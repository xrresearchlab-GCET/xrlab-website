/**
 * Netlify Function: admin-milestones
 * Protected CRUD endpoint for Completed Events and Academic Milestones
 * Authentication: Cookie session + CSRF header
 */

const { z } = require('zod');
const {
  getSupabase, respond, respondError, handleOptions,
  validateSession, validateCSRF, checkRateLimit,
  sanitizeText, validateUrl, generateSlug,
  auditLog, getClientIP,
} = require('./utils/shared');

// Zero-dependency HTML sanitizer
function sanitizeHtml(html, allowedTags = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4', 'a']) {
  if (typeof html !== 'string') return '';
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
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

// Zod Schema for Milestones
const MilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  milestone_type: z.enum(['completed_event', 'project_milestone', 'award', 'publication', 'lab_milestone']).default('completed_event'),
  category: z.string().max(100).optional().default(''),
  research_division: z.string().max(100).optional().default(''),
  completed_date: z.string().optional().nullable(),
  location: z.string().max(300).optional().default(''),
  venue: z.string().max(300).optional().default(''),
  organizer: z.string().max(200).optional().default(''),
  short_description: z.string().max(500).optional().default(''),
  description: z.string().max(20000).optional().default(''),
  event_report_url: z.string().max(2000).optional().default(''),
  video_url: z.string().max(2000).optional().default(''),
  presentation_url: z.string().max(2000).optional().default(''),
  external_article_url: z.string().max(2000).optional().default(''),
  participant_count: z.number().int().min(0).max(100000).optional().nullable(),
  achievement: z.string().max(5000).optional().default(''),
  outcome: z.string().max(5000).optional().default(''),
  impact: z.string().max(5000).optional().default(''),
  key_takeaways: z.array(z.string().max(500)).optional().default([]),
  tags: z.array(z.string().max(50)).optional().default([]),
  featured_image: z.string().max(2000).optional().default(''),
  featured: z.boolean().optional().default(false),
  published: z.boolean().optional().default(true),
});

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
    // -------------------------------------------------------------------------
    // GET: List all milestones or get single milestone by ID
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'GET') {
      if (params.id) {
        const { data, error } = await supabase
          .from('milestones')
          .select('*')
          .eq('id', params.id)
          .single();

        if (error || !data) return respondError(404, 'Milestone not found');
        return respond(200, { milestone: data });
      }

      let query = supabase
        .from('milestones')
        .select('*')
        .order('completed_date', { ascending: false });

      if (params.category) query = query.eq('category', params.category);
      if (params.milestone_type) query = query.eq('milestone_type', params.milestone_type);

      const { data, error } = await query;
      if (error) {
        return respond(200, { milestones: [] });
      }
      return respond(200, { milestones: data || [] });
    }

    // -------------------------------------------------------------------------
    // POST: Create Milestone / Completed Event OR Toggle Publish
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return respondError(400, 'Invalid request body');
      }

      // Quick action: toggle publish
      if (body._action === 'toggle_publish' && body.id) {
        const { data: updated, error: toggleErr } = await supabase
          .from('milestones')
          .update({ published: !!body.published, updated_at: new Date().toISOString() })
          .eq('id', body.id)
          .select()
          .single();

        if (toggleErr) return respondError(500, toggleErr.message);
        await auditLog('TOGGLE_MILESTONE_PUBLISH', { success: true, ip, userAgent: ua, details: { id: body.id, published: !!body.published } });
        return respond(200, { message: 'Milestone status updated', milestone: updated });
      }

      const parseResult = MilestoneSchema.safeParse(body);
      if (!parseResult.success) {
        return respondError(400, 'Validation failed: ' + parseResult.error.errors.map(e => e.message).join(', '));
      }

      const m = parseResult.data;
      let slug = generateSlug(m.title);
      if (!slug) slug = 'milestone-' + Date.now();

      const { data: existing } = await supabase.from('milestones').select('id').eq('slug', slug).maybeSingle();
      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const insertData = {
        title: sanitizeText(m.title, 200),
        slug,
        milestone_type: m.milestone_type,
        category: sanitizeText(m.category, 100),
        research_division: sanitizeText(m.research_division, 100),
        completed_date: m.completed_date ? new Date(m.completed_date).toISOString() : new Date().toISOString(),
        location: sanitizeText(m.location, 300),
        venue: sanitizeText(m.venue, 300),
        organizer: sanitizeText(m.organizer, 200),
        short_description: sanitizeHtml(sanitizeText(m.short_description, 500)),
        description: sanitizeHtml(sanitizeText(m.description, 20000)),
        event_report_url: m.event_report_url && validateUrl(m.event_report_url) ? m.event_report_url.trim() : null,
        video_url: m.video_url && validateUrl(m.video_url) ? m.video_url.trim() : null,
        presentation_url: m.presentation_url && validateUrl(m.presentation_url) ? m.presentation_url.trim() : null,
        external_article_url: m.external_article_url && validateUrl(m.external_article_url) ? m.external_article_url.trim() : null,
        participant_count: m.participant_count || null,
        achievement: sanitizeHtml(sanitizeText(m.achievement, 5000)),
        outcome: sanitizeHtml(sanitizeText(m.outcome, 5000)),
        impact: sanitizeHtml(sanitizeText(m.impact, 5000)),
        key_takeaways: Array.isArray(m.key_takeaways) ? m.key_takeaways.map(t => sanitizeText(t, 500)).filter(Boolean) : [],
        tags: Array.isArray(m.tags) ? m.tags.map(t => sanitizeText(t, 50)).filter(Boolean) : [],
        featured_image: m.featured_image && validateUrl(m.featured_image) ? m.featured_image.trim() : null,
        featured: !!m.featured,
        published: m.published !== false,
      };

      const { data: created, error: insertErr } = await supabase
        .from('milestones')
        .insert(insertData)
        .select()
        .single();

      if (insertErr) return respondError(500, insertErr.message);

      await auditLog('CREATE_MILESTONE', { success: true, ip, userAgent: ua, details: { id: created.id, title: created.title } });
      return respond(201, { message: 'Milestone created successfully', milestone: created });
    }

    // -------------------------------------------------------------------------
    // PUT: Update Milestone
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'PUT') {
      const milestoneId = params.id;
      if (!milestoneId) return respondError(400, 'Missing milestone ID');

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return respondError(400, 'Invalid request body');
      }

      const parseResult = MilestoneSchema.safeParse(body);
      if (!parseResult.success) {
        return respondError(400, 'Validation failed: ' + parseResult.error.errors.map(e => e.message).join(', '));
      }

      const m = parseResult.data;
      const updateData = {
        title: sanitizeText(m.title, 200),
        milestone_type: m.milestone_type,
        category: sanitizeText(m.category, 100),
        research_division: sanitizeText(m.research_division, 100),
        completed_date: m.completed_date ? new Date(m.completed_date).toISOString() : new Date().toISOString(),
        location: sanitizeText(m.location, 300),
        venue: sanitizeText(m.venue, 300),
        organizer: sanitizeText(m.organizer, 200),
        short_description: sanitizeHtml(sanitizeText(m.short_description, 500)),
        description: sanitizeHtml(sanitizeText(m.description, 20000)),
        event_report_url: m.event_report_url && validateUrl(m.event_report_url) ? m.event_report_url.trim() : null,
        video_url: m.video_url && validateUrl(m.video_url) ? m.video_url.trim() : null,
        presentation_url: m.presentation_url && validateUrl(m.presentation_url) ? m.presentation_url.trim() : null,
        external_article_url: m.external_article_url && validateUrl(m.external_article_url) ? m.external_article_url.trim() : null,
        participant_count: m.participant_count || null,
        achievement: sanitizeHtml(sanitizeText(m.achievement, 5000)),
        outcome: sanitizeHtml(sanitizeText(m.outcome, 5000)),
        impact: sanitizeHtml(sanitizeText(m.impact, 5000)),
        key_takeaways: Array.isArray(m.key_takeaways) ? m.key_takeaways.map(t => sanitizeText(t, 500)).filter(Boolean) : [],
        tags: Array.isArray(m.tags) ? m.tags.map(t => sanitizeText(t, 50)).filter(Boolean) : [],
        featured_image: m.featured_image && validateUrl(m.featured_image) ? m.featured_image.trim() : null,
        featured: !!m.featured,
        published: m.published !== false,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await supabase
        .from('milestones')
        .update(updateData)
        .eq('id', milestoneId)
        .select()
        .single();

      if (updateErr) return respondError(500, updateErr.message);

      await auditLog('UPDATE_MILESTONE', { success: true, ip, userAgent: ua, details: { id: milestoneId, title: updated.title } });
      return respond(200, { message: 'Milestone updated successfully', milestone: updated });
    }

    // -------------------------------------------------------------------------
    // DELETE: Delete Milestone
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'DELETE') {
      const milestoneId = params.id;
      if (!milestoneId) return respondError(400, 'Missing milestone ID');

      const { error: delErr } = await supabase.from('milestones').delete().eq('id', milestoneId);
      if (delErr) return respondError(500, delErr.message);

      await auditLog('DELETE_MILESTONE', { success: true, ip, userAgent: ua, details: { id: milestoneId } });
      return respond(200, { message: 'Milestone deleted successfully' });
    }

    return respondError(405, 'Method not allowed');
  } catch (err) {
    console.error('admin-milestones error:', err);
    return respondError(500, err.message || 'Internal server error');
  }
};
