/**
 * /api/research-public
 * Public endpoints for research catalog and detail
 * GET       — list published research (supports filters: division, stage, featured, search)
 * GET?slug= — get single published research item
 */

const { getSupabase, respond, respondError, handleOptions } = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  // Single research item lookup by slug
  if (params.slug) {
    const { data: item, error } = await supabase
      .from('research_items')
      .select(`
        id, title, slug, short_summary, description, research_area,
        research_division, objectives, problem_statement, methodology,
        technologies, expected_outcomes, findings, team_members, mentor,
        start_date, expected_completion_date, completion_date, research_stage,
        concept_image_url, related_project_url, report_url, demo_video_url,
        dataset_url, publication_url, github_url, additional_links, tags,
        featured, published_at
      `)
      .eq('slug', params.slug)
      .neq('publication_status', 'archived')
      .maybeSingle();

    if (error || !item) return respondError(404, 'Research item not found');

    return respond(200, { research: item });
  }

  // Research list query
  let query = supabase
    .from('research_items')
    .select(`
      id, title, slug, short_summary, research_area, research_division,
      research_stage, concept_image_url, demo_video_url, mentor, team_members,
      technologies, tags, featured, published_at
    `)
    .neq('publication_status', 'archived');

  if (params.division && params.division !== 'all') {
    query = query.eq('research_division', params.division);
  }

  if (params.stage && params.stage !== 'all') {
    query = query.eq('research_stage', params.stage);
  }

  if (params.featured === 'true') {
    query = query.eq('featured', true);
  }

  if (params.search) {
    const term = `%${params.search.trim()}%`;
    query = query.or(`title.ilike.${term},short_summary.ilike.${term},research_area.ilike.${term}`);
  }

  query = query
    .order('display_order', { ascending: true })
    .order('published_at', { ascending: false });

  const { data: items, error } = await query;

  if (error) {
    console.error('Fetch public research error:', error.message);
    return respondError(500, 'Failed to fetch research items');
  }

  return respond(200, { research: items || [] });
};
