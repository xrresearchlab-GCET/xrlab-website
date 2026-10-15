/**
 * /api/courses-public
 * Public endpoints for Tutorials & Learning Catalog (Epic Dev Community Style)
 * GET       — list published tutorials (supports filters: category/engine, content_type, author_type, difficulty, featured, search, sort)
 * GET?slug= — get single published tutorial with lessons/steps
 */

const { getSupabase, respond, respondError, handleOptions } = require('./utils/shared');

function safeJsonParse(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
}

function normalizeTutorial(c) {
  if (!c) return null;

  const authorName = c.author_name || c.instructor_name || 'XR Research Lab';
  const authorRole = c.author_role || c.instructor_role || 'Lab Core';
  const authorType = c.author_type || (
    authorRole.toLowerCase().includes('student') || authorRole.toLowerCase().includes('community')
      ? 'Community'
      : 'Lab Core'
  );

  return {
    id: c.id,
    title: c.title || 'Untitled Tutorial',
    slug: c.slug || `tutorial-${c.id}`,
    short_description: c.short_description || c.description || '',
    description: c.description || c.short_description || '',
    tutorial_body: c.tutorial_body || c.description || c.short_description || '',
    content_type: c.content_type || 'Tutorial',
    category: c.category || 'Unreal Engine 5',
    difficulty: c.difficulty || 'Beginner',
    author_name: authorName,
    author_role: authorRole,
    author_type: authorType,
    author_avatar_url: c.author_avatar_url || null,
    estimated_duration: c.estimated_duration || '15 min read',
    thumbnail_url: c.thumbnail_url || null,
    video_url: c.video_url || c.intro_video_url || null,
    external_url: c.external_url || null,
    technologies: safeJsonParse(c.technologies, []),
    tags: safeJsonParse(c.tags, []),
    views_count: typeof c.views_count === 'number' ? c.views_count : 0,
    likes_count: typeof c.likes_count === 'number' ? c.likes_count : 0,
    lesson_count: typeof c.lesson_count === 'number' ? c.lesson_count : 0,
    certificate_available: !!c.certificate_available,
    featured: !!c.featured,
    status: c.status || 'published',
    published_at: c.published_at || c.created_at || new Date().toISOString(),
    created_at: c.created_at || new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    console.error('courses-public: Supabase initialization error:', err.message);
    return respond(500, {
      error: 'Database configuration missing: ' + err.message,
      courses: [],
      tutorials: [],
      count: 0,
    });
  }

  const params = event.queryStringParameters || {};

  // Single tutorial lookup by slug
  if (params.slug) {
    try {
      const { data: item, error: cErr } = await supabase
        .from('courses')
        .select('*')
        .eq('slug', params.slug)
        .neq('status', 'archived')
        .maybeSingle();

      if (cErr) {
        console.error('Fetch single tutorial error:', cErr.message);
        return respondError(500, 'Database error: ' + cErr.message);
      }
      if (!item) return respondError(404, 'Tutorial not found');

      // Fetch optional steps/lessons
      const { data: lessons } = await supabase
        .from('course_lessons')
        .select('*')
        .eq('course_id', item.id)
        .neq('status', 'archived')
        .order('lesson_order', { ascending: true });

      const normalized = normalizeTutorial(item);
      return respond(200, {
        course: normalized,
        tutorial: normalized,
        lessons: lessons || [],
      });
    } catch (err) {
      console.error('Exception in single tutorial lookup:', err.message);
      return respondError(500, 'Internal server error: ' + err.message);
    }
  }

  // Tutorial list query
  try {
    let query = supabase
      .from('courses')
      .select('*')
      .neq('status', 'archived');

    // Category / Engine filter
    if (params.category && params.category !== 'all') {
      const cat = params.category;
      query = query.or(`category.ilike.%${cat}%,title.ilike.%${cat}%`);
    }

    // Content Type filter
    if (params.content_type && params.content_type !== 'all') {
      query = query.eq('content_type', params.content_type);
    }

    // Author Type filter
    if (params.author_type && params.author_type !== 'all') {
      query = query.eq('author_type', params.author_type);
    }

    // Difficulty filter
    if (params.difficulty && params.difficulty !== 'all') {
      query = query.eq('difficulty', params.difficulty);
    }

    // Featured filter
    if (params.featured === 'true') {
      query = query.eq('featured', true);
    }

    // Search keyword
    if (params.search) {
      const term = `%${params.search.trim()}%`;
      query = query.or(`title.ilike.${term},short_description.ilike.${term},category.ilike.${term}`);
    }

    // Sorting
    const sort = (params.sort || 'trending').toLowerCase();
    if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sort === 'popular') {
      query = query.order('display_order', { ascending: true }).order('created_at', { ascending: false });
    } else {
      // Trending default
      query = query
        .order('featured', { ascending: false })
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });
    }

    let { data: rows, error } = await query;

    // Resilient fallback query if custom filters/orders hit un-migrated schema
    if (error) {
      console.warn('Primary tutorial query failed, trying basic fallback:', error.message);
      const fallback = await supabase
        .from('courses')
        .select('*')
        .neq('status', 'archived');

      if (fallback.error) {
        console.error('Fallback tutorial query also failed:', fallback.error.message);
        return respond(500, {
          error: 'Failed to retrieve tutorials from database: ' + fallback.error.message,
          courses: [],
          tutorials: [],
          count: 0,
        });
      }
      rows = fallback.data || [];
    }

    const normalized = (rows || []).map(normalizeTutorial);

    return respond(200, {
      courses: normalized,
      tutorials: normalized,
      count: normalized.length,
    });
  } catch (err) {
    console.error('Unhandled error in courses-public handler:', err.message);
    return respond(500, {
      error: 'Server error: ' + err.message,
      courses: [],
      tutorials: [],
      count: 0,
    });
  }
};
