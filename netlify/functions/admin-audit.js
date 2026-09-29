/**
 * GET /api/admin-audit
 * Protected endpoint to fetch audit logs and security info
 */

const {
  getSupabase, respond, respondError, handleOptions,
  validateSession, getClientIP,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  // Authenticate
  const session = await validateSession(event);
  if (!session) {
    return respondError(401, 'Unauthorized');
  }

  try {
    const supabase = getSupabase();
    const params = event.queryStringParameters || {};

    // Recent login attempts
    const { data: loginAttempts } = await supabase
      .from('audit_log')
      .select('action, success, ip_address, created_at')
      .in('action', ['ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILURE', 'OTP_FAILURE', 'OTP_SENT', 'ADMIN_LOGOUT'])
      .order('created_at', { ascending: false })
      .limit(20);

    // Recent admin actions
    const { data: adminActions } = await supabase
      .from('audit_log')
      .select('action, event_id, success, created_at, details')
      .in('action', ['EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_DELETED', 'EVENT_STATUS_UPDATED'])
      .order('created_at', { ascending: false })
      .limit(20);

    // Last successful login
    const { data: lastLogin } = await supabase
      .from('audit_log')
      .select('created_at, ip_address')
      .eq('action', 'ADMIN_LOGIN_SUCCESS')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Active sessions count
    const { count: activeSessions } = await supabase
      .from('admin_sessions')
      .select('*', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());

    return respond(200, {
      lastLogin: lastLogin || null,
      loginAttempts: loginAttempts || [],
      adminActions: adminActions || [],
      activeSessions: activeSessions || 0,
      currentSession: {
        expiresAt: session.expires_at,
        lastActivity: session.last_activity,
        ip: session.ip_address,
      },
    });
  } catch (err) {
    console.error('Audit error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
