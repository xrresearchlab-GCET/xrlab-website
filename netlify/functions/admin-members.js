/**
 * /api/admin-members
 * GET    — List all members (admin)
 * GET?id — Get single member
 * POST   — Create member
 * PUT?id — Update member
 * DELETE?id — Delete member
 * POST { _action: 'move_to_past' | 'restore_to_present', id } — Status change
 */

const {
  getSupabase, respond, respondError, handleOptions,
  validateSession, validateCSRF, sanitizeText, validateUrl,
  auditLog, getClientIP,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const ip = getClientIP(event);
  const ua = event.headers['user-agent'] || '';

  // All admin-members operations require auth
  const session = await validateSession(event);
  if (!session) return respondError(401, 'Authentication required');

  const supabase = getSupabase();
  const params = event.queryStringParameters || {};

  // ── GET ──
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', params.id)
        .single();
      if (error || !data) return respondError(404, 'Member not found');
      return respond(200, { member: data });
    }
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) return respondError(500, 'Failed to fetch members');
    return respond(200, { members: data || [] });
  }

  // Mutating operations require CSRF
  if (!validateCSRF(event)) return respondError(403, 'Invalid CSRF token');

  // ── POST ──
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return respondError(400, 'Invalid request body'); }

    // Status change actions
    if (body._action === 'move_to_past' || body._action === 'restore_to_present') {
      const { id } = body;
      if (!id) return respondError(400, 'Member ID required');

      const newStatus = body._action === 'move_to_past' ? 'PAST' : 'PRESENT';
      const { error } = await supabase
        .from('members')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) return respondError(500, 'Failed to update member status');

      const auditAction = newStatus === 'PAST' ? 'MEMBER_MOVED_TO_PAST' : 'MEMBER_RESTORED';
      await auditLog(auditAction, { success: true, ip, userAgent: ua, details: { memberId: id } });
      return respond(200, { success: true, message: `Member ${newStatus === 'PAST' ? 'moved to past' : 'restored'}` });
    }

    // Create member
    const memberData = sanitizeMemberData(body);
    if (!memberData.full_name) return respondError(400, 'Full name is required');
    if (!memberData.role) return respondError(400, 'Role is required');

    // Validate URLs
    for (const urlField of ['model_url', 'fallback_image_url', 'public_profile_url']) {
      if (memberData[urlField] && !validateUrl(memberData[urlField])) {
        return respondError(400, `Invalid URL for ${urlField}`);
      }
    }

    const { data, error } = await supabase
      .from('members')
      .insert(memberData)
      .select()
      .single();

    if (error) return respondError(500, 'Failed to create member: ' + error.message);
    await auditLog('MEMBER_CREATED', { success: true, ip, userAgent: ua, details: { memberId: data.id, name: data.full_name } });
    return respond(201, { success: true, member: data });
  }

  // ── PUT ──
  if (event.httpMethod === 'PUT') {
    const id = params.id;
    if (!id) return respondError(400, 'Member ID required');

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return respondError(400, 'Invalid request body'); }

    const memberData = sanitizeMemberData(body);

    // Validate URLs
    for (const urlField of ['model_url', 'fallback_image_url', 'public_profile_url']) {
      if (memberData[urlField] && !validateUrl(memberData[urlField])) {
        return respondError(400, `Invalid URL for ${urlField}`);
      }
    }

    const { data, error } = await supabase
      .from('members')
      .update(memberData)
      .eq('id', id)
      .select()
      .single();

    if (error) return respondError(500, 'Failed to update member: ' + error.message);
    await auditLog('MEMBER_UPDATED', { success: true, ip, userAgent: ua, details: { memberId: id } });
    return respond(200, { success: true, member: data });
  }

  // ── DELETE ──
  if (event.httpMethod === 'DELETE') {
    const id = params.id;
    if (!id) return respondError(400, 'Member ID required');

    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) return respondError(500, 'Failed to delete member');
    await auditLog('MEMBER_ARCHIVED', { success: true, ip, userAgent: ua, details: { memberId: id } });
    return respond(200, { success: true });
  }

  return respondError(405, 'Method not allowed');
};

function sanitizeMemberData(body) {
  return {
    full_name: sanitizeText(body.full_name, 200),
    email: sanitizeText(body.email, 200),
    role: sanitizeText(body.role, 200),
    tagline: sanitizeText(body.tagline, 500),
    about: sanitizeText(body.about, 5000),
    status: ['PRESENT', 'PAST'].includes(body.status) ? body.status : 'PRESENT',
    model_url: sanitizeText(body.model_url, 1000),
    model_format: sanitizeText(body.model_format, 20) || 'glb',
    fallback_image_url: sanitizeText(body.fallback_image_url, 1000),
    public_profile_url: sanitizeText(body.public_profile_url, 1000),
    show_email_publicly: body.show_email_publicly === true,
    display_order: typeof body.display_order === 'number' ? body.display_order : 0,
    joined_at: body.joined_at || new Date().toISOString().slice(0, 10),
  };
}
