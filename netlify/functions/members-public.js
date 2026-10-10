/**
 * GET /api/members-public
 * Returns public member data — excludes private emails unless show_email_publicly is true.
 * ?status=PRESENT|PAST (defaults to PRESENT)
 */

const { getSupabase, respond, respondError, handleOptions } = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  const params = event.queryStringParameters || {};
  const status = ['PRESENT', 'PAST'].includes(params.status) ? params.status : null;

  const supabase = getSupabase();

  let query = supabase
    .from('members')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('members-public error:', error);
    return respondError(500, error.message || 'Failed to fetch members');
  }

  // Strip private emails and server-internal fields
  const publicMembers = (data || []).map(m => {
    const member = { ...m };
    if (!member.show_email_publicly) {
      delete member.email;
    }
    delete member.show_email_publicly;
    delete member.created_by;
    return member;
  });

  return respond(200, { members: publicMembers });
};
