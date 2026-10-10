/**
 * /api/courses-public
 * Public endpoints for courses & lessons catalog
 * GET       — list published courses (supports filters: category, difficulty, featured, search)
 * GET?slug= — get single published course with its published lessons
 */

const { getSupabase, respond, respondError, handleOptions } = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  // Single course lookup by slug
  if (params.slug) {
    const { data: course, error: cErr } = await supabase
      .from('courses')
      .select(`
        id, title, slug, short_description, description, category, difficulty,
        thumbnail_url, video_url, intro_video_url, instructor_name, instructor_role,
        estimated_duration, lesson_count, learning_objectives, prerequisites,
        technologies, tags, language, certificate_available, featured,
        published_at
      `)
      .eq('slug', params.slug)
      .eq('status', 'published')
      .maybeSingle();

    if (cErr || !course) return respondError(404, 'Course not found');

    // Fetch published lessons
    const { data: lessons, error: lErr } = await supabase
      .from('course_lessons')
      .select('id, title, slug, description, video_url, resource_url, lesson_order')
      .eq('course_id', course.id)
      .eq('status', 'published')
      .order('lesson_order', { ascending: true });

    return respond(200, {
      course,
      lessons: lessons || [],
    });
  }

  // Course list query
  let query = supabase
    .from('courses')
    .select(`
      id, title, slug, short_description, category, difficulty,
      thumbnail_url, video_url, instructor_name, instructor_role,
      estimated_duration, lesson_count, technologies, tags,
      certificate_available, featured, published_at
    `)
    .eq('status', 'published');

  if (params.category && params.category !== 'all') {
    query = query.eq('category', params.category);
  }

  if (params.difficulty && params.difficulty !== 'all') {
    query = query.eq('difficulty', params.difficulty);
  }

  if (params.featured === 'true') {
    query = query.eq('featured', true);
  }

  if (params.search) {
    const term = `%${params.search.trim()}%`;
    query = query.or(`title.ilike.${term},short_description.ilike.${term},category.ilike.${term}`);
  }

  query = query
    .order('display_order', { ascending: true })
    .order('published_at', { ascending: false });

  const { data: courses, error } = await query;

  if (error) {
    console.error('Fetch public courses error:', error.message);
    return respondError(500, 'Failed to fetch courses');
  }

  return respond(200, { courses: courses || [] });
};
