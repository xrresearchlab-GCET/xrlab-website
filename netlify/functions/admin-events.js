/**
 * /api/admin-events
 * Protected admin CRUD for events
 * GET    — list all events (all statuses)
 * POST   — create event
 * PUT    — update event
 * DELETE — delete event
 */

const { z } = require('zod');
const {
  getSupabase, respond, respondError, handleOptions,
  validateSession, validateCSRF, checkRateLimit,
  sanitizeText, validateUrl, generateSlug,
  auditLog, getClientIP,
} = require('./utils/shared');

// Lightweight server-side HTML sanitizer (no JSDOM dependency)
// Strips all tags except a safe allow-list
function sanitizeHtml(html, allowedTags = []) {
  if (typeof html !== 'string') return '';
  // Remove script/style tags and their contents entirely
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove event handlers (on*)
  clean = clean.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Remove dangerous attributes
  clean = clean.replace(/\s+(javascript|data|vbscript)\s*:/gi, ' blocked:');
  if (allowedTags.length === 0) {
    // Strip ALL tags
    return clean.replace(/<[^>]*>/g, '');
  }
  // Keep only allowed tags, strip all others
  const tagPattern = new RegExp(
    `<(?!\/?(?:${allowedTags.join('|')})\\b)[^>]*>`, 'gi'
  );
  return clean.replace(tagPattern, '');
}

// ============================================
// Zod Schemas
// ============================================
const EventCreateSchema = z.object({
  title: z.string().min(1).max(200),
  short_description: z.string().max(500).optional().default(''),
  description: z.string().max(10000).optional().default(''),
  category: z.string().max(100).optional().default(''),
  research_division: z.string().max(100).optional().default(''),
  start_datetime: z.string().optional().nullable(),
  end_datetime: z.string().optional().nullable(),
  location: z.string().max(300).optional().default(''),
  venue: z.string().max(300).optional().default(''),
  registration_url: z.string().max(2000).optional().default(''),
  external_url: z.string().max(2000).optional().default(''),
  organizer: z.string().max(200).optional().default(''),
  status: z.enum(['draft', 'upcoming', 'ongoing', 'completed', 'cancelled', 'archived']).default('draft'),
  featured_image: z.string().max(2000).optional().default(''),
  gallery: z.array(z.string().max(2000)).optional().default([]),
  speakers: z.array(z.object({
    name: z.string().max(200),
    role: z.string().max(200).optional().default(''),
    bio: z.string().max(1000).optional().default(''),
  })).optional().default([]),
  highlights: z.array(z.string().max(500)).optional().default([]),
  tags: z.array(z.string().max(50)).optional().default([]),
  milestone_enabled: z.boolean().optional().default(false),
  milestone_title: z.string().max(200).optional().default(''),
  milestone_description: z.string().max(5000).optional().default(''),
  milestone_content: z.object({}).passthrough().optional().default({}),
  event_report_url: z.string().max(2000).optional().default(''),
  video_url: z.string().max(2000).optional().default(''),
  presentation_url: z.string().max(2000).optional().default(''),
  external_article_url: z.string().max(2000).optional().default(''),
  achievement: z.string().max(5000).optional().default(''),
  outcome: z.string().max(5000).optional().default(''),
  impact: z.string().max(5000).optional().default(''),
  participant_count: z.number().int().min(0).max(100000).optional().nullable(),
  key_takeaways: z.array(z.string().max(500)).optional().default([]),
});

const StatusUpdateSchema = z.object({
  status: z.enum(['draft', 'upcoming', 'ongoing', 'completed', 'cancelled', 'archived']),
  milestone_enabled: z.boolean().optional(),
});

// ============================================
// Sanitize event data
// ============================================
function sanitizeEventData(data) {
  const sanitized = { ...data };

  // Sanitize text fields
  if (sanitized.title) sanitized.title = sanitizeText(sanitized.title, 200);
  if (sanitized.short_description) sanitized.short_description = sanitizeHtml(sanitizeText(sanitized.short_description, 500));
  if (sanitized.description) sanitized.description = sanitizeHtml(sanitizeText(sanitized.description, 10000), ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4']);
  if (sanitized.location) sanitized.location = sanitizeText(sanitized.location, 300);
  if (sanitized.venue) sanitized.venue = sanitizeText(sanitized.venue, 300);
  if (sanitized.organizer) sanitized.organizer = sanitizeText(sanitized.organizer, 200);
  if (sanitized.category) sanitized.category = sanitizeText(sanitized.category, 100);
  if (sanitized.research_division) sanitized.research_division = sanitizeText(sanitized.research_division, 100);
  if (sanitized.milestone_title) sanitized.milestone_title = sanitizeText(sanitized.milestone_title, 200);
  if (sanitized.milestone_description) sanitized.milestone_description = sanitizeHtml(sanitizeText(sanitized.milestone_description, 5000));
  if (sanitized.achievement) sanitized.achievement = sanitizeHtml(sanitizeText(sanitized.achievement, 5000));
  if (sanitized.outcome) sanitized.outcome = sanitizeHtml(sanitizeText(sanitized.outcome, 5000));
  if (sanitized.impact) sanitized.impact = sanitizeHtml(sanitizeText(sanitized.impact, 5000));

  // Validate URLs
  const urlFields = [
    'registration_url', 'external_url', 'featured_image',
    'event_report_url', 'video_url', 'presentation_url', 'external_article_url'
  ];
  for (const field of urlFields) {
    if (sanitized[field] && !validateUrl(sanitized[field])) {
      sanitized[field] = '';
    }
  }

  // Sanitize gallery URLs
  if (Array.isArray(sanitized.gallery)) {
    sanitized.gallery = sanitized.gallery.filter(validateUrl);
  }

  // Sanitize speakers
  if (Array.isArray(sanitized.speakers)) {
    sanitized.speakers = sanitized.speakers.map(s => ({
      name: sanitizeText(s.name || '', 200),
      role: sanitizeText(s.role || '', 200),
      bio: sanitizeHtml(sanitizeText(s.bio || '', 1000)),
    }));
  }

  // Sanitize highlights
  if (Array.isArray(sanitized.highlights)) {
    sanitized.highlights = sanitized.highlights.map(h => sanitizeText(h, 500));
  }

  // Sanitize tags
  if (Array.isArray(sanitized.tags)) {
    sanitized.tags = sanitized.tags.map(t => sanitizeText(t, 50));
  }

  // Sanitize key_takeaways
  if (Array.isArray(sanitized.key_takeaways)) {
    sanitized.key_takeaways = sanitized.key_takeaways.map(k => sanitizeText(k, 500));
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
    // ========== GET: List all events ==========
    if (event.httpMethod === 'GET') {
      let query = supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (params.status) {
        query = query.eq('status', params.status);
      }

      if (params.id) {
        query = query.eq('id', params.id).single();
        const { data, error } = await query;
        if (error) return respondError(404, 'Event not found');
        return respond(200, { event: data });
      }

      const { data, error } = await query;
      if (error) return respondError(500, 'Unable to fetch events');
      return respond(200, { events: data || [] });
    }

    // ========== POST: Create event ==========
    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return respondError(400, 'Invalid request body');
      }

      // Check if this is a status update action
      if (body._action === 'update_status' && body.id) {
        const parsed = StatusUpdateSchema.safeParse(body);
        if (!parsed.success) {
          return respondError(400, 'Invalid status data');
        }

        const update = { status: parsed.data.status };
        if (parsed.data.status === 'upcoming' || parsed.data.status === 'ongoing') {
          update.published_at = update.published_at || new Date().toISOString();
        }
        if (parsed.data.status === 'completed') {
          update.completed_at = new Date().toISOString();
        }
        if (parsed.data.milestone_enabled !== undefined) {
          update.milestone_enabled = parsed.data.milestone_enabled;
        }

        const { error } = await supabase
          .from('events')
          .update(update)
          .eq('id', body.id);

        if (error) return respondError(500, 'Unable to update status');

        await auditLog('EVENT_STATUS_UPDATED', { eventId: body.id, success: true, ip, userAgent: ua, details: { newStatus: parsed.data.status } });
        return respond(200, { success: true });
      }

      // Regular create
      const parsed = EventCreateSchema.safeParse(body);
      if (!parsed.success) {
        return respondError(400, `Validation error: ${parsed.error.issues.map(i => i.message).join(', ')}`);
      }

      const sanitized = sanitizeEventData(parsed.data);
      sanitized.slug = generateSlug(sanitized.title);

      // Ensure unique slug
      const { data: existing } = await supabase
        .from('events')
        .select('slug')
        .eq('slug', sanitized.slug)
        .single();

      if (existing) {
        sanitized.slug = `${sanitized.slug}-${Date.now().toString(36)}`;
      }

      if (sanitized.status === 'upcoming' || sanitized.status === 'ongoing') {
        sanitized.published_at = new Date().toISOString();
      }

      const { data: created, error } = await supabase
        .from('events')
        .insert(sanitized)
        .select()
        .single();

      if (error) {
        console.error('Create event error:', error.message);
        return respondError(500, 'Unable to create event');
      }

      await auditLog('EVENT_CREATED', { eventId: created.id, success: true, ip, userAgent: ua });
      return respond(201, { event: created });
    }

    // ========== PUT: Update event ==========
    if (event.httpMethod === 'PUT') {
      const eventId = params.id;
      if (!eventId) return respondError(400, 'Event ID required');

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

      const parsed = EventCreateSchema.partial().safeParse(body);
      if (!parsed.success) {
        return respondError(400, `Validation error: ${parsed.error.issues.map(i => i.message).join(', ')}`);
      }

      const sanitized = sanitizeEventData(parsed.data);

      // If title changed, optionally update slug (preserving old)
      if (sanitized.title && body._updateSlug) {
        sanitized.slug = generateSlug(sanitized.title);
        const { data: existing } = await supabase
          .from('events')
          .select('slug')
          .eq('slug', sanitized.slug)
          .neq('id', eventId)
          .single();
        if (existing) {
          sanitized.slug = `${sanitized.slug}-${Date.now().toString(36)}`;
        }
      }

      if (sanitized.status === 'upcoming' || sanitized.status === 'ongoing') {
        sanitized.published_at = sanitized.published_at || new Date().toISOString();
      }
      if (sanitized.status === 'completed') {
        sanitized.completed_at = sanitized.completed_at || new Date().toISOString();
      }

      const { data: updated, error } = await supabase
        .from('events')
        .update(sanitized)
        .eq('id', eventId)
        .select()
        .single();

      if (error) {
        console.error('Update event error:', error.message);
        return respondError(500, 'Unable to update event');
      }

      await auditLog('EVENT_UPDATED', { eventId, success: true, ip, userAgent: ua });
      return respond(200, { event: updated });
    }

    // ========== DELETE: Delete event ==========
    if (event.httpMethod === 'DELETE') {
      const eventId = params.id;
      if (!eventId) return respondError(400, 'Event ID required');

      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        console.error('Delete event error:', error.message);
        return respondError(500, 'Unable to delete event');
      }

      await auditLog('EVENT_DELETED', { eventId, success: true, ip, userAgent: ua });
      return respond(200, { success: true });
    }

    return respondError(405, 'Method not allowed');
  } catch (err) {
    console.error('Admin events error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
