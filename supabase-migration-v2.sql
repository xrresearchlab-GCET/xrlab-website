-- =============================================================================
-- XR Research Lab — V2 Additive Migration
-- New tables: members, courses, course_lessons, research_items
-- Run this AFTER the original supabase-migration.sql
-- 100% idempotent: safe to run multiple times.
-- =============================================================================

-- Enable UUID extension (already exists, safe to repeat)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Helper trigger function (ensures idempotency even if run standalone)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. MEMBERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'Member',
  tagline TEXT,
  about TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT'
    CHECK (status IN ('PRESENT', 'PAST')),
  model_url TEXT,
  model_format TEXT DEFAULT 'glb',
  fallback_image_url TEXT,
  public_profile_url TEXT,
  show_email_publicly BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  joined_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_display_order ON members(display_order);

-- Members trigger
DROP TRIGGER IF EXISTS trigger_members_updated_at ON members;
CREATE TRIGGER trigger_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 2. COURSES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Augmented Reality',
  difficulty TEXT NOT NULL DEFAULT 'Beginner'
    CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  thumbnail_url TEXT,
  video_url TEXT,
  intro_video_url TEXT,
  instructor_name TEXT,
  instructor_role TEXT,
  estimated_duration TEXT,
  lesson_count INTEGER DEFAULT 0,
  learning_objectives JSONB DEFAULT '[]'::jsonb,
  prerequisites JSONB DEFAULT '[]'::jsonb,
  technologies JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  language TEXT DEFAULT 'English',
  certificate_available BOOLEAN DEFAULT FALSE,
  featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_featured ON courses(featured) WHERE featured = TRUE;

-- Courses trigger
DROP TRIGGER IF EXISTS trigger_courses_updated_at ON courses;
CREATE TRIGGER trigger_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 3. COURSE LESSONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS course_lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  resource_url TEXT,
  lesson_order INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_course ON course_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_course_lessons_order ON course_lessons(course_id, lesson_order);

-- Lessons trigger
DROP TRIGGER IF EXISTS trigger_course_lessons_updated_at ON course_lessons;
CREATE TRIGGER trigger_course_lessons_updated_at
  BEFORE UPDATE ON course_lessons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 4. RESEARCH ITEMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS research_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_summary TEXT,
  description TEXT,
  research_area TEXT,
  research_division TEXT,
  objectives TEXT,
  problem_statement TEXT,
  methodology TEXT,
  technologies JSONB DEFAULT '[]'::jsonb,
  expected_outcomes TEXT,
  findings TEXT,
  team_members JSONB DEFAULT '[]'::jsonb,
  mentor TEXT,
  start_date DATE,
  expected_completion_date DATE,
  completion_date DATE,
  research_stage TEXT NOT NULL DEFAULT 'PROPOSED'
    CHECK (research_stage IN ('PROPOSED', 'ONGOING', 'EXPERIMENTAL', 'VALIDATION', 'COMPLETED', 'ARCHIVED')),
  concept_image_url TEXT,
  related_project_url TEXT,
  report_url TEXT,
  demo_video_url TEXT,
  dataset_url TEXT,
  publication_url TEXT,
  github_url TEXT,
  additional_links JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_research_slug ON research_items(slug);
CREATE INDEX IF NOT EXISTS idx_research_status ON research_items(publication_status);
CREATE INDEX IF NOT EXISTS idx_research_division ON research_items(research_division);
CREATE INDEX IF NOT EXISTS idx_research_stage ON research_items(research_stage);
CREATE INDEX IF NOT EXISTS idx_research_featured ON research_items(featured) WHERE featured = TRUE;

-- Research trigger
DROP TRIGGER IF EXISTS trigger_research_items_updated_at ON research_items;
CREATE TRIGGER trigger_research_items_updated_at
  BEFORE UPDATE ON research_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 5. ADD FK COLUMNS TO AUDIT_LOG (ADDITIVE ONLY)
-- =============================================================================
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS research_id UUID REFERENCES research_items(id) ON DELETE SET NULL;

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

-- Members RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read present members" ON members;
CREATE POLICY "Public can read present members" ON members
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role full access members" ON members;
CREATE POLICY "Service role full access members" ON members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Courses RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published courses" ON courses;
CREATE POLICY "Public can read published courses" ON courses
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Service role full access courses" ON courses;
CREATE POLICY "Service role full access courses" ON courses
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Course Lessons RLS
ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published lessons" ON course_lessons;
CREATE POLICY "Public can read published lessons" ON course_lessons
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Service role full access lessons" ON course_lessons;
CREATE POLICY "Service role full access lessons" ON course_lessons
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Research RLS
ALTER TABLE research_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published research" ON research_items;
CREATE POLICY "Public can read published research" ON research_items
  FOR SELECT
  USING (publication_status = 'published');

DROP POLICY IF EXISTS "Service role full access research" ON research_items;
CREATE POLICY "Service role full access research" ON research_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 7. INITIAL SEED DATA (CORE CURRICULA & RESEARCH PUBLICATIONS)
-- Idempotent: uses ON CONFLICT (slug) DO NOTHING so existing data is preserved.
-- =============================================================================

-- Core Curricula (matches Learn platform tracks)
INSERT INTO courses (
  title, slug, short_description, description, category, difficulty,
  technologies, lesson_count, estimated_duration, featured, display_order, status, published_at
) VALUES 
(
  'Unreal Engine 5 & Virtual Production',
  'unreal-engine-5-virtual-production',
  'Master Nanite, Lumen dynamic illumination, Niagara particle physics, Blueprint visual scripting, and C++ gameplay systems tailored for high-fidelity VR.',
  'Comprehensive spatial computing curriculum covering high-fidelity virtual reality development with Epic Games Unreal Engine 5. Students learn to configure OpenXR runtimes, build real-time photorealistic volumetric environments, program gameplay mechanics using C++ and Blueprints, and deploy production-ready VR applications.',
  'Virtual Reality',
  'Advanced',
  '["UE5", "C++", "Lumen & Nanite", "VR OpenXR"]'::jsonb,
  8,
  '12 Weeks',
  true,
  1,
  'published',
  NOW()
),
(
  'Unity 3D & XR Interaction Toolkit',
  'unity-3d-xr-interaction-toolkit',
  'Build cross-platform AR/VR experiences targeting Meta Quest 3, Apple Vision Pro, and mobile AR with ARFoundation, spatial anchors, and hand-tracking.',
  'Hands-on laboratory track focused on rapid cross-platform spatial app engineering using Unity 6 and XR Interaction Toolkit (XRIT). Covers spatial locomotion, direct interactor physics, hand tracking gestures, plane raycasting, and passthrough mixed reality.',
  'Mixed Reality',
  'Intermediate',
  '["Unity", "C#", "XRIT", "ARFoundation"]'::jsonb,
  6,
  '8 Weeks',
  true,
  2,
  'published',
  NOW()
),
(
  'WebXR, Three.js & Browser 3D',
  'webxr-threejs-browser-3d',
  'Create zero-install spatial experiences running directly in web browsers using WebGL, WebGPU, Three.js, GLTF pipelines, and WebXR device APIs.',
  'Discover the open spatial web. Learn to construct interactive 3D web environments with Three.js, configure immersive VR/AR sessions with WebXR device APIs, load and optimize GLTF models, and build accessible spatial user interfaces accessible directly from any browser without app installation.',
  'WebXR',
  'Beginner',
  '["JavaScript", "Three.js", "WebGL", "WebXR"]'::jsonb,
  5,
  '6 Weeks',
  true,
  3,
  'published',
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- Initial Research Publications (matches Research archive)
INSERT INTO research_items (
  title, slug, short_summary, description, research_division, research_area,
  research_stage, mentor, technologies, featured, display_order, publication_status, published_at
) VALUES
(
  'Sub-Millimeter Optical Tracking Accuracy in Holographic Headsets',
  'sub-millimeter-tracking',
  'Empirical benchmark assessing stereoscopic drift and depth disparity tolerances under micro-surgical operating room illumination.',
  'This research investigates optical sensor precision and positional drift in holographic head-mounted displays under dynamic clinical operating theater lighting. Through high-frequency optical motion capture benchmarking, we establish tolerance thresholds for stereoscopic spatial overlay fidelity during precision procedures.',
  'Healthcare & Surgical XR',
  'Computer Vision & SLAM',
  'VALIDATION',
  'MD Akif · HCI Division',
  '["Computer Vision", "OpenXR", "Surgical VR"]'::jsonb,
  true,
  1,
  'published',
  NOW()
),
(
  'BIM Telemetry Synchronization via WebSockets in Browser WebXR',
  'bim-telemetry-webxr',
  'Real-time IoT sensor telemetry streaming overlaid onto 3D CAD architectural models in browser runtimes.',
  'An investigation into bidirectional streaming architectures for real-time digital twin monitoring. By coupling high-frequency WebSocket telemetry streams with lightweight WebGL/WebXR scene graphs, we demonstrate low-latency interactive sensor visualization mapped directly onto building information models in standard browser environments.',
  'Industrial Digital Twins',
  'Spatial Digital Twins',
  'EXPERIMENTAL',
  'Faculty Advisor: XR Research Lab · Robotics Division',
  '["WebXR", "Three.js", "Digital Twins"]'::jsonb,
  true,
  2,
  'published',
  NOW()
)
ON CONFLICT (slug) DO NOTHING;
