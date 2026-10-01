/**
 * Netlify Function: milestones-public
 * Public read-only endpoint for published academic milestones & completed events
 */

const { getSupabase } = require('./utils/shared');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=60, s-maxage=300',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  try {
    let query = supabase
      .from('milestones')
      .select(`
        id,
        title,
        slug,
        milestone_type,
        category,
        research_division,
        completed_date,
        location,
        venue,
        organizer,
        short_description,
        description,
        event_report_url,
        video_url,
        presentation_url,
        external_article_url,
        participant_count,
        achievement,
        outcome,
        impact,
        key_takeaways,
        tags,
        featured_image,
        featured,
        created_at
      `)
      .eq('published', true)
      .order('completed_date', { ascending: false });

    if (params.category) {
      query = query.eq('category', params.category);
    }

    if (params.research_division) {
      query = query.eq('research_division', params.research_division);
    }

    if (params.milestone_type) {
      query = query.eq('milestone_type', params.milestone_type);
    }

    if (params.slug) {
      const { data, error } = await query.eq('slug', params.slug).single();
      if (error || !data) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Milestone not found' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ milestone: data }) };
    }

    const { data, error } = await query;
    if (error) {
      // Return empty gracefully if table is not yet migrated
      return { statusCode: 200, headers, body: JSON.stringify({ milestones: [] }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ milestones: data || [] }) };
  } catch (err) {
    console.error('milestones-public error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch milestones' }),
    };
  }
};
