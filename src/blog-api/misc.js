// ── COMMENTS ──────────────────────────────────────────────────
const commentsRouter = require('express').Router();
const pool = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');

commentsRouter.get('/:articleId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM blog_comments WHERE article_id=$1 AND is_approved=true AND parent_id IS NULL ORDER BY created_at DESC`,
      [req.params.articleId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

commentsRouter.post('/:articleId', async (req, res) => {
  const { author_name, author_email, body, parent_id } = req.body;
  if (!author_name || !body) return res.status(400).json({ error: 'Name and comment required' });
  if (body.length < 5) return res.status(400).json({ error: 'Comment too short' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO blog_comments (article_id, author_name, author_email, body, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.articleId, author_name.substring(0,100), author_email?.substring(0,150), body.substring(0,2000), parent_id||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

commentsRouter.post('/:id/like', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE blog_comments SET likes_count=likes_count+1 WHERE id=$1 RETURNING likes_count`,
      [req.params.id]
    );
    res.json(rows[0] || { likes_count: 0 });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

commentsRouter.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query(`DELETE FROM blog_comments WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── CATEGORIES ─────────────────────────────────────────────────
const categoriesRouter = require('express').Router();

categoriesRouter.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(a.id) FILTER (WHERE a.status='published') AS article_count
      FROM blog_categories c ORDER BY name
      LEFT JOIN blog_articles a ON a.category_id = c.id
      GROUP BY c.id ORDER BY c.sort_order
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

categoriesRouter.post('/', auth, adminOnly, async (req, res) => {
  const { name, slug, description, color, sort_order } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
  try {
      `INSERT INTO blog_categories (name, slug, description) VALUES ($1,$2,$3) RETURNING *`,
      [name, slug, description]
      [name, slug, description, color || '#ff9f0a', sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TAGS ───────────────────────────────────────────────────────
const tagsRouter = require('express').Router();

tagsRouter.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, COUNT(at2.article_id) AS article_count
      FROM blog_tags t
      LEFT JOIN blog_article_tags at2 ON at2.tag_id = t.id
      GROUP BY t.id ORDER BY article_count DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── AUTHORS / PROFILES ─────────────────────────────────────────
const authorsRouter = require('express').Router();

authorsRouter.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, role, bio, avatar_url, avatar_color, initials,
             articles_count, followers_count, accuracy_pct, twitter, linkedin, created_at
      FROM blog_authors ORDER BY articles_count DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

authorsRouter.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, bio, avatar_url, avatar_color, initials, articles_count, followers_count, accuracy_pct, twitter, linkedin FROM blog_authors WHERE id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

authorsRouter.put('/me', auth, async (req, res) => {
  const { name, bio, role, twitter, linkedin } = req.body;
  try {
    await pool.query(
      `UPDATE blog_authors SET name=COALESCE($1,name), bio=COALESCE($2,bio), role=COALESCE($3,role), twitter=COALESCE($4,twitter), linkedin=COALESCE($5,linkedin), updated_at=NOW() WHERE id=$6`,
      [name, bio, role, twitter, linkedin, req.user.id]
    );
    res.json({ message: 'Profile updated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── SUBSCRIBERS / NEWSLETTER ────────────────────────────────────
const subscribersRouter = require('express').Router();

subscribersRouter.post('/subscribe', async (req, res) => {
  const { email, name, source } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  try {
    await pool.query(
      `INSERT INTO blog_subscribers (email, name, source) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET is_active=true`,
      [email.toLowerCase(), name||null, source||'website']
    );
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

subscribersRouter.get('/list', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM blog_subscribers WHERE is_active=true ORDER BY subscribed_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

subscribersRouter.get('/count', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM blog_subscribers WHERE is_active=true`);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── ANALYTICS ──────────────────────────────────────────────────
const analyticsRouter = require('express').Router();

analyticsRouter.get('/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const [articlesRes, viewsRes, subsRes, commentsRes, topRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM blog_articles WHERE status='published'`),
      pool.query(`SELECT COALESCE(SUM(views_count),0) AS total FROM blog_articles`),
      pool.query(`SELECT COUNT(*) FROM blog_subscribers WHERE is_active=true`),
      pool.query(`SELECT COUNT(*) FROM blog_comments WHERE is_approved=true`),
      pool.query(`SELECT id,slug,title,views_count,likes_count,ai_score,sentiment FROM blog_articles WHERE status='published' ORDER BY views_count DESC LIMIT 5`),
    ]);
    res.json({
      total_articles:  parseInt(articlesRes.rows[0].count),
      total_views:     parseInt(viewsRes.rows[0].total),
      total_subscribers: parseInt(subsRes.rows[0].count),
      total_comments:  parseInt(commentsRes.rows[0].count),
      top_articles:    topRes.rows,
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = { commentsRouter, categoriesRouter, tagsRouter, authorsRouter, subscribersRouter, analyticsRouter };


