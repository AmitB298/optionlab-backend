/**
 * src/blog/seo.js
 * Auto-generates sitemap.xml and rss.xml
 *
 * Add to src/index.js:
 *   const { sitemapHandler, rssHandler } = require('./blog/seo');
 *   app.get('/sitemap.xml', sitemapHandler);
 *   app.get('/rss.xml',     rssHandler);
 */

let pool;
try {
  pool = require('../db').pool;
} catch {
  try {
    const client = require('../db');
    pool = client.pool || client;
  } catch {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
}

const SITE = () => process.env.SITE_URL || 'https://optionlab.io';

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function generateSitemap() {
  const { rows: posts } = await pool.query(`
    SELECT slug, updated_at FROM blog_posts
    WHERE status = 'published'
    ORDER BY published_at DESC
  `);

  const { rows: cats } = await pool.query(`SELECT slug FROM blog_categories`);
  const site = SITE();
  const now  = new Date().toISOString();

  const staticPages = [
    { url: '/',         changefreq: 'daily',   priority: '1.0' },
    { url: '/blog',     changefreq: 'daily',   priority: '0.9' },
    { url: '/register', changefreq: 'monthly', priority: '0.5' },
  ];

  const entries = [
    ...staticPages.map(p => urlEntry(`${site}${p.url}`, now, p.changefreq, p.priority)),
    ...posts.map(p =>
      urlEntry(`${site}/blog/${p.slug}`, new Date(p.updated_at).toISOString(), 'weekly', '0.8')
    ),
    ...cats.map(c =>
      urlEntry(`${site}/blog/category/${c.slug}`, now, 'weekly', '0.7')
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>`;
}

async function generateRSS() {
  const site = SITE();
  const { rows } = await pool.query(`
    SELECT p.title, p.slug, p.excerpt, p.published_at, p.author_name,
           bc.name AS category_name
    FROM blog_posts p
    LEFT JOIN blog_categories bc ON bc.id = p.category_id
    WHERE p.status = 'published'
    ORDER BY p.published_at DESC
    LIMIT 20
  `);

  const items = rows.map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${site}/blog/${p.slug}</link>
      <guid isPermaLink="true">${site}/blog/${p.slug}</guid>
      <description><![CDATA[${p.excerpt || ''}]]></description>
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
      <author>${p.author_name || 'OptionLab Team'}</author>
      <category>${p.category_name || 'Options Trading'}</category>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>OptionLab Blog</title>
    <link>${site}/blog</link>
    <description>Options trading strategies, analysis, and market insights</description>
    <language>en-us</language>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}

async function sitemapHandler(req, res) {
  try {
    const xml = await generateSitemap();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[blog] sitemap error:', err.message);
    res.status(500).send('Sitemap generation failed');
  }
}

async function rssHandler(req, res) {
  try {
    const xml = await generateRSS();
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.send(xml);
  } catch (err) {
    console.error('[blog] rss error:', err.message);
    res.status(500).send('RSS generation failed');
  }
}

module.exports = { sitemapHandler, rssHandler };
