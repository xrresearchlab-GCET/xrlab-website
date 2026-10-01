/**
 * /api/admin-projects
 * Protected admin CRUD for projects
 * GET    — list all projects (all statuses)
 * POST   — create project
 * PUT    — update project
 * DELETE — delete project
 */

const { z } = require('zod');
const {
  getSupabase, respond, respondError, handleOptions,
  validateSession, validateCSRF, checkRateLimit,
  sanitizeText, validateUrl, generateSlug,
  auditLog, getClientIP,
} = require('./utils/shared');

// ============================================
// Lightweight HTML sanitizer
// ============================================
function sanitizeHtml(html, allowedTags = []) {
  if (typeof html !== 'string') return '';
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  clean = clean.replace(/\s+(javascript|data|vbscript)\s*:/gi, ' blocked:');
  if (allowedTags.length === 0) {
    return clean.replace(/<[^>]*>/g, '');
  }
  const tagPattern = new RegExp(
    `<(?!\/?(?:${allowedTags.join('|')})\\b)[^>]*>`, 'gi'
  );
  return clean.replace(tagPattern, '');
}

// ============================================
// Zod Schemas
// ============================================
const ProjectCreateSchema = z.object({
  title: z.string().min(1).max(200),
  short_description: z.string().max(500).optional().default(''),
  description: z.string().max(20000).optional().default(''),
  project_type: z.enum(['experiential', 'individual', 'outsourcing', 'group']),
  research_division: z.string().max(100).optional().default(''),
  status: z.enum(['concept', 'ongoing', 'prototype', 'completed', 'archived']).default('concept'),
  year: z.number().int().min(2020).max(2100).optional().nullable(),
  objectives: z.string().max(5000).optional().default(''),
  expected_outcome: z.string().max(5000).optional().default(''),
  technologies: z.array(z.string().max(100)).optional().default([]),
  tags: z.array(z.string().max(50)).optional().default([]),
  team_members: z.array(z.string().max(200)).optional().default([]),
  mentor: z.string().max(200).optional().default(''),
  client_name: z.string().max(200).optional().default(''),
  show_client_publicly: z.boolean().optional().default(false),
  scope: z.string().max(5000).optional().default(''),
  student_name: z.string().max(200).optional().default(''),
  concept_image_url: z.string().max(2000).optional().default(''),
  webgl_url: z.string().max(2000).optional().default(''),
  documentation_url: z.string().max(2000).optional().default(''),
  report_url: z.string().max(2000).optional().default(''),
  demo_video_url: z.string().max(2000).optional().default(''),
  github_url: z.string().max(2000).optional().default(''),
  additional_resource_url: z.string().max(2000).optional().default(''),
  featured: z.boolean().optional().default(false),
  published: z.boolean().optional().default(false),
});

// ============================================
// Sanitize project data
// ============================================
function sanitizeProjectData(data) {
  const sanitized = { ...data };

  // Sanitize text fields
  if (sanitized.title) sanitized.title = sanitizeText(sanitized.title, 200);
  if (sanitized.short_description) sanitized.short_description = sanitizeHtml(sanitizeText(sanitized.short_description, 500));
  if (sanitized.description) sanitized.description = sanitizeHtml(sanitizeText(sanitized.description, 20000), ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4']);
  if (sanitized.research_division) sanitized.research_division = sanitizeText(sanitized.research_division, 100);
  if (sanitized.objectives) sanitized.objectives = sanitizeHtml(sanitizeText(sanitized.objectives, 5000));
  if (sanitized.expected_outcome) sanitized.expected_outcome = sanitizeHtml(sanitizeText(sanitized.expected_outcome, 5000));
  if (sanitized.mentor) sanitized.mentor = sanitizeText(sanitized.mentor, 200);
  if (sanitized.client_name) sanitized.client_name = sanitizeText(sanitized.client_name, 200);
  if (sanitized.scope) sanitized.scope = sanitizeHtml(sanitizeText(sanitized.scope, 5000));
  if (sanitized.student_name) sanitized.student_name = sanitizeText(sanitized.student_name, 200);

  // Validate URLs — reject unsafe schemes
  const urlFields = [
    'concept_image_url', 'webgl_url', 'documentation_url',
    'report_url', 'demo_video_url', 'github_url', 'additional_resource_url'
  ];
  for (const field of urlFields) {
    if (sanitized[field] && !validateUrl(sanitized[field])) {
      sanitized[field] = '';
    }
  }

  // Sanitize arrays
  if (Array.isArray(sanitized.technologies)) {
    sanitized.technologies = sanitized.technologies.map(t => sanitizeText(t, 100));
  }
  if (Array.isArray(sanitized.tags)) {
    sanitized.tags = sanitized.tags.map(t => sanitizeText(t, 50));
  }
  if (Array.isArray(sanitized.team_members)) {
    sanitized.team_members = sanitized.team_members.map(m => sanitizeText(m, 200));
  }

  return sanitized;
}

// ============================================
// Handler
// ============================================
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const ip = getClientIP(event);
  const ua = event.headers['user-agent'] || '';

  // Authenticate
  const session = await validateSession(event);
  if (!session) {
    return respondError(401, 'Unauthorized');
  }

  // Rate limit admin API
  const rl = await checkRateLimit(ip, 'api');
  if (!rl.allowed) {
    return respondError(429, 'Rate limit exceeded');
  }

  // CSRF for state-changing operations
  if (['POST', 'PUT', 'DELETE'].includes(event.httpMethod)) {
    if (!validateCSRF(event)) {
      return respondError(403, 'Invalid CSRF token');
    }
  }

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  try {
    // ========== GET: List all projects ==========
    if (event.httpMethod === 'GET') {
      let query = supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (params.status) {
        query = query.eq('status', params.status);
      }
      if (params.project_type) {
        query = query.eq('project_type', params.project_type);
      }
      if (params.research_division) {
        query = query.eq('research_division', params.research_division);
      }

      if (params.id) {
        query = query.eq('id', params.id).single();
        const { data, error } = await query;
        if (error) return respondError(404, 'Project not found');
        return respond(200, { project: data });
      }

      const { data, error } = await query;
      if (error) return respondError(500, 'Unable to fetch projects');
      return respond(200, { projects: data || [] });
    }

    // ========== POST: Create project ==========
    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return respondError(400, 'Invalid request body');
      }

      // Check if this is a status/publish action
      if (body._action === 'update_status' && body.id) {
        const validStatuses = ['concept', 'ongoing', 'prototype', 'completed', 'archived'];
        if (!validStatuses.includes(body.status)) {
          return respondError(400, 'Invalid status');
        }

        const update = { status: body.status };
        if (body.published !== undefined) {
          update.published = body.published;
          if (body.published) {
            update.published_at = new Date().toISOString();
          }
        }

        const { error } = await supabase
          .from('projects')
          .update(update)
          .eq('id', body.id);

        if (error) return respondError(500, 'Unable to update status');

        await auditLog('PROJECT_STATUS_UPDATED', { eventId: null, success: true, ip, userAgent: ua, details: { projectId: body.id, newStatus: body.status } });
        return respond(200, { success: true });
      }

      // Regular create
      const parsed = ProjectCreateSchema.safeParse(body);
      if (!parsed.success) {
        return respondError(400, `Validation error: ${parsed.error.issues.map(i => i.message).join(', ')}`);
      }

      const sanitized = sanitizeProjectData(parsed.data);
      sanitized.slug = generateSlug(sanitized.title);

      // Ensure unique slug
      const { data: existing } = await supabase
        .from('projects')
        .select('slug')
        .eq('slug', sanitized.slug)
        .single();

      if (existing) {
        sanitized.slug = `${sanitized.slug}-${Date.now().toString(36)}`;
      }

      if (sanitized.published) {
        sanitized.published_at = new Date().toISOString();
      }

      const { data: created, error } = await supabase
        .from('projects')
        .insert(sanitized)
        .select()
        .single();

      if (error) {
        console.error('Create project error:', error.message);
        return respondError(500, 'Unable to create project');
      }

      await auditLog('PROJECT_CREATED', { eventId: null, success: true, ip, userAgent: ua, details: { projectId: created.id } });
      return respond(201, { project: created });
    }

    // ========== PUT: Update project ==========
    if (event.httpMethod === 'PUT') {
      const projectId = params.id;
      if (!projectId) return respondError(400, 'Project ID required');

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return respondError(400, 'Invalid request body');
      }

      // Remove fields that shouldn't be mass-assigned
      delete body.id;
      delete body.created_at;
      delete body.created_by;

      const parsed = ProjectCreateSchema.partial().safeParse(body);
      if (!parsed.success) {
        return respondError(400, `Validation error: ${parsed.error.issues.map(i => i.message).join(', ')}`);
      }

      const sanitized = sanitizeProjectData(parsed.data);

      // If title changed, optionally update slug
      if (sanitized.title && body._updateSlug) {
        sanitized.slug = generateSlug(sanitized.title);
        const { data: existing } = await supabase
          .from('projects')
          .select('slug')
          .eq('slug', sanitized.slug)
          .neq('id', projectId)
          .single();
        if (existing) {
          sanitized.slug = `${sanitized.slug}-${Date.now().toString(36)}`;
        }
      }

      if (sanitized.published) {
        sanitized.published_at = sanitized.published_at || new Date().toISOString();
      }

      const { data: updated, error } = await supabase
        .from('projects')
        .update(sanitized)
        .eq('id', projectId)
        .select()
        .single();

      if (error) {
        console.error('Update project error:', error.message);
        return respondError(500, 'Unable to update project');
      }

      await auditLog('PROJECT_UPDATED', { eventId: null, success: true, ip, userAgent: ua, details: { projectId } });
      return respond(200, { project: updated });
    }

    // ========== DELETE: Delete project ==========
    if (event.httpMethod === 'DELETE') {
      const projectId = params.id;
      if (!projectId) return respondError(400, 'Project ID required');

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) {
        console.error('Delete project error:', error.message);
        return respondError(500, 'Unable to delete project');
      }

      await auditLog('PROJECT_DELETED', { eventId: null, success: true, ip, userAgent: ua, details: { projectId } });
      return respond(200, { success: true });
    }

    return respondError(405, 'Method not allowed');
  } catch (err) {
    console.error('Admin projects error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
