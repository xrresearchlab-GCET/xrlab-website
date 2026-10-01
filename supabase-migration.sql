-- =============================================================================
-- XR Research Lab — Unified Master Database Schema
-- Run this SINGLE script in the Supabase SQL Editor.
-- It is 100% idempotent: safe to run on fresh or existing databases.
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. TRIGGER FUNCTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. PROJECTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  
  -- Classification
  project_type TEXT NOT NULL DEFAULT 'experiential' 
    CHECK (project_type IN ('experiential', 'individual', 'outsourcing', 'group')),
  research_division TEXT,
  status TEXT NOT NULL DEFAULT 'concept' 
    CHECK (status IN ('concept', 'ongoing', 'prototype', 'completed', 'archived')),
  year INTEGER,
  
  -- Details
  objectives TEXT,
  expected_outcome TEXT,
  technologies JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  
  -- Team & Mentors
  team_members JSONB DEFAULT '[]'::jsonb,
  mentor TEXT,
  
  -- Outsourcing-specific
  client_name TEXT,
  show_client_publicly BOOLEAN DEFAULT FALSE,
  scope TEXT,
  
  -- Individual project-specific
  student_name TEXT,
  
  -- External Resource URLs (strict URL-only policy: no binary file storage)
  concept_image_url TEXT,
  webgl_url TEXT,
  documentation_url TEXT,
  report_url TEXT,
  demo_video_url TEXT,
  github_url TEXT,
  additional_resource_url TEXT,
  
  -- Publishing & Lifecycle
  featured BOOLEAN DEFAULT FALSE,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin'
);

-- Projects Indexes
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_division ON projects(research_division);
CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_projects_featured ON projects(featured) WHERE featured = TRUE;

-- =============================================================================
-- 3. EVENTS TABLE (WITH MILESTONE EXTENSIONS)
-- =============================================================================
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
  
  -- Milestone Fields
  milestone_enabled BOOLEAN DEFAULT FALSE,
  milestone_title TEXT,
  milestone_description TEXT,
  milestone_content JSONB DEFAULT '{}'::jsonb,
  
  -- Extended Milestone & Academic Report Fields
  event_report_url TEXT,
  video_url TEXT,
  presentation_url TEXT,
  external_article_url TEXT,
  participant_count INTEGER,
  achievement TEXT,
  outcome TEXT,
  impact TEXT,
  key_takeaways JSONB DEFAULT '[]'::jsonb,
  
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin'
);

-- Ensure milestone columns exist if table was previously created without them
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_report_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS presentation_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_article_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS participant_count INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS achievement TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS impact TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS key_takeaways JSONB DEFAULT '[]'::jsonb;

-- Events Indexes
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_start_datetime ON events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_milestone_enabled ON events(milestone_enabled) WHERE milestone_enabled = TRUE;

-- =============================================================================
-- 4. AUTH CHALLENGES TABLE (OTP AUTHENTICATION)
-- =============================================================================
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

-- =============================================================================
-- 5. ADMIN SESSIONS TABLE
-- =============================================================================
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

-- =============================================================================
-- 6. AUDIT LOG TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  success BOOLEAN DEFAULT TRUE,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure project_id column exists if audit_log table was created earlier
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- =============================================================================
-- 7. RATE LIMITING TABLE
-- =============================================================================
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

-- =============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Projects: Public read published only
DROP POLICY IF EXISTS "Public can read published projects" ON projects;
CREATE POLICY "Public can read published projects" ON projects
  FOR SELECT
  USING (published = TRUE);

-- Projects: Service role full access
DROP POLICY IF EXISTS "Service role full access projects" ON projects;
CREATE POLICY "Service role full access projects" ON projects
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Events: Public read published only
DROP POLICY IF EXISTS "Public can read published events" ON events;
CREATE POLICY "Public can read published events" ON events
  FOR SELECT
  USING (status IN ('upcoming', 'ongoing', 'completed', 'cancelled'));

-- Events: Service role full access
DROP POLICY IF EXISTS "Service role full access events" ON events;
CREATE POLICY "Service role full access events" ON events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Internal administrative tables: Service role only
DROP POLICY IF EXISTS "Service role access auth_challenges" ON auth_challenges;
CREATE POLICY "Service role access auth_challenges" ON auth_challenges
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access admin_sessions" ON admin_sessions;
CREATE POLICY "Service role access admin_sessions" ON admin_sessions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access audit_log" ON audit_log;
CREATE POLICY "Service role access audit_log" ON audit_log
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access rate_limits" ON rate_limits;
CREATE POLICY "Service role access rate_limits" ON rate_limits
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- 9. AUTO-UPDATE UPDATED_AT TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_events_updated_at ON events;
CREATE TRIGGER trigger_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 10. CLEANUP FUNCTION FOR EXPIRED DATA
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Clean expired auth challenges (older than 1 hour)
  DELETE FROM auth_challenges WHERE expires_at < NOW() - INTERVAL '1 hour';
  -- Clean expired sessions
  DELETE FROM admin_sessions WHERE expires_at < NOW();
  -- Clean old rate limit entries (older than 1 day)
  DELETE FROM rate_limits WHERE last_attempt < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 11. SEED INITIAL RESEARCH PROJECTS (IDEMPOTENT)
-- =============================================================================
INSERT INTO projects (
  title, slug, short_description, description, project_type, research_division,
  status, year, objectives, expected_outcome, technologies, tags, team_members,
  mentor, webgl_url, published, featured, published_at
) VALUES 
(
  'Entertainment 3D Interactive WebGL Demo Game',
  'entertainment-3d-interactive-webgl-demo-game',
  'Interactive WebGL 3D game experience built with Unity & WebGL, featuring real-time spatial graphics and controls.',
  'Interactive WebGL 3D game experience developed at the XR Research Lab, featuring real-time spatial graphics, optimized WebGL shaders, responsive keyboard and mouse controls, and immersive interactive mechanics.',
  'experiential',
  'Entertainment',
  'completed',
  2026,
  'Deliver an accessible in-browser 3D interactive demonstration proving real-time spatial rendering and WebGL runtime stability.',
  'Fully operational WebGL build hosted and accessible directly within Project Space.',
  '["Unity 3D", "WebGL", "C#", "Spatial Computing"]'::jsonb,
  '["Interactive", "3D Gaming", "WebGL", "Unity"]'::jsonb,
  '["XR Lab Student Researchers", "Entertainment Division Team"]'::jsonb,
  'XR Lab Faculty Lead',
  'projects/entertainment/demo game/index.html',
  TRUE,
  TRUE,
  NOW()
),
(
  'Virtual Engineering Laboratory',
  'virtual-engineering-laboratory',
  'Mechanical simulations, CAD model visualization, and structural digital twins built for real-time 3D engineering analysis.',
  'A comprehensive virtual engineering suite providing interactive mechanical simulations, exploded CAD model inspections, stress-strain visual overlays, and real-time structural digital twins.',
  'experiential',
  'Engineering',
  'ongoing',
  2026,
  'Enable students and researchers to safely disassemble complex machinery, simulate structural load tolerances, and inspect high-voltage systems in immersive 3D.',
  'Interactive VR/WebGL modules for thermodynamics, mechanical design, and robotics integrated into undergraduate engineering curricula.',
  '["Unreal Engine 5", "WebXR", "Three.js", "CAD/STEP", "Digital Twins"]'::jsonb,
  '["Engineering", "Simulation", "CAD", "Digital Twin"]'::jsonb,
  '["Engineering Division Research Team"]'::jsonb,
  'Dr. Mechanical Engineering Lead',
  NULL,
  TRUE,
  TRUE,
  NOW()
),
(
  'Spatial Career Placement Simulator',
  'spatial-career-placement-simulator',
  'Industry-ready training, technical skill showcases, and career placement portfolios in spatial technology.',
  'Simulated technical assessment environments that place candidates in virtual industrial engineering and IT problem-solving scenarios, recording spatial problem-solving metrics and team communication.',
  'experiential',
  'Placements',
  'ongoing',
  2026,
  'Prepare students for high-stakes technical interviews with immersive behavioral and situational simulations.',
  'Standardized spatial assessment metrics and portfolio generation for student candidates.',
  '["Unity 3D", "WebXR", "AI Interview Engine", "Spatial Analytics"]'::jsonb,
  '["Placements", "Career Prep", "Simulation", "AI"]'::jsonb,
  '["Placement Training Cell", "XR Developers"]'::jsonb,
  'Faculty Placement Coordinator',
  NULL,
  TRUE,
  FALSE,
  NOW()
),
(
  'Surgical VR Anatomy & Clinical Training',
  'surgical-vr-anatomy-clinical-training',
  'Surgical VR training, medical anatomy visualization, and AR-assisted clinical simulations for next-generation healthcare.',
  'An interactive biomedical simulation enabling medical trainees to perform virtual surgical dissections, inspect micro-vascular pathways, and practice emergency triage in procedural VR.',
  'experiential',
  'Healthcare',
  'ongoing',
  2026,
  'Provide risk-free procedural training for complex surgical techniques with realistic haptic-inspired visual feedback.',
  'Clinical validation of VR anatomical accuracy and improved procedural recall rates.',
  '["Unreal Engine 5", "DICOM Volume Rendering", "VR Haptics", "Bio-Sensors"]'::jsonb,
  '["Healthcare", "Surgery", "VR", "Anatomy"]'::jsonb,
  '["Healthcare XR Research Group"]'::jsonb,
  'Medical Advisory Board',
  NULL,
  TRUE,
  TRUE,
  NOW()
),
(
  'Virtual Museum & Cultural Heritage Walkthrough',
  'virtual-museum-cultural-heritage-walkthrough',
  'Heritage site preservation, virtual museum walkthroughs, and interactive cultural spatial experiences.',
  'High-precision photogrammetry models of historic monuments and cultural artifacts, presented as an immersive virtual museum with interactive audio-guided spatial exhibits.',
  'experiential',
  'Tourism & Culture',
  'ongoing',
  2026,
  'Preserve endangered historical structures in digital twin format for education and virtual tourism.',
  'Public web-based spatial tours accessible from any browser or mobile XR headset.',
  '["Photogrammetry", "Three.js", "Gaussian Splatting", "WebXR"]'::jsonb,
  '["Heritage", "Virtual Museum", "Culture", "Photogrammetry"]'::jsonb,
  '["Digital Heritage Team"]'::jsonb,
  'Cultural Preservation Mentor',
  NULL,
  TRUE,
  FALSE,
  NOW()
),
(
  'Smart Campus BIM Digital Twin',
  'smart-campus-bim-digital-twin',
  'BIM architecture walkthroughs, civil engineering visualization, and smart city digital twins.',
  'A live spatial digital twin of the college campus integrating BIM architectural models with real-time IoT energy consumption, occupancy sensors, and emergency evacuation simulations.',
  'experiential',
  'Building & Infrastructure',
  'ongoing',
  2026,
  'Facilitate predictive facility management and interactive campus tours.',
  'Full-scale interactive campus model with live telemetry overlays.',
  '["BIM/Revit", "Three.js", "IoT MQTT", "Digital Twin"]'::jsonb,
  '["BIM", "Infrastructure", "Smart City", "Digital Twin"]'::jsonb,
  '["Civil & IoT Research Cohort"]'::jsonb,
  'Civil Engineering Dept Chair',
  NULL,
  TRUE,
  FALSE,
  NOW()
),
(
  'Haptic Feedback Spatial Controller for WebXR',
  'haptic-feedback-spatial-controller-for-webxr',
  'Custom low-latency wireless haptic glove hardware interfacing directly with WebXR spatial web applications.',
  'An independent student research exploration designing custom microcontroller-driven tactile vibration actuators integrated into lightweight spatial gloves, providing physical tactile resistance when grabbing virtual tools.',
  'individual',
  'Engineering',
  'ongoing',
  2026,
  'Develop an affordable, open-hardware haptic glove that connects to browser-based WebXR without external drivers.',
  'Working prototype gloves with sub-15ms response latency evaluated across assembly simulations.',
  '["WebXR", "Arduino", "ESP32", "C++", "Three.js"]'::jsonb,
  '["Haptics", "Hardware", "WebXR", "Sensors"]'::jsonb,
  '["Aravind Sharma (UG Researcher)"]'::jsonb,
  'Dr. K. Srinivas Rao',
  NULL,
  TRUE,
  TRUE,
  NOW()
),
(
  'Neural Gaze Tracking & Foveated Rendering Prototype',
  'neural-gaze-tracking-and-foveated-rendering-prototype',
  'Deep learning-powered gaze estimation pipeline optimizing real-time VR graphics performance by 40%.',
  'Individual honors project implementing a camera-based neural network model to track user pupil coordinates in real-time, focusing high-fidelity shading exclusively where the eye looks while degrading peripheral resolution.',
  'individual',
  'Engineering',
  'prototype',
  2026,
  'Reduce computational overhead on standalone headsets by dynamically prioritizing GPU resources around eye fixation points.',
  'Demonstrated 42% framerate boost in dense architectural scenes with zero perceived loss in image clarity.',
  '["Python", "PyTorch", "OpenCV", "Unity 3D", "HLSL Compute Shaders"]'::jsonb,
  '["Eye Tracking", "Foveated Rendering", "AI/ML", "Optimization"]'::jsonb,
  '["Sneha Patel (Student Researcher)"]'::jsonb,
  'Prof. M. V. Ramana',
  NULL,
  TRUE,
  FALSE,
  NOW()
),
(
  'Aerospace Turbofan Assembly & Maintenance VR',
  'aerospace-turbofan-assembly-and-maintenance-vr',
  'Enterprise VR maintenance training system for commercial aerospace turbine disassembly and safety verification.',
  'Outsourced industrial spatial solution built for aircraft propulsion engineers to practice critical assembly checklists, tool calibrations, and fastener torque validations inside high-fidelity VR.',
  'outsourcing',
  'Engineering',
  'completed',
  2025,
  'Cut aircraft technician training turnaround by 50% while guaranteeing zero hazard exposure.',
  'Deployed VR training simulation certified across initial industrial maintenance technician batches.',
  '["Unreal Engine 5", "Meta Quest Pro", "Physics Rigging", "CAD Import"]'::jsonb,
  '["Aerospace", "Maintenance", "Simulation", "Industry 4.0"]'::jsonb,
  '["XR Lab Industrial Development Unit"]'::jsonb,
  'Aviation Industry Mentor',
  NULL,
  TRUE,
  TRUE,
  NOW()
),
(
  'Interactive Spatial Showroom & Digital Twin Architecture',
  'interactive-spatial-showroom-and-digital-twin-architecture',
  'Photorealistic commercial spatial walkthrough enabling remote interactive real-estate exploration.',
  'Commercial outsourcing project developed for modern luxury architecture showcases, supporting real-time material swapping, natural daylight angle simulations, and interactive spatial measuring tools.',
  'outsourcing',
  'Building & Infrastructure',
  'completed',
  2026,
  'Provide an ultra-low latency spatial browser preview of residential developments before physical groundbreaking.',
  'Production-ready WebGL & Pixel Streaming spatial showroom with multi-client interactive walkthroughs.',
  '["Unreal Engine 5", "Pixel Streaming", "WebRTC", "Three.js", "BIM"]'::jsonb,
  '["Architecture", "Real Estate", "Digital Twin", "Showroom"]'::jsonb,
  '["Digital Architecture Cohort"]'::jsonb,
  'Prof. Architecture Department',
  NULL,
  TRUE,
  FALSE,
  NOW()
),
(
  'Multi-User Collaborative Spatial Research Classroom',
  'multi-user-collaborative-spatial-research-classroom',
  'Networked multi-student virtual research laboratory supporting shared manipulation of molecular and mechanical 3D models.',
  'A multi-disciplinary group development linking students across remote locations into an interconnected virtual laboratory featuring spatial audio, custom avatar gestures, and synchronous 3D whiteboards.',
  'group',
  'General',
  'ongoing',
  2026,
  'Establish a latency-tolerant shared spatial environment where up to 30 students can concurrently experiment on shared 3D simulations.',
  'Validated multi-user networking layer with sub-40ms spatial sync across mobile and desktop clients.',
  '["Unity 3D", "Photon Fusion", "Spatial Audio", "WebRTC", "C#"]'::jsonb,
  '["Multiplayer", "Education", "Collaboration", "Spatial Audio"]'::jsonb,
  '["Rahul Verma", "Priya Nair", "Syed Farhan", "Divya K"]'::jsonb,
  'XR Lab Faculty Advisory',
  NULL,
  TRUE,
  TRUE,
  NOW()
),
(
  'Disaster Triage & Flood Evacuation VR Simulator',
  'disaster-triage-and-flood-evacuation-vr-simulator',
  'Urban emergency scenario simulator modeling rapid floodwaters, situational triage, and community evacuation routes.',
  'Student hackathon gold-winning project creating dynamic fluid physics simulations of urban flooding, challenging emergency response trainees to direct virtual citizens to safety under intense temporal pressure.',
  'group',
  'Building & Infrastructure',
  'completed',
  2025,
  'Simulate realistic flash flood scenarios and measure human decision-making accuracy during emergency evacuation.',
  'First prize winner at National Spatial Computing Hackathon 2025.',
  '["Unreal Engine 5", "Niagara Fluids", "Chaos Physics", "GIS Spatial Data"]'::jsonb,
  '["Disaster Management", "Evacuation", "VR Simulation", "Hackathon"]'::jsonb,
  '["RescueXR Student Team", "CSE & Civil Interdisciplinary Cohort"]'::jsonb,
  'State Disaster Management Cell',
  NULL,
  TRUE,
  FALSE,
  NOW()
)
ON CONFLICT (slug) DO NOTHING;
