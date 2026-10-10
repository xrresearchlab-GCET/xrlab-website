-- =============================================================================
-- XR Research Lab — Unreal Engine Style Tutorials & Learning Migration
-- Run this script in the Supabase SQL Editor to support Epic Dev Community
-- style tutorial attributes on the learning catalog.
-- 100% idempotent and backward compatible with existing courses.
-- =============================================================================

ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'Tutorial';
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS author_role TEXT;
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS author_type TEXT DEFAULT 'Lab Core';
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS author_avatar_url TEXT;
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS external_url TEXT;
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS tutorial_body TEXT;
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS courses ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- Backfill existing courses if any
UPDATE courses 
SET 
  content_type = COALESCE(content_type, 'Tutorial'),
  author_name = COALESCE(author_name, instructor_name, 'XR Research Lab'),
  author_role = COALESCE(author_role, instructor_role, 'Lab Core'),
  author_type = COALESCE(author_type, 'Lab Core')
WHERE author_name IS NULL OR content_type IS NULL;

-- Create index for quick filtering
CREATE INDEX IF NOT EXISTS idx_courses_content_type ON courses(content_type);
CREATE INDEX IF NOT EXISTS idx_courses_author_type ON courses(author_type);
