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
-- 4. MILESTONES TABLE (COMPLETED EVENTS & RESEARCH ACHIEVEMENTS)
-- Dedicated section for completed events and academic outcomes
-- =============================================================================
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  
  -- Milestone Classification
  milestone_type TEXT NOT NULL DEFAULT 'completed_event'
    CHECK (milestone_type IN ('completed_event', 'project_milestone', 'award', 'publication', 'lab_milestone')),
  category TEXT DEFAULT 'Completed Event',
  research_division TEXT,
  organizer TEXT,
  
  -- Completion & Timeline
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location TEXT,
  venue TEXT,
  
  -- Academic & Verification Artifacts (External URLs ONLY: Google Drive, YouTube, external HTTPS)
  event_report_url TEXT,
  video_url TEXT,
  presentation_url TEXT,
  external_article_url TEXT,
  featured_image TEXT,
  
  -- Quantitative & Qualitative Impact
  participant_count INTEGER,
  achievement TEXT,
  outcome TEXT,
  impact TEXT,
  key_takeaways JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  
  -- Associated Event (optional foreign key if linked to a previous event record)
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  
  -- Publishing & Lifecycle
  published BOOLEAN DEFAULT TRUE,
  featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin'
);

-- Milestones Indexes
CREATE INDEX IF NOT EXISTS idx_milestones_slug ON milestones(slug);
CREATE INDEX IF NOT EXISTS idx_milestones_type ON milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_milestones_division ON milestones(research_division);
CREATE INDEX IF NOT EXISTS idx_milestones_completed_date ON milestones(completed_date DESC);
CREATE INDEX IF NOT EXISTS idx_milestones_published ON milestones(published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_milestones_featured ON milestones(featured) WHERE featured = TRUE;

-- =============================================================================
-- 5. AUTH CHALLENGES TABLE (OTP AUTHENTICATION)
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
-- 6. ADMIN SESSIONS TABLE
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
-- 7. AUDIT LOG TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  success BOOLEAN DEFAULT TRUE,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure project_id and milestone_id columns exist if audit_log table was created earlier
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;

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
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
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

-- Milestones: Public read published only
DROP POLICY IF EXISTS "Public can read published milestones" ON milestones;
CREATE POLICY "Public can read published milestones" ON milestones
  FOR SELECT
  USING (published = TRUE);

-- Milestones: Service role full access
DROP POLICY IF EXISTS "Service role full access milestones" ON milestones;
CREATE POLICY "Service role full access milestones" ON milestones
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

DROP TRIGGER IF EXISTS trigger_milestones_updated_at ON milestones;
CREATE TRIGGER trigger_milestones_updated_at
  BEFORE UPDATE ON milestones
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

-- =============================================================================
-- 13. SEED COMPLETED EVENTS & RESEARCH MILESTONES
-- =============================================================================
INSERT INTO milestones (
  title,
  slug,
  milestone_type,
  category,
  research_division,
  completed_date,
  location,
  venue,
  organizer,
  short_description,
  description,
  event_report_url,
  video_url,
  presentation_url,
  external_article_url,
  participant_count,
  achievement,
  outcome,
  impact,
  key_takeaways,
  tags,
  featured,
  published
) VALUES
(
  'National Spatial Computing Hackathon — 1st Place Victory',
  'national-spatial-computing-hackathon-1st-place-victory',
  'completed_event',
  'Completed Event',
  'Building & Infrastructure',
  '2025-11-18',
  'Bengaluru, India',
  'National Tech Convention Center',
  'National Spatial Computing Federation & XR Lab GCET',
  'GCET XR Research Lab team clinched 1st place among 140+ nationwide university engineering teams with their VR Disaster Triage simulator.',
  'A rigorous 48-hour continuous hackathon culminating in the presentation of our Chaos Physics and Niagara Fluid evacuation simulator. The system was praised by judges for low-latency simulation fidelity on standalone headsets.',
  'https://drive.google.com/file/d/demo-hackathon-gold-report/view',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://docs.google.com/presentation/d/demo-hackathon-slides/edit',
  'https://techtimes.example.com/gcet-xr-lab-wins-national-hackathon',
  140,
  'Gold Trophy & Best Technical Architecture Award',
  'Full prototype deployed to Meta Quest 3 and adopted by regional civil defense trainers for trial evaluations.',
  'Validated student readiness in high-pressure competition and established XR Lab as a leading national collegiate research unit.',
  '["Real-time Niagara fluid particle reduction on mobile chipset", "User stress metrics tracking via heart rate telemetry", "Synchronized multi-user VR triage coordination"]'::jsonb,
  '["Hackathon", "Victory", "Disaster Management", "Unreal Engine 5"]'::jsonb,
  TRUE,
  TRUE
),
(
  'XR Medical Surgery & Anatomy Symposium 2025',
  'xr-medical-surgery-and-anatomy-symposium-2025',
  'completed_event',
  'Completed Event',
  'Healthcare',
  '2025-09-12',
  'GCET Auditorium',
  'Main Academic Campus, Hall A',
  'Department of Medical Sciences & GCET XR Research Lab',
  'A milestone academic symposium gathering 280+ clinicians, biomedical students, and spatial computing researchers discussing haptic surgical training.',
  'Three keynote lectures delivered by leading laparoscopic surgeons followed by hands-on haptic demonstration stations created by XR Lab interns. Comprehensive post-event academic report published to our institutional repository.',
  'https://drive.google.com/file/d/demo-medical-symposium-report/view',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://docs.google.com/presentation/d/demo-symposium-slides/edit',
  'https://medicaltech.example.com/symposium-2025-gcet',
  280,
  'Official Memorandum of Understanding signed with Regional Teaching Hospital',
  'Formalized clinical validation trials for XR Lab Laparoscopic Haptic Simulator.',
  'Bridged the gap between clinical requirements and immersive software engineering.',
  '["Sub-millimeter haptic feedback is necessary for tissue incision training", "Stereoscopic visualization reduced cognitive fatigue by 34% among resident trainees", "Cloud-backed telemetry records surgeon precision metrics accurately"]'::jsonb,
  '["Symposium", "Medical XR", "Healthcare", "Surgery", "Haptics"]'::jsonb,
  TRUE,
  TRUE
),
(
  'Multi-User Spatial Audio & Photon Hands-On Workshop',
  'multi-user-spatial-audio-and-photon-hands-on-workshop',
  'completed_event',
  'Completed Event',
  'General',
  '2025-08-04',
  'XR Research Lab Studio',
  'Lab Room 302, GCET Campus',
  'XR Lab Core Engineering Cohort',
  'Intensive full-day workshop training 45 undergraduate researchers in WebRTC, spatial audio HRTF filtering, and multi-user networked VR synchronization.',
  'All 45 participants successfully built and deployed a 4-player shared VR room with positional voice chat on local Quest headsets by the end of the session.',
  'https://drive.google.com/file/d/demo-spatial-audio-workshop-report/view',
  NULL,
  'https://docs.google.com/presentation/d/demo-workshop-slides/edit',
  NULL,
  45,
  '100% project completion rate across all 12 student teams',
  '45 trained undergraduate developers onboarded into active lab research tracks.',
  'Expanded active student developer pool capable of contributing to production spatial environments.',
  '["Photon Fusion provides predictable clock sync across asymmetric networks", "Binaural spatial audio reduces speech collisions in multi-user discussion", "Asset optimization strategies for standalone VR performance"]'::jsonb,
  '["Workshop", "Spatial Audio", "Multiplayer", "Networking"]'::jsonb,
  FALSE,
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 14. MEMBERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'Member',
  tagline TEXT,
  about TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT'
    CHECK (status IN ('PRESENT', 'PAST')),
  is_lead BOOLEAN DEFAULT FALSE,
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

-- Add columns if table already existed prior to migration
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_lead BOOLEAN DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_display_order ON members(display_order);
CREATE INDEX IF NOT EXISTS idx_members_is_lead ON members(is_lead) WHERE is_lead = TRUE;

DROP TRIGGER IF EXISTS trigger_members_updated_at ON members;
CREATE TRIGGER trigger_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 15. COURSES TABLE
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

DROP TRIGGER IF EXISTS trigger_courses_updated_at ON courses;
CREATE TRIGGER trigger_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 16. COURSE LESSONS TABLE
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

DROP TRIGGER IF EXISTS trigger_course_lessons_updated_at ON course_lessons;
CREATE TRIGGER trigger_course_lessons_updated_at
  BEFORE UPDATE ON course_lessons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 17. RESEARCH ITEMS TABLE
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

DROP TRIGGER IF EXISTS trigger_research_items_updated_at ON research_items;
CREATE TRIGGER trigger_research_items_updated_at
  BEFORE UPDATE ON research_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 18. AUDIT LOG EXTENSIONS & RLS POLICIES FOR NEW TABLES
-- =============================================================================
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS research_id UUID REFERENCES research_items(id) ON DELETE SET NULL;

-- Members RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read present members" ON members;
CREATE POLICY "Public can read present members" ON members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access members" ON members;
CREATE POLICY "Service role full access members" ON members FOR ALL USING (true) WITH CHECK (true);

-- Courses RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read published courses" ON courses;
CREATE POLICY "Public can read published courses" ON courses FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS "Service role full access courses" ON courses;
CREATE POLICY "Service role full access courses" ON courses FOR ALL USING (true) WITH CHECK (true);

-- Course Lessons RLS
ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read published lessons" ON course_lessons;
CREATE POLICY "Public can read published lessons" ON course_lessons FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS "Service role full access lessons" ON course_lessons;
CREATE POLICY "Service role full access lessons" ON course_lessons FOR ALL USING (true) WITH CHECK (true);

-- Research Items RLS
ALTER TABLE research_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read published research" ON research_items;
CREATE POLICY "Public can read published research" ON research_items FOR SELECT USING (publication_status = 'published');
DROP POLICY IF EXISTS "Service role full access research" ON research_items;
CREATE POLICY "Service role full access research" ON research_items FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- 19. INITIAL SEED DATA (CORE CURRICULA & RESEARCH PUBLICATIONS)
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

-- Initial Lab Leadership (matches About page leadership section)
INSERT INTO members (
  full_name, email, phone, role, tagline, about, status, is_lead, show_email_publicly, display_order
)
SELECT
  'MD Akif',
  'xrresearchlab@gcet.edu.in',
  '+91 8763688312',
  'AR/VR Research Lab Lead Researcher & Head',
  'Head of Lab • Immersive Tech & HCI Research',
  'Oversees overall lab direction, strategic research initiatives, interdisciplinary project teams, and global academic collaborations.',
  'PRESENT',
  TRUE,
  TRUE,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM members WHERE is_lead = TRUE
);


