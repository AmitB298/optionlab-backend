const router = require('express').Router();
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');
const slugify = require('slugify');
const crypto = require('crypto');

// ── HELPERS ─────────────────────────────────────────────────
const ARTICLE_SELECT = `
  SELECT
    a.id, a.slug, a.title, a.subtitle, a.excerpt,
    a.body_markdown, a.body_html, a.cover_emoji, a.cover_image,
    a.status, a.sentiment, a.ai_score, a.ai_summary,
    a.read_time_min, a.views_count, a.likes_count, a.shares_count,
    a.featured, a.is_ai_generated, a.published_at, a.created_at, a.updated_at,
    a.seo_title, a.seo_description, a.scheduled_at,
    au.id AS author_id, au.name AS author_name, au.role AS author_role,
    au.initials AS author_initials, au.avatar_color AS author_color,
    au.avatar_url AS author_avatar,
    c.id AS cat_id, c.name AS cat_name, c.slug AS cat_slug, c.color AS cat_color,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'color', t.color))
      FILTER (WHERE t.id IS NOT NULL), '[]'
    ) AS tags,
    (SELECT COUNT(*) FROM blog_comments cm WHERE cm.article_id = a.id AND cm.is_approved = true) AS comments_count
  FROM blog_articles a
  JOIN blog_authors au ON au.id = a.author_id
  LEFT JOIN blog_categories c ON c.id = a.category_id
  LEFT JOIN blog_article_tags at2 ON at2.article_id = a.id
  LEFT JOIN blog_tags t ON t.id = at2.tag_id
`;

// ── PUBLIC ROUTES ─────────────────────────────────────────────

// GET /api/articles — list published articles
router.get('/', async (req, res) => {
  const { cat, tag, author, search, featured, page = 1, limit = 12 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conds = [`a.status = 'published'`];

  if (cat)      { params.push(cat);    conds.push(`c.slug = $${params.length}`); }
  if (tag)      { params.push(tag);    conds.push(`EXISTS (SELECT 1 FROM blog_article_tags at3 JOIN blog_tags tg ON tg.id=at3.tag_id WHERE at3.article_id=a.id AND tg.slug=$${params.length})`); }
  if (author)   { params.push(parseInt(author)); conds.push(`a.author_id = $${params.length}`); }
  if (featured === 'true') { conds.push(`a.featured = true`); }
  if (search)   {
    params.push(`%${search}%`);
    conds.push(`(a.title ILIKE $${params.length} OR a.excerpt ILIKE $${params.length} OR a.body_markdown ILIKE $${params.length})`);
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  params.push(parseInt(limit), offset);

  try {
    const { rows } = await pool.query(
      `${ARTICLE_SELECT} ${where} GROUP BY a.id, au.id, c.id ORDER BY a.published_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, -2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(DISTINCT a.id) FROM blog_articles a JOIN blog_authors au ON au.id=a.author_id LEFT JOIN blog_categories c ON c.id=a.category_id ${where}`,
      countParams
    );
    res.json({ articles: rows, total: parseInt(countRows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[Articles] List error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/articles/featured — featured article for hero
router.get('/featured', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${ARTICLE_SELECT} WHERE a.status='published' AND a.featured=true GROUP BY a.id,au.id,c.id ORDER BY a.published_at DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/articles/trending — top by views last 7 days
router.get('/trending', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${ARTICLE_SELECT} WHERE a.status='published' GROUP BY a.id,au.id,c.id ORDER BY a.views_count DESC LIMIT 6`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/articles/:slug — single article
router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${ARTICLE_SELECT} WHERE a.slug = $1 AND a.status='published' GROUP BY a.id,au.id,c.id`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Article not found' });

    // Track view
    const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
    await pool.query(
      `INSERT INTO blog_article_views (article_id, ip_hash, user_agent) VALUES ($1,$2,$3)`,
      [rows[0].id, ipHash, req.headers['user-agent']?.substring(0, 300)]
    );
    await pool.query(
      `UPDATE blog_articles SET views_count = views_count + 1 WHERE id = $1`,
      [rows[0].id]
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/articles/:slug/like
router.post('/:slug/like', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE blog_articles SET likes_count = likes_count + 1 WHERE slug=$1 AND status='published' RETURNING likes_count`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ likes_count: rows[0].likes_count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── ADMIN / PROTECTED ROUTES ───────────────────────────────

// GET /api/articles/admin/all — all articles for admin dashboard
router.get('/admin/all', auth, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = 'WHERE 1=1';
  if (status) { params.push(status); where += ` AND a.status=$${params.length}`; }
  if (!req.user.is_admin) { params.push(req.user.id); where += ` AND a.author_id=$${params.length}`; }
  params.push(parseInt(limit), offset);
  try {
    const { rows } = await pool.query(
      `${ARTICLE_SELECT} ${where} GROUP BY a.id,au.id,c.id ORDER BY a.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/articles — create article
router.post('/', auth, async (req, res) => {
  const {
    title, subtitle, excerpt, body_markdown, cover_emoji,
    category_id, status, sentiment, ai_score, ai_summary,
    read_time_min, featured, is_ai_generated, scheduled_at,
    seo_title, seo_description, tag_ids
  } = req.body;

  if (!title || !body_markdown)
    return res.status(400).json({ error: 'Title and body are required' });

  const slug = slugify(title, { lower: true, strict: true, trim: true }).substring(0, 200)
             + '-' + Date.now().toString(36);

  const pub = status === 'published' ? new Date() : null;

  try {
    const { rows } = await pool.query(`
      INSERT INTO blog_articles
        (slug, title, subtitle, excerpt, body_markdown, body_html, cover_emoji,
         author_id, category_id, status, sentiment, ai_score, ai_summary,
         read_time_min, featured, is_ai_generated, scheduled_at,
         seo_title, seo_description, published_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING id, slug
    `, [slug, title, subtitle, excerpt, body_markdown, `<p>${excerpt || ''}</p>`,
        cover_emoji || '📊', req.user.id, category_id || null,
        status || 'draft', sentiment || 'neutral', ai_score || 0, ai_summary || null,
        read_time_min || 5, featured || false, is_ai_generated || false,
        scheduled_at || null, seo_title || null, seo_description || null, pub]);

    const artId = rows[0].id;

    if (tag_ids?.length) {
      for (const tid of tag_ids) {
        await pool.query(
          `INSERT INTO blog_article_tags (article_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [artId, tid]
        );
      }
    }

    await pool.query(`UPDATE blog_authors SET articles_count = articles_count + 1 WHERE id = $1`, [req.user.id]);

    res.status(201).json({ id: artId, slug: rows[0].slug });
  } catch (err) {
    console.error('[Articles] Create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/articles/:id — update article
router.put('/:id', auth, async (req, res) => {
  const {
    title, subtitle, excerpt, body_markdown, cover_emoji,
    category_id, status, sentiment, ai_score, ai_summary,
    read_time_min, featured, scheduled_at, seo_title, seo_description, tag_ids
  } = req.body;

  try {
    const existing = await pool.query(`SELECT author_id, status FROM blog_articles WHERE id=$1`, [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (!req.user.is_admin && existing.rows[0].author_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    const wasPublished = existing.rows[0].status === 'published';
    const nowPublished = status === 'published';
    const pub = nowPublished && !wasPublished ? new Date() : undefined;

    const updateFields = [];
    const vals = [];
    const set = (col, val) => { vals.push(val); updateFields.push(`${col}=$${vals.length}`); };

    if (title !== undefined) set('title', title);
    if (subtitle !== undefined) set('subtitle', subtitle);
    if (excerpt !== undefined) set('excerpt', excerpt);
    if (body_markdown !== undefined) { set('body_markdown', body_markdown); set('body_html', `<p>${excerpt||''}</p>`); }
    if (cover_emoji !== undefined) set('cover_emoji', cover_emoji);
    if (category_id !== undefined) set('category_id', category_id);
    if (status !== undefined) set('status', status);
    if (sentiment !== undefined) set('sentiment', sentiment);
    if (ai_score !== undefined) set('ai_score', ai_score);
    if (ai_summary !== undefined) set('ai_summary', ai_summary);
    if (read_time_min !== undefined) set('read_time_min', read_time_min);
    if (featured !== undefined) set('featured', featured);
    if (scheduled_at !== undefined) set('scheduled_at', scheduled_at);
    if (seo_title !== undefined) set('seo_title', seo_title);
    if (seo_description !== undefined) set('seo_description', seo_description);
    if (pub) set('published_at', pub);
    set('updated_at', new Date());

    vals.push(req.params.id);
    await pool.query(`UPDATE blog_articles SET ${updateFields.join(',')} WHERE id=$${vals.length}`, vals);

    if (tag_ids !== undefined) {
      await pool.query(`DELETE FROM blog_article_tags WHERE article_id=$1`, [req.params.id]);
      for (const tid of tag_ids) {
        await pool.query(`INSERT INTO blog_article_tags (article_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, tid]);
      }
    }

    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[Articles] Update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/articles/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT author_id FROM blog_articles WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (!req.user.is_admin && rows[0].author_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query(`UPDATE blog_articles SET status='archived', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Article archived' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
