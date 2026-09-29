/**
 * GET /api/auth-session
 * Check if current session is valid, return session info
 */

const {
  respond, respondError, handleOptions,
  validateSession, getClientIP,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  try {
    const session = await validateSession(event);

    if (!session) {
      return respond(200, { authenticated: false });
    }

    return respond(200, {
      authenticated: true,
      session: {
        expiresAt: session.expires_at,
        lastActivity: session.last_activity,
      },
    });
  } catch (err) {
    console.error('Session check error:', err.message);
    return respond(200, { authenticated: false });
  }
};
