/**
 * POST /api/auth-logout
 * Destroy session and clear cookies
 */

const {
  respondError, handleOptions, getSupabase,
  getSessionToken, hashToken, clearSessionCookie,
  clearCSRFCookie, auditLog, getClientIP,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return respondError(405, 'Method not allowed');

  const ip = getClientIP(event);
  const ua = event.headers['user-agent'] || '';

  try {
    const token = getSessionToken(event);
    if (token) {
      const tokenHash = hashToken(token);
      const supabase = getSupabase();
      await supabase.from('admin_sessions').delete().eq('session_token_hash', tokenHash);
    }

    await auditLog('ADMIN_LOGOUT', { success: true, ip, userAgent: ua });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      multiValueHeaders: {
        'Set-Cookie': [clearSessionCookie(), clearCSRFCookie()],
      },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Logout error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
