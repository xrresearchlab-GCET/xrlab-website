-- ============================================
-- XR Research Lab — Events Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  category TEXT,
  research_division TEXT,
  start_datetime TIMESTAMPTZ,
  end_datetime TIMESTAMPTZ,
  location TEXT,
  venue TEXT,
  registration_url TEXT,
  external_url TEXT,
  organizer TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','upcoming','ongoing','completed','cancelled','archived')),
  featured_image TEXT,
  gallery JSONB DEFAULT '[]'::jsonb,
  speakers JSONB DEFAULT '[]'::jsonb,
  highlights JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  milestone_enabled BOOLEAN DEFAULT FALSE,
  milestone_title TEXT,
  milestone_description TEXT,
  milestone_content JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_start_datetime ON events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_milestone_enabled ON events(milestone_enabled) WHERE milestone_enabled = TRUE;

-- ============================================
-- 2. AUTH CHALLENGES TABLE (OTP)
-- ============================================
CREATE TABLE IF NOT EXISTS auth_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  used_at TIMESTAMPTZ,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_email ON auth_challenges(email_hash);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at);

-- ============================================
-- 3. ADMIN SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON admin_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);

-- ============================================
-- 4. AUDIT LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  success BOOLEAN DEFAULT TRUE,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- ============================================
-- 5. RATE LIMITING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL,
  action TEXT NOT NULL,
  attempts INTEGER DEFAULT 1,
  first_attempt TIMESTAMPTZ DEFAULT NOW(),
  last_attempt TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_key_action ON rate_limits(key, action);

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Public: Can read only published events (upcoming, ongoing, completed non-draft)
CREATE POLICY "Public can read published events" ON events
  FOR SELECT
  USING (status IN ('upcoming', 'ongoing', 'completed', 'cancelled'));

-- Service role: Full access (used by Netlify Functions)
CREATE POLICY "Service role full access events" ON events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- All internal tables: service role only
CREATE POLICY "Service role access auth_challenges" ON auth_challenges
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role access admin_sessions" ON admin_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role access audit_log" ON audit_log
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role access rate_limits" ON rate_limits
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 7. AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 8. CLEANUP FUNCTION FOR EXPIRED DATA
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Clean expired auth challenges
  DELETE FROM auth_challenges WHERE expires_at < NOW() - INTERVAL '1 hour';
  -- Clean expired sessions
  DELETE FROM admin_sessions WHERE expires_at < NOW();
  -- Clean old rate limit entries
  DELETE FROM rate_limits WHERE last_attempt < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;
