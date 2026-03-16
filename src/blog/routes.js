/**
 * src/blog/routes.js
 *
 * Mount in your existing src/index.js with ONE line:
 *   app.use('/api/blog', require('./blog/routes'));
 *
 * Also add sitemap + RSS:
 *   const { sitemapHandler, rssHandler } = require('./blog/seo');
 *   app.get('/sitemap.xml', sitemapHandler);
 *   app.get('/rss.xml',     rssHandler);
 */

const express = require('express');
const router  = express.Router();
const slugify = require('slugify');

// Reuse your existing pool — adjust path if your db file is named differently
// Common patterns in Railway Express apps:
let pool;
try {
  pool = require('../db').pool;            // if you export { pool }
} catch {
  try {
    const client = require('../db');
    pool = client.pool || client;          // if module.exports = pool directly
  } catch {
    // fallback: create our own using DATABASE_URL
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
}

async function q(sql, params) {
  const res = await pool.query(sql, params);
  return res;
}

// ── Auth guard (reuses your existing JWT secret) ────────────────────────────
const jwt = require('jsonwebtoken');

function adminOnly(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Admin token required' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function readingTime(html) {
  const words = (html || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function makeSlug(title) {
  return slugify(title, { lower: true, strict: true });
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/blog/posts
router.get('/posts', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(50, parseInt(req.query.limit) || 10);
    const offset   = (page - 1) * limit;
    const category = req.query.category || null;
    const tag      = req.query.tag      || null;
    const search   = req.query.search   || null;

    const params = [];
    let where = "WHERE p.status = 'published'";

    if (category) {
      params.push(category);
      where += ` AND bc.slug = $${params.length}`;
    }
    if (tag) {
      params.push(tag);
      where += ` AND EXISTS (
        SELECT 1 FROM blog_post_tags bpt
        JOIN blog_tags bt ON bt.id = bpt.tag_id
        WHERE bpt.post_id = p.id AND bt.slug = $${params.length}
      )`;
    }
    if (search) {
      params.push('%' + search + '%');
      where += ` AND (p.title ILIKE $${params.length} OR p.excerpt ILIKE $${params.length})`;
    }

    params.push(limit, offset);
    const li = params.length - 1;
    const oi = params.length;

    const { rows } = await q(`
      SELECT p.id, p.title, p.slug, p.excerpt, p.featured_image,
             p.featured_image_alt, p.published_at, p.reading_time_min,
             p.author_name,
             bc.name AS category_name, bc.slug AS category_slug,
             COUNT(*) OVER() AS total_count
      FROM blog_posts p
      LEFT JOIN blog_categories bc ON bc.id = p.category_id
      ${where}
      ORDER BY p.published_at DESC NULLS LAST
      LIMIT $${li} OFFSET $${oi}
    `, params);

    const total = parseInt(rows[0]?.total_count || 0);
    res.json({
      posts: rows.map(r => { delete r.total_count; return r; }),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[blog] GET /posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blog/categories
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await q(`
      SELECT bc.*, COUNT(p.id) AS post_count
      FROM blog_categories bc
      LEFT JOIN blog_posts p ON p.category_id = bc.id AND p.status = 'published'
      GROUP BY bc.id ORDER BY bc.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/blog/tags
router.get('/tags', async (req, res) => {
  try {
    const { rows } = await q(`
      SELECT bt.*, COUNT(bpt.post_id) AS post_count
      FROM blog_tags bt
      LEFT JOIN blog_post_tags bpt ON bpt.tag_id = bt.id
      GROUP BY bt.id ORDER BY bt.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/blog/posts/related/:slug  (must be before /:slug)
router.get('/posts/related/:slug', async (req, res) => {
  try {
    const { rows } = await q(
      "SELECT id, category_id FROM blog_posts WHERE slug=$1 AND status='published'",
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const post = rows[0];

    const { rows: related } = await q(`
      SELECT title, slug, featured_image, excerpt, reading_time_min
      FROM blog_posts
      WHERE status='published' AND id != $1 AND category_id = $2
      ORDER BY published_at DESC LIMIT 4
    `, [post.id, post.category_id]);

    res.json(related);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/blog/posts/:slug
router.get('/posts/:slug', async (req, res) => {
  try {
    const SITE = process.env.SITE_URL || 'https://optionlab.io';

    const { rows } = await q(`
      SELECT p.*,
             bc.name AS category_name, bc.slug AS category_slug,
             COALESCE(
               json_agg(json_build_object('id',bt.id,'name',bt.name,'slug',bt.slug))
               FILTER (WHERE bt.id IS NOT NULL), '[]'
             ) AS tags
      FROM blog_posts p
      LEFT JOIN blog_categories bc  ON bc.id = p.category_id
      LEFT JOIN blog_post_tags  bpt ON bpt.post_id = p.id
      LEFT JOIN blog_tags       bt  ON bt.id = bpt.tag_id
      WHERE p.slug = $1 AND p.status = 'published'
      GROUP BY p.id, bc.name, bc.slug
    `, [req.params.slug]);

    if (!rows.length) return res.status(404).json({ error: 'Post not found' });

    const post = rows[0];
    // Attach JSON-LD for Google rich results
    post.jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.meta_title || post.title,
      description: post.meta_description || post.excerpt,
      image: post.og_image || post.featured_image,
      datePublished: post.published_at,
      dateModified:  post.updated_at,
      author: { '@type': 'Person', name: post.author_name || 'OptionLab Team' },
      publisher: {
        '@type': 'Organization', name: 'OptionLab',
        logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` }
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${post.slug}` }
    };

    res.json(post);
  } catch (err) {
    console.error('[blog] GET /posts/:slug error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blog/comments?post=<slug>
router.get('/comments', async (req, res) => {
  try {
    const { post: slug } = req.query;
    if (!slug) return res.status(400).json({ error: 'post slug required' });

    const { rows } = await q(`
      SELECT bc.id, bc.author_name, bc.body, bc.created_at, bc.parent_id
      FROM blog_comments bc
      JOIN blog_posts p ON p.id = bc.post_id
      WHERE p.slug = $1 AND bc.approved = TRUE
      ORDER BY bc.created_at ASC
    `, [slug]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/blog/comments  (public submission — held for moderation)
router.post('/comments', async (req, res) => {
  try {
    const { post_id, author_name, author_email, body, parent_id } = req.body;
    if (!post_id || !author_name || !author_email || !body)
      return res.status(400).json({ error: 'post_id, author_name, author_email, body required' });

    const { rows: [c] } = await q(`
      INSERT INTO blog_comments (post_id, author_name, author_email, body, parent_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, author_name, body, created_at
    `, [post_id, author_name, author_email, body, parent_id || null]);

    res.status(201).json({ ...c, message: 'Comment submitted — pending moderation' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (require JWT)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/blog/posts
router.post('/posts', adminOnly, async (req, res) => {
  try {
    const {
      title, content, excerpt = '', category_id = null, tags = [],
      featured_image = null, featured_image_alt = null,
      meta_title = null, meta_description = null,
      og_image = null, focus_keyword = null, canonical_url = null,
      author_name = 'OptionLab Team', status = 'draft'
    } = req.body;

    if (!title)   return res.status(400).json({ error: 'title required' });
    if (!content) return res.status(400).json({ error: 'content required' });

    const slug = makeSlug(title);
    const rtime = readingTime(content);
    const pub_at = status === 'published' ? new Date() : null;

    const { rows: [post] } = await q(`
      INSERT INTO blog_posts (
        title, slug, content, excerpt, category_id, author_name,
        featured_image, featured_image_alt,
        meta_title, meta_description, og_image, focus_keyword, canonical_url,
        status, published_at, reading_time_min
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [title, slug, content, excerpt, category_id, author_name,
        featured_image, featured_image_alt,
        meta_title, meta_description, og_image, focus_keyword, canonical_url,
        status, pub_at, rtime]);

    if (tags.length) {
      const vals = tags.map((id, i) => `($1,$${i + 2})`).join(',');
      await q(`INSERT INTO blog_post_tags (post_id,tag_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
        [post.id, ...tags]);
    }

    res.status(201).json(post);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug already exists — try a different title' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/blog/posts/:id
router.patch('/posts/:id', adminOnly, async (req, res) => {
  try {
    const allowed = ['title','content','excerpt','category_id','author_name',
      'featured_image','featured_image_alt','meta_title','meta_description',
      'og_image','focus_keyword','canonical_url','status'];

    const sets = [], vals = [];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) {
        vals.push(req.body[f]);
        sets.push(`${f} = $${vals.length}`);
      }
    });
    if (req.body.status === 'published')
      sets.push('published_at = COALESCE(published_at, NOW())');
    if (req.body.content) {
      vals.push(readingTime(req.body.content));
      sets.push(`reading_time_min = $${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(req.params.id);
    const { rows: [post] } = await q(
      `UPDATE blog_posts SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (req.body.tags !== undefined) {
      await q('DELETE FROM blog_post_tags WHERE post_id=$1', [req.params.id]);
      if (req.body.tags.length) {
        const vals2 = req.body.tags.map((id, i) => `($1,$${i + 2})`).join(',');
        await q(`INSERT INTO blog_post_tags (post_id,tag_id) VALUES ${vals2} ON CONFLICT DO NOTHING`,
          [req.params.id, ...req.body.tags]);
      }
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/blog/posts/:id
router.delete('/posts/:id', adminOnly, async (req, res) => {
  try {
    const { rowCount } = await q('DELETE FROM blog_posts WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/blog/categories  (admin)
router.post('/categories', adminOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const slug = makeSlug(name);
    const { rows: [cat] } = await q(
      'INSERT INTO blog_categories (name,slug,description) VALUES ($1,$2,$3) RETURNING *',
      [name, slug, description]);
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category exists' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blog/tags  (admin)
router.post('/tags', adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const slug = makeSlug(name);
    const { rows: [tag] } = await q(
      'INSERT INTO blog_tags (name,slug) VALUES ($1,$2) RETURNING *', [name, slug]);
    res.status(201).json(tag);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Tag exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/blog/comments/:id/approve  (admin)
router.patch('/comments/:id/approve', adminOnly, async (req, res) => {
  try {
    await q('UPDATE blog_comments SET approved=TRUE WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/blog/comments/:id  (admin)
router.delete('/comments/:id', adminOnly, async (req, res) => {
  try {
    await q('DELETE FROM blog_comments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/blog/admin/comments  (all comments, including unapproved)
router.get('/admin/comments', adminOnly, async (req, res) => {
  try {
    const { rows } = await q(`
      SELECT bc.*, p.title AS post_title, p.slug AS post_slug
      FROM blog_comments bc
      JOIN blog_posts p ON p.id = bc.post_id
      ORDER BY bc.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
