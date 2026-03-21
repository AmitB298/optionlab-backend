const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MsbhWaBlBEjCrtPUTXUaydgkabfNuogC@metro.proxy.rlwy.net:10759/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Creating missing blog tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS blog_authors (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(100) NOT NULL,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role          VARCHAR(100) DEFAULT 'Analyst',
        bio           TEXT,
        initials      VARCHAR(5),
        avatar_color  VARCHAR(20) DEFAULT '#ff9f0a',
        avatar_url    VARCHAR(500),
        is_admin      BOOLEAN DEFAULT false,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blog_subscribers (
        id           SERIAL PRIMARY KEY,
        email        VARCHAR(255) NOT NULL UNIQUE,
        name         VARCHAR(100),
        source       VARCHAR(50) DEFAULT 'website',
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blog_ai_briefings (
        id         SERIAL PRIMARY KEY,
        date       DATE NOT NULL UNIQUE,
        content    TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blog_article_views (
        id         SERIAL PRIMARY KEY,
        article_id INTEGER NOT NULL,
        ip_address VARCHAR(50),
        viewed_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Tables created');

    // Add author_id column to blog_posts if missing
    await client.query(`
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES blog_authors(id);
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES blog_categories(id);
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS subtitle TEXT;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS excerpt TEXT;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS body_markdown TEXT;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS body_html TEXT;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_emoji VARCHAR(10) DEFAULT '📊';
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image VARCHAR(500);
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20) DEFAULT 'neutral';
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 50;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS ai_summary TEXT;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS read_time_min INTEGER DEFAULT 3;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255);
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS seo_description TEXT;
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `).catch(e => console.log('blog_posts columns (some may already exist):', e.message));

    console.log('✅ blog_posts columns updated');

    // Seed admin author
    const hash = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO blog_authors (name, email, password_hash, role, bio, initials, avatar_color, is_admin)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email) DO UPDATE SET password_hash = $3, is_admin = $8
    `, ['Amit B', 'amit@optionslab.in', hash, 'Senior Analyst', 'Founder of OptionsLab. NIFTY derivatives specialist.', 'AB', '#ff9f0a', true]);

    console.log('✅ Admin author seeded!');
    console.log('');
    console.log('🔑 Login at: https://www.optionslab.in/blog/login');
    console.log('   Email:    amit@optionslab.in');
    console.log('   Password: admin123');
    console.log('   ⚠️  Change password immediately after login!');

  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
