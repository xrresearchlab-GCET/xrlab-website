/**
 * XR Research Lab — Shared Utilities for Netlify Functions
 * Database client, auth helpers, rate limiting, validation
 */

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cookie = require('cookie');

// ============================================
// Supabase Client (Service Role — server-side only)
// ============================================
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

// ============================================
// CORS & Response Helpers
// ============================================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.URL || '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function respondError(statusCode, message) {
  return respond(statusCode, { error: message });
}

function handleOptions() {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}

// ============================================
// Session Management
// ============================================
const SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function generateSessionToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSessionCookie(token) {
  return cookie.serialize('xr_admin_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_DURATION / 1000,
  });
}

function clearSessionCookie() {
  return cookie.serialize('xr_admin_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  });
}

function getSessionToken(event) {
  const cookies = cookie.parse(event.headers.cookie || '');
  return cookies.xr_admin_session || null;
}

async function validateSession(event) {
  const token = getSessionToken(event);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: session, error } = await supabase
    .from('admin_sessions')
    .select('*')
    .eq('session_token_hash', tokenHash)
    .gt('expires_at', now)
    .single();

  if (error || !session) return null;

  // Check idle timeout
  const lastActivity = new Date(session.last_activity);
  if (Date.now() - lastActivity.getTime() > SESSION_IDLE_TIMEOUT) {
    await supabase.from('admin_sessions').delete().eq('id', session.id);
    return null;
  }

  // Update last activity
  await supabase
    .from('admin_sessions')
    .update({ last_activity: now })
    .eq('id', session.id);

  return session;
}

// ============================================
// CSRF Protection
// ============================================
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createCSRFCookie(token) {
  return cookie.serialize('xr_csrf', token, {
    httpOnly: false, // Must be readable by JS to send in header
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_DURATION / 1000,
  });
}

function validateCSRF(event) {
  const cookies = cookie.parse(event.headers.cookie || '');
  const cookieToken = cookies.xr_csrf;
  const headerToken = event.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) return false;
  return crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken)
  );
}

// ============================================
// Rate Limiting
// ============================================
const RATE_LIMITS = {
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  otp: { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  resend: { maxAttempts: 3, windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  api: { maxAttempts: 100, windowMs: 15 * 60 * 1000, blockMs: 5 * 60 * 1000 },
};

async function checkRateLimit(key, action) {
  const supabase = getSupabase();
  const config = RATE_LIMITS[action] || RATE_LIMITS.api;
  const now = new Date();

  const { data: existing } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('key', key)
    .eq('action', action)
    .single();

  if (existing) {
    // Check if blocked
    if (existing.blocked_until && new Date(existing.blocked_until) > now) {
      return { allowed: false, retryAfter: Math.ceil((new Date(existing.blocked_until) - now) / 1000) };
    }

    // Check if window expired — reset
    const windowStart = new Date(existing.first_attempt);
    if (now - windowStart > config.windowMs) {
      await supabase
        .from('rate_limits')
        .update({
          attempts: 1,
          first_attempt: now.toISOString(),
          last_attempt: now.toISOString(),
          blocked_until: null,
        })
        .eq('id', existing.id);
      return { allowed: true };
    }

    // Increment and check
    const newAttempts = existing.attempts + 1;
    const update = { attempts: newAttempts, last_attempt: now.toISOString() };

    if (newAttempts >= config.maxAttempts) {
      update.blocked_until = new Date(now.getTime() + config.blockMs).toISOString();
    }

    await supabase.from('rate_limits').update(update).eq('id', existing.id);

    if (newAttempts >= config.maxAttempts) {
      return { allowed: false, retryAfter: config.blockMs / 1000 };
    }

    return { allowed: true, remaining: config.maxAttempts - newAttempts };
  }

  // First attempt
  await supabase.from('rate_limits').insert({
    key,
    action,
    attempts: 1,
    first_attempt: now.toISOString(),
    last_attempt: now.toISOString(),
  });

  return { allowed: true, remaining: config.maxAttempts - 1 };
}

// ============================================
// Turnstile CAPTCHA Verification
// ============================================
async function verifyCaptcha(token, ip) {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping CAPTCHA in dev');
    return true;
  }

  const formData = new URLSearchParams();
  formData.append('secret', process.env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });

  const result = await res.json();
  return result.success === true;
}

// ============================================
// Input Sanitization
// ============================================
function sanitizeText(text, maxLength = 5000) {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, maxLength);
}

function validateUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

// ============================================
// Audit Logging
// ============================================
async function auditLog(action, { eventId, success = true, ip, userAgent, details = {} }) {
  try {
    const supabase = getSupabase();
    await supabase.from('audit_log').insert({
      action,
      event_id: eventId || null,
      success,
      ip_address: ip || null,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
      details,
    });
  } catch (err) {
    // Don't let audit failures break the main flow
    console.error('Audit log error:', err.message);
  }
}

// ============================================
// Helper to get client IP
// ============================================
function getClientIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['x-real-ip']
    || event.headers['client-ip']
    || 'unknown';
}

module.exports = {
  getSupabase,
  respond,
  respondError,
  handleOptions,
  CORS_HEADERS,
  // Session
  generateSessionToken,
  hashToken,
  createSessionCookie,
  clearSessionCookie,
  getSessionToken,
  validateSession,
  SESSION_DURATION,
  // CSRF
  generateCSRFToken,
  createCSRFCookie,
  validateCSRF,
  // Rate limiting
  checkRateLimit,
  // CAPTCHA
  verifyCaptcha,
  // Input
  sanitizeText,
  validateUrl,
  generateSlug,
  // Audit
  auditLog,
  getClientIP,
};
