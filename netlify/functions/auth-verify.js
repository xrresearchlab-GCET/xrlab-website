/**
 * POST /api/auth-verify
 * Step 2: Verify OTP code, create session, set HttpOnly cookie
 */

const crypto = require('crypto');
const {
  getSupabase, respond, respondError, handleOptions,
  generateSessionToken, hashToken, createSessionCookie,
  createCSRFCookie, generateCSRFToken,
  checkRateLimit, auditLog, getClientIP, SESSION_DURATION,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return respondError(405, 'Method not allowed');

  const ip = getClientIP(event);
  const ua = event.headers['user-agent'] || '';

  try {
    // Rate limit check
    const rl = await checkRateLimit(ip, 'otp');
    if (!rl.allowed) {
      await auditLog('OTP_RATE_LIMITED', { success: false, ip, userAgent: ua });
      return respondError(429, 'Too many attempts. Please try again later.');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respondError(400, 'Invalid request body');
    }

    const { challengeId, code } = body;

    if (!challengeId || !code) {
      return respondError(400, 'Missing required fields');
    }

    // Validate code format
    if (!/^\d{6}$/.test(code)) {
      return respondError(400, 'Invalid code format');
    }

    const supabase = getSupabase();
    const now = new Date();

    // Find challenge
    const { data: challenge, error: findError } = await supabase
      .from('auth_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (findError || !challenge) {
      await auditLog('OTP_FAILURE', { success: false, ip, userAgent: ua, details: { reason: 'challenge_not_found' } });
      return respondError(401, 'Invalid or expired verification');
    }

    // Check if already used
    if (challenge.used_at) {
      await auditLog('OTP_FAILURE', { success: false, ip, userAgent: ua, details: { reason: 'already_used' } });
      return respondError(401, 'Verification code already used');
    }

    // Check expiry
    if (new Date(challenge.expires_at) < now) {
      await auditLog('OTP_FAILURE', { success: false, ip, userAgent: ua, details: { reason: 'expired' } });
      return respondError(401, 'Verification code expired');
    }

    // Check attempts
    if (challenge.attempt_count >= challenge.max_attempts) {
      await auditLog('OTP_FAILURE', { success: false, ip, userAgent: ua, details: { reason: 'max_attempts' } });
      return respondError(401, 'Too many failed attempts');
    }

    // Verify code hash
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const codeMatches = crypto.timingSafeEqual(
      Buffer.from(codeHash, 'hex'),
      Buffer.from(challenge.code_hash, 'hex')
    );

    if (!codeMatches) {
      // Increment attempt count
      await supabase
        .from('auth_challenges')
        .update({ attempt_count: challenge.attempt_count + 1 })
        .eq('id', challenge.id);

      await auditLog('OTP_FAILURE', { success: false, ip, userAgent: ua, details: { reason: 'wrong_code' } });
      return respondError(401, 'Invalid verification code');
    }

    // Mark challenge as used
    await supabase
      .from('auth_challenges')
      .update({ used_at: now.toISOString() })
      .eq('id', challenge.id);

    // Invalidate any existing sessions (single admin)
    const adminEmailHash = challenge.email_hash;
    // Clean up old sessions
    await supabase
      .from('admin_sessions')
      .delete()
      .lt('expires_at', now.toISOString());

    // Create new session
    const sessionToken = generateSessionToken();
    const sessionTokenHash = hashToken(sessionToken);
    const expiresAt = new Date(now.getTime() + SESSION_DURATION);

    await supabase.from('admin_sessions').insert({
      session_token_hash: sessionTokenHash,
      expires_at: expiresAt.toISOString(),
      last_activity: now.toISOString(),
      ip_address: ip,
      user_agent: ua.slice(0, 500),
    });

    // Generate CSRF token
    const csrfToken = generateCSRFToken();

    await auditLog('ADMIN_LOGIN_SUCCESS', { success: true, ip, userAgent: ua });

    // Set session cookie + CSRF cookie
    const sessionCookie = createSessionCookie(sessionToken);
    const csrfCookie = createCSRFCookie(csrfToken);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      multiValueHeaders: {
        'Set-Cookie': [sessionCookie, csrfCookie],
      },
      body: JSON.stringify({
        success: true,
        csrfToken,
      }),
    };
  } catch (err) {
    console.error('Verify error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
