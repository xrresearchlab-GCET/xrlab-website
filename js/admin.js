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
  let allProjects = [];
  let editingProjectId = null;

  const API = '/api';

  // =========================================================================
  // HELPERS
  // =========================================================================
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  async function apiCall(path, options = {}, maybeBody = null) {
    if (window.location.protocol === 'file:') {
      throw new Error('Running on file:// protocol. Netlify backend functions require a live web server or Netlify deployment.');
    }
    if (typeof options === 'string') {
      options = {
        method: options,
        body: maybeBody ? JSON.stringify(maybeBody) : undefined,
      };
    } else if (options && options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
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
      case 'projects': loadProjects(); break;
      case 'create-project': loadCreateProject(); break;
      case 'events': loadEvents(); break;
      case 'create': loadCreateEvent(); break;
      case 'security': loadSecurity(); break;
      case 'news': loadNews(); break;
      case 'settings': loadSettings(); break;
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
          <p class="admin-main-subtitle">XR RESEARCH LAB // SYSTEM & CONTENT OVERVIEW</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('create-project')">
            + ADD PROJECT
          </button>
          <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.switchSection('create')">
            + CREATE EVENT
          </button>
        </div>
      </div>
      <div class="admin-stats-grid" id="dash-stats">
        <div class="admin-stat-card"><div class="admin-stat-label">LOADING</div><div class="admin-stat-value"><div class="admin-spinner"></div></div></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:24px;margin-top:32px">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-family:var(--font-display);font-size:15px;color:var(--cin-text)">Recently Added Projects</h3>
            <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.switchSection('projects')">View All</button>
          </div>
          <div id="dash-recent-projects"></div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-family:var(--font-display);font-size:15px;color:var(--cin-text)">Recently Added Events</h3>
            <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.switchSection('events')">View All</button>
          </div>
          <div id="dash-recent-events"></div>
        </div>
      </div>

      <div style="margin-top:32px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="font-family:var(--font-display);font-size:15px;color:var(--cin-text)">Recently Published Milestones</h3>
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.switchSection('events')">View Milestones</button>
        </div>
        <div id="dash-recent-milestones"></div>
      </div>
    `;

    try {
      const [evtData, projData] = await Promise.allSettled([
        apiCall('admin-events'),
        apiCall('admin-projects'),
      ]);
      allEvents = evtData.status === 'fulfilled' ? (evtData.value.events || []) : [];
      allProjects = projData.status === 'fulfilled' ? (projData.value.projects || []) : [];
      renderDashStats();
      renderDashboardPanels();
    } catch (err) {
      main.innerHTML += `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDashStats() {
    const totalProjects = allProjects.length;
    const ongoingProjects = allProjects.filter(p => p.status === 'ongoing').length;
    const completedProjects = allProjects.filter(p => p.status === 'completed').length;
    const upcomingEvents = allEvents.filter(e => e.status === 'upcoming').length;
    const completedEvents = allEvents.filter(e => e.status === 'completed').length;
    const milestones = allEvents.filter(e => e.milestone_enabled).length;
    const draftItems = allEvents.filter(e => e.status === 'draft').length + allProjects.filter(p => !p.published).length;

    const el = $('#dash-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="admin-stat-card"><div class="admin-stat-label">TOTAL PROJECTS</div><div class="admin-stat-value accent">${totalProjects}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(52,211,153,0.25)"><div class="admin-stat-label">ONGOING PROJECTS</div><div class="admin-stat-value" style="color:#34D399">${ongoingProjects}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(167,139,250,0.25)"><div class="admin-stat-label">COMPLETED PROJECTS</div><div class="admin-stat-value" style="color:#A78BFA">${completedProjects}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">UPCOMING EVENTS</div><div class="admin-stat-value accent">${upcomingEvents}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">COMPLETED EVENTS</div><div class="admin-stat-value">${completedEvents}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(252,211,77,0.25)"><div class="admin-stat-label">MILESTONES</div><div class="admin-stat-value" style="color:#FCD34D">${milestones}</div></div>
      <div class="admin-stat-card"><div class="admin-stat-label">DRAFT ITEMS</div><div class="admin-stat-value" style="color:var(--cin-text-dim)">${draftItems}</div></div>
    `;
  }

  function renderDashboardPanels() {
    // 1. Recent Projects
    const projEl = $('#dash-recent-projects');
    if (projEl) {
      const recentProjects = allProjects.slice(0, 5);
      if (!recentProjects.length) {
        projEl.innerHTML = `<div class="admin-empty-state"><h3>No projects yet</h3><p>Create your first project.</p></div>`;
      } else {
        projEl.innerHTML = recentProjects.map(p => renderProjectRow(p)).join('');
      }
    }

    // 2. Recent Events
    const evtEl = $('#dash-recent-events');
    if (evtEl) {
      const recentEvents = allEvents.slice(0, 5);
      if (!recentEvents.length) {
        evtEl.innerHTML = `<div class="admin-empty-state"><h3>No events yet</h3><p>Create your first event.</p></div>`;
      } else {
        evtEl.innerHTML = recentEvents.map(e => renderEventRow(e)).join('');
      }
    }

    // 3. Recent Milestones
    const mileEl = $('#dash-recent-milestones');
    if (mileEl) {
      const recentMilestones = allEvents.filter(e => e.milestone_enabled).slice(0, 5);
      if (!recentMilestones.length) {
        mileEl.innerHTML = `<div class="admin-empty-state"><h3>No published milestones</h3><p>When events complete, choose "Publish as Milestone" to showcase them here.</p></div>`;
      } else {
        mileEl.innerHTML = recentMilestones.map(e => renderEventRow(e)).join('');
      }
    }
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
        <button class="admin-tab" data-filter="milestone">★ MILESTONES</button>
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
    if (filter === 'milestone') {
      events = events.filter(e => e.milestone_enabled);
    } else if (filter) {
      events = events.filter(e => e.status === filter);
    }

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
          <div class="admin-event-title">
            ${escapeHtml(e.title)}
            ${e.milestone_enabled ? '<span style="font-size:10px;color:#FCD34D;background:rgba(252,211,77,0.12);padding:2px 6px;border-radius:3px;margin-left:8px;font-family:var(--font-mono)">★ MILESTONE</span>' : ''}
          </div>
          <div class="admin-event-meta">
            <span>${formatDate(e.start_datetime)}</span>
            <span>${escapeHtml(e.category || '—')}</span>
            <span>${escapeHtml(e.location || '—')}</span>
            ${e.event_report_url ? '<span style="color:var(--cin-accent-bright)">📄 Report Linked</span>' : ''}
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
          ${e.status === 'completed' && !e.milestone_enabled ? `<button class="admin-btn admin-btn-icon" onclick="window.adminApp.publishAsMilestone('${e.id}')" title="Publish as Milestone" style="color:#FCD34D"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>` : ''}
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
          <h3 class="admin-form-section-title">Milestone & Impact Settings</h3>
          <p class="admin-form-section-desc">CONTROL WHETHER THIS EVENT APPEARS IN EXPLORE → MILESTONES WITH ACADEMIC OUTCOMES</p>

          <label class="admin-toggle">
            <input type="checkbox" id="evt-milestone" ${e.milestone_enabled ? 'checked' : ''}>
            <span>Publish to Explore Milestones</span>
          </label>

          <div style="margin-top:20px" id="milestone-fields" ${e.milestone_enabled ? '' : 'style="display:none"'}>
            <div class="admin-form-grid">
              <div class="admin-field full-width">
                <label>Milestone Title (optional override)</label>
                <input type="text" id="evt-milestone-title" value="${escapeHtml(e.milestone_title || '')}" placeholder="Leave blank to use event title">
              </div>
              <div class="admin-field full-width">
                <label>Milestone Description / Summary</label>
                <textarea id="evt-milestone-desc" placeholder="Summary of achievements and outcomes...">${escapeHtml(e.milestone_description || '')}</textarea>
              </div>
              <div class="admin-field">
                <label>Event Report URL (Google Drive / PDF)</label>
                <input type="url" id="evt-report-url" value="${escapeHtml(e.event_report_url || '')}" placeholder="https://drive.google.com/file/d/.../view">
              </div>
              <div class="admin-field">
                <label>Participant Count</label>
                <input type="number" id="evt-participants" min="0" value="${e.participant_count || ''}" placeholder="e.g., 150">
              </div>
              <div class="admin-field">
                <label>Video Recording URL (YouTube/Vimeo)</label>
                <input type="url" id="evt-video-url" value="${escapeHtml(e.video_url || '')}" placeholder="https://youtube.com/watch?v=...">
              </div>
              <div class="admin-field">
                <label>Slide Deck URL (Google Slides/PDF)</label>
                <input type="url" id="evt-pres-url" value="${escapeHtml(e.presentation_url || '')}" placeholder="https://docs.google.com/presentation/...">
              </div>
              <div class="admin-field full-width">
                <label>External Article / Press Coverage URL</label>
                <input type="url" id="evt-article-url" value="${escapeHtml(e.external_article_url || '')}" placeholder="https://...">
              </div>
              <div class="admin-field">
                <label>Key Achievement</label>
                <input type="text" id="evt-achievement" value="${escapeHtml(e.achievement || '')}" placeholder="e.g., 1st Prize, National Hackathon">
              </div>
              <div class="admin-field">
                <label>Outcome</label>
                <input type="text" id="evt-outcome" value="${escapeHtml(e.outcome || '')}" placeholder="e.g., 4 Research Prototypes Deployed">
              </div>
              <div class="admin-field full-width">
                <label>Impact Statement</label>
                <input type="text" id="evt-impact" value="${escapeHtml(e.impact || '')}" placeholder="e.g., Trained 120+ undergraduates in Spatial Computing">
              </div>
              <div class="admin-field full-width">
                <label>Key Takeaways (one per line)</label>
                <textarea id="evt-key-takeaways" placeholder="Spatial audio integration enhances VR immersion&#10;Unity WebGL export allows zero-install browser deployment">${(e.key_takeaways || []).join('\n')}</textarea>
              </div>
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
      event_report_url: $('#evt-report-url')?.value.trim() || '',
      video_url: $('#evt-video-url')?.value.trim() || '',
      presentation_url: $('#evt-pres-url')?.value.trim() || '',
      external_article_url: $('#evt-article-url')?.value.trim() || '',
      achievement: $('#evt-achievement')?.value.trim() || '',
      outcome: $('#evt-outcome')?.value.trim() || '',
      impact: $('#evt-impact')?.value.trim() || '',
      participant_count: $('#evt-participants')?.value ? parseInt($('#evt-participants').value, 10) : null,
      key_takeaways: $('#evt-key-takeaways')?.value.split('\n').map(t => t.trim()).filter(Boolean) || [],
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
    publishAsMilestone: async (id) => {
      const evt = allEvents.find(e => e.id === id);
      if (!evt) return;
      const reportUrl = prompt('Publish this completed event as an Explore Milestone?\n\nEnter Event Report URL (Google Drive or external HTTPS link) or leave as is:', evt.event_report_url || '');
      if (reportUrl === null) return; // User cancelled
      try {
        await apiCall(`admin-events?id=${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...evt,
            milestone_enabled: true,
            event_report_url: reportUrl.trim() || evt.event_report_url || '',
            milestone_title: evt.milestone_title || evt.title,
            milestone_description: evt.milestone_description || evt.short_description || evt.description,
          }),
        });
        alert('Published as Milestone successfully!');
        loadEvents('milestone');
      } catch (err) {
        alert('Error publishing milestone: ' + err.message);
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
  // 8. PROJECTS LIST
  // =========================================================================
  async function loadProjects(filterType) {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Projects</h1>
          <p class="admin-main-subtitle">MANAGE ALL PROJECTS</p>
        </div>
        <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('create-project')">
          + ADD PROJECT
        </button>
      </div>
      <div class="admin-tabs" id="project-tabs">
        <button class="admin-tab active" data-filter="">ALL</button>
        <button class="admin-tab" data-filter="experiential">EXPERIENTIAL</button>
        <button class="admin-tab" data-filter="individual">INDIVIDUAL</button>
        <button class="admin-tab" data-filter="outsourcing">OUTSOURCING</button>
        <button class="admin-tab" data-filter="group">GROUP</button>
        <button class="admin-tab" data-filter="status:ongoing">ONGOING</button>
        <button class="admin-tab" data-filter="status:completed">COMPLETED</button>
        <button class="admin-tab" data-filter="status:prototype">PROTOTYPE</button>
        <button class="admin-tab" data-filter="status:draft">UNPUBLISHED</button>
      </div>
      <div class="admin-events-list" id="projects-list">
        <div style="text-align:center;padding:40px"><div class="admin-spinner" style="margin:0 auto"></div></div>
      </div>
    `;

    $$('#project-tabs .admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#project-tabs .admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderProjectsList(tab.dataset.filter);
      });
    });

    try {
      const data = await apiCall('admin-projects');
      allProjects = data.projects || [];
      renderProjectsList(filterType || '');
    } catch (err) {
      $('#projects-list').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderProjectsList(filter) {
    const list = $('#projects-list');
    if (!list) return;
    let filtered = allProjects;
    if (filter) {
      if (filter.startsWith('status:')) {
        const s = filter.replace('status:', '');
        if (s === 'draft') {
          filtered = allProjects.filter(p => !p.published);
        } else {
          filtered = allProjects.filter(p => p.status === s);
        }
      } else {
        filtered = allProjects.filter(p => p.project_type === filter);
      }
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="admin-empty-state"><h3>No projects found</h3><p>Create your first project to get started.</p></div>`;
      return;
    }
    list.innerHTML = filtered.map(p => renderProjectRow(p)).join('');
  }

  function renderProjectRow(p) {
    const statusColors = { concept: '#FCD34D', ongoing: '#34D399', prototype: '#60A5FA', completed: '#A78BFA', archived: '#6B7280' };
    const typeLabels = { experiential: 'EXP', individual: 'IND', outsourcing: 'OUT', group: 'GRP' };
    const color = statusColors[p.status] || '#6B7280';

    return `
      <div class="admin-event-row" data-id="${p.id}">
        <div class="admin-event-status" style="background:${color}1A;border-color:${color}4D">
          <span style="color:${color};font-size:10px;letter-spacing:0.1em">${(p.status || '').toUpperCase()}</span>
        </div>
        <div class="admin-event-info">
          <h3 class="admin-event-name">${escapeHtml(p.title)}</h3>
          <p class="admin-event-meta">
            <span style="background:rgba(59,130,246,0.1);color:var(--cin-accent-bright);padding:1px 6px;border-radius:3px;font-size:9px;letter-spacing:0.08em">${typeLabels[p.project_type] || p.project_type}</span>
            ${p.research_division ? `<span style="background:rgba(139,92,246,0.1);color:#A78BFA;padding:1px 6px;border-radius:3px;font-size:9px">${escapeHtml(p.research_division)}</span>` : ''}
            ${p.published ? '<span style="color:#34D399">● Published</span>' : '<span style="color:var(--cin-text-dim)">○ Unpublished</span>'}
            ${p.year ? `<span>${p.year}</span>` : ''}
          </p>
        </div>
        <div class="admin-event-actions">
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.editProject('${p.id}')">Edit</button>
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" style="color:${p.published ? '#F87171' : '#34D399'}" onclick="window.adminApp.toggleProjectPublish('${p.id}', ${!p.published})">${p.published ? 'Unpublish' : 'Publish'}</button>
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" style="color:#F87171" onclick="window.adminApp.deleteProject('${p.id}', '${escapeHtml(p.title)}')">Delete</button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 9. CREATE / EDIT PROJECT FORM
  // =========================================================================
  function loadCreateProject(prefillData) {
    editingProjectId = prefillData ? prefillData.id : null;
    const p = prefillData || {};
    const isEdit = !!editingProjectId;

    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">${isEdit ? 'Edit Project' : 'Add New Project'}</h1>
          <p class="admin-main-subtitle">${isEdit ? 'UPDATE PROJECT DETAILS' : 'CREATE A NEW PROJECT ENTRY'}</p>
        </div>
        <button class="admin-btn admin-btn-ghost admin-btn-small" onclick="window.adminApp.switchSection('projects')">← Back to Projects</button>
      </div>
      <form id="project-form" class="admin-form">
        <div class="admin-message" id="project-form-msg" style="display:none"></div>

        <div class="admin-form-section">
          <h3 class="admin-form-heading">Basic Information</h3>
          <div class="admin-form-grid">
            <div class="admin-field full">
              <label class="admin-label">Project Title *</label>
              <input type="text" class="admin-input" name="title" required maxlength="200" value="${escapeHtml(p.title || '')}" placeholder="e.g., VR Campus Navigation System">
            </div>
            <div class="admin-field">
              <label class="admin-label">Project Type *</label>
              <select class="admin-input" name="project_type" required id="proj-type-select">
                <option value="experiential" ${p.project_type === 'experiential' ? 'selected' : ''}>Experiential / Simulation Based</option>
                <option value="individual" ${p.project_type === 'individual' ? 'selected' : ''}>Individual</option>
                <option value="outsourcing" ${p.project_type === 'outsourcing' ? 'selected' : ''}>Outsourcing</option>
                <option value="group" ${p.project_type === 'group' ? 'selected' : ''}>Group</option>
              </select>
            </div>
            <div class="admin-field" id="proj-division-field" style="display:${(!p.project_type || p.project_type === 'experiential') ? 'block' : 'none'}">
              <label class="admin-label">Research Division</label>
              <select class="admin-input" name="research_division">
                <option value="">— Select Division —</option>
                <option value="Engineering" ${p.research_division === 'Engineering' ? 'selected' : ''}>Engineering</option>
                <option value="Placements" ${p.research_division === 'Placements' ? 'selected' : ''}>Placements</option>
                <option value="Healthcare" ${p.research_division === 'Healthcare' ? 'selected' : ''}>Healthcare</option>
                <option value="Tourism & Culture" ${p.research_division === 'Tourism & Culture' ? 'selected' : ''}>Tourism & Culture</option>
                <option value="Entertainment" ${p.research_division === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
                <option value="Building & Infrastructure" ${p.research_division === 'Building & Infrastructure' ? 'selected' : ''}>Building & Infrastructure</option>
              </select>
            </div>
            <div class="admin-field">
              <label class="admin-label">Status</label>
              <select class="admin-input" name="status">
                <option value="concept" ${p.status === 'concept' ? 'selected' : ''}>Concept</option>
                <option value="ongoing" ${(p.status === 'ongoing' || !p.status) ? 'selected' : ''}>Ongoing</option>
                <option value="prototype" ${p.status === 'prototype' ? 'selected' : ''}>Prototype</option>
                <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="archived" ${p.status === 'archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>
            <div class="admin-field">
              <label class="admin-label">Year</label>
              <input type="number" class="admin-input" name="year" min="2020" max="2100" value="${p.year || new Date().getFullYear()}" placeholder="2026">
            </div>
          </div>
        </div>

        <div class="admin-form-section">
          <h3 class="admin-form-heading">Descriptions</h3>
          <div class="admin-form-grid">
            <div class="admin-field full">
              <label class="admin-label">Short Description</label>
              <input type="text" class="admin-input" name="short_description" maxlength="500" value="${escapeHtml(p.short_description || '')}" placeholder="Brief summary (shown in cards)">
            </div>
            <div class="admin-field full">
              <label class="admin-label">Full Description</label>
              <textarea class="admin-input admin-textarea" name="description" maxlength="20000" placeholder="Detailed project description...">${escapeHtml(p.description || '')}</textarea>
            </div>
            <div class="admin-field full">
              <label class="admin-label">Objectives</label>
              <textarea class="admin-input admin-textarea" name="objectives" maxlength="5000" placeholder="Project objectives...">${escapeHtml(p.objectives || '')}</textarea>
            </div>
            <div class="admin-field full">
              <label class="admin-label">Expected Outcome</label>
              <textarea class="admin-input admin-textarea" name="expected_outcome" maxlength="5000" placeholder="Expected results...">${escapeHtml(p.expected_outcome || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="admin-form-section">
          <h3 class="admin-form-heading">Team & Attribution</h3>
          <div class="admin-form-grid">
            <div class="admin-field full">
              <label class="admin-label">Team Members (comma-separated)</label>
              <input type="text" class="admin-input" name="team_members" value="${escapeHtml((p.team_members || []).join(', '))}" placeholder="Member 1, Member 2, Member 3">
            </div>
            <div class="admin-field">
              <label class="admin-label">Mentor / Faculty</label>
              <input type="text" class="admin-input" name="mentor" maxlength="200" value="${escapeHtml(p.mentor || '')}" placeholder="Faculty name">
            </div>
            <div class="admin-field" id="proj-student-field" style="display:${p.project_type === 'individual' ? 'block' : 'none'}">
              <label class="admin-label">Student Name</label>
              <input type="text" class="admin-input" name="student_name" maxlength="200" value="${escapeHtml(p.student_name || '')}" placeholder="Student researcher name">
            </div>
          </div>
        </div>

        <div class="admin-form-section" id="proj-outsourcing-section" style="display:${p.project_type === 'outsourcing' ? 'block' : 'none'}">
          <h3 class="admin-form-heading">Outsourcing Details</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label class="admin-label">Client / Organization Name</label>
              <input type="text" class="admin-input" name="client_name" maxlength="200" value="${escapeHtml(p.client_name || '')}" placeholder="Client organization">
            </div>
            <div class="admin-field">
              <label class="admin-label">Show Client Publicly?</label>
              <select class="admin-input" name="show_client_publicly">
                <option value="false" ${!p.show_client_publicly ? 'selected' : ''}>No — Keep Private</option>
                <option value="true" ${p.show_client_publicly ? 'selected' : ''}>Yes — Display on Site</option>
              </select>
            </div>
            <div class="admin-field full">
              <label class="admin-label">Scope</label>
              <textarea class="admin-input admin-textarea" name="scope" maxlength="5000" placeholder="Project scope...">${escapeHtml(p.scope || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="admin-form-section">
          <h3 class="admin-form-heading">Technologies & Tags</h3>
          <div class="admin-form-grid">
            <div class="admin-field full">
              <label class="admin-label">Technologies (comma-separated)</label>
              <input type="text" class="admin-input" name="technologies" value="${escapeHtml((p.technologies || []).join(', '))}" placeholder="Unity, C#, WebGL, Three.js">
            </div>
            <div class="admin-field full">
              <label class="admin-label">Tags (comma-separated)</label>
              <input type="text" class="admin-input" name="tags" value="${escapeHtml((p.tags || []).join(', '))}" placeholder="VR, Medical, Simulation">
            </div>
          </div>
        </div>

        <div class="admin-form-section">
          <h3 class="admin-form-heading">Resource URLs</h3>
          <p style="font-size:12px;color:var(--cin-text-dim);margin-bottom:16px">External links only. Supabase stores URLs — not the files themselves.</p>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label class="admin-label">Concept / Cover Image URL</label>
              <input type="url" class="admin-input" name="concept_image_url" value="${escapeHtml(p.concept_image_url || '')}" placeholder="https://...">
            </div>
            <div class="admin-field">
              <label class="admin-label">WebGL Build URL</label>
              <input type="url" class="admin-input" name="webgl_url" value="${escapeHtml(p.webgl_url || '')}" placeholder="https://... or relative path">
            </div>
            <div class="admin-field">
              <label class="admin-label">Demo Video URL</label>
              <input type="url" class="admin-input" name="demo_video_url" value="${escapeHtml(p.demo_video_url || '')}" placeholder="https://youtube.com/...">
            </div>
            <div class="admin-field">
              <label class="admin-label">GitHub URL</label>
              <input type="url" class="admin-input" name="github_url" value="${escapeHtml(p.github_url || '')}" placeholder="https://github.com/...">
            </div>
            <div class="admin-field">
              <label class="admin-label">Documentation URL</label>
              <input type="url" class="admin-input" name="documentation_url" value="${escapeHtml(p.documentation_url || '')}" placeholder="https://...">
            </div>
            <div class="admin-field">
              <label class="admin-label">Report URL</label>
              <input type="url" class="admin-input" name="report_url" value="${escapeHtml(p.report_url || '')}" placeholder="https://drive.google.com/...">
            </div>
            <div class="admin-field">
              <label class="admin-label">Additional Resource URL</label>
              <input type="url" class="admin-input" name="additional_resource_url" value="${escapeHtml(p.additional_resource_url || '')}" placeholder="https://...">
            </div>
          </div>
        </div>

        <div class="admin-form-section">
          <h3 class="admin-form-heading">Publishing</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label class="admin-label">Publish to Project Space?</label>
              <select class="admin-input" name="published">
                <option value="false" ${!p.published ? 'selected' : ''}>No — Save as Draft</option>
                <option value="true" ${p.published ? 'selected' : ''}>Yes — Publish Now</option>
              </select>
            </div>
            <div class="admin-field">
              <label class="admin-label">Featured Project?</label>
              <select class="admin-input" name="featured">
                <option value="false" ${!p.featured ? 'selected' : ''}>No</option>
                <option value="true" ${p.featured ? 'selected' : ''}>Yes — Show First</option>
              </select>
            </div>
          </div>
        </div>

        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary">${isEdit ? 'UPDATE PROJECT' : 'CREATE PROJECT'}</button>
          <button type="button" class="admin-btn admin-btn-ghost" onclick="window.adminApp.switchSection('projects')">CANCEL</button>
        </div>
      </form>
    `;

    // Toggle conditional fields based on project type
    const typeSelect = document.getElementById('proj-type-select');
    typeSelect.addEventListener('change', () => {
      const t = typeSelect.value;
      document.getElementById('proj-division-field').style.display = t === 'experiential' ? 'block' : 'none';
      document.getElementById('proj-student-field').style.display = t === 'individual' ? 'block' : 'none';
      document.getElementById('proj-outsourcing-section').style.display = t === 'outsourcing' ? 'block' : 'none';
    });

    // Form submit
    document.getElementById('project-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('project-form-msg');

      const formData = new FormData(e.target);
      const body = {};
      for (const [key, val] of formData.entries()) {
        body[key] = val;
      }

      // Parse arrays
      body.technologies = body.technologies ? body.technologies.split(',').map(s => s.trim()).filter(Boolean) : [];
      body.tags = body.tags ? body.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      body.team_members = body.team_members ? body.team_members.split(',').map(s => s.trim()).filter(Boolean) : [];

      // Parse booleans
      body.published = body.published === 'true';
      body.featured = body.featured === 'true';
      body.show_client_publicly = body.show_client_publicly === 'true';

      // Parse year
      body.year = body.year ? parseInt(body.year) : null;

      try {
        msg.style.display = 'none';
        const submitBtn = e.target.querySelector('[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = isEdit ? 'UPDATING...' : 'CREATING...';

        let result;
        if (isEdit) {
          result = await apiCall('admin-projects?id=' + editingProjectId, 'PUT', body);
        } else {
          result = await apiCall('admin-projects', 'POST', body);
        }

        msg.className = 'admin-message success';
        msg.textContent = isEdit ? 'Project updated successfully!' : 'Project created successfully!';
        msg.style.display = '';

        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'UPDATE PROJECT' : 'CREATE PROJECT';

        setTimeout(() => loadProjects(), 1500);
      } catch (err) {
        msg.className = 'admin-message error';
        msg.textContent = err.message || 'An error occurred';
        msg.style.display = '';
        const submitBtn = e.target.querySelector('[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'UPDATE PROJECT' : 'CREATE PROJECT';
      }
    });
  }

  // Edit project
  window.adminApp = window.adminApp || {};
  window.adminApp.editProject = async function(id) {
    try {
      const data = await apiCall('admin-projects?id=' + id);
      loadCreateProject(data.project);
    } catch (err) {
      alert('Error loading project: ' + err.message);
    }
  };

  // Toggle publish
  window.adminApp.toggleProjectPublish = async function(id, publish) {
    try {
      await apiCall('admin-projects', 'POST', { _action: 'update_status', id, status: allProjects.find(p => p.id === id)?.status || 'ongoing', published: publish });
      loadProjects();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Delete project
  window.adminApp.deleteProject = async function(id, title) {
    if (!confirm(`Delete project "${title}"? This action cannot be undone.`)) return;
    try {
      await apiCall('admin-projects?id=' + id, 'DELETE');
      loadProjects();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // =========================================================================
  // 10. NEWS & SETTINGS
  // =========================================================================
  function loadNews() {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Lab News & Announcements</h1>
          <p class="admin-main-subtitle">RESEARCH BROADCASTS & MEDIA HIGHLIGHTS</p>
        </div>
      </div>
      <div class="admin-security-grid">
        <div class="admin-security-card" style="grid-column: 1 / -1">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0">Active News Integration</h3>
            <span class="admin-status-badge upcoming">Connected</span>
          </div>
          <p style="color:var(--cin-text-secondary);font-size:13px;line-height:1.6;margin-bottom:20px">
            Lab news and media announcements are synchronized directly with events and academic milestones. When an event is marked with category "Seminar", "Conference", "Research Presentation", or published to Milestones, it is automatically featured across public feeds.
          </p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px">
            <div style="background:rgba(255,255,255,0.02);border:1px solid var(--cin-border);border-radius:8px;padding:16px">
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--cin-accent-bright);margin-bottom:6px">PUBLISH ANNOUNCEMENT</div>
              <p style="font-size:12px;color:var(--cin-text-secondary);margin-bottom:12px">Post an event or research milestone with category "Research Presentation" or "Webinar".</p>
              <button class="admin-btn admin-btn-secondary admin-btn-tiny" onclick="window.adminApp.switchSection('create')">+ Post Announcement</button>
            </div>
            <div style="background:rgba(255,255,255,0.02);border:1px solid var(--cin-border);border-radius:8px;padding:16px">
              <div style="font-family:var(--font-mono);font-size:11px;color:#34D399;margin-bottom:6px">PRESS & ARTICLES</div>
              <p style="font-size:12px;color:var(--cin-text-secondary);margin-bottom:12px">Attach external news/press URLs to project detail pages and milestone records.</p>
              <button class="admin-btn admin-btn-secondary admin-btn-tiny" onclick="window.adminApp.switchSection('projects')">Manage Projects</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function loadSettings() {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Lab Settings</h1>
          <p class="admin-main-subtitle">SYSTEM STATUS, ARCHITECTURE & CONFIGURATION</p>
        </div>
      </div>
      <div class="admin-security-grid">
        <div class="admin-security-card">
          <h3>Architecture & Hosting</h3>
          <div style="font-size:13px;color:var(--cin-text-secondary);line-height:1.8">
            <div><strong>Hosting:</strong> Netlify CDN + Edge Network</div>
            <div><strong>Serverless Functions:</strong> Netlify Functions (Node.js 18+)</div>
            <div><strong>Database:</strong> Supabase PostgreSQL (Text & URLs only)</div>
            <div><strong>Asset Storage:</strong> Google Drive / GitHub / YouTube</div>
            <div><strong>Bot Mitigation:</strong> Cloudflare Turnstile</div>
            <div><strong>Email Dispatch:</strong> Resend API</div>
          </div>
        </div>

        <div class="admin-security-card">
          <h3>Database & Storage Policy</h3>
          <div style="font-size:13px;color:var(--cin-text-secondary);line-height:1.8">
            <div><strong>Supabase Quota Protection:</strong> Strict zero-binary storage policy.</div>
            <div><strong>Build Deliverables:</strong> WebGL builds served from external HTTPS or GitHub Pages.</div>
            <div><strong>Event Reports:</strong> Linked via Google Drive or academic archives.</div>
            <div><strong>Videos:</strong> Embedded via YouTube / Vimeo.</div>
          </div>
        </div>

        <div class="admin-security-card" style="grid-column: 1 / -1">
          <h3>Required Environment Variables (Netlify)</h3>
          <div style="font-family:var(--font-mono);font-size:12px;background:rgba(0,0,0,0.4);border:1px solid var(--cin-border);border-radius:8px;padding:16px;color:var(--cin-text-secondary);line-height:1.8">
            <div><span style="color:var(--cin-accent-bright)">ADMIN_EMAIL</span> — Administrator email for OTP delivery</div>
            <div><span style="color:var(--cin-accent-bright)">ADMIN_PASSWORD_HASH</span> — Bcrypt hash of admin master password</div>
            <div><span style="color:var(--cin-accent-bright)">SUPABASE_URL</span> — Supabase project API endpoint</div>
            <div><span style="color:var(--cin-accent-bright)">SUPABASE_SERVICE_ROLE_KEY</span> — Supabase Service Role secret key</div>
            <div><span style="color:var(--cin-accent-bright)">JWT_SECRET</span> — High-entropy secret for admin session tokens</div>
            <div><span style="color:var(--cin-accent-bright)">TURNSTILE_SECRET_KEY</span> — Cloudflare Turnstile verification secret</div>
            <div><span style="color:var(--cin-accent-bright)">RESEND_API_KEY</span> — Resend transactional email API token</div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 11. INITIALIZATION
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
