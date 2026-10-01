/**
 * GET /api/auth-session
 * Check if current session is valid, return session info
 */

const cookie = require('cookie');
const {
  respond, respondError, handleOptions,
  validateSession, getClientIP,
  generateCSRFToken, createCSRFCookie,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return respondError(405, 'Method not allowed');

  try {
    const session = await validateSession(event);

    if (!session) {
      return respond(200, { authenticated: false });
    }

    const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
    const cookies = cookie.parse(cookieHeader);
    let csrfToken = cookies.xr_csrf;
    let newCsrfCookie = null;

    if (!csrfToken) {
      csrfToken = generateCSRFToken();
      newCsrfCookie = createCSRFCookie(csrfToken);
    }

    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        authenticated: true,
        csrfToken,
        session: {
          expiresAt: session.expires_at,
          lastActivity: session.last_activity,
        },
      }),
    };

    if (newCsrfCookie) {
      response.headers['Set-Cookie'] = newCsrfCookie;
    }

    return response;
  } catch (err) {
    console.error('Session check error:', err.message);
    return respond(200, { authenticated: false });
  }
};
