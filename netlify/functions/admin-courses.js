/**
 * /api/admin-courses
 * Protected admin CRUD for Courses & Course Lessons
 * GET    — list all courses or get single course with lessons
 * POST   — create course OR lesson sub-actions (_action: 'create_lesson', 'update_lesson', 'delete_lesson', 'update_status')
 * PUT    — update course
 * DELETE — delete course
 */

const {
  getSupabase, respond, respondError, handleOptions,
  validateSession, validateCSRF,
  sanitizeText, validateUrl, generateSlug,
  auditLog, getClientIP,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const ip = getClientIP(event);
  const ua = event.headers['user-agent'] || '';

  // Auth verification
  const session = await validateSession(event);
  if (!session) return respondError(401, 'Authentication required');

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  // ── GET ──
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const { data: course, error: cErr } = await supabase
        .from('courses')
        .select('*')
        .eq('id', params.id)
        .single();

      if (cErr || !course) return respondError(404, 'Course not found');

      const { data: lessons, error: lErr } = await supabase
        .from('course_lessons')
        .select('*')
        .eq('course_id', params.id)
        .order('lesson_order', { ascending: true })
        .order('created_at', { ascending: true });

      return respond(200, {
        course,
        lessons: lessons || [],
      });
    }

    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch courses error:', error.message);
      return respondError(500, 'Failed to fetch courses');
    }

    return respond(200, { courses: courses || [] });
  }

  // Mutating operations require CSRF
  if (!validateCSRF(event)) return respondError(403, 'Invalid CSRF token');

  // ── POST ──
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respondError(400, 'Invalid request body');
    }

    // Sub-action: Lesson Creation
    if (body._action === 'create_lesson') {
      const { course_id, title, description, video_url, resource_url, lesson_order, status } = body;
      if (!course_id || !title) return respondError(400, 'course_id and title are required');

      const slug = generateSlug(title) + '-' + Date.now().toString(36);
      const cleanVideo = video_url ? validateUrl(video_url) : null;
      const cleanResource = resource_url ? validateUrl(resource_url) : null;

      const { data: lesson, error: lErr } = await supabase
        .from('course_lessons')
        .insert({
          course_id,
          title: sanitizeText(title),
          slug,
          description: sanitizeText(description || ''),
          video_url: cleanVideo,
          resource_url: cleanResource,
          lesson_order: parseInt(lesson_order, 10) || 0,
          status: status === 'published' ? 'published' : 'draft',
        })
        .select('*')
        .single();

      if (lErr) {
        console.error('Create lesson error:', lErr.message);
        return respondError(500, 'Failed to create lesson');
      }

      // Update lesson_count on course
      const { count } = await supabase
        .from('course_lessons')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course_id);

      await supabase.from('courses').update({ lesson_count: count || 0 }).eq('id', course_id);

      await auditLog('COURSE_LESSON_CREATE', {
        success: true, ip, userAgent: ua, courseId: course_id,
        details: { lesson_id: lesson.id, title: lesson.title },
      });

      return respond(201, { lesson });
    }

    // Sub-action: Lesson Update
    if (body._action === 'update_lesson') {
      const { id, title, description, video_url, resource_url, lesson_order, status } = body;
      if (!id) return respondError(400, 'Lesson id is required');

      const updates = {};
      if (title !== undefined) updates.title = sanitizeText(title);
      if (description !== undefined) updates.description = sanitizeText(description);
      if (video_url !== undefined) updates.video_url = video_url ? validateUrl(video_url) : null;
      if (resource_url !== undefined) updates.resource_url = resource_url ? validateUrl(resource_url) : null;
      if (lesson_order !== undefined) updates.lesson_order = parseInt(lesson_order, 10) || 0;
      if (status !== undefined) updates.status = status === 'published' ? 'published' : 'draft';

      const { data: lesson, error: lErr } = await supabase
        .from('course_lessons')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (lErr) return respondError(500, 'Failed to update lesson');

      await auditLog('COURSE_LESSON_UPDATE', {
        success: true, ip, userAgent: ua,
        details: { lesson_id: id },
      });

      return respond(200, { lesson });
    }

    // Sub-action: Lesson Deletion
    if (body._action === 'delete_lesson') {
      const { id, course_id } = body;
      if (!id) return respondError(400, 'Lesson id is required');

      const { error: dErr } = await supabase
        .from('course_lessons')
        .delete()
        .eq('id', id);

      if (dErr) return respondError(500, 'Failed to delete lesson');

      if (course_id) {
        const { count } = await supabase
          .from('course_lessons')
          .select('id', { count: 'exact', head: true })
          .eq('course_id', course_id);

        await supabase.from('courses').update({ lesson_count: count || 0 }).eq('id', course_id);
      }

      await auditLog('COURSE_LESSON_DELETE', {
        success: true, ip, userAgent: ua, courseId: course_id,
        details: { lesson_id: id },
      });

      return respond(200, { success: true });
    }

    // Sub-action: Status update
    if (body._action === 'update_status') {
      const { id, status, featured, display_order } = body;
      if (!id) return respondError(400, 'Course id is required');

      const updates = {};
      if (status !== undefined) {
        if (!['draft', 'published', 'archived'].includes(status)) {
          return respondError(400, 'Invalid status value');
        }
        updates.status = status;
        if (status === 'published') updates.published_at = new Date().toISOString();
      }
      if (featured !== undefined) updates.featured = !!featured;
      if (display_order !== undefined) updates.display_order = parseInt(display_order, 10) || 0;

      const { data: course, error } = await supabase
        .from('courses')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (error) return respondError(500, 'Failed to update course status');

      await auditLog('COURSE_STATUS_CHANGE', {
        success: true, ip, userAgent: ua, courseId: id,
        details: updates,
      });

      return respond(200, { course });
    }

    // Create Course
    const title = sanitizeText(body.title);
    if (!title) return respondError(400, 'Course title is required');

    let slug = body.slug ? generateSlug(body.slug) : generateSlug(title);
    if (!slug) slug = 'course-' + Date.now().toString(36);

    // Ensure unique slug
    const { data: existing } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const courseData = {
      title,
      slug,
      short_description: sanitizeText(body.short_description || ''),
      description: sanitizeText(body.description || ''),
      category: sanitizeText(body.category || 'Augmented Reality'),
      difficulty: ['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(body.difficulty)
        ? body.difficulty
        : 'Beginner',
      thumbnail_url: body.thumbnail_url ? validateUrl(body.thumbnail_url) : null,
      video_url: body.video_url ? validateUrl(body.video_url) : null,
      intro_video_url: body.intro_video_url ? validateUrl(body.intro_video_url) : null,
      instructor_name: sanitizeText(body.instructor_name || ''),
      instructor_role: sanitizeText(body.instructor_role || ''),
      estimated_duration: sanitizeText(body.estimated_duration || ''),
      lesson_count: 0,
      learning_objectives: Array.isArray(body.learning_objectives) ? body.learning_objectives.map(sanitizeText).filter(Boolean) : [],
      prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites.map(sanitizeText).filter(Boolean) : [],
      technologies: Array.isArray(body.technologies) ? body.technologies.map(sanitizeText).filter(Boolean) : [],
      tags: Array.isArray(body.tags) ? body.tags.map(sanitizeText).filter(Boolean) : [],
      language: sanitizeText(body.language || 'English'),
      certificate_available: !!body.certificate_available,
      featured: !!body.featured,
      display_order: parseInt(body.display_order, 10) || 0,
      status: ['draft', 'published', 'archived'].includes(body.status) ? body.status : 'draft',
      published_at: body.status === 'published' ? new Date().toISOString() : null,
      created_by: 'admin',
    };

    const { data: course, error } = await supabase
      .from('courses')
      .insert(courseData)
      .select('*')
      .single();

    if (error) {
      console.error('Course insert error:', error.message);
      return respondError(500, 'Failed to create course: ' + error.message);
    }

    await auditLog('COURSE_CREATE', {
      success: true, ip, userAgent: ua, courseId: course.id,
      details: { title: course.title, slug: course.slug },
    });

    return respond(201, { course });
  }

  // ── PUT ──
  if (event.httpMethod === 'PUT') {
    const id = params.id;
    if (!id) return respondError(400, 'Course ID is required');

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respondError(400, 'Invalid request body');
    }

    const updates = {};
    if (body.title !== undefined) updates.title = sanitizeText(body.title);
    if (body.slug !== undefined && body.slug) updates.slug = generateSlug(body.slug);
    if (body.short_description !== undefined) updates.short_description = sanitizeText(body.short_description);
    if (body.description !== undefined) updates.description = sanitizeText(body.description);
    if (body.category !== undefined) updates.category = sanitizeText(body.category);
    if (body.difficulty !== undefined && ['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(body.difficulty)) {
      updates.difficulty = body.difficulty;
    }
    if (body.thumbnail_url !== undefined) updates.thumbnail_url = body.thumbnail_url ? validateUrl(body.thumbnail_url) : null;
    if (body.video_url !== undefined) updates.video_url = body.video_url ? validateUrl(body.video_url) : null;
    if (body.intro_video_url !== undefined) updates.intro_video_url = body.intro_video_url ? validateUrl(body.intro_video_url) : null;
    if (body.instructor_name !== undefined) updates.instructor_name = sanitizeText(body.instructor_name);
    if (body.instructor_role !== undefined) updates.instructor_role = sanitizeText(body.instructor_role);
    if (body.estimated_duration !== undefined) updates.estimated_duration = sanitizeText(body.estimated_duration);
    if (body.learning_objectives !== undefined) {
      updates.learning_objectives = Array.isArray(body.learning_objectives) ? body.learning_objectives.map(sanitizeText).filter(Boolean) : [];
    }
    if (body.prerequisites !== undefined) {
      updates.prerequisites = Array.isArray(body.prerequisites) ? body.prerequisites.map(sanitizeText).filter(Boolean) : [];
    }
    if (body.technologies !== undefined) {
      updates.technologies = Array.isArray(body.technologies) ? body.technologies.map(sanitizeText).filter(Boolean) : [];
    }
    if (body.tags !== undefined) {
      updates.tags = Array.isArray(body.tags) ? body.tags.map(sanitizeText).filter(Boolean) : [];
    }
    if (body.language !== undefined) updates.language = sanitizeText(body.language);
    if (body.certificate_available !== undefined) updates.certificate_available = !!body.certificate_available;
    if (body.featured !== undefined) updates.featured = !!body.featured;
    if (body.display_order !== undefined) updates.display_order = parseInt(body.display_order, 10) || 0;
    if (body.status !== undefined && ['draft', 'published', 'archived'].includes(body.status)) {
      updates.status = body.status;
      if (body.status === 'published' && !updates.published_at) {
        updates.published_at = new Date().toISOString();
      }
    }

    const { data: course, error } = await supabase
      .from('courses')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Course update error:', error.message);
      return respondError(500, 'Failed to update course');
    }

    await auditLog('COURSE_UPDATE', {
      success: true, ip, userAgent: ua, courseId: id,
      details: { title: course.title },
    });

    return respond(200, { course });
  }

  // ── DELETE ──
  if (event.httpMethod === 'DELETE') {
    const id = params.id;
    if (!id) return respondError(400, 'Course ID is required');

    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Course delete error:', error.message);
      return respondError(500, 'Failed to delete course');
    }

    await auditLog('COURSE_DELETE', {
      success: true, ip, userAgent: ua, courseId: id,
    });

    return respond(200, { success: true });
  }

  return respondError(405, 'Method not allowed');
};
