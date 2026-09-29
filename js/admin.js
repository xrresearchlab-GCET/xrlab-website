/**
 * XR Research Lab — Admin Panel JavaScript
 * Client-side SPA logic for authentication and event management
 * All sensitive operations happen server-side via Netlify Functions
 */

(function () {
  'use strict';

  // =========================================================================
  // STATE
  // =========================================================================
  let csrfToken = '';
  let challengeId = '';
  let captchaToken = '';
  let otpTimerInterval = null;
  let currentSection = 'dashboard';
  let allEvents = [];
  let editingEventId = null;

  const API = '/api';

  // =========================================================================
  // HELPERS
  // =========================================================================
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  async function apiCall(path, options = {}) {
    if (window.location.protocol === 'file:') {
      throw new Error('Running on file:// protocol. Netlify backend functions require a live web server or Netlify deployment.');
    }
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && options.method && options.method !== 'GET') {
      headers['X-CSRF-Token'] = csrfToken;
    }
    let res;
    try {
      res = await fetch(`${API}/${path}`, {
        credentials: 'include',
        ...options,
        headers,
      });
    } catch (netErr) {
      throw new Error(`Cannot reach /api/${path}. Ensure your site is deployed to Netlify or running locally with 'netlify dev'.`);
    }
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`Server returned an unreadable response (${res.status}).`);
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  // =========================================================================
  // 1. AUTHENTICATION
  // =========================================================================

  // Check existing session on load
  async function checkSession() {
    try {
      const data = await apiCall('auth-session');
      if (data.authenticated) {
        showDashboard();
        return true;
      }
    } catch (e) {
      // Not authenticated
    }
    showLogin();
    return false;
  }

  function showLogin() {
    $('#login-screen').style.display = '';
    $('#admin-dashboard').style.display = 'none';
  }

  function showDashboard() {
    $('#login-screen').style.display = 'none';
    $('#admin-dashboard').style.display = 'flex';
    loadDashboard();
  }

  // Turnstile callbacks
  window.onCaptchaSuccess = function (token) {
    captchaToken = token;
    hideLoginError();
  };

  window.onCaptchaExpired = function () {
    captchaToken = '';
    showLoginError('CAPTCHA expired. Please solve the security check again.');
  };

  window.onCaptchaError = function (errorCode) {
    console.error('Turnstile CAPTCHA error:', errorCode);
    showLoginError(`Cloudflare Turnstile CAPTCHA error (${errorCode || 'unknown'}). Please ensure your current domain (or localhost) is allowed in your Cloudflare Turnstile widget settings.`);
  };

  function checkEnvironment() {
    if (window.location.protocol === 'file:') {
      showLoginError('⚠️ You opened admin.html directly from your file system (file://). Netlify serverless functions and Cloudflare CAPTCHA cannot run from file://. Please view through your deployed Netlify site or via local dev server.');
      return;
    }

    const widget = $('#turnstile-widget');
    const sitekey = widget ? widget.getAttribute('data-sitekey') : '';
    if (!sitekey) {
      showLoginError('⚠️ Cloudflare Turnstile site key is missing in admin.html.');
      return;
    }

    setTimeout(() => {
      if (!captchaToken && !window.turnstile) {
        showLoginError('⚠️ Cloudflare Turnstile script failed to load. Check your network or browser ad-blocker.');
      }
    }, 4000);
  }

  // Login form (Step 1)
  function initLoginForm() {
    const form = $('#login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#admin-email').value.trim();
      const password = $('#admin-password').value;

      if (!email || !password) {
        showLoginError('Please enter both your admin email and password');
        return;
      }

      if (!captchaToken) {
        showLoginError('Please complete the security check (CAPTCHA) above');
        const tc = $('.turnstile-container');
        if (tc) {
          tc.style.outline = '2px solid rgba(239, 68, 68, 0.6)';
          tc.style.borderRadius = '6px';
          setTimeout(() => { tc.style.outline = 'none'; }, 2500);
        }
        return;
      }

      setLoginLoading(true);
      hideLoginError();

      try {
        const data = await apiCall('auth-login', {
          method: 'POST',
          body: JSON.stringify({ email, password, captchaToken }),
        });

        challengeId = data.challengeId;
        showOTPStep();
      } catch (err) {
        showLoginError(err.message || 'Authentication failed');
        // Reset captcha
        if (window.turnstile) {
          try { window.turnstile.reset(); } catch (_) {}
          captchaToken = '';
        }
      } finally {
        setLoginLoading(false);
      }
    });
  }

  function showLoginError(msg) {
    const el = $('#login-error');
    el.textContent = msg;
    el.className = 'admin-message error';
  }

  function hideLoginError() {
    const el = $('#login-error');
    el.textContent = '';
    el.className = 'admin-message';
  }

  function setLoginLoading(loading) {
    $('#login-submit-btn').disabled = loading;
    $('#login-btn-text').style.display = loading ? 'none' : '';
    $('#login-spinner').style.display = loading ? 'block' : 'none';
  }

  // OTP Step (Step 2)
  function showOTPStep() {
    $('#login-step1').style.display = 'none';
    $('#login-step2').style.display = '';
    startOTPTimer();

    // Focus first OTP input
    const inputs = $$('#otp-inputs input');
    if (inputs[0]) inputs[0].focus();
  }

  function initOTPForm() {
    // Auto-advance OTP inputs
    const inputs = $$('#otp-inputs input');
    inputs.forEach((input, i) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val;
        if (val && i < inputs.length - 1) {
          inputs[i + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          inputs[i - 1].focus();
        }
      });
      // Allow paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        for (let j = 0; j < Math.min(paste.length, inputs.length); j++) {
          inputs[j].value = paste[j];
        }
        const lastFilled = Math.min(paste.length, inputs.length) - 1;
        if (lastFilled >= 0) inputs[lastFilled].focus();
      });
    });

    // OTP form submit
    const form = $('#otp-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = Array.from(inputs).map(i => i.value).join('');

      if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        showOTPError('Please enter a valid 6-digit code');
        return;
      }

      setOTPLoading(true);
      hideOTPError();

      try {
        const data = await apiCall('auth-verify', {
          method: 'POST',
          body: JSON.stringify({ challengeId, code }),
        });

        csrfToken = data.csrfToken;
        clearInterval(otpTimerInterval);
        showDashboard();
      } catch (err) {
        showOTPError(err.message || 'Verification failed');
        // Clear inputs
        inputs.forEach(i => { i.value = ''; });
        inputs[0].focus();
      } finally {
        setOTPLoading(false);
      }
    });
  }

  function showOTPError(msg) {
    const el = $('#otp-error');
    el.textContent = msg;
    el.className = 'admin-message error';
  }

  function hideOTPError() {
    const el = $('#otp-error');
    el.textContent = '';
    el.className = 'admin-message';
  }

  function setOTPLoading(loading) {
    $('#otp-submit-btn').disabled = loading;
    $('#otp-btn-text').style.display = loading ? 'none' : '';
    $('#otp-spinner').style.display = loading ? 'block' : 'none';
  }

  function startOTPTimer() {
    let seconds = 600; // 10 minutes
    const el = $('#otp-timer');

    otpTimerInterval = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(otpTimerInterval);
        el.textContent = 'Expired';
        showOTPError('Verification code has expired. Please start over.');
        return;
      }
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
  }

  // Logout
  function initLogout() {
    const btn = $('#logout-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await apiCall('auth-logout', { method: 'POST' });
      } catch (e) {
        // Ignore
      }
      csrfToken = '';
      location.reload();
    });
  }

  // =========================================================================
  // 2. NAVIGATION
  // =========================================================================
  function initNavigation() {
    $$('.admin-nav-item[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        switchSection(section);
      });
    });

    // Mobile sidebar toggle
    const toggle = $('#sidebar-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        $('#admin-sidebar').classList.toggle('open');
      });
    }
  }

  function switchSection(section) {
    currentSection = section;
    $$('.admin-nav-item[data-section]').forEach(b => b.classList.remove('active'));
    const active = $(`.admin-nav-item[data-section="${section}"]`);
    if (active) active.classList.add('active');

    // Close mobile sidebar
    $('#admin-sidebar').classList.remove('open');

    switch (section) {
      case 'dashboard': loadDashboard(); break;
      case 'events': loadEvents(); break;
      case 'create': loadCreateEvent(); break;
      case 'security': loadSecurity(); break;
      default: loadDashboard();
    }
  }

  // =========================================================================
  // 3. DASHBOARD
  // =========================================================================
  async function loadDashboard() {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Dashboard</h1>
          <p class="admin-main-subtitle">XR RESEARCH LAB // EVENT MANAGEMENT OVERVIEW</p>
        </div>
        <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('create')">
          + CREATE EVENT
        </button>
      </div>
      <div class="admin-stats-grid" id="dash-stats">
        <div class="admin-stat-card"><div class="admin-stat-label">LOADING</div><div class="admin-stat-value"><div class="admin-spinner"></div></div></div>
      </div>
      <div style="margin-top:32px">
        <h3 style="font-family:var(--font-display);font-size:16px;margin-bottom:16px;color:var(--cin-text)">Recent Events</h3>
        <div id="dash-recent"></div>
      </div>
    `;

    try {
      const data = await apiCall('admin-events');
      allEvents = data.events || [];
      renderDashStats();
      renderRecentEvents();
    } catch (err) {
      main.innerHTML += `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDashStats() {
    const stats = {
      total: allEvents.length,
      draft: allEvents.filter(e => e.status === 'draft').length,
      upcoming: allEvents.filter(e => e.status === 'upcoming').length,
      ongoing: allEvents.filter(e => e.status === 'ongoing').length,
      completed: allEvents.filter(e => e.status === 'completed').length,
      milestones: allEvents.filter(e => e.milestone_enabled).length,
    };

    const el = $('#dash-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="admin-stat-card"><div class="admin-stat-label">TOTAL EVENTS</div><div class="admin-stat-value accent">${stats.total}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">DRAFTS</div><div class="admin-stat-value">${stats.draft}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">UPCOMING</div><div class="admin-stat-value">${stats.upcoming}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">ONGOING</div><div class="admin-stat-value">${stats.ongoing}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">COMPLETED</div><div class="admin-stat-value">${stats.completed}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">MILESTONES</div><div class="admin-stat-value">${stats.milestones}</div></div>
    `;
  }

  function renderRecentEvents() {
    const el = $('#dash-recent');
    if (!el) return;
    const recent = allEvents.slice(0, 5);
    if (!recent.length) {
      el.innerHTML = `<div class="admin-empty-state"><h3>No events yet</h3><p>Create your first event to get started.</p></div>`;
      return;
    }
    el.innerHTML = recent.map(e => renderEventRow(e)).join('');
  }

  // =========================================================================
  // 4. EVENTS LIST
  // =========================================================================
  async function loadEvents(filterStatus) {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Events</h1>
          <p class="admin-main-subtitle">MANAGE ALL EVENTS</p>
        </div>
        <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('create')">
          + CREATE EVENT
        </button>
      </div>
      <div class="admin-tabs" id="event-tabs">
        <button class="admin-tab active" data-filter="">ALL</button>
        <button class="admin-tab" data-filter="draft">DRAFTS</button>
        <button class="admin-tab" data-filter="upcoming">UPCOMING</button>
        <button class="admin-tab" data-filter="ongoing">ONGOING</button>
        <button class="admin-tab" data-filter="completed">COMPLETED</button>
        <button class="admin-tab" data-filter="cancelled">CANCELLED</button>
        <button class="admin-tab" data-filter="archived">ARCHIVED</button>
      </div>
      <div class="admin-events-list" id="events-list">
        <div style="text-align:center;padding:40px"><div class="admin-spinner" style="margin:0 auto"></div></div>
      </div>
    `;

    // Tab clicks
    $$('#event-tabs .admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#event-tabs .admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderEventsList(tab.dataset.filter);
      });
    });

    try {
      const data = await apiCall('admin-events');
      allEvents = data.events || [];
      renderEventsList(filterStatus || '');
    } catch (err) {
      $('#events-list').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderEventsList(filter) {
    const el = $('#events-list');
    if (!el) return;
    let events = allEvents;
    if (filter) events = events.filter(e => e.status === filter);

    if (!events.length) {
      el.innerHTML = `<div class="admin-empty-state"><h3>No ${filter || ''} events</h3></div>`;
      return;
    }

    el.innerHTML = events.map(e => renderEventRow(e)).join('');
  }

  function renderEventRow(e) {
    return `
      <div class="admin-event-row">
        <div class="admin-event-info">
          <div class="admin-event-title">${escapeHtml(e.title)}</div>
          <div class="admin-event-meta">
            <span>${formatDate(e.start_datetime)}</span>
            <span>${escapeHtml(e.category || '—')}</span>
            <span>${escapeHtml(e.location || '—')}</span>
          </div>
        </div>
        <span class="admin-status-badge ${e.status}">${e.status}</span>
        <div class="admin-event-actions">
          <button class="admin-btn admin-btn-icon" onclick="window.adminApp.editEvent('${e.id}')" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="admin-btn admin-btn-icon" onclick="window.adminApp.previewEvent('${e.id}')" title="Preview">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          ${e.status === 'draft' ? `<button class="admin-btn admin-btn-icon" onclick="window.adminApp.publishEvent('${e.id}')" title="Publish"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>` : ''}
          ${['upcoming', 'ongoing'].includes(e.status) ? `<button class="admin-btn admin-btn-icon" onclick="window.adminApp.completeEvent('${e.id}')" title="Mark Completed"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></button>` : ''}
          <button class="admin-btn admin-btn-icon" onclick="window.adminApp.deleteEvent('${e.id}','${escapeHtml(e.title).replace(/'/g, "\\'")}')" title="Delete" style="color:#f87171">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 5. CREATE / EDIT EVENT FORM
  // =========================================================================
  function loadCreateEvent(event) {
    editingEventId = event ? event.id : null;
    const e = event || {};

    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">${editingEventId ? 'Edit Event' : 'Create Event'}</h1>
          <p class="admin-main-subtitle">${editingEventId ? 'UPDATE EVENT DETAILS' : 'ADD A NEW EVENT TO THE SYSTEM'}</p>
        </div>
      </div>

      <form id="event-form" autocomplete="off">
        <div id="event-form-error" class="admin-message"></div>
        <div id="event-form-success" class="admin-message"></div>

        <!-- Basic Info -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Basic Information</h3>
          <p class="admin-form-section-desc">REQUIRED FIELDS FOR EVENT CREATION</p>
          <div class="admin-form-grid">
            <div class="admin-field full-width">
              <label>Event Title *</label>
              <input type="text" id="evt-title" value="${escapeHtml(e.title || '')}" required maxlength="200" placeholder="e.g., XR Healthcare Workshop 2026">
            </div>
            <div class="admin-field full-width">
              <label>Short Description</label>
              <input type="text" id="evt-short-desc" value="${escapeHtml(e.short_description || '')}" maxlength="500" placeholder="Brief one-line description">
            </div>
            <div class="admin-field full-width">
              <label>Full Description</label>
              <textarea id="evt-description" maxlength="10000" placeholder="Detailed event description...">${escapeHtml(e.description || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Details -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Event Details</h3>
          <p class="admin-form-section-desc">SCHEDULE, LOCATION & CATEGORY</p>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label>Category</label>
              <select id="evt-category">
                <option value="">Select Category</option>
                <option value="Workshop" ${e.category === 'Workshop' ? 'selected' : ''}>Workshop</option>
                <option value="Seminar" ${e.category === 'Seminar' ? 'selected' : ''}>Seminar</option>
                <option value="Hackathon" ${e.category === 'Hackathon' ? 'selected' : ''}>Hackathon</option>
                <option value="Conference" ${e.category === 'Conference' ? 'selected' : ''}>Conference</option>
                <option value="Exhibition" ${e.category === 'Exhibition' ? 'selected' : ''}>Exhibition</option>
                <option value="Webinar" ${e.category === 'Webinar' ? 'selected' : ''}>Webinar</option>
                <option value="Demo Day" ${e.category === 'Demo Day' ? 'selected' : ''}>Demo Day</option>
                <option value="Research Presentation" ${e.category === 'Research Presentation' ? 'selected' : ''}>Research Presentation</option>
                <option value="Other" ${e.category === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
            <div class="admin-field">
              <label>Research Division</label>
              <select id="evt-division">
                <option value="">Select Division</option>
                <option value="Engineering" ${e.research_division === 'Engineering' ? 'selected' : ''}>Engineering</option>
                <option value="Healthcare" ${e.research_division === 'Healthcare' ? 'selected' : ''}>Healthcare</option>
                <option value="Tourism & Culture" ${e.research_division === 'Tourism & Culture' ? 'selected' : ''}>Tourism & Culture</option>
                <option value="Entertainment" ${e.research_division === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
                <option value="Building & Infrastructure" ${e.research_division === 'Building & Infrastructure' ? 'selected' : ''}>Building & Infrastructure</option>
                <option value="Placements" ${e.research_division === 'Placements' ? 'selected' : ''}>Placements</option>
                <option value="General" ${e.research_division === 'General' ? 'selected' : ''}>General</option>
              </select>
            </div>
            <div class="admin-field">
              <label>Start Date & Time</label>
              <input type="datetime-local" id="evt-start" value="${e.start_datetime ? new Date(e.start_datetime).toISOString().slice(0, 16) : ''}">
            </div>
            <div class="admin-field">
              <label>End Date & Time</label>
              <input type="datetime-local" id="evt-end" value="${e.end_datetime ? new Date(e.end_datetime).toISOString().slice(0, 16) : ''}">
            </div>
            <div class="admin-field">
              <label>Location</label>
              <input type="text" id="evt-location" value="${escapeHtml(e.location || '')}" maxlength="300" placeholder="e.g., GCET Campus">
            </div>
            <div class="admin-field">
              <label>Venue</label>
              <input type="text" id="evt-venue" value="${escapeHtml(e.venue || '')}" maxlength="300" placeholder="e.g., AR/VR Research Lab, Block C">
            </div>
            <div class="admin-field">
              <label>Organizer</label>
              <input type="text" id="evt-organizer" value="${escapeHtml(e.organizer || '')}" maxlength="200" placeholder="e.g., XR Research Lab">
            </div>
            <div class="admin-field">
              <label>Status</label>
              <select id="evt-status">
                <option value="draft" ${e.status === 'draft' || !e.status ? 'selected' : ''}>Draft</option>
                <option value="upcoming" ${e.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
                <option value="ongoing" ${e.status === 'ongoing' ? 'selected' : ''}>Ongoing</option>
                <option value="completed" ${e.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="cancelled" ${e.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                <option value="archived" ${e.status === 'archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Links -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Links & Media</h3>
          <p class="admin-form-section-desc">REGISTRATION, EXTERNAL LINKS & IMAGES</p>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label>Registration URL</label>
              <input type="url" id="evt-reg-url" value="${escapeHtml(e.registration_url || '')}" placeholder="https://...">
            </div>
            <div class="admin-field">
              <label>External Event URL</label>
              <input type="url" id="evt-ext-url" value="${escapeHtml(e.external_url || '')}" placeholder="https://...">
            </div>
            <div class="admin-field full-width">
              <label>Featured Image URL</label>
              <input type="url" id="evt-image" value="${escapeHtml(e.featured_image || '')}" placeholder="https://... (image URL)">
            </div>
          </div>
        </div>

        <!-- Speakers & Highlights -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Speakers & Highlights</h3>
          <p class="admin-form-section-desc">OPTIONAL — ADD SPEAKER INFO AND KEY HIGHLIGHTS</p>

          <div class="admin-field">
            <label>Highlights (one per line)</label>
            <textarea id="evt-highlights" placeholder="Immersive medical simulation\nVR training demonstration\nStudent research showcase">${(e.highlights || []).join('\n')}</textarea>
          </div>

          <div class="admin-field">
            <label>Tags (comma-separated)</label>
            <input type="text" id="evt-tags" value="${(e.tags || []).join(', ')}" placeholder="VR, Healthcare, Workshop">
          </div>
        </div>

        <!-- Milestone Settings -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Milestone Settings</h3>
          <p class="admin-form-section-desc">CONTROL WHETHER THIS EVENT APPEARS IN EXPLORE → MILESTONES</p>

          <label class="admin-toggle">
            <input type="checkbox" id="evt-milestone" ${e.milestone_enabled ? 'checked' : ''}>
            <span>Publish to Explore Milestones</span>
          </label>

          <div style="margin-top:16px" id="milestone-fields" ${e.milestone_enabled ? '' : 'style="display:none"'}>
            <div class="admin-field">
              <label>Milestone Title (optional override)</label>
              <input type="text" id="evt-milestone-title" value="${escapeHtml(e.milestone_title || '')}" placeholder="Leave blank to use event title">
            </div>
            <div class="admin-field">
              <label>Milestone Description</label>
              <textarea id="evt-milestone-desc" placeholder="Summary of achievements and outcomes...">${escapeHtml(e.milestone_description || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary" style="width:auto" id="event-submit-btn">
            ${editingEventId ? 'UPDATE EVENT' : 'CREATE EVENT'}
          </button>
          <button type="button" class="admin-btn admin-btn-secondary" onclick="window.adminApp.switchSection('events')">
            CANCEL
          </button>
        </div>
      </form>
    `;

    // Toggle milestone fields
    const milestoneCheck = $('#evt-milestone');
    if (milestoneCheck) {
      milestoneCheck.addEventListener('change', () => {
        const fields = $('#milestone-fields');
        if (fields) fields.style.display = milestoneCheck.checked ? '' : 'none';
      });
    }

    // Form submit
    $('#event-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await saveEvent();
    });
  }

  async function saveEvent() {
    const errorEl = $('#event-form-error');
    const successEl = $('#event-form-success');
    errorEl.className = 'admin-message';
    successEl.className = 'admin-message';

    const eventData = {
      title: $('#evt-title').value.trim(),
      short_description: $('#evt-short-desc').value.trim(),
      description: $('#evt-description').value.trim(),
      category: $('#evt-category').value,
      research_division: $('#evt-division').value,
      start_datetime: $('#evt-start').value ? new Date($('#evt-start').value).toISOString() : null,
      end_datetime: $('#evt-end').value ? new Date($('#evt-end').value).toISOString() : null,
      location: $('#evt-location').value.trim(),
      venue: $('#evt-venue').value.trim(),
      organizer: $('#evt-organizer').value.trim(),
      status: $('#evt-status').value,
      registration_url: $('#evt-reg-url').value.trim(),
      external_url: $('#evt-ext-url').value.trim(),
      featured_image: $('#evt-image').value.trim(),
      highlights: $('#evt-highlights').value.split('\n').map(h => h.trim()).filter(Boolean),
      tags: $('#evt-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      milestone_enabled: $('#evt-milestone').checked,
      milestone_title: $('#evt-milestone-title')?.value.trim() || '',
      milestone_description: $('#evt-milestone-desc')?.value.trim() || '',
    };

    if (!eventData.title) {
      errorEl.textContent = 'Event title is required';
      errorEl.className = 'admin-message error';
      return;
    }

    try {
      $('#event-submit-btn').disabled = true;

      if (editingEventId) {
        await apiCall(`admin-events?id=${editingEventId}`, {
          method: 'PUT',
          body: JSON.stringify(eventData),
        });
        successEl.textContent = 'Event updated successfully';
      } else {
        await apiCall('admin-events', {
          method: 'POST',
          body: JSON.stringify(eventData),
        });
        successEl.textContent = 'Event created successfully';
      }
      successEl.className = 'admin-message success';

      setTimeout(() => switchSection('events'), 1500);
    } catch (err) {
      errorEl.textContent = err.message || 'Unable to save event';
      errorEl.className = 'admin-message error';
    } finally {
      $('#event-submit-btn').disabled = false;
    }
  }

  // =========================================================================
  // 6. EVENT ACTIONS
  // =========================================================================
  window.adminApp = {
    switchSection,
    editEvent: async (id) => {
      try {
        const data = await apiCall(`admin-events?id=${id}`);
        loadCreateEvent(data.event);
      } catch (err) {
        alert('Unable to load event: ' + err.message);
      }
    },
    previewEvent: async (id) => {
      const event = allEvents.find(e => e.id === id);
      if (!event) return;

      const main = $('#admin-main');
      main.innerHTML = `
        <div class="admin-main-header">
          <div>
            <h1 class="admin-main-title">Preview Event</h1>
            <p class="admin-main-subtitle">HOW THIS EVENT WILL APPEAR PUBLICLY</p>
          </div>
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('events')">
            ← BACK TO EVENTS
          </button>
        </div>
        <div class="admin-preview-card">
          ${event.featured_image ? `<img src="${escapeHtml(event.featured_image)}" alt="" style="width:100%;max-height:300px;object-fit:cover;border-radius:12px;margin-bottom:24px">` : ''}
          <span class="admin-status-badge ${event.status}" style="margin-bottom:16px;display:inline-block">${event.status}</span>
          <h2>${escapeHtml(event.title)}</h2>
          <div class="admin-preview-meta">
            ${event.start_datetime ? `<span>📅 ${formatDateTime(event.start_datetime)}</span>` : ''}
            ${event.location ? `<span>📍 ${escapeHtml(event.location)}</span>` : ''}
            ${event.category ? `<span>🏷️ ${escapeHtml(event.category)}</span>` : ''}
            ${event.research_division ? `<span>🔬 ${escapeHtml(event.research_division)}</span>` : ''}
          </div>
          <div class="admin-preview-desc">${escapeHtml(event.description || event.short_description || 'No description provided.')}</div>
          ${event.highlights && event.highlights.length ? `
            <div style="margin-top:20px">
              <h3 style="font-size:14px;margin-bottom:10px;color:var(--cin-text)">Highlights</h3>
              <ul style="color:var(--cin-text-secondary);font-size:14px;padding-left:20px">
                ${event.highlights.map(h => `<li style="margin-bottom:4px">${escapeHtml(h)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          ${event.registration_url ? `
            <a href="${escapeHtml(event.registration_url)}" target="_blank" style="display:inline-block;margin-top:20px;padding:10px 24px;background:var(--cin-accent);color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Register Now</a>
          ` : ''}
        </div>
      `;
    },
    publishEvent: async (id) => {
      if (!confirm('Publish this event? It will become publicly visible.')) return;
      try {
        await apiCall('admin-events', {
          method: 'POST',
          body: JSON.stringify({ _action: 'update_status', id, status: 'upcoming' }),
        });
        loadEvents();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    },
    completeEvent: async (id) => {
      if (!confirm('Mark this event as completed?')) return;
      try {
        await apiCall('admin-events', {
          method: 'POST',
          body: JSON.stringify({ _action: 'update_status', id, status: 'completed' }),
        });
        loadEvents('completed');
      } catch (err) {
        alert('Error: ' + err.message);
      }
    },
    deleteEvent: async (id, title) => {
      if (!confirm(`Delete "${title}"? This action cannot be undone.`)) return;
      if (!confirm('Are you absolutely sure?')) return;
      try {
        await apiCall(`admin-events?id=${id}`, { method: 'DELETE' });
        loadEvents();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    },
  };

  // =========================================================================
  // 7. SECURITY DASHBOARD
  // =========================================================================
  async function loadSecurity() {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Security</h1>
          <p class="admin-main-subtitle">AUTHENTICATION & AUDIT LOG</p>
        </div>
      </div>
      <div class="admin-security-grid" id="security-content">
        <div class="admin-security-card"><h3>Loading...</h3><div class="admin-spinner"></div></div>
      </div>
    `;

    try {
      const data = await apiCall('admin-audit');
      renderSecurity(data);
    } catch (err) {
      $('#security-content').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderSecurity(data) {
    const el = $('#security-content');
    if (!el) return;

    el.innerHTML = `
      <div class="admin-security-card">
        <h3>🔐 Session Info</h3>
        <div style="font-size:13px;color:var(--cin-text-secondary);line-height:1.8">
          <div><strong>Last Login:</strong> ${data.lastLogin ? formatDateTime(data.lastLogin.created_at) : '—'}</div>
          <div><strong>Last Login IP:</strong> ${data.lastLogin ? escapeHtml(data.lastLogin.ip_address || '—') : '—'}</div>
          <div><strong>Current Session Expires:</strong> ${formatDateTime(data.currentSession.expiresAt)}</div>
          <div><strong>Last Activity:</strong> ${timeAgo(data.currentSession.lastActivity)}</div>
          <div><strong>Active Sessions:</strong> ${data.activeSessions}</div>
        </div>
      </div>

      <div class="admin-security-card">
        <h3>🔑 Recent Login Attempts</h3>
        <div class="admin-log-list">
          ${(data.loginAttempts || []).map(l => `
            <div class="admin-log-item">
              <span class="log-status ${l.success ? 'success' : 'failure'}"></span>
              <span class="log-action">${escapeHtml(l.action)}</span>
              <span style="font-size:11px;color:var(--cin-text-dim)">${escapeHtml(l.ip_address || '')}</span>
              <span class="log-time">${timeAgo(l.created_at)}</span>
            </div>
          `).join('') || '<p style="color:var(--cin-text-dim);font-size:13px">No recent login attempts</p>'}
        </div>
      </div>

      <div class="admin-security-card" style="grid-column: 1 / -1">
        <h3>📋 Recent Admin Actions</h3>
        <div class="admin-log-list">
          ${(data.adminActions || []).map(a => `
            <div class="admin-log-item">
              <span class="log-status ${a.success ? 'success' : 'failure'}"></span>
              <span class="log-action">${escapeHtml(a.action)}</span>
              <span style="font-size:11px;color:var(--cin-text-dim)">${a.details ? escapeHtml(JSON.stringify(a.details).slice(0, 60)) : ''}</span>
              <span class="log-time">${timeAgo(a.created_at)}</span>
            </div>
          `).join('') || '<p style="color:var(--cin-text-dim);font-size:13px">No recent actions</p>'}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 8. INITIALIZATION
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    checkEnvironment();
    initLoginForm();
    initOTPForm();
    initLogout();
    initNavigation();
    checkSession();
  });

})();
