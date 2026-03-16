-- ============================================================
-- OptionLab Blog Migration
-- Run ONCE on your existing Railway PostgreSQL database:
--   railway run psql $DATABASE_URL -f db/blog-migration.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Blog posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title              VARCHAR(200)  NOT NULL,
  slug               VARCHAR(220)  UNIQUE NOT NULL,
  excerpt            TEXT,
  content            TEXT          NOT NULL,
  featured_image     TEXT,
  featured_image_alt VARCHAR(200),
  author_name        VARCHAR(100)  DEFAULT 'OptionLab Team',

  -- SEO fields
  meta_title         VARCHAR(70),
  meta_description   VARCHAR(160),
  og_image           TEXT,
  focus_keyword      VARCHAR(100),
  canonical_url      TEXT,

  -- Status
  status             VARCHAR(20)   DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'archived')),
  published_at       TIMESTAMP,
  reading_time_min   INT DEFAULT 1,

  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS blog_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(120) UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Add category FK to posts (optional grouping)
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL;

-- Tags
CREATE TABLE IF NOT EXISTS blog_tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(80)  NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Post <-> Tag (many-to-many)
CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id  UUID REFERENCES blog_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Comments (moderated)
CREATE TABLE IF NOT EXISTS blog_comments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES blog_comments(id),
  author_name  VARCHAR(100) NOT NULL,
  author_email VARCHAR(200) NOT NULL,
  body         TEXT         NOT NULL,
  approved     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug      ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status    ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category  ON blog_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_post   ON blog_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_apprvd ON blog_comments(approved);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION blog_update_modified()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_posts_modtime ON blog_posts;
CREATE TRIGGER blog_posts_modtime
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION blog_update_modified();

-- Seed default category
INSERT INTO blog_categories (name, slug, description)
VALUES ('Options Trading', 'options-trading', 'Options trading strategies, tips and analysis')
ON CONFLICT (slug) DO NOTHING;

SELECT 'Blog migration complete!' AS result;
