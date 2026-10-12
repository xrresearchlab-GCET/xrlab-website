/**
 * /api/courses-public
 * Public endpoints for Tutorials & Learning Catalog (Epic Dev Community Style)
 * GET       — list published tutorials (supports filters: category/engine, content_type, author_type, difficulty, featured, search, sort)
 * GET?slug= — get single published tutorial with lessons/steps
 */

const { getSupabase, respond, respondError, handleOptions } = require('./utils/shared');

function normalizeTutorial(c) {
  if (!c) return null;
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    short_description: c.short_description || c.description || '',
    description: c.description || c.short_description || '',
    tutorial_body: c.tutorial_body || c.description || c.short_description || '',
    content_type: c.content_type || 'Tutorial',
    category: c.category || 'Unreal Engine 5',
    difficulty: c.difficulty || 'Beginner',
    author_name: c.author_name || c.instructor_name || 'XR Research Lab',
    author_role: c.author_role || c.instructor_role || 'Lab Core',
    author_type: c.author_type || (c.instructor_role?.toLowerCase().includes('student') ? 'Community' : 'Lab Core'),
    author_avatar_url: c.author_avatar_url || null,
    estimated_duration: c.estimated_duration || '15 min read',
    thumbnail_url: c.thumbnail_url || null,
    video_url: c.video_url || c.intro_video_url || null,
    external_url: c.external_url || null,
    technologies: Array.isArray(c.technologies) ? c.technologies : [],
    tags: Array.isArray(c.tags) ? c.tags : [],
    views_count: c.views_count || 0,
    likes_count: c.likes_count || 0,
    lesson_count: c.lesson_count || 0,
    certificate_available: !!c.certificate_available,
    featured: !!c.featured,
    status: c.status || 'published',
    published_at: c.published_at || c.created_at,
    created_at: c.created_at,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  // Single tutorial lookup by slug
  if (params.slug) {
    const { data: item, error: cErr } = await supabase
      .from('courses')
      .select('*')
      .eq('slug', params.slug)
      .neq('status', 'archived')
      .maybeSingle();

    if (cErr || !item) return respondError(404, 'Tutorial not found');

    // Fetch optional steps/lessons
    const { data: lessons } = await supabase
      .from('course_lessons')
      .select('*')
      .eq('course_id', item.id)
      .neq('status', 'archived')
      .order('lesson_order', { ascending: true });

    return respond(200, {
      course: normalizeTutorial(item),
      tutorial: normalizeTutorial(item),
      lessons: lessons || [],
    });
  }

  // Tutorial list query
  let query = supabase
    .from('courses')
    .select('*')
    .neq('status', 'archived');

  // Category / Engine filter
  if (params.category && params.category !== 'all') {
    query = query.eq('category', params.category);
  }

  // Content Type filter (Tutorial, Community Tutorial, Knowledge Base, Snippet, etc.)
  if (params.content_type && params.content_type !== 'all') {
    query = query.eq('content_type', params.content_type);
  }

  // Author Type filter (Lab Core, Community)
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
    query = query.order('published_at', { ascending: false });
  } else if (sort === 'popular') {
    query = query.order('views_count', { ascending: false }).order('published_at', { ascending: false });
  } else {
    // Trending default: featured first, then display_order, then newest
    query = query
      .order('featured', { ascending: false })
      .order('display_order', { ascending: true })
      .order('published_at', { ascending: false });
  }

  const { data: rows, error } = await query;

  if (error) {
    console.warn('Fetch public tutorials notice (table may be unpopulated):', error.message);
    return respond(200, {
      courses: [],
      tutorials: [],
      count: 0,
    });
  }

  const normalized = (rows || []).map(normalizeTutorial);

  return respond(200, {
    courses: normalized,
    tutorials: normalized,
    count: normalized.length,
  });
};
