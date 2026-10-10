/**
 * POST /api/admin-password-change
 * Secure admin password change with fresh OTP verification
 * 
 * Step 1: { action: 'request', currentPassword } → Verify password → Send OTP
 * Step 2: { action: 'verify', challengeId, code, newPassword } → Verify OTP → Update password hash
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Resend } = require('resend');
const {
  getSupabase, respond, respondError, handleOptions,
  validateSession, validateCSRF, checkRateLimit,
  auditLog, getClientIP, sanitizeText,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return respondError(405, 'Method not allowed');

  const ip = getClientIP(event);
  const ua = event.headers['user-agent'] || '';

  // Require authenticated session
  const session = await validateSession(event);
  if (!session) return respondError(401, 'Authentication required');

  // CSRF check
  if (!validateCSRF(event)) return respondError(403, 'Invalid CSRF token');

  // Rate limit
  const rl = await checkRateLimit(ip, 'password_change');
  if (!rl.allowed) {
    await auditLog('ADMIN_PASSWORD_CHANGE_RATE_LIMITED', { success: false, ip, userAgent: ua });
    return respondError(429, 'Too many attempts. Please try again later.');
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respondError(400, 'Invalid request body');
  }

  const { action } = body;

  // ── STEP 1: Request password change ──
  if (action === 'request') {
    const { currentPassword } = body;
    if (!currentPassword) return respondError(400, 'Current password is required');

    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminPasswordHash) return respondError(500, 'Server configuration error');

    const passwordMatch = await bcrypt.compare(currentPassword, adminPasswordHash);
    if (!passwordMatch) {
      await auditLog('ADMIN_PASSWORD_CHANGE_FAILED', {
        success: false, ip, userAgent: ua,
        details: { reason: 'wrong_current_password' },
      });
      return respondError(401, 'Current password is incorrect');
    }

    await auditLog('ADMIN_PASSWORD_CHANGE_REQUESTED', { success: true, ip, userAgent: ua });

    // Generate OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    const adminEmail = process.env.ADMIN_EMAIL;
    const emailHash = crypto.createHash('sha256').update(adminEmail.toLowerCase()).digest('hex');

    const supabase = getSupabase();

    // Invalidate existing challenges for this email
    await supabase.from('auth_challenges').delete().eq('email_hash', emailHash);

    // Create challenge
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const { data: challenge, error: challengeError } = await supabase
      .from('auth_challenges')
      .insert({
        email_hash: emailHash,
        code_hash: otpHash,
        expires_at: expiresAt.toISOString(),
        ip_address: ip,
      })
      .select('id')
      .single();

    if (challengeError) {
      console.error('Challenge creation error:', challengeError.message);
      return respondError(500, 'Unable to process request');
    }

    // Send OTP email
    const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL;
    if (process.env.RESEND_API_KEY && notifyEmail) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'XR Research Lab <onboarding@resend.dev>',
          to: [notifyEmail],
          subject: 'XR Research Lab — Password Change Verification',
          html: `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0d14; color: #f0f0f2; border-radius: 12px; border: 1px solid rgba(239,68,68,0.3);">
              <h2 style="color: #F87171; margin-bottom: 8px; font-size: 18px; letter-spacing: 0.05em;">⚠ PASSWORD CHANGE REQUEST</h2>
              <p style="color: #9ca3af; font-size: 13px; margin-bottom: 24px;">A password change was requested for the XR Research Lab admin panel.</p>
              <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 0.3em; color: #F87171;">${otpCode}</span>
              </div>
              <p style="color: #9ca3af; font-size: 13px; line-height: 1.6;">This code expires in <strong style="color:#f0f0f2;">10 minutes</strong>. If you did not request this change, your account may be compromised.</p>
              <p style="color: #6b7280; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06);">IP: ${ip}</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Email send error:', emailErr.message);
      }
    }

    await auditLog('ADMIN_PASSWORD_CHANGE_OTP_SENT', { success: true, ip, userAgent: ua });

    return respond(200, {
      challengeId: challenge.id,
      message: 'Verification code sent to the registered email',
    });
  }

  // ── STEP 2: Verify OTP and update password ──
  if (action === 'verify') {
    const { challengeId, code, newPassword } = body;

    if (!challengeId || !code || !newPassword) {
      return respondError(400, 'Missing required fields');
    }

    if (!/^\d{6}$/.test(code)) {
      return respondError(400, 'Invalid code format');
    }

    // Password policy
    if (newPassword.length < 8) {
      return respondError(400, 'Password must be at least 8 characters');
    }
    if (newPassword.length > 128) {
      return respondError(400, 'Password is too long');
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
      await auditLog('ADMIN_PASSWORD_CHANGE_FAILED', {
        success: false, ip, userAgent: ua,
        details: { reason: 'challenge_not_found' },
      });
      return respondError(401, 'Invalid or expired verification');
    }

    if (challenge.used_at) {
      return respondError(401, 'Verification code already used');
    }

    if (new Date(challenge.expires_at) < now) {
      return respondError(401, 'Verification code expired');
    }

    if (challenge.attempt_count >= challenge.max_attempts) {
      return respondError(401, 'Too many failed attempts');
    }

    // Verify code
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const codeMatches = crypto.timingSafeEqual(
      Buffer.from(codeHash, 'hex'),
      Buffer.from(challenge.code_hash, 'hex')
    );

    if (!codeMatches) {
      await supabase
        .from('auth_challenges')
        .update({ attempt_count: challenge.attempt_count + 1 })
        .eq('id', challenge.id);

      await auditLog('ADMIN_PASSWORD_CHANGE_FAILED', {
        success: false, ip, userAgent: ua,
        details: { reason: 'wrong_code' },
      });
      return respondError(401, 'Invalid verification code');
    }

    // Mark challenge as used
    await supabase
      .from('auth_challenges')
      .update({ used_at: now.toISOString() })
      .eq('id', challenge.id);

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 12);

    // NOTE: The password hash is stored as an environment variable (ADMIN_PASSWORD_HASH).
    // Netlify environment variables cannot be changed at runtime via code.
    // The admin must manually update the ADMIN_PASSWORD_HASH env var in Netlify.
    // We log the new hash securely and provide instructions.

    // Invalidate all other sessions (logout everywhere)
    await supabase
      .from('admin_sessions')
      .delete()
      .neq('id', session.id);

    // Invalidate outstanding OTPs
    const adminEmail = process.env.ADMIN_EMAIL;
    const emailHash = crypto.createHash('sha256').update(adminEmail.toLowerCase()).digest('hex');
    await supabase.from('auth_challenges').delete().eq('email_hash', emailHash);

    await auditLog('ADMIN_PASSWORD_CHANGE_SUCCESS', { success: true, ip, userAgent: ua });

    return respond(200, {
      success: true,
      newPasswordHash: newHash,
      message: 'Password change verified. Update your ADMIN_PASSWORD_HASH environment variable in Netlify with the new hash, then redeploy.',
      instructions: [
        '1. Go to Netlify → Site Settings → Environment Variables',
        '2. Update ADMIN_PASSWORD_HASH with the hash provided',
        '3. Trigger a redeploy for the change to take effect',
        '4. Your new password will be active after redeploy',
      ],
    });
  }

  return respondError(400, 'Invalid action');
};
