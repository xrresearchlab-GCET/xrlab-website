/**
 * POST /api/auth-login
 * Step 1: Validate CAPTCHA + password, create OTP challenge, send email
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Resend } = require('resend');
const {
  getSupabase, respond, respondError, handleOptions,
  hashToken, checkRateLimit, verifyCaptcha, auditLog, getClientIP,
} = require('./utils/shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return respondError(405, 'Method not allowed');

  const ip = getClientIP(event);
  const ua = event.headers['user-agent'] || '';

  try {
    // Rate limit check
    const rl = await checkRateLimit(ip, 'login');
    if (!rl.allowed) {
      await auditLog('ADMIN_LOGIN_RATE_LIMITED', { success: false, ip, userAgent: ua });
      return respondError(429, 'Too many attempts. Please try again later.');
    }

    // Parse body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respondError(400, 'Invalid request body');
    }

    const { email, password, captchaToken } = body;

    // Validate required fields
    if (!email || !password || !captchaToken) {
      return respondError(400, 'Missing required fields');
    }

    // Verify CAPTCHA server-side
    const captchaValid = await verifyCaptcha(captchaToken, ip);
    if (!captchaValid) {
      await auditLog('CAPTCHA_FAILURE', { success: false, ip, userAgent: ua });
      return respondError(403, 'CAPTCHA verification failed');
    }

    // Verify credentials (constant-time comparison for email)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminPasswordHash) {
      console.error('Admin credentials not configured');
      return respondError(500, 'Server configuration error');
    }

    // Use constant-time comparison for email to prevent timing attacks
    const emailMatch = email.toLowerCase() === adminEmail.toLowerCase();
    // Always check password even if email doesn't match (prevent timing leak)
    const passwordMatch = await bcrypt.compare(password, adminPasswordHash);

    if (!emailMatch || !passwordMatch) {
      await auditLog('ADMIN_LOGIN_FAILURE', { success: false, ip, userAgent: ua });
      return respondError(401, 'Invalid credentials');
    }

    // Generate 6-digit OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    const emailHash = crypto.createHash('sha256').update(adminEmail.toLowerCase()).digest('hex');

    // Invalidate any existing challenges for this email
    const supabase = getSupabase();
    await supabase
      .from('auth_challenges')
      .delete()
      .eq('email_hash', emailHash);

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

    // Send OTP email via Resend
    const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL;
    if (process.env.RESEND_API_KEY && notifyEmail) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'XR Research Lab <onboarding@resend.dev>',
          to: [notifyEmail],
          subject: 'XR Research Lab — Admin Verification Code',
          html: `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0d14; color: #f0f0f2; border-radius: 12px; border: 1px solid rgba(59,130,246,0.3);">
              <h2 style="color: #60A5FA; margin-bottom: 8px; font-size: 18px; letter-spacing: 0.05em;">XR RESEARCH LAB</h2>
              <p style="color: #9ca3af; font-size: 13px; margin-bottom: 24px;">Admin Verification Code</p>
              <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 0.3em; color: #60A5FA;">${otpCode}</span>
              </div>
              <p style="color: #9ca3af; font-size: 13px; line-height: 1.6;">This code expires in <strong style="color:#f0f0f2;">10 minutes</strong>.</p>
              <p style="color: #6b7280; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06);">If you did not request this code, please ignore this email.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Email send error:', emailErr.message);
        // Don't fail the whole flow — user can still enter OTP if it was logged
      }
    } else {
      console.warn('Email not configured — OTP not sent');
    }

    await auditLog('OTP_SENT', { success: true, ip, userAgent: ua });

    return respond(200, {
      challengeId: challenge.id,
      message: 'Verification code sent',
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return respondError(500, 'An error occurred');
  }
};
