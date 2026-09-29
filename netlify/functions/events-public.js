/**
 * GET /api/events-public
 * Public API to fetch published events (upcoming, ongoing, completed milestones)
 * No authentication required
 */

const { getSupabase, respond, respondError, handleOptions } = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  try {
    const supabase = getSupabase();
    const params = event.queryStringParameters || {};
    const { status, slug, milestone, limit } = params;

    let query = supabase
      .from('events')
      .select('id, title, slug, short_description, description, category, research_division, start_datetime, end_datetime, location, venue, registration_url, external_url, organizer, status, featured_image, gallery, speakers, highlights, tags, milestone_enabled, milestone_title, milestone_description, milestone_content, published_at, completed_at');

    // Single event by slug
    if (slug) {
      query = query.eq('slug', slug).in('status', ['upcoming', 'ongoing', 'completed', 'cancelled']).single();
      const { data, error } = await query;
      if (error || !data) return respondError(404, 'Event not found');
      return respond(200, { event: data });
    }

    // Milestone mode — completed events with milestone_enabled
    if (milestone === 'true') {
      query = query
        .eq('status', 'completed')
        .eq('milestone_enabled', true)
        .order('completed_at', { ascending: false });
    }
    // Filter by status
    else if (status && ['upcoming', 'ongoing', 'completed', 'cancelled'].includes(status)) {
      query = query.eq('status', status);
    }
    // Default: upcoming + ongoing
    else {
      query = query.in('status', ['upcoming', 'ongoing']);
    }

    // Apply ordering
    if (!milestone) {
      query = query.order('start_datetime', { ascending: true });
    }

    // Limit
    if (limit && parseInt(limit) > 0) {
      query = query.limit(parseInt(limit));
    } else {
      query = query.limit(50);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Events fetch error:', error.message);
      return respondError(500, 'Unable to fetch events');
    }

    return respond(200, { events: data || [] });
  } catch (err) {
    console.error('Events public error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
