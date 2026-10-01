/**
 * GET /api/projects-public
 * Public API to fetch published projects
 * No authentication required
 */

const { getSupabase, respond, respondError, handleOptions } = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  try {
    const supabase = getSupabase();
    const params = event.queryStringParameters || {};
    const { project_type, research_division, status, slug, search, limit, offset } = params;

    // Columns to select publicly (exclude client_name when show_client_publicly is false)
    const publicColumns = 'id, title, slug, short_description, description, project_type, research_division, status, year, objectives, expected_outcome, technologies, tags, team_members, mentor, client_name, show_client_publicly, student_name, scope, concept_image_url, webgl_url, documentation_url, report_url, demo_video_url, github_url, additional_resource_url, featured, published_at, created_at';

    let query = supabase
      .from('projects')
      .select(publicColumns)
      .eq('published', true);

    // Single project by slug
    if (slug) {
      query = query.eq('slug', slug).single();
      const { data, error } = await query;
      if (error || !data) return respondError(404, 'Project not found');

      // Redact client name if not publicly shown
      if (data.client_name && !data.show_client_publicly) {
        data.client_name = null;
      }

      return respond(200, { project: data });
    }

    // Filter by project type
    if (project_type) {
      query = query.eq('project_type', project_type);
    }

    // Filter by research division (only for experiential projects)
    if (research_division) {
      query = query.eq('research_division', research_division);
    }

    // Filter by status
    if (status && ['concept', 'ongoing', 'prototype', 'completed', 'archived'].includes(status)) {
      query = query.eq('status', status);
    }

    // Search
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike.${term},short_description.ilike.${term},research_division.ilike.${term}`);
    }

    // Order: featured first, then by created_at
    query = query.order('featured', { ascending: false })
                 .order('created_at', { ascending: false });

    // Pagination
    const pageLimit = Math.min(parseInt(limit) || 50, 100);
    const pageOffset = parseInt(offset) || 0;
    query = query.range(pageOffset, pageOffset + pageLimit - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error('Projects fetch error:', error.message);
      return respondError(500, 'Unable to fetch projects');
    }

    // Redact client names where not publicly shown
    const projects = (data || []).map(p => {
      if (p.client_name && !p.show_client_publicly) {
        p.client_name = null;
      }
      return p;
    });

    return respond(200, { projects, total: projects.length });
  } catch (err) {
    console.error('Projects public error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
