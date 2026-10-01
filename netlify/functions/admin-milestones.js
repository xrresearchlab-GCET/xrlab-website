/**
 * Netlify Function: admin-milestones
 * Protected CRUD endpoint for Completed Events and Academic Milestones
 * Authentication: JWT session cookie + CSRF header
 */

const { z } = require('zod');
const { getSupabase } = require('./utils/supabase');
const { verifySessionToken } = require('./utils/auth');
const { checkRateLimit } = require('./utils/rate-limiter');
const { logAudit } = require('./utils/audit');

// Fast, zero-dependency HTML & text sanitization
function sanitizeText(str, maxLength = 10000) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\0/g, '')
    .trim()
    .slice(0, maxLength);
}

function sanitizeHtml(dirty, allowedTags = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4', 'a']) {
  if (!dirty || typeof dirty !== 'string') return '';
  let clean = dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/\son\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');

  clean = clean.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!allowedTags.includes(tag)) return '';
    if (tag === 'a') {
      const hrefMatch = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3]) : '';
      if (href && (href.startsWith('https://') || href.startsWith('http://') || href.startsWith('mailto:'))) {
        return `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">`;
      }
      return '<a>';
    }
    return `<${tag}>`;
  });

  return clean;
}

function validateUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (trimmed === '') return true;
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
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
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // Verify Session Token
  const session = verifySessionToken(event);
  if (!session) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized: valid admin session required' }),
    };
  }

  // Rate Limiting (60 requests per minute)
  const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  const rateLimit = await checkRateLimit(clientIp, 'admin_milestones', 60, 60);
  if (!rateLimit.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Too many requests. Please slow down.' }),
    };
  }

  const supabase = getSupabase();

  try {
    // -------------------------------------------------------------------------
    // GET: List all milestones or get single milestone by ID
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'GET') {
      const milestoneId = event.queryStringParameters?.id;
      if (milestoneId) {
        const { data, error } = await supabase
          .from('milestones')
          .select('*')
          .eq('id', milestoneId)
          .single();

        if (error || !data) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Milestone not found' }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify({ milestone: data }) };
      }

      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .order('completed_date', { ascending: false });

      if (error) {
        // Fallback gracefully if table isn't migrated yet
        return { statusCode: 200, headers, body: JSON.stringify({ milestones: [] }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ milestones: data || [] }) };
    }

    // CSRF Check for Write Operations
    if (['POST', 'PUT', 'DELETE'].includes(event.httpMethod)) {
      const csrfHeader = event.headers['x-csrf-token'];
      if (!csrfHeader || csrfHeader !== session.csrfToken) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid or missing CSRF token' }) };
      }
    }

    // -------------------------------------------------------------------------
    // POST: Create Milestone / Completed Event OR Toggle Publish
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (_) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      }

      // Quick action: toggle publish
      if (body._action === 'toggle_publish' && body.id) {
        const { data: updated, error: toggleErr } = await supabase
          .from('milestones')
          .update({ published: !!body.published, updated_at: new Date().toISOString() })
          .eq('id', body.id)
          .select()
          .single();

        if (toggleErr) throw new Error(toggleErr.message);
        await logAudit(clientIp, 'toggle_milestone_publish', true, { id: body.id, published: !!body.published });
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ message: 'Milestone status updated', milestone: updated }),
        };
      }

      const parseResult = MilestoneSchema.safeParse(body);
      if (!parseResult.success) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Validation failed', details: parseResult.error.format() }),
        };
      }

      const m = parseResult.data;

      // Validate URLs
      const urlList = [m.event_report_url, m.video_url, m.presentation_url, m.external_article_url, m.featured_image];
      for (const u of urlList) {
        if (u && !validateUrl(u)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid URL format: ${u}` }) };
        }
      }

      let slug = slugify(m.title);
      if (!slug) slug = 'milestone-' + Date.now();

      // Check slug uniqueness
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
        event_report_url: m.event_report_url ? m.event_report_url.trim() : null,
        video_url: m.video_url ? m.video_url.trim() : null,
        presentation_url: m.presentation_url ? m.presentation_url.trim() : null,
        external_article_url: m.external_article_url ? m.external_article_url.trim() : null,
        participant_count: m.participant_count || null,
        achievement: sanitizeHtml(sanitizeText(m.achievement, 5000)),
        outcome: sanitizeHtml(sanitizeText(m.outcome, 5000)),
        impact: sanitizeHtml(sanitizeText(m.impact, 5000)),
        key_takeaways: Array.isArray(m.key_takeaways) ? m.key_takeaways.map(t => sanitizeText(t, 500)).filter(Boolean) : [],
        tags: Array.isArray(m.tags) ? m.tags.map(t => sanitizeText(t, 50)).filter(Boolean) : [],
        featured_image: m.featured_image ? m.featured_image.trim() : null,
        featured: !!m.featured,
        published: m.published !== false,
      };

      const { data: created, error: insertErr } = await supabase
        .from('milestones')
        .insert(insertData)
        .select()
        .single();

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      await logAudit(clientIp, 'create_milestone', true, { id: created.id, title: created.title });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ message: 'Milestone created successfully', milestone: created }),
      };
    }

    // -------------------------------------------------------------------------
    // PUT: Update Milestone
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'PUT') {
      const milestoneId = event.queryStringParameters?.id;
      if (!milestoneId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing milestone ID' }) };
      }

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (_) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      }

      const parseResult = MilestoneSchema.safeParse(body);
      if (!parseResult.success) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Validation failed', details: parseResult.error.format() }),
        };
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
        event_report_url: m.event_report_url ? m.event_report_url.trim() : null,
        video_url: m.video_url ? m.video_url.trim() : null,
        presentation_url: m.presentation_url ? m.presentation_url.trim() : null,
        external_article_url: m.external_article_url ? m.external_article_url.trim() : null,
        participant_count: m.participant_count || null,
        achievement: sanitizeHtml(sanitizeText(m.achievement, 5000)),
        outcome: sanitizeHtml(sanitizeText(m.outcome, 5000)),
        impact: sanitizeHtml(sanitizeText(m.impact, 5000)),
        key_takeaways: Array.isArray(m.key_takeaways) ? m.key_takeaways.map(t => sanitizeText(t, 500)).filter(Boolean) : [],
        tags: Array.isArray(m.tags) ? m.tags.map(t => sanitizeText(t, 50)).filter(Boolean) : [],
        featured_image: m.featured_image ? m.featured_image.trim() : null,
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

      if (updateErr) throw new Error(updateErr.message);

      await logAudit(clientIp, 'update_milestone', true, { id: milestoneId, title: updated.title });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Milestone updated successfully', milestone: updated }),
      };
    }

    // -------------------------------------------------------------------------
    // DELETE: Delete Milestone
    // -------------------------------------------------------------------------
    if (event.httpMethod === 'DELETE') {
      const milestoneId = event.queryStringParameters?.id;
      if (!milestoneId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing milestone ID' }) };
      }

      const { error: delErr } = await supabase.from('milestones').delete().eq('id', milestoneId);
      if (delErr) throw new Error(delErr.message);

      await logAudit(clientIp, 'delete_milestone', true, { id: milestoneId });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Milestone deleted successfully' }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-milestones error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
