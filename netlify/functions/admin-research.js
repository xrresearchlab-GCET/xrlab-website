/**
 * /api/admin-research
 * Protected admin CRUD for Research Items
 * GET    — list all research items or single item
 * POST   — create research item OR status update action
 * PUT    — update research item
 * DELETE — delete research item
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

  const session = await validateSession(event);
  if (!session) return respondError(401, 'Authentication required');

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  // ── GET ──
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const { data: item, error } = await supabase
        .from('research_items')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error || !item) return respondError(404, 'Research item not found');
      return respond(200, { research: item });
    }

    const { data: items, error } = await supabase
      .from('research_items')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch research error:', error.message);
      return respondError(500, 'Failed to fetch research items');
    }

    return respond(200, { research: items || [] });
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

    // Sub-action: Status update
    if (body._action === 'update_status') {
      const { id, publication_status, research_stage, featured, display_order } = body;
      if (!id) return respondError(400, 'Research ID is required');

      const updates = {};
      if (publication_status !== undefined) {
        if (!['draft', 'published', 'archived'].includes(publication_status)) {
          return respondError(400, 'Invalid publication status');
        }
        updates.publication_status = publication_status;
        if (publication_status === 'published') updates.published_at = new Date().toISOString();
      }
      if (research_stage !== undefined) {
        const validStages = ['PROPOSED', 'ONGOING', 'EXPERIMENTAL', 'VALIDATION', 'COMPLETED', 'ARCHIVED'];
        if (!validStages.includes(research_stage)) return respondError(400, 'Invalid research stage');
        updates.research_stage = research_stage;
      }
      if (featured !== undefined) updates.featured = !!featured;
      if (display_order !== undefined) updates.display_order = parseInt(display_order, 10) || 0;

      const { data: item, error } = await supabase
        .from('research_items')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (error) return respondError(500, 'Failed to update research status');

      await auditLog('RESEARCH_STATUS_CHANGE', {
        success: true, ip, userAgent: ua, researchId: id,
        details: updates,
      });

      return respond(200, { research: item });
    }

    // Create Research Item
    const title = sanitizeText(body.title);
    if (!title) return respondError(400, 'Title is required');

    let slug = body.slug ? generateSlug(body.slug) : generateSlug(title);
    if (!slug) slug = 'research-' + Date.now().toString(36);

    const { data: existing } = await supabase
      .from('research_items')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const validStages = ['PROPOSED', 'ONGOING', 'EXPERIMENTAL', 'VALIDATION', 'COMPLETED', 'ARCHIVED'];
    const research_stage = validStages.includes(body.research_stage) ? body.research_stage : 'PROPOSED';
    const publication_status = ['draft', 'published', 'archived'].includes(body.publication_status) ? body.publication_status : 'draft';

    const insertData = {
      title,
      slug,
      short_summary: sanitizeText(body.short_summary || ''),
      description: sanitizeText(body.description || ''),
      research_area: sanitizeText(body.research_area || ''),
      research_division: sanitizeText(body.research_division || ''),
      objectives: sanitizeText(body.objectives || ''),
      problem_statement: sanitizeText(body.problem_statement || ''),
      methodology: sanitizeText(body.methodology || ''),
      technologies: Array.isArray(body.technologies) ? body.technologies.map(sanitizeText).filter(Boolean) : [],
      expected_outcomes: sanitizeText(body.expected_outcomes || ''),
      findings: sanitizeText(body.findings || ''),
      team_members: Array.isArray(body.team_members) ? body.team_members.map(sanitizeText).filter(Boolean) : [],
      mentor: sanitizeText(body.mentor || ''),
      start_date: body.start_date || null,
      expected_completion_date: body.expected_completion_date || null,
      completion_date: body.completion_date || null,
      research_stage,
      concept_image_url: body.concept_image_url ? validateUrl(body.concept_image_url) : null,
      related_project_url: body.related_project_url ? validateUrl(body.related_project_url) : null,
      report_url: body.report_url ? validateUrl(body.report_url) : null,
      demo_video_url: body.demo_video_url ? validateUrl(body.demo_video_url) : null,
      dataset_url: body.dataset_url ? validateUrl(body.dataset_url) : null,
      publication_url: body.publication_url ? validateUrl(body.publication_url) : null,
      github_url: body.github_url ? validateUrl(body.github_url) : null,
      additional_links: Array.isArray(body.additional_links) ? body.additional_links : [],
      tags: Array.isArray(body.tags) ? body.tags.map(sanitizeText).filter(Boolean) : [],
      featured: !!body.featured,
      display_order: parseInt(body.display_order, 10) || 0,
      publication_status,
      published_at: publication_status === 'published' ? new Date().toISOString() : null,
      created_by: 'admin',
    };

    const { data: item, error } = await supabase
      .from('research_items')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('Research insert error:', error.message);
      return respondError(500, 'Failed to create research item: ' + error.message);
    }

    await auditLog('RESEARCH_CREATE', {
      success: true, ip, userAgent: ua, researchId: item.id,
      details: { title: item.title, slug: item.slug },
    });

    return respond(201, { research: item });
  }

  // ── PUT ──
  if (event.httpMethod === 'PUT') {
    const id = params.id;
    if (!id) return respondError(400, 'Research ID is required');

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respondError(400, 'Invalid request body');
    }

    const updates = {};
    if (body.title !== undefined) updates.title = sanitizeText(body.title);
    if (body.slug !== undefined && body.slug) updates.slug = generateSlug(body.slug);
    if (body.short_summary !== undefined) updates.short_summary = sanitizeText(body.short_summary);
    if (body.description !== undefined) updates.description = sanitizeText(body.description);
    if (body.research_area !== undefined) updates.research_area = sanitizeText(body.research_area);
    if (body.research_division !== undefined) updates.research_division = sanitizeText(body.research_division);
    if (body.objectives !== undefined) updates.objectives = sanitizeText(body.objectives);
    if (body.problem_statement !== undefined) updates.problem_statement = sanitizeText(body.problem_statement);
    if (body.methodology !== undefined) updates.methodology = sanitizeText(body.methodology);
    if (body.technologies !== undefined) {
      updates.technologies = Array.isArray(body.technologies) ? body.technologies.map(sanitizeText).filter(Boolean) : [];
    }
    if (body.expected_outcomes !== undefined) updates.expected_outcomes = sanitizeText(body.expected_outcomes);
    if (body.findings !== undefined) updates.findings = sanitizeText(body.findings);
    if (body.team_members !== undefined) {
      updates.team_members = Array.isArray(body.team_members) ? body.team_members.map(sanitizeText).filter(Boolean) : [];
    }
    if (body.mentor !== undefined) updates.mentor = sanitizeText(body.mentor);
    if (body.start_date !== undefined) updates.start_date = body.start_date || null;
    if (body.expected_completion_date !== undefined) updates.expected_completion_date = body.expected_completion_date || null;
    if (body.completion_date !== undefined) updates.completion_date = body.completion_date || null;
    if (body.research_stage !== undefined) {
      const validStages = ['PROPOSED', 'ONGOING', 'EXPERIMENTAL', 'VALIDATION', 'COMPLETED', 'ARCHIVED'];
      if (validStages.includes(body.research_stage)) updates.research_stage = body.research_stage;
    }
    if (body.concept_image_url !== undefined) updates.concept_image_url = body.concept_image_url ? validateUrl(body.concept_image_url) : null;
    if (body.related_project_url !== undefined) updates.related_project_url = body.related_project_url ? validateUrl(body.related_project_url) : null;
    if (body.report_url !== undefined) updates.report_url = body.report_url ? validateUrl(body.report_url) : null;
    if (body.demo_video_url !== undefined) updates.demo_video_url = body.demo_video_url ? validateUrl(body.demo_video_url) : null;
    if (body.dataset_url !== undefined) updates.dataset_url = body.dataset_url ? validateUrl(body.dataset_url) : null;
    if (body.publication_url !== undefined) updates.publication_url = body.publication_url ? validateUrl(body.publication_url) : null;
    if (body.github_url !== undefined) updates.github_url = body.github_url ? validateUrl(body.github_url) : null;
    if (body.additional_links !== undefined) {
      updates.additional_links = Array.isArray(body.additional_links) ? body.additional_links : [];
    }
    if (body.tags !== undefined) {
      updates.tags = Array.isArray(body.tags) ? body.tags.map(sanitizeText).filter(Boolean) : [];
    }
    if (body.featured !== undefined) updates.featured = !!body.featured;
    if (body.display_order !== undefined) updates.display_order = parseInt(body.display_order, 10) || 0;
    if (body.publication_status !== undefined && ['draft', 'published', 'archived'].includes(body.publication_status)) {
      updates.publication_status = body.publication_status;
      if (body.publication_status === 'published' && !updates.published_at) {
        updates.published_at = new Date().toISOString();
      }
    }

    const { data: item, error } = await supabase
      .from('research_items')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Research update error:', error.message);
      return respondError(500, 'Failed to update research item');
    }

    await auditLog('RESEARCH_UPDATE', {
      success: true, ip, userAgent: ua, researchId: id,
      details: { title: item.title },
    });

    return respond(200, { research: item });
  }

  // ── DELETE ──
  if (event.httpMethod === 'DELETE') {
    const id = params.id;
    if (!id) return respondError(400, 'Research ID is required');

    const { error } = await supabase
      .from('research_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Research delete error:', error.message);
      return respondError(500, 'Failed to delete research item');
    }

    await auditLog('RESEARCH_DELETE', {
      success: true, ip, userAgent: ua, researchId: id,
    });

    return respond(200, { success: true });
  }

  return respondError(405, 'Method not allowed');
};
