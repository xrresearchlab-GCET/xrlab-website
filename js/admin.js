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
  let allMilestones = [];
  let editingMilestoneId = null;
  let allMembers = [];
  let editingMember = null;
  let membersTab = 'PRESENT';
  let allCourses = [];
  let editingCourse = null;
  let managingCourse = null;
  let allResearch = [];
  let editingResearch = null;

  const API = '/api';

  // =========================================================================
  // HELPERS
  // =========================================================================
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function getCSRFToken() {
    if (csrfToken) return csrfToken;
    const match = document.cookie.match(/(?:^|;\s*)xr_csrf=([^;]+)/);
    if (match && match[1]) {
      csrfToken = decodeURIComponent(match[1]);
      return csrfToken;
    }
    return '';
  }

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
    if (options.method && options.method !== 'GET') {
      let token = getCSRFToken();
      if (!token) {
        // Attempt quick sync recovery of csrfToken from session before proceeding
        try {
          const sRes = await fetch(`${API}/auth-session`, { credentials: 'include' });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData && sData.csrfToken) {
              csrfToken = sData.csrfToken;
              token = csrfToken;
            }
          }
        } catch (_) {}
      }
      if (token) {
        headers['X-CSRF-Token'] = token;
      }
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
        if (data.csrfToken) {
          csrfToken = data.csrfToken;
        } else {
          getCSRFToken();
        }
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
    const btn = $('#login-submit-btn');
    if (btn) btn.disabled = false;
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
      case 'milestones': loadMilestones(); break;
      case 'create-milestone': loadCreateMilestone(); break;
      case 'members': loadMembers(); break;
      case 'learn': loadCourses(); break;
      case 'create-course': loadCourseForm(); break;
      case 'research': loadResearch(); break;
      case 'create-research': loadResearchForm(); break;
      case 'security': loadSecurity(); break;
      case 'settings': loadSettings(); break;
      default: loadDashboard();
    }
  }

  window.adminApp = window.adminApp || {};
  window.adminApp.switchSection = switchSection;

  // =========================================================================
  // 3. DASHBOARD
  // =========================================================================
  async function loadDashboard() {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Dashboard</h1>
          <p class="admin-main-subtitle">XR RESEARCH LAB // SYSTEM &amp; CONTENT OVERVIEW</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('create-project')">
            + PROJECT
          </button>
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('create')">
            + EVENT
          </button>
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('create-milestone')">
            + MILESTONE
          </button>
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.loadMemberForm()">
            + MEMBER
          </button>
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.loadCourseForm()">
            + COURSE
          </button>
          <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.loadResearchForm()">
            + RESEARCH
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

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:24px;margin-top:32px">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-family:var(--font-display);font-size:15px;color:var(--cin-text)">Team Members</h3>
            <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.switchSection('members')">Manage Members</button>
          </div>
          <div id="dash-recent-members"></div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-family:var(--font-display);font-size:15px;color:var(--cin-text)">Learn &amp; Courses</h3>
            <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.switchSection('learn')">Manage Courses</button>
          </div>
          <div id="dash-recent-courses"></div>
        </div>
      </div>

      <div style="margin-top:32px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="font-family:var(--font-display);font-size:15px;color:var(--cin-text)">Research Publications &amp; Projects</h3>
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.switchSection('research')">View All Research</button>
        </div>
        <div id="dash-recent-research"></div>
      </div>
    `;

    try {
      const [evtData, projData, mileData, memData, courseData, resData] = await Promise.allSettled([
        apiCall('admin-events'),
        apiCall('admin-projects'),
        apiCall('admin-milestones'),
        apiCall('admin-members'),
        apiCall('admin-courses'),
        apiCall('admin-research'),
      ]);
      allEvents = evtData.status === 'fulfilled' ? (evtData.value.events || []) : [];
      allProjects = projData.status === 'fulfilled' ? (projData.value.projects || []) : [];
      allMilestones = mileData.status === 'fulfilled' ? (mileData.value.milestones || []) : [];
      allMembers = memData.status === 'fulfilled' ? (memData.value.members || []) : [];
      allCourses = courseData.status === 'fulfilled' ? (courseData.value.courses || []) : [];
      allResearch = resData.status === 'fulfilled' ? (resData.value.research || []) : [];

      renderDashStats();
      renderDashboardPanels();
    } catch (err) {
      main.innerHTML += `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDashStats() {
    const totalProjects = allProjects.length;
    const upcomingEvents = allEvents.filter(e => e.status === 'upcoming').length;
    const totalMilestones = allMilestones.length;
    const presentMembers = allMembers.filter(m => m.status === 'PRESENT').length;
    const publishedCourses = allCourses.filter(c => c.status === 'published').length;
    const publishedResearch = allResearch.filter(r => r.publication_status === 'published').length;

    const el = $('#dash-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="admin-stat-card"><div class="admin-stat-label">TOTAL PROJECTS</div><div class="admin-stat-value accent">${totalProjects}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(52,211,153,0.25)"><div class="admin-stat-label">UPCOMING EVENTS</div><div class="admin-stat-value" style="color:#34D399">${upcomingEvents}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(252,211,77,0.25)"><div class="admin-stat-label">MILESTONES</div><div class="admin-stat-value" style="color:#FCD34D">${totalMilestones}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(56,189,248,0.25)"><div class="admin-stat-label">ACTIVE MEMBERS</div><div class="admin-stat-value" style="color:#38BDF8">${presentMembers}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(167,139,250,0.25)"><div class="admin-stat-label">PUBLISHED COURSES</div><div class="admin-stat-value" style="color:#A78BFA">${publishedCourses}</div></div>
      <div class="admin-stat-card" style="border-color:rgba(244,114,182,0.25)"><div class="admin-stat-label">RESEARCH ITEMS</div><div class="admin-stat-value" style="color:#F472B6">${publishedResearch}</div></div>
    `;
  }

  function renderDashboardPanels() {
    // 1. Recent Projects
    const projEl = $('#dash-recent-projects');
    if (projEl) {
      const recentProjects = allProjects.slice(0, 4);
      if (!recentProjects.length) {
        projEl.innerHTML = `<div class="admin-empty-state"><h3>No projects yet</h3><p>Create your first project.</p></div>`;
      } else {
        projEl.innerHTML = recentProjects.map(p => renderProjectRow(p)).join('');
      }
    }

    // 2. Recent Events
    const evtEl = $('#dash-recent-events');
    if (evtEl) {
      const recentEvents = allEvents.slice(0, 4);
      if (!recentEvents.length) {
        evtEl.innerHTML = `<div class="admin-empty-state"><h3>No events yet</h3><p>Create your first event.</p></div>`;
      } else {
        evtEl.innerHTML = recentEvents.map(e => renderEventRow(e)).join('');
      }
    }

    // 3. Members Preview
    const memEl = $('#dash-recent-members');
    if (memEl) {
      const recentMems = allMembers.slice(0, 4);
      if (!recentMems.length) {
        memEl.innerHTML = `<div class="admin-empty-state"><h3>No members yet</h3><p>Add team members with 3D avatars.</p></div>`;
      } else {
        memEl.innerHTML = recentMems.map(m => `
          <div class="admin-event-row" style="padding:10px 14px;border:1px solid var(--cin-border);border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.015);display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong style="color:var(--cin-text);font-size:13px">${escapeHtml(m.full_name)}</strong>
              <div style="font-size:11px;color:var(--cin-text-dim)">${escapeHtml(m.role || 'Member')} · ${m.status === 'PRESENT' ? '<span style="color:#34D399">Active</span>' : '<span style="color:#94A3B8">Alumni</span>'}</div>
            </div>
            <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.editMember('${m.id}')">Edit</button>
          </div>
        `).join('');
      }
    }

    // 4. Courses Preview
    const courseEl = $('#dash-recent-courses');
    if (courseEl) {
      const recentCourses = allCourses.slice(0, 4);
      if (!recentCourses.length) {
        courseEl.innerHTML = `<div class="admin-empty-state"><h3>No courses yet</h3><p>Add curricula and lessons.</p></div>`;
      } else {
        courseEl.innerHTML = recentCourses.map(c => `
          <div class="admin-event-row" style="padding:10px 14px;border:1px solid var(--cin-border);border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.015);display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong style="color:var(--cin-text);font-size:13px">${escapeHtml(c.title)}</strong>
              <div style="font-size:11px;color:var(--cin-text-dim)">${escapeHtml(c.category || 'General')} · ${c.status === 'published' ? '<span style="color:#34D399">Published</span>' : '<span style="color:#FCD34D">Draft</span>'}</div>
            </div>
            <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.editCourse('${c.id}')">Edit</button>
          </div>
        `).join('');
      }
    }

    // 5. Research Preview
    const resEl = $('#dash-recent-research');
    if (resEl) {
      const recentResearch = allResearch.slice(0, 4);
      if (!recentResearch.length) {
        resEl.innerHTML = `<div class="admin-empty-state"><h3>No research papers yet</h3><p>Add research items and technical reports.</p></div>`;
      } else {
        resEl.innerHTML = recentResearch.map(r => `
          <div class="admin-event-row" style="padding:10px 14px;border:1px solid var(--cin-border);border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.015);display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong style="color:var(--cin-text);font-size:13px">${escapeHtml(r.title)}</strong>
              <div style="font-size:11px;color:var(--cin-text-dim)">Stage: <span style="color:var(--cin-accent-bright)">${escapeHtml(r.research_stage)}</span> · Division: ${escapeHtml(r.research_division || 'HCI')}</div>
            </div>
            <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.editResearch('${r.id}')">Edit</button>
          </div>
        `).join('');
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
    if (filter) {
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
          </div>
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
          ${e.status === 'completed' ? `<button class="admin-btn admin-btn-icon" onclick="window.adminApp.createMilestoneFromEvent('${e.id}')" title="Add Completed Event to Milestones" style="color:#FCD34D"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>` : ''}
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
    createMilestoneFromEvent: (id) => {
      const evt = allEvents.find(e => e.id === id);
      if (!evt) return;
      switchSection('create-milestone');
      loadCreateMilestone({
        title: evt.title,
        milestone_type: 'completed_event',
        category: evt.category || 'Completed Event',
        research_division: evt.research_division || '',
        completed_date: evt.end_datetime ? evt.end_datetime.slice(0, 10) : (evt.start_datetime ? evt.start_datetime.slice(0, 10) : new Date().toISOString().slice(0, 10)),
        location: evt.location || '',
        venue: evt.venue || '',
        organizer: evt.organizer || '',
        short_description: evt.short_description || '',
        description: evt.description || '',
        tags: evt.tags || [],
      });
    },
    editMilestone: async (id) => {
      try {
        const data = await apiCall(`admin-milestones?id=${id}`);
        switchSection('create-milestone');
        loadCreateMilestone(data.milestone);
      } catch (err) {
        alert('Unable to load milestone: ' + err.message);
      }
    },
    previewMilestone: async (id) => {
      const m = allMilestones.find(item => item.id === id);
      if (!m) return;
      const main = $('#admin-main');
      main.innerHTML = `
        <div class="admin-main-header">
          <div>
            <h1 class="admin-main-title">Milestone Preview</h1>
            <p class="admin-main-subtitle">HOW THIS COMPLETED EVENT APPEARS ON EXPLORE &gt; MILESTONES</p>
          </div>
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('milestones')">
            ← BACK TO MILESTONES
          </button>
        </div>
        <div class="admin-preview-card" style="background:var(--cin-card-bg);border:1px solid var(--cin-border);border-radius:12px;padding:32px;max-width:800px">
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--cin-accent-bright);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">
            ★ ${escapeHtml(m.category || m.milestone_type || 'COMPLETED EVENT')}
          </div>
          <h2 style="font-family:var(--font-display);font-size:24px;margin-bottom:12px;color:var(--cin-text)">${escapeHtml(m.title)}</h2>
          <div class="admin-preview-meta" style="display:flex;gap:16px;color:var(--cin-text-dim);font-size:12px;margin-bottom:20px;flex-wrap:wrap">
            <span>📅 ${formatDate(m.completed_date)}</span>
            ${m.location ? `<span>📍 ${escapeHtml(m.location)}</span>` : ''}
            ${m.participant_count ? `<span>👥 ${m.participant_count} Attendees</span>` : ''}
          </div>
          <p style="color:var(--cin-text-secondary);line-height:1.7;margin-bottom:20px">${escapeHtml(m.short_description || m.description || '')}</p>
          ${m.achievement ? `<div style="background:rgba(252,211,77,0.08);border:1px solid rgba(252,211,77,0.25);border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:13px"><strong style="color:#FCD34D">Key Achievement:</strong> ${escapeHtml(m.achievement)}</div>` : ''}
          ${m.outcome ? `<div style="margin-bottom:12px;font-size:13px;color:var(--cin-text-secondary)"><strong style="color:var(--cin-text)">Tangible Outcome:</strong> ${escapeHtml(m.outcome)}</div>` : ''}
          ${m.impact ? `<div style="margin-bottom:16px;font-size:13px;color:var(--cin-text-secondary)"><strong style="color:var(--cin-text)">Institutional Impact:</strong> ${escapeHtml(m.impact)}</div>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:24px;padding-top:16px;border-top:1px solid var(--cin-border)">
            ${m.event_report_url ? `<a href="${escapeHtml(m.event_report_url)}" target="_blank" class="admin-btn admin-btn-primary admin-btn-small">📄 Open Event Report</a>` : ''}
            ${m.video_url ? `<a href="${escapeHtml(m.video_url)}" target="_blank" class="admin-btn admin-btn-secondary admin-btn-small">🎬 Watch Video</a>` : ''}
            ${m.presentation_url ? `<a href="${escapeHtml(m.presentation_url)}" target="_blank" class="admin-btn admin-btn-secondary admin-btn-small">📊 View Deck</a>` : ''}
            ${m.external_article_url ? `<a href="${escapeHtml(m.external_article_url)}" target="_blank" class="admin-btn admin-btn-secondary admin-btn-small">🔗 Read Article</a>` : ''}
          </div>
        </div>
      `;
    },
    toggleMilestonePublish: async (id, publish) => {
      try {
        await apiCall('admin-milestones', 'POST', { _action: 'toggle_publish', id, published: publish });
        loadMilestones();
      } catch (err) {
        alert('Error updating milestone: ' + err.message);
      }
    },
    deleteMilestone: async (id, title) => {
      if (!confirm(`Delete milestone "${title}"? This action cannot be undone.`)) return;
      if (!confirm('Are you absolutely sure you want to delete this completed event record?')) return;
      try {
        await apiCall(`admin-milestones?id=${id}`, { method: 'DELETE' });
        loadMilestones();
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
  // 6B. MILESTONES & COMPLETED EVENTS (DEDICATED SECTION)
  // =========================================================================
  async function loadMilestones(filter) {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Milestones &amp; Completed Events</h1>
          <p class="admin-main-subtitle">OFFICIAL LAB RECORD OF COMPLETED EVENTS, ACADEMIC IMPACT &amp; AWARDS</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('events')">
            Browse Events
          </button>
          <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.switchSection('create-milestone')">
            + ADD COMPLETED EVENT / MILESTONE
          </button>
        </div>
      </div>
      <div class="admin-tabs" id="milestone-tabs">
        <button class="admin-tab active" data-filter="">ALL MILESTONES</button>
        <button class="admin-tab" data-filter="completed_event">COMPLETED EVENTS</button>
        <button class="admin-tab" data-filter="award">AWARDS &amp; HACKATHONS</button>
        <button class="admin-tab" data-filter="publication">SYMPOSIA &amp; PAPERS</button>
        <button class="admin-tab" data-filter="lab_milestone">LAB MILESTONES</button>
        <button class="admin-tab" data-filter="draft">DRAFTS</button>
      </div>
      <div class="admin-events-list" id="milestones-list">
        <div style="text-align:center;padding:40px"><div class="admin-spinner" style="margin:0 auto"></div></div>
      </div>
    `;

    // Tab clicks
    $$('#milestone-tabs .admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#milestone-tabs .admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderMilestonesList(tab.dataset.filter);
      });
    });

    try {
      const data = await apiCall('admin-milestones');
      allMilestones = data.milestones || [];
      renderMilestonesList(filter || '');
    } catch (err) {
      $('#milestones-list').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderMilestonesList(filter) {
    const el = $('#milestones-list');
    if (!el) return;
    let list = allMilestones;
    if (filter === 'draft') {
      list = list.filter(m => !m.published);
    } else if (filter) {
      list = list.filter(m => m.milestone_type === filter);
    }

    if (!list.length) {
      el.innerHTML = `
        <div class="admin-empty-state">
          <h3>No milestones found</h3>
          <p>Record a completed event, student hackathon victory, or academic symposium to highlight lab achievements.</p>
          <button class="admin-btn admin-btn-primary admin-btn-small" style="margin-top:14px" onclick="window.adminApp.switchSection('create-milestone')">
            + Add Completed Event Details
          </button>
        </div>`;
      return;
    }

    el.innerHTML = list.map(m => renderMilestoneRow(m)).join('');
  }

  function renderMilestoneRow(m) {
    const typeBadges = {
      completed_event: { label: 'COMPLETED EVENT', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
      award: { label: '★ AWARD / HACKATHON', color: '#FCD34D', bg: 'rgba(252,211,77,0.12)' },
      publication: { label: 'SYMPOSIUM / PAPER', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
      project_milestone: { label: 'PROJECT MILESTONE', color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
      lab_milestone: { label: 'LAB MILESTONE', color: '#EC4899', bg: 'rgba(236,72,153,0.12)' },
    };
    const badge = typeBadges[m.milestone_type] || { label: m.milestone_type || 'MILESTONE', color: 'var(--cin-accent-bright)', bg: 'rgba(59,130,246,0.12)' };

    return `
      <div class="admin-event-row" data-id="${m.id}">
        <div class="admin-event-info">
          <div class="admin-event-title" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
            <span style="font-weight:600;font-size:15px">${escapeHtml(m.title)}</span>
            <span style="font-size:10px;font-family:var(--font-mono);font-weight:600;color:${badge.color};background:${badge.bg};border:1px solid ${badge.color}40;padding:2px 7px;border-radius:4px;letter-spacing:0.06em">
              ${badge.label}
            </span>
            ${m.research_division ? `<span style="font-size:10px;color:#9CA3AF;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:3px">${escapeHtml(m.research_division)}</span>` : ''}
          </div>
          <div class="admin-event-meta" style="margin-top:6px;gap:12px">
            <span>📅 ${formatDate(m.completed_date)}</span>
            ${m.location ? `<span>📍 ${escapeHtml(m.location)}</span>` : ''}
            ${m.participant_count ? `<span style="color:#60A5FA">👥 ${m.participant_count} Attendees</span>` : ''}
            ${m.event_report_url ? `<span style="color:var(--cin-accent-bright)">📄 Report Linked</span>` : ''}
            ${m.video_url ? `<span style="color:#F87171">🎬 Video</span>` : ''}
            ${m.presentation_url ? `<span style="color:#A78BFA">📊 Slides</span>` : ''}
          </div>
          ${m.achievement ? `<div style="font-size:12px;color:var(--cin-text-secondary);margin-top:4px"><strong style="color:var(--cin-text)">Achievement:</strong> ${escapeHtml(m.achievement)}</div>` : ''}
        </div>
        <span class="admin-status-badge ${m.published ? 'upcoming' : 'draft'}">
          ${m.published ? 'Published' : 'Draft'}
        </span>
        <div class="admin-event-actions">
          <button class="admin-btn admin-btn-icon" onclick="window.adminApp.editMilestone('${m.id}')" title="Edit Milestone">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="admin-btn admin-btn-icon" onclick="window.adminApp.previewMilestone('${m.id}')" title="Preview Public Card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="admin-btn admin-btn-icon" onclick="window.adminApp.toggleMilestonePublish('${m.id}', ${!m.published})" title="${m.published ? 'Unpublish' : 'Publish'}" style="color:${m.published ? '#F87171' : '#34D399'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
          </button>
          <button class="admin-btn admin-btn-icon" onclick="window.adminApp.deleteMilestone('${m.id}', '${escapeHtml(m.title).replace(/'/g, "\\'")}')" title="Delete" style="color:#f87171">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 6C. CREATE / EDIT MILESTONE (ADD COMPLETED EVENT FORM)
  // =========================================================================
  function loadCreateMilestone(prefillData) {
    editingMilestoneId = prefillData && prefillData.id ? prefillData.id : null;
    const m = prefillData || {};
    const isEdit = !!editingMilestoneId;
    const defaultDate = m.completed_date 
      ? (typeof m.completed_date === 'string' ? m.completed_date.slice(0, 10) : new Date(m.completed_date).toISOString().slice(0, 10))
      : new Date().toISOString().slice(0, 10);

    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">${isEdit ? 'Edit Completed Event / Milestone' : 'Add Completed Event Details &amp; Milestone'}</h1>
          <p class="admin-main-subtitle">RECORD VERIFIED COMPLETION OUTCOMES, ACADEMIC REPORTS, AND LAB ACHIEVEMENTS</p>
        </div>
        <button class="admin-btn admin-btn-ghost admin-btn-small" onclick="window.adminApp.switchSection('milestones')">
          ← Back to Milestones
        </button>
      </div>

      <form id="milestone-form" autocomplete="off" class="admin-form">
        <div id="milestone-form-error" class="admin-message" style="display:none"></div>
        <div id="milestone-form-success" class="admin-message" style="display:none"></div>

        <!-- Section 1: Basic Information -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Milestone &amp; Event Identification</h3>
          <p class="admin-form-section-desc">ESSENTIAL CLASSIFICATION &amp; COMPLETION TIMELINE</p>
          <div class="admin-form-grid">
            <div class="admin-field full-width">
              <label>Milestone / Completed Event Title *</label>
              <input type="text" id="ms-title" value="${escapeHtml(m.title || '')}" required maxlength="200" placeholder="e.g., National Spatial Computing Hackathon — Gold Victory">
            </div>

            <div class="admin-field">
              <label>Milestone Type *</label>
              <select id="ms-type" required>
                <option value="completed_event" ${(m.milestone_type === 'completed_event' || !m.milestone_type) ? 'selected' : ''}>Completed Event</option>
                <option value="award" ${m.milestone_type === 'award' ? 'selected' : ''}>Award / Hackathon Victory</option>
                <option value="publication" ${m.milestone_type === 'publication' ? 'selected' : ''}>Research Symposium / Paper</option>
                <option value="project_milestone" ${m.milestone_type === 'project_milestone' ? 'selected' : ''}>Project Milestone / Release</option>
                <option value="lab_milestone" ${m.milestone_type === 'lab_milestone' ? 'selected' : ''}>Lab Milestone / Facility Growth</option>
              </select>
            </div>

            <div class="admin-field">
              <label>Research Division</label>
              <select id="ms-division">
                <option value="">— Select Research Division —</option>
                <option value="Engineering" ${m.research_division === 'Engineering' ? 'selected' : ''}>Engineering Simulations</option>
                <option value="Healthcare" ${m.research_division === 'Healthcare' ? 'selected' : ''}>Healthcare &amp; Surgical VR</option>
                <option value="Tourism & Culture" ${m.research_division === 'Tourism & Culture' ? 'selected' : ''}>Tourism &amp; Cultural Heritage</option>
                <option value="Entertainment" ${m.research_division === 'Entertainment' ? 'selected' : ''}>Interactive Entertainment</option>
                <option value="Building & Infrastructure" ${m.research_division === 'Building & Infrastructure' ? 'selected' : ''}>Building &amp; Smart Infrastructure</option>
                <option value="Placements" ${m.research_division === 'Placements' ? 'selected' : ''}>Spatial Careers &amp; Placements</option>
                <option value="General" ${m.research_division === 'General' ? 'selected' : ''}>General Lab Milestone</option>
              </select>
            </div>

            <div class="admin-field">
              <label>Category Tag</label>
              <input type="text" id="ms-category" value="${escapeHtml(m.category || 'Completed Event')}" maxlength="100" placeholder="Completed Event, Hackathon, Symposium, Workshop">
            </div>

            <div class="admin-field">
              <label>Completion Date *</label>
              <input type="date" id="ms-date" value="${defaultDate}" required>
            </div>

            <div class="admin-field">
              <label>Location (City / State / Campus)</label>
              <input type="text" id="ms-location" value="${escapeHtml(m.location || '')}" maxlength="300" placeholder="e.g., Bengaluru, India or GCET Campus">
            </div>

            <div class="admin-field">
              <label>Venue (Hall / Building / Auditorium)</label>
              <input type="text" id="ms-venue" value="${escapeHtml(m.venue || '')}" maxlength="300" placeholder="e.g., Main Auditorium Hall A">
            </div>

            <div class="admin-field full-width">
              <label>Organizer / Host Entity</label>
              <input type="text" id="ms-organizer" value="${escapeHtml(m.organizer || '')}" maxlength="200" placeholder="e.g., GCET AR/VR Research Lab &amp; IEEE Student Chapter">
            </div>
          </div>
        </div>

        <!-- Section 2: Narrative & Description -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Descriptions &amp; Executive Summary</h3>
          <p class="admin-form-section-desc">CONCISE CARD SUMMARY AND COMPREHENSIVE NARRATIVE</p>
          <div class="admin-form-grid">
            <div class="admin-field full-width">
              <label>Short Summary (displayed on public timeline cards)</label>
              <input type="text" id="ms-short-desc" value="${escapeHtml(m.short_description || '')}" maxlength="500" placeholder="Brief 1-2 sentence overview of the completed event and its primary breakthrough">
            </div>

            <div class="admin-field full-width">
              <label>Detailed Description &amp; Outcome Narrative</label>
              <textarea id="ms-desc" maxlength="20000" style="min-height:140px" placeholder="Comprehensive post-event report, methodology, and session breakdown...">${escapeHtml(m.description || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Section 3: Verification & External Artifacts -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Academic Reports &amp; Verification Links</h3>
          <p class="admin-form-section-desc">EXTERNAL HTTPS URLS ONLY (GOOGLE DRIVE / YOUTUBE / GITHUB / INSTITUTIONAL PDFS)</p>
          <div class="admin-form-grid">
            <div class="admin-field full-width">
              <label>Official Event Report URL (Google Drive / PDF / Academic Repo) 📄</label>
              <input type="url" id="ms-report-url" value="${escapeHtml(m.event_report_url || '')}" placeholder="https://drive.google.com/file/d/.../view">
            </div>

            <div class="admin-field">
              <label>Video Recording / Showcase URL (YouTube / Vimeo) 🎬</label>
              <input type="url" id="ms-video-url" value="${escapeHtml(m.video_url || '')}" placeholder="https://www.youtube.com/watch?v=...">
            </div>

            <div class="admin-field">
              <label>Presentation Deck URL (Google Slides / PDF) 📊</label>
              <input type="url" id="ms-presentation-url" value="${escapeHtml(m.presentation_url || '')}" placeholder="https://docs.google.com/presentation/d/...">
            </div>

            <div class="admin-field">
              <label>External Press / News Article URL 🔗</label>
              <input type="url" id="ms-article-url" value="${escapeHtml(m.external_article_url || '')}" placeholder="https://newspaper.com/article/...">
            </div>

            <div class="admin-field">
              <label>Cover / Featured Photo URL (External HTTPS)</label>
              <input type="url" id="ms-image-url" value="${escapeHtml(m.featured_image || '')}" placeholder="https://images.unsplash.com/... or Google Drive direct image">
            </div>
          </div>
        </div>

        <!-- Section 4: Quantitative & Qualitative Impact -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Quantitative &amp; Qualitative Impact</h3>
          <p class="admin-form-section-desc">RECORD MEASURABLE SUCCESS METRICS AND SCHOLARLY FINDINGS</p>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label>Total Attendees / Participants 👥</label>
              <input type="number" id="ms-participants" min="0" value="${m.participant_count || ''}" placeholder="e.g., 140">
            </div>

            <div class="admin-field">
              <label>Key Achievement / Award Won 🏆</label>
              <input type="text" id="ms-achievement" value="${escapeHtml(m.achievement || '')}" placeholder="e.g., 1st Prize Gold Trophy &amp; Best Technical Architecture">
            </div>

            <div class="admin-field full-width">
              <label>Tangible Outcome</label>
              <input type="text" id="ms-outcome" value="${escapeHtml(m.outcome || '')}" placeholder="e.g., 4 prototypes deployed to Meta Quest 3, adopted by regional hospital">
            </div>

            <div class="admin-field full-width">
              <label>Broader Institutional Impact Statement</label>
              <input type="text" id="ms-impact" value="${escapeHtml(m.impact || '')}" placeholder="e.g., Validated collegiate research capabilities and trained 45 undergraduate engineers in WebRTC">
            </div>

            <div class="admin-field full-width">
              <label>Key Takeaways &amp; Research Findings (one per line)</label>
              <textarea id="ms-takeaways" style="min-height:90px" placeholder="Sub-millimeter haptic feedback is essential for tissue incision&#10;Binaural audio reduced vocal collisions in collaborative VR&#10;Niagara particle budget maintained 72 FPS on mobile chipsets">${(m.key_takeaways || []).join('\n')}</textarea>
            </div>

            <div class="admin-field full-width">
              <label>Tags (comma-separated)</label>
              <input type="text" id="ms-tags" value="${(m.tags || []).join(', ')}" placeholder="Hackathon, Victory, Healthcare, Medical XR, Unreal Engine 5">
            </div>
          </div>
        </div>

        <!-- Section 5: Publishing & Visibility -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Publishing &amp; Site Visibility</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label>Publish Status</label>
              <select id="ms-published">
                <option value="true" ${m.published !== false ? 'selected' : ''}>Published — Visible on Explore Milestones</option>
                <option value="false" ${m.published === false ? 'selected' : ''}>Draft — Hidden from Public</option>
              </select>
            </div>

            <div class="admin-field">
              <label>Featured Milestone</label>
              <select id="ms-featured">
                <option value="false" ${!m.featured ? 'selected' : ''}>Standard Milestone</option>
                <option value="true" ${m.featured ? 'selected' : ''}>Featured — Pin at Top</option>
              </select>
            </div>
          </div>
        </div>

        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary" id="milestone-submit-btn">
            ${isEdit ? 'UPDATE MILESTONE' : 'SAVE COMPLETED EVENT MILESTONE'}
          </button>
          <button type="button" class="admin-btn admin-btn-secondary" onclick="window.adminApp.switchSection('milestones')">
            CANCEL
          </button>
        </div>
      </form>
    `;

    $('#milestone-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await saveMilestone();
    });
  }

  async function saveMilestone() {
    const errorEl = $('#milestone-form-error');
    const successEl = $('#milestone-form-success');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    const title = $('#ms-title').value.trim();
    if (!title) {
      errorEl.textContent = 'Milestone title is required';
      errorEl.style.display = 'block';
      return;
    }

    const payload = {
      title,
      milestone_type: $('#ms-type').value,
      research_division: $('#ms-division').value,
      category: $('#ms-category').value.trim() || 'Completed Event',
      completed_date: $('#ms-date').value || new Date().toISOString().slice(0, 10),
      location: $('#ms-location').value.trim(),
      venue: $('#ms-venue').value.trim(),
      organizer: $('#ms-organizer').value.trim(),
      short_description: $('#ms-short-desc').value.trim(),
      description: $('#ms-desc').value.trim(),
      event_report_url: $('#ms-report-url').value.trim(),
      video_url: $('#ms-video-url').value.trim(),
      presentation_url: $('#ms-presentation-url').value.trim(),
      external_article_url: $('#ms-article-url').value.trim(),
      featured_image: $('#ms-image-url').value.trim(),
      participant_count: $('#ms-participants').value ? parseInt($('#ms-participants').value, 10) : null,
      achievement: $('#ms-achievement').value.trim(),
      outcome: $('#ms-outcome').value.trim(),
      impact: $('#ms-impact').value.trim(),
      key_takeaways: $('#ms-takeaways').value.split('\n').map(t => t.trim()).filter(Boolean),
      tags: $('#ms-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      published: $('#ms-published').value === 'true',
      featured: $('#ms-featured').value === 'true',
    };

    try {
      $('#milestone-submit-btn').disabled = true;
      $('#milestone-submit-btn').textContent = 'SAVING...';

      if (editingMilestoneId) {
        await apiCall(`admin-milestones?id=${editingMilestoneId}`, 'PUT', payload);
        successEl.textContent = 'Completed event milestone updated successfully!';
      } else {
        await apiCall('admin-milestones', 'POST', payload);
        successEl.textContent = 'Completed event milestone recorded successfully!';
      }

      successEl.style.display = 'block';
      setTimeout(() => switchSection('milestones'), 1400);
    } catch (err) {
      errorEl.textContent = err.message || 'Failed to save milestone';
      errorEl.style.display = 'block';
    } finally {
      $('#milestone-submit-btn').disabled = false;
      $('#milestone-submit-btn').textContent = editingMilestoneId ? 'UPDATE MILESTONE' : 'SAVE COMPLETED EVENT MILESTONE';
    }
  }

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

      <!-- Change Master Password Card -->
      <div class="admin-security-card" style="grid-column: 1 / -1">
        <h3>🛡️ Change Master Administrator Password</h3>
        <p style="color:var(--cin-text-secondary);font-size:13px;margin-bottom:16px;line-height:1.6">
          Updating the master password requires current password verification followed by a 6-digit one-time passcode (OTP) delivered to the administrator email address.
        </p>

        <!-- Step 1: Password inputs -->
        <div id="pwd-step-1">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px;margin-bottom:16px">
            <div class="admin-field">
              <label for="pwd-current">Current Password</label>
              <input type="password" id="pwd-current" placeholder="Current password" required>
            </div>
            <div class="admin-field">
              <label for="pwd-new">New Password (min. 8 characters)</label>
              <input type="password" id="pwd-new" placeholder="New strong password" required>
            </div>
            <div class="admin-field">
              <label for="pwd-confirm">Confirm New Password</label>
              <input type="password" id="pwd-confirm" placeholder="Confirm new password" required>
            </div>
          </div>
          <div id="pwd-error" class="admin-message error" style="display:none;margin-bottom:12px"></div>
          <button type="button" class="admin-btn admin-btn-primary admin-btn-small" id="pwd-request-btn">
            REQUEST VERIFICATION CODE
          </button>
        </div>

        <!-- Step 2: OTP verification -->
        <div id="pwd-step-2" style="display:none;background:rgba(0,0,0,0.3);border:1px solid var(--cin-border);border-radius:10px;padding:20px;margin-top:16px">
          <h4 style="font-size:14px;color:var(--cin-accent-bright);margin-bottom:8px">ENTER 6-DIGIT VERIFICATION CODE</h4>
          <p style="font-size:12px;color:var(--cin-text-dim);margin-bottom:16px">A 6-digit verification code has been dispatched to the administrator email. Enter the code below to finalize.</p>
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
            <input type="text" id="pwd-otp-code" maxlength="6" placeholder="123456" style="width:180px;font-family:var(--font-mono);font-size:18px;letter-spacing:0.2em;text-align:center" required>
            <button type="button" class="admin-btn admin-btn-primary admin-btn-small" id="pwd-verify-btn">
              VERIFY &amp; GENERATE HASH
            </button>
            <button type="button" class="admin-btn admin-btn-ghost admin-btn-small" id="pwd-cancel-btn">
              Cancel
            </button>
          </div>
          <div id="pwd-otp-error" class="admin-message error" style="display:none"></div>
        </div>

        <!-- Step 3: Success Instructions -->
        <div id="pwd-step-3" style="display:none;margin-top:16px">
          <div class="admin-message success" style="margin-bottom:14px">
            ✓ Password verified successfully! Follow the instructions below to apply the new hash to your deployment.
          </div>
          <div style="font-size:12px;color:var(--cin-text-secondary);margin-bottom:8px"><strong>Generated Bcrypt Hash:</strong> (Click to select &amp; copy)</div>
          <div class="admin-code-box" id="pwd-new-hash"></div>
          <div style="margin-top:16px;padding:16px;background:rgba(255,255,255,0.02);border:1px solid var(--cin-border);border-radius:8px;font-size:13px;line-height:1.7;color:var(--cin-text-secondary)">
            <strong style="color:var(--cin-text)">Netlify Deployment Steps:</strong>
            <ol style="margin-top:6px;padding-left:20px">
              <li>Open your <strong>Netlify Dashboard</strong> &rarr; Site configuration &rarr; <strong>Environment variables</strong>.</li>
              <li>Edit the <code style="color:var(--cin-accent-bright)">ADMIN_PASSWORD_HASH</code> variable and paste the hash above.</li>
              <li>Trigger a <strong>Deploy site</strong> (or clear cache and deploy).</li>
              <li>Your new master password will immediately be active upon redeployment!</li>
            </ol>
          </div>
        </div>
      </div>
    `;

    // Hook up Password Change event handlers
    let pwdChallengeId = '';
    let pendingNewPassword = '';

    const reqBtn = $('#pwd-request-btn');
    if (reqBtn) {
      reqBtn.addEventListener('click', async () => {
        const curPwd = $('#pwd-current').value;
        const newPwd = $('#pwd-new').value;
        const confPwd = $('#pwd-confirm').value;
        const errEl = $('#pwd-error');
        errEl.style.display = 'none';

        if (!curPwd) {
          errEl.textContent = 'Please enter your current password';
          errEl.style.display = 'block';
          return;
        }
        if (newPwd.length < 8) {
          errEl.textContent = 'New password must be at least 8 characters';
          errEl.style.display = 'block';
          return;
        }
        if (newPwd !== confPwd) {
          errEl.textContent = 'New password and confirmation do not match';
          errEl.style.display = 'block';
          return;
        }

        reqBtn.disabled = true;
        reqBtn.textContent = 'REQUESTING CODE...';

        try {
          const res = await apiCall('admin-password-change', 'POST', {
            action: 'request',
            currentPassword: curPwd,
          });

          pwdChallengeId = res.challengeId;
          pendingNewPassword = newPwd;
          $('#pwd-step-1').style.opacity = '0.6';
          $('#pwd-step-2').style.display = 'block';
          $('#pwd-otp-code').focus();
        } catch (err) {
          errEl.textContent = err.message || 'Failed to request code';
          errEl.style.display = 'block';
        } finally {
          reqBtn.disabled = false;
          reqBtn.textContent = 'REQUEST VERIFICATION CODE';
        }
      });
    }

    const cancelBtn = $('#pwd-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        $('#pwd-step-2').style.display = 'none';
        $('#pwd-step-1').style.opacity = '1';
        pwdChallengeId = '';
        pendingNewPassword = '';
      });
    }

    const verBtn = $('#pwd-verify-btn');
    if (verBtn) {
      verBtn.addEventListener('click', async () => {
        const code = $('#pwd-otp-code').value.trim();
        const errEl = $('#pwd-otp-error');
        errEl.style.display = 'none';

        if (!/^\d{6}$/.test(code)) {
          errEl.textContent = 'Please enter a valid 6-digit code';
          errEl.style.display = 'block';
          return;
        }

        verBtn.disabled = true;
        verBtn.textContent = 'VERIFYING...';

        try {
          const res = await apiCall('admin-password-change', 'POST', {
            action: 'verify',
            challengeId: pwdChallengeId,
            code,
            newPassword: pendingNewPassword,
          });

          $('#pwd-step-1').style.display = 'none';
          $('#pwd-step-2').style.display = 'none';
          $('#pwd-new-hash').textContent = res.newPasswordHash;
          $('#pwd-step-3').style.display = 'block';
        } catch (err) {
          errEl.textContent = err.message || 'Verification failed';
          errEl.style.display = 'block';
        } finally {
          verBtn.disabled = false;
          verBtn.textContent = 'VERIFY & GENERATE HASH';
        }
      });
    }
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
  // 10. MEMBERS MANAGEMENT
  // =========================================================================
  // 10. MEMBERS MANAGEMENT
  // =========================================================================
  async function loadMembers(tabFilter = 'PRESENT') {
    membersTab = tabFilter;
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Lab Members &amp; 3D Team</h1>
          <p class="admin-main-subtitle">MANAGE ACTIVE RESEARCHERS, LAB LEADERSHIP &amp; ALUMNI</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.editLeadMember()" style="border-color:rgba(59,130,246,0.5);color:var(--cin-accent-bright)">
            ★ EDIT LEAD DEVELOPER / HEAD
          </button>
          <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.loadMemberForm()">
            + ADD MEMBER
          </button>
        </div>
      </div>

      <!-- Lab Leadership & Lead Developer Highlight Card -->
      <div id="lead-member-banner" style="margin-bottom:24px"></div>

      <div class="admin-tabs" id="member-tabs">
        <button class="admin-tab ${membersTab === 'PRESENT' ? 'active' : ''}" data-tab="PRESENT">ACTIVE MEMBERS</button>
        <button class="admin-tab ${membersTab === 'PAST' ? 'active' : ''}" data-tab="PAST">PAST MEMBERS / ALUMNI</button>
        <button class="admin-tab ${membersTab === 'ALL' ? 'active' : ''}" data-tab="ALL">ALL MEMBERS</button>
      </div>

      <div class="admin-events-list" id="members-list">
        <div style="text-align:center;padding:40px"><div class="admin-spinner" style="margin:0 auto"></div></div>
      </div>
    `;

    $$('#member-tabs .admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#member-tabs .admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        membersTab = tab.dataset.tab;
        renderMembersList();
      });
    });

    if (allMembers && allMembers.length) {
      renderLeadBanner();
    }

    try {
      const res = await apiCall('admin-members');
      allMembers = res.members || [];
      renderLeadBanner();
      renderMembersList();
    } catch (err) {
      $('#members-list').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderLeadBanner() {
    const bannerEl = $('#lead-member-banner');
    if (!bannerEl) return;

    const lead = allMembers.find(m => m.is_lead) || 
                 allMembers.find(m => (m.role || '').toLowerCase().includes('lead') || (m.full_name || '').toLowerCase().includes('akif')) || 
                 {
                   id: null,
                   full_name: 'MD Akif',
                   role: 'AR/VR Research Lab Lead Researcher & Head',
                   tagline: 'Head of Lab • Immersive Tech & HCI Research',
                   about: 'Oversees overall lab direction, strategic research initiatives, interdisciplinary project teams, and global academic collaborations.',
                   email: 'xrresearchlab@gcet.edu.in',
                   phone: '+91 8763688312',
                   is_lead: true,
                   status: 'PRESENT'
                 };

    bannerEl.innerHTML = `
      <div style="background:linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(13,17,23,0.7) 100%);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:20px 24px;position:relative;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap">
          <div style="flex:1;min-width:280px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:10px;font-weight:600;letter-spacing:1px;color:#60a5fa;text-transform:uppercase;background:rgba(59,130,246,0.15);padding:3px 8px;border-radius:4px;border:1px solid rgba(59,130,246,0.3)">
                ★ LAB LEADERSHIP &amp; LEAD DEVELOPER
              </span>
              <span style="font-size:11px;color:var(--cin-text-dim)">Pinned to "Lab Leadership &amp; Mentorship" on About page</span>
            </div>
            <h2 style="font-family:var(--font-display);font-size:20px;font-weight:600;color:var(--cin-text);margin:0 0 4px">
              ${escapeHtml(lead.full_name || 'MD Akif')}
            </h2>
            <div style="font-size:13px;color:var(--cin-accent-bright);margin-bottom:8px;font-weight:500">
              ${escapeHtml(lead.role || 'AR/VR Research Lab Lead Researcher & Head')}
            </div>
            ${lead.tagline ? `
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                ${lead.tagline.split(/[•,|]/).map(s => s.trim()).filter(Boolean).map(t => `
                  <span style="font-family:var(--font-mono);font-size:10px;color:var(--cin-text-dim);background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:4px;border:1px solid var(--cin-border)">${escapeHtml(t)}</span>
                `).join('')}
              </div>
            ` : ''}
            <p style="font-size:13px;line-height:1.5;color:var(--cin-text-secondary);margin:0 0 12px;max-width:760px">
              ${escapeHtml(lead.about || 'Oversees overall lab direction, strategic research initiatives, interdisciplinary project teams, and global academic collaborations.')}
            </p>
            <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;color:var(--cin-text-dim);font-family:var(--font-mono)">
              ${lead.email ? `<div><span style="color:var(--cin-text-secondary)">EMAIL:</span> <span style="color:var(--cin-text)">${escapeHtml(lead.email)}</span></div>` : ''}
              ${lead.phone ? `<div><span style="color:var(--cin-text-secondary)">PHONE:</span> <span style="color:var(--cin-text)">${escapeHtml(lead.phone)}</span></div>` : ''}
              ${lead.model_url ? `<div style="color:#38bdf8">3D MODEL CONFIGURED</div>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;flex-shrink:0">
            <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.editLeadMember('${lead.id || ''}')" style="box-shadow:0 0 12px rgba(59,130,246,0.3)">
              ✏ EDIT LEAD DEVELOPER / HEAD
            </button>
            <span style="font-size:11px;color:var(--cin-text-dim)">Changes sync live to About page</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderMembersList() {
    const listEl = $('#members-list');
    if (!listEl) return;

    let filtered = allMembers;
    if (membersTab === 'PRESENT') filtered = allMembers.filter(m => m.status === 'PRESENT');
    if (membersTab === 'PAST') filtered = allMembers.filter(m => m.status === 'PAST');

    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="admin-empty-state">
          <h3>No members found</h3>
          <p>No member records match the selected filter.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(m => `
      <div class="admin-event-row" style="display:flex;justify-content:space-between;align-items:center;padding:16px;margin-bottom:12px;background:rgba(255,255,255,0.02);border:1px solid var(--cin-border);border-radius:10px">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:48px;height:48px;border-radius:8px;background:rgba(0,0,0,0.4);border:1px solid var(--cin-border);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${m.fallback_image_url ? `<img src="${escapeHtml(m.fallback_image_url)}" alt="${escapeHtml(m.full_name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<span style=\\'font-size:11px;color:var(--cin-text-dim)\\'>3D</span>'"/>` : `<span style="font-family:var(--font-mono);font-size:12px;color:var(--cin-accent-bright)">${escapeHtml(m.full_name.slice(0, 2).toUpperCase())}</span>`}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <strong style="font-size:15px;color:var(--cin-text)">${escapeHtml(m.full_name)}</strong>
              ${m.is_lead ? `<span class="admin-status-badge" style="background:rgba(59,130,246,0.2);color:#60a5fa;border:1px solid rgba(59,130,246,0.4)">★ LEAD</span>` : ''}
              <span class="admin-status-badge ${m.status === 'PRESENT' ? 'admin-badge-present' : 'admin-badge-past'}">${m.status === 'PRESENT' ? 'Active' : 'Alumni'}</span>
              ${m.model_url ? `<span class="admin-status-badge admin-badge-model">3D Model</span>` : ''}
              ${m.show_email_publicly ? `<span style="font-size:10px;color:var(--cin-accent-bright);font-family:var(--font-mono)">Public Email</span>` : ''}
            </div>
            <div style="font-size:13px;color:var(--cin-text-secondary);margin-top:2px">
              ${escapeHtml(m.role || 'Member')} ${m.tagline ? `— <span style="color:var(--cin-text-dim)">${escapeHtml(m.tagline)}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--cin-text-dim);margin-top:4px">
              Order: ${m.display_order ?? 0} · Joined: ${formatDate(m.joined_at)} ${m.email ? `· ${escapeHtml(m.email)}` : ''} ${m.phone ? `· Tel: ${escapeHtml(m.phone)}` : ''}
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.editMember('${m.id}')">Edit</button>
          ${m.status === 'PRESENT' ? `
            <button class="admin-btn admin-btn-secondary admin-btn-tiny" onclick="window.adminApp.moveMemberStatus('${m.id}', 'move_to_past')">Move to Alumni</button>
          ` : `
            <button class="admin-btn admin-btn-secondary admin-btn-tiny" onclick="window.adminApp.moveMemberStatus('${m.id}', 'restore_to_present')">Restore Active</button>
          `}
          <button class="admin-btn admin-btn-danger admin-btn-tiny" onclick="window.adminApp.deleteMember('${m.id}', '${escapeHtml(m.full_name)}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  function loadMemberForm(member = null) {
    editingMember = member;
    const isEdit = !!member;
    const m = member || {};
    const isLead = m.is_lead === true || (m.role || '').toLowerCase().includes('lead') || (m.full_name || '').toLowerCase().includes('akif');

    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">${isEdit ? (isLead ? 'Edit Lab Leadership &amp; Lead Developer' : 'Edit Member') : 'Add Team Member'}</h1>
          <p class="admin-main-subtitle">RESEARCHER PROFILE, CONTACT INFO, 3D AVATAR &amp; BIO</p>
        </div>
        <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('members')">
          ← BACK TO MEMBERS
        </button>
      </div>

      <div id="member-form-msg" class="admin-message" style="display:none"></div>

      <form id="member-form" class="admin-form">
        <!-- Basic Info -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Identity &amp; Role</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label for="mem-name">Full Name *</label>
              <input type="text" id="mem-name" value="${escapeHtml(m.full_name || '')}" placeholder="e.g. MD Akif" required>
            </div>

            <div class="admin-field">
              <label for="mem-email">Email Address</label>
              <input type="email" id="mem-email" value="${escapeHtml(m.email || '')}" placeholder="member@gcet.edu.in">
            </div>

            <div class="admin-field">
              <label for="mem-phone">Contact Phone Number</label>
              <input type="tel" id="mem-phone" value="${escapeHtml(m.phone || '')}" placeholder="+91 8763688312">
            </div>

            <div class="admin-field">
              <label for="mem-role">Lab Role *</label>
              <input type="text" id="mem-role" value="${escapeHtml(m.role || (isLead ? 'AR/VR Research Lab Lead Researcher & Head' : 'Member'))}" placeholder="e.g. AR/VR Research Lab Lead Researcher &amp; Head" required>
            </div>

            <div class="admin-field">
              <label for="mem-status">Membership Status *</label>
              <select id="mem-status">
                <option value="PRESENT" ${m.status !== 'PAST' ? 'selected' : ''}>PRESENT (Active Member)</option>
                <option value="PAST" ${m.status === 'PAST' ? 'selected' : ''}>PAST (Lab Alumni)</option>
              </select>
            </div>

            <div class="admin-field full-width" style="padding:14px 16px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.25);border-radius:8px">
              <label class="admin-toggle" style="display:flex;align-items:center;gap:12px;cursor:pointer">
                <input type="checkbox" id="mem-is-lead" ${isLead ? 'checked' : ''}>
                <div>
                  <strong style="color:var(--cin-text);font-size:13px;display:flex;align-items:center;gap:6px">
                    <span style="color:#60a5fa">★</span> Set as Lead Developer / Lab Head (Pins to "Lab Leadership &amp; Mentorship" on About Page)
                  </strong>
                  <div style="font-size:11px;color:var(--cin-text-secondary);margin-top:2px">
                    When enabled, this member is featured prominently in the top Leadership Card on the About page with email &amp; phone contacts.
                  </div>
                </div>
              </label>
            </div>

            <div class="admin-field full-width">
              <label for="mem-tagline">Tagline / Specialization (Tags separated by • or commas)</label>
              <input type="text" id="mem-tagline" value="${escapeHtml(m.tagline || (isLead ? 'Head of Lab • Immersive Tech & HCI Research' : ''))}" placeholder="e.g. Head of Lab • Immersive Tech &amp; HCI Research">
            </div>

            <div class="admin-field full-width">
              <label for="mem-about">About / Biography</label>
              <textarea id="mem-about" rows="4" placeholder="Brief research background, achievements, and contributions...">${escapeHtml(m.about || (isLead ? 'Oversees overall lab direction, strategic research initiatives, interdisciplinary project teams, and global academic collaborations.' : ''))}</textarea>
            </div>
          </div>
        </div>

        <!-- 3D Model & Media -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">3D Model &amp; Media Assets</h3>
          <p style="font-size:12px;color:var(--cin-text-secondary);margin-bottom:16px">
            Provide a Google Drive share link or direct URL to a <code>.glb</code> / <code>.gltf</code> 3D model. The model will be rendered dynamically with interactive rotation.
          </p>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label for="mem-model-url">3D Model URL (.glb / Google Drive)</label>
              <input type="url" id="mem-model-url" value="${escapeHtml(m.model_url || '')}" placeholder="https://drive.google.com/file/d/.../view or https://.../model.glb">
              <div id="mem-model-preview" class="admin-media-preview-box"></div>
            </div>

            <div class="admin-field">
              <label for="mem-fallback-img">Fallback Portrait Image URL (or Google Drive)</label>
              <input type="url" id="mem-fallback-img" value="${escapeHtml(m.fallback_image_url || '')}" placeholder="https://drive.google.com/file/d/.../view or image URL">
              <div id="mem-img-preview" class="admin-media-preview-box"></div>
            </div>

            <div class="admin-field">
              <label for="mem-profile-url">Public Profile Link (LinkedIn / Portfolio / GitHub)</label>
              <input type="url" id="mem-profile-url" value="${escapeHtml(m.public_profile_url || '')}" placeholder="https://linkedin.com/in/...">
            </div>

            <div class="admin-field">
              <label for="mem-order">Display Order (Lower appears first)</label>
              <input type="number" id="mem-order" value="${m.display_order ?? 0}">
            </div>

            <div class="admin-field">
              <label for="mem-joined">Joined Date</label>
              <input type="date" id="mem-joined" value="${m.joined_at ? m.joined_at.slice(0, 10) : new Date().toISOString().slice(0, 10)}">
            </div>

            <div class="admin-field" style="display:flex;align-items:center;padding-top:24px">
              <label class="admin-toggle">
                <input type="checkbox" id="mem-show-email" ${m.show_email_publicly ? 'checked' : ''}>
                <span>Show Email Publicly on Team Page</span>
              </label>
            </div>
          </div>
        </div>

        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary" id="mem-submit-btn">
            ${isEdit ? 'UPDATE MEMBER' : 'SAVE MEMBER'}
          </button>
          <button type="button" class="admin-btn admin-btn-secondary" onclick="window.adminApp.switchSection('members')">
            CANCEL
          </button>
        </div>
      </form>
    `;

    // Live media previews
    const modelInput = $('#mem-model-url');
    const modelBox = $('#mem-model-preview');
    if (modelInput && modelBox) {
      if (modelInput.value) window.XRMedia?.renderLivePreview(modelBox, modelInput.value, 'model');
      modelInput.addEventListener('input', () => {
        window.XRMedia?.renderLivePreview(modelBox, modelInput.value, 'model');
      });
    }

    const imgInput = $('#mem-fallback-img');
    const imgBox = $('#mem-img-preview');
    if (imgInput && imgBox) {
      if (imgInput.value) window.XRMedia?.renderLivePreview(imgBox, imgInput.value, 'image');
      imgInput.addEventListener('input', () => {
        window.XRMedia?.renderLivePreview(imgBox, imgInput.value, 'image');
      });
    }

    $('#member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveMember();
    });
  }

  async function saveMember() {
    const msg = $('#member-form-msg');
    msg.style.display = 'none';

    const full_name = $('#mem-name').value.trim();
    if (!full_name) {
      msg.className = 'admin-message error';
      msg.textContent = 'Member name is required';
      msg.style.display = 'block';
      return;
    }

    const payload = {
      full_name,
      email: $('#mem-email').value.trim() || null,
      phone: $('#mem-phone').value.trim() || null,
      role: $('#mem-role').value.trim() || 'Member',
      tagline: $('#mem-tagline').value.trim() || null,
      about: $('#mem-about').value.trim() || null,
      status: $('#mem-status').value,
      is_lead: $('#mem-is-lead').checked,
      model_url: $('#mem-model-url').value.trim() || null,
      fallback_image_url: $('#mem-fallback-img').value.trim() || null,
      public_profile_url: $('#mem-profile-url').value.trim() || null,
      display_order: parseInt($('#mem-order').value, 10) || 0,
      joined_at: $('#mem-joined').value || null,
      show_email_publicly: $('#mem-show-email').checked,
    };

    const submitBtn = $('#mem-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SAVING...';

    try {
      if (editingMember && editingMember.id) {
        await apiCall(`admin-members?id=${editingMember.id}`, 'PUT', payload);
      } else {
        await apiCall('admin-members', 'POST', payload);
      }

      msg.className = 'admin-message success';
      msg.textContent = (editingMember && editingMember.id) ? 'Member profile updated!' : 'Member added successfully!';
      msg.style.display = 'block';

      setTimeout(() => loadMembers(payload.status), 1200);
    } catch (err) {
      msg.className = 'admin-message error';
      msg.textContent = err.message || 'Failed to save member';
      msg.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = (editingMember && editingMember.id) ? 'UPDATE MEMBER' : 'SAVE MEMBER';
    }
  }

  async function editLeadMember(id) {
    if (id) {
      try {
        const res = await apiCall(`admin-members?id=${id}`);
        if (res.member) {
          loadMemberForm(res.member);
          return;
        }
      } catch (err) {
        console.warn('Could not fetch lead member by id, falling back to local list', err);
      }
    }

    // Check if any existing member in allMembers is already lead or named Akif
    const existing = allMembers.find(m => m.is_lead) || 
                     allMembers.find(m => (m.role || '').toLowerCase().includes('lead') || (m.full_name || '').toLowerCase().includes('akif'));
    if (existing) {
      loadMemberForm(existing);
      return;
    }

    // Default template for MD Akif as Lead Developer / Lab Head
    loadMemberForm({
      full_name: 'MD Akif',
      email: 'xrresearchlab@gcet.edu.in',
      phone: '+91 8763688312',
      role: 'AR/VR Research Lab Lead Researcher & Head',
      tagline: 'Head of Lab • Immersive Tech & HCI Research',
      about: 'Oversees overall lab direction, strategic research initiatives, interdisciplinary project teams, and global academic collaborations.',
      status: 'PRESENT',
      is_lead: true,
      show_email_publicly: true,
      display_order: 0
    });
  }

  async function moveMemberStatus(id, action) {
    try {
      await apiCall('admin-members', 'POST', { _action: action, id });
      loadMembers(membersTab);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function deleteMember(id, name) {
    if (!confirm(`Delete member "${name}"? This action cannot be undone.`)) return;
    try {
      await apiCall(`admin-members?id=${id}`, 'DELETE');
      loadMembers(membersTab);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // =========================================================================
  // 11. LEARN & COURSES MANAGEMENT
  // =========================================================================
  async function loadCourses(categoryFilter = 'all') {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Learn Platform &amp; Curricula</h1>
          <p class="admin-main-subtitle">MANAGE SPATIAL COMPUTING COURSES &amp; LESSONS</p>
        </div>
        <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.loadCourseForm()">
          + ADD COURSE
        </button>
      </div>

      <div class="admin-tabs" id="course-tabs">
        <button class="admin-tab ${categoryFilter === 'all' ? 'active' : ''}" data-cat="all">ALL COURSES</button>
        <button class="admin-tab ${categoryFilter === 'Augmented Reality' ? 'active' : ''}" data-cat="Augmented Reality">AR</button>
        <button class="admin-tab ${categoryFilter === 'Virtual Reality' ? 'active' : ''}" data-cat="Virtual Reality">VR</button>
        <button class="admin-tab ${categoryFilter === 'WebXR' ? 'active' : ''}" data-cat="WebXR">WEBXR</button>
        <button class="admin-tab ${categoryFilter === 'draft' ? 'active' : ''}" data-cat="draft">DRAFTS</button>
      </div>

      <div class="admin-events-list" id="courses-list">
        <div style="text-align:center;padding:40px"><div class="admin-spinner" style="margin:0 auto"></div></div>
      </div>
    `;

    $$('#course-tabs .admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#course-tabs .admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderCoursesList(tab.dataset.cat);
      });
    });

    try {
      const res = await apiCall('admin-courses');
      allCourses = res.courses || [];
      renderCoursesList(categoryFilter);
    } catch (err) {
      $('#courses-list').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderCoursesList(filter = 'all') {
    const listEl = $('#courses-list');
    if (!listEl) return;

    let filtered = allCourses;
    if (filter === 'draft') {
      filtered = allCourses.filter(c => c.status === 'draft');
    } else if (filter !== 'all') {
      filtered = allCourses.filter(c => c.category === filter);
    }

    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="admin-empty-state">
          <h3>No courses found</h3>
          <p>Click "+ ADD COURSE" to create a new curriculum track.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(c => `
      <div class="admin-event-row" style="display:flex;justify-content:space-between;align-items:center;padding:16px;margin-bottom:12px;background:rgba(255,255,255,0.02);border:1px solid var(--cin-border);border-radius:10px">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:64px;height:48px;border-radius:8px;background:rgba(0,0,0,0.4);border:1px solid var(--cin-border);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${c.thumbnail_url ? `<img src="${escapeHtml(c.thumbnail_url)}" alt="${escapeHtml(c.title)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<span style=\\'font-size:11px;color:var(--cin-text-dim)\\'>TRACK</span>'"/>` : `<span style="font-family:var(--font-mono);font-size:11px;color:var(--cin-accent-bright)">TRACK</span>`}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <strong style="font-size:15px;color:var(--cin-text)">${escapeHtml(c.title)}</strong>
              <span class="admin-status-badge ${c.status === 'published' ? 'admin-badge-present' : 'admin-badge-past'}">${c.status.toUpperCase()}</span>
              <span class="admin-status-badge admin-badge-model">${escapeHtml(c.difficulty)}</span>
              ${c.featured ? `<span style="font-size:10px;color:#FCD34D;font-family:var(--font-mono)">★ FEATURED</span>` : ''}
            </div>
            <div style="font-size:13px;color:var(--cin-text-secondary);margin-top:2px">
              ${escapeHtml(c.category)} · ${c.estimated_duration ? `${escapeHtml(c.estimated_duration)} · ` : ''}${c.lesson_count || 0} Lessons
            </div>
            <div style="font-size:11px;color:var(--cin-text-dim);margin-top:4px">
              Instructor: ${escapeHtml(c.instructor_name || 'Lab Staff')} · Slug: <code>${escapeHtml(c.slug)}</code>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="admin-btn admin-btn-secondary admin-btn-tiny" onclick="window.adminApp.manageLessons('${c.id}')">Manage Lessons (${c.lesson_count || 0})</button>
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.editCourse('${c.id}')">Edit</button>
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.toggleCoursePublish('${c.id}', ${c.status !== 'published'})">
            ${c.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
          <button class="admin-btn admin-btn-danger admin-btn-tiny" onclick="window.adminApp.deleteCourse('${c.id}', '${escapeHtml(c.title)}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  function loadCourseForm(course = null) {
    editingCourse = course;
    const isEdit = !!course;
    const c = course || {};

    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">${isEdit ? 'Edit Course' : 'Create Course'}</h1>
          <p class="admin-main-subtitle">SPATIAL CURRICULUM, SYLLABUS &amp; METADATA</p>
        </div>
        <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('learn')">
          ← BACK TO COURSES
        </button>
      </div>

      <div id="course-form-msg" class="admin-message" style="display:none"></div>

      <form id="course-form" class="admin-form">
        <!-- Overview -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Course Information</h3>
          <div class="admin-form-grid">
            <div class="admin-field full-width">
              <label for="course-title">Course Title *</label>
              <input type="text" id="course-title" value="${escapeHtml(c.title || '')}" placeholder="e.g. Unreal Engine 5 &amp; Virtual Production" required>
            </div>

            <div class="admin-field">
              <label for="course-category">Category *</label>
              <select id="course-category">
                <option value="Augmented Reality" ${c.category === 'Augmented Reality' ? 'selected' : ''}>Augmented Reality</option>
                <option value="Virtual Reality" ${c.category === 'Virtual Reality' ? 'selected' : ''}>Virtual Reality</option>
                <option value="Mixed Reality" ${c.category === 'Mixed Reality' ? 'selected' : ''}>Mixed Reality</option>
                <option value="WebXR" ${c.category === 'WebXR' ? 'selected' : ''}>WebXR</option>
                <option value="3D Modeling" ${c.category === '3D Modeling' ? 'selected' : ''}>3D Modeling &amp; Shaders</option>
                <option value="Spatial Computing" ${c.category === 'Spatial Computing' ? 'selected' : ''}>Spatial Computing</option>
              </select>
            </div>

            <div class="admin-field">
              <label for="course-difficulty">Difficulty *</label>
              <select id="course-difficulty">
                <option value="Beginner" ${c.difficulty === 'Beginner' ? 'selected' : ''}>Beginner</option>
                <option value="Intermediate" ${c.difficulty === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                <option value="Advanced" ${c.difficulty === 'Advanced' ? 'selected' : ''}>Advanced</option>
                <option value="Expert" ${c.difficulty === 'Expert' ? 'selected' : ''}>Expert</option>
              </select>
            </div>

            <div class="admin-field">
              <label for="course-slug">URL Slug (leave blank to auto-generate)</label>
              <input type="text" id="course-slug" value="${escapeHtml(c.slug || '')}" placeholder="e.g. unreal-engine-5-virtual-production">
            </div>

            <div class="admin-field">
              <label for="course-duration">Estimated Duration</label>
              <input type="text" id="course-duration" value="${escapeHtml(c.estimated_duration || '')}" placeholder="e.g. 6 Weeks · 24 Hours">
            </div>

            <div class="admin-field">
              <label for="course-instructor">Instructor Name</label>
              <input type="text" id="course-instructor" value="${escapeHtml(c.instructor_name || '')}" placeholder="e.g. MD Akif">
            </div>

            <div class="admin-field">
              <label for="course-instructor-role">Instructor Role</label>
              <input type="text" id="course-instructor-role" value="${escapeHtml(c.instructor_role || '')}" placeholder="e.g. Head of Lab / Lead Researcher">
            </div>

            <div class="admin-field full-width">
              <label for="course-short-desc">Short Description (Cards &amp; Meta)</label>
              <input type="text" id="course-short-desc" value="${escapeHtml(c.short_description || '')}" placeholder="Brief 1-2 sentence overview">
            </div>

            <div class="admin-field full-width">
              <label for="course-desc">Full Syllabus Description</label>
              <textarea id="course-desc" rows="5" placeholder="Comprehensive course syllabus, methodology, and learning expectations...">${escapeHtml(c.description || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Media Assets -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Media &amp; Video Embeds</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label for="course-thumbnail">Thumbnail Image URL (or Google Drive)</label>
              <input type="url" id="course-thumbnail" value="${escapeHtml(c.thumbnail_url || '')}" placeholder="https://drive.google.com/file/d/.../view or image URL">
              <div id="course-thumb-preview" class="admin-media-preview-box"></div>
            </div>

            <div class="admin-field">
              <label for="course-video">Introduction Video URL (YouTube or Google Drive)</label>
              <input type="url" id="course-video" value="${escapeHtml(c.intro_video_url || c.video_url || '')}" placeholder="https://youtube.com/watch?v=... or Google Drive video">
              <div id="course-vid-preview" class="admin-media-preview-box"></div>
            </div>

            <div class="admin-field full-width">
              <label for="course-objectives">Learning Objectives (one per line)</label>
              <textarea id="course-objectives" rows="3" placeholder="Master Nanite and Lumen dynamic lighting&#10;Implement Blueprint spatial interaction systems&#10;Optimize real-time framerate for VR">${(c.learning_objectives || []).join('\n')}</textarea>
            </div>

            <div class="admin-field full-width">
              <label for="course-prereqs">Prerequisites (one per line)</label>
              <textarea id="course-prereqs" rows="2" placeholder="Basic C++ or C# syntax understanding&#10;Foundational 3D coordinate mathematics">${(c.prerequisites || []).join('\n')}</textarea>
            </div>

            <div class="admin-field">
              <label for="course-tech">Technologies (comma-separated)</label>
              <input type="text" id="course-tech" value="${(c.technologies || []).join(', ')}" placeholder="Unreal Engine 5, C++, OpenXR, Lumen">
            </div>

            <div class="admin-field">
              <label for="course-tags">Tags (comma-separated)</label>
              <input type="text" id="course-tags" value="${(c.tags || []).join(', ')}" placeholder="VR, Virtual Production, Blueprint">
            </div>

            <div class="admin-field">
              <label for="course-status">Publication Status</label>
              <select id="course-status">
                <option value="published" ${c.status !== 'draft' && c.status !== 'archived' ? 'selected' : ''}>Published — Active on Learn Page</option>
                <option value="draft" ${c.status === 'draft' ? 'selected' : ''}>Draft — Hidden from Public</option>
                <option value="archived" ${c.status === 'archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>

            <div class="admin-field">
              <label for="course-order">Display Order</label>
              <input type="number" id="course-order" value="${c.display_order ?? 0}">
            </div>

            <div class="admin-field" style="display:flex;align-items:center;padding-top:24px">
              <label class="admin-toggle">
                <input type="checkbox" id="course-featured" ${c.featured ? 'checked' : ''}>
                <span>Feature on Homepage &amp; Learn Header</span>
              </label>
            </div>

            <div class="admin-field" style="display:flex;align-items:center;padding-top:24px">
              <label class="admin-toggle">
                <input type="checkbox" id="course-cert" ${c.certificate_available ? 'checked' : ''}>
                <span>Lab Completion Certificate Available</span>
              </label>
            </div>
          </div>
        </div>

        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary" id="course-submit-btn">
            ${isEdit ? 'UPDATE COURSE' : 'SAVE COURSE'}
          </button>
          <button type="button" class="admin-btn admin-btn-secondary" onclick="window.adminApp.switchSection('learn')">
            CANCEL
          </button>
        </div>
      </form>
    `;

    // Live previews
    const thumbInput = $('#course-thumbnail');
    const thumbBox = $('#course-thumb-preview');
    if (thumbInput && thumbBox) {
      if (thumbInput.value) window.XRMedia?.renderLivePreview(thumbBox, thumbInput.value, 'image');
      thumbInput.addEventListener('input', () => {
        window.XRMedia?.renderLivePreview(thumbBox, thumbInput.value, 'image');
      });
    }

    const vidInput = $('#course-video');
    const vidBox = $('#course-vid-preview');
    if (vidInput && vidBox) {
      if (vidInput.value) window.XRMedia?.renderLivePreview(vidBox, vidInput.value, 'video');
      vidInput.addEventListener('input', () => {
        window.XRMedia?.renderLivePreview(vidBox, vidInput.value, 'video');
      });
    }

    $('#course-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveCourse();
    });
  }

  async function saveCourse() {
    const msg = $('#course-form-msg');
    msg.style.display = 'none';

    const title = $('#course-title').value.trim();
    if (!title) {
      msg.className = 'admin-message error';
      msg.textContent = 'Course title is required';
      msg.style.display = 'block';
      return;
    }

    const payload = {
      title,
      slug: $('#course-slug').value.trim() || undefined,
      category: $('#course-category').value,
      difficulty: $('#course-difficulty').value,
      estimated_duration: $('#course-duration').value.trim() || null,
      instructor_name: $('#course-instructor').value.trim() || null,
      instructor_role: $('#course-instructor-role').value.trim() || null,
      short_description: $('#course-short-desc').value.trim() || null,
      description: $('#course-desc').value.trim() || null,
      thumbnail_url: $('#course-thumbnail').value.trim() || null,
      intro_video_url: $('#course-video').value.trim() || null,
      video_url: $('#course-video').value.trim() || null,
      learning_objectives: $('#course-objectives').value.split('\n').map(s => s.trim()).filter(Boolean),
      prerequisites: $('#course-prereqs').value.split('\n').map(s => s.trim()).filter(Boolean),
      technologies: $('#course-tech').value.split(',').map(s => s.trim()).filter(Boolean),
      tags: $('#course-tags').value.split(',').map(s => s.trim()).filter(Boolean),
      status: $('#course-status').value,
      display_order: parseInt($('#course-order').value, 10) || 0,
      featured: $('#course-featured').checked,
      certificate_available: $('#course-cert').checked,
    };

    const submitBtn = $('#course-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SAVING...';

    try {
      if (editingCourse) {
        await apiCall(`admin-courses?id=${editingCourse.id}`, 'PUT', payload);
      } else {
        await apiCall('admin-courses', 'POST', payload);
      }

      msg.className = 'admin-message success';
      msg.textContent = editingCourse ? 'Course updated!' : 'Course created!';
      msg.style.display = 'block';

      setTimeout(() => loadCourses(), 1200);
    } catch (err) {
      msg.className = 'admin-message error';
      msg.textContent = err.message || 'Failed to save course';
      msg.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingCourse ? 'UPDATE COURSE' : 'SAVE COURSE';
    }
  }

  async function toggleCoursePublish(id, publish) {
    try {
      await apiCall('admin-courses', 'POST', {
        _action: 'update_status',
        id,
        status: publish ? 'published' : 'draft',
      });
      loadCourses();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function deleteCourse(id, title) {
    if (!confirm(`Delete course "${title}" and all its lessons? This cannot be undone.`)) return;
    try {
      await apiCall(`admin-courses?id=${id}`, 'DELETE');
      loadCourses();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // Course Lessons Manager
  async function loadLessonManager(courseId) {
    managingCourse = courseId;
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Course Lessons</h1>
          <p class="admin-main-subtitle" id="lesson-mgr-sub">LOADING LESSONS...</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('learn')">
            ← BACK TO COURSES
          </button>
          <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.openLessonModal('${courseId}')">
            + ADD LESSON
          </button>
        </div>
      </div>

      <div class="admin-lesson-list" id="lessons-list">
        <div style="text-align:center;padding:40px"><div class="admin-spinner" style="margin:0 auto"></div></div>
      </div>
    `;

    try {
      const res = await apiCall(`admin-courses?id=${courseId}`);
      const course = res.course;
      const lessons = res.lessons || [];

      $('#lesson-mgr-sub').textContent = `COURSE: ${course.title.toUpperCase()} (${lessons.length} LESSONS)`;
      renderLessonsList(lessons, courseId);
    } catch (err) {
      $('#lessons-list').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderLessonsList(lessons, courseId) {
    const listEl = $('#lessons-list');
    if (!listEl) return;

    if (!lessons.length) {
      listEl.innerHTML = `
        <div class="admin-empty-state">
          <h3>No lessons in this course</h3>
          <p>Click "+ ADD LESSON" to add instructional video units or readings.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = lessons.map(l => `
      <div class="admin-lesson-row">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:var(--font-mono);font-size:12px;color:var(--cin-accent-bright);padding:2px 6px;background:rgba(56,189,248,0.1);border-radius:4px">
              #${l.lesson_order ?? 0}
            </span>
            <strong style="color:var(--cin-text);font-size:14px">${escapeHtml(l.title)}</strong>
            <span class="admin-status-badge ${l.status === 'published' ? 'admin-badge-present' : 'admin-badge-past'}">${l.status}</span>
          </div>
          <div style="font-size:12px;color:var(--cin-text-secondary);margin-top:4px">
            ${l.video_url ? `<span style="color:#38BDF8">🎥 Video attached</span> · ` : ''}
            ${l.resource_url ? `<span style="color:#34D399">📎 Resource linked</span> · ` : ''}
            ${escapeHtml(l.description ? l.description.slice(0, 80) + '...' : '')}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.openLessonModal('${courseId}', '${l.id}')">Edit</button>
          <button class="admin-btn admin-btn-danger admin-btn-tiny" onclick="window.adminApp.deleteLesson('${l.id}', '${courseId}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function openLessonModal(courseId, lessonId = null) {
    let lesson = null;
    if (lessonId) {
      const res = await apiCall(`admin-courses?id=${courseId}`);
      lesson = (res.lessons || []).find(l => l.id === lessonId);
    }

    const modal = document.createElement('div');
    modal.className = 'admin-confirm-overlay';
    modal.id = 'lesson-modal';
    modal.innerHTML = `
      <div class="admin-confirm-dialog" style="max-width:560px">
        <h3>${lesson ? 'Edit Lesson' : 'Add New Lesson'}</h3>
        <div id="modal-lesson-msg" class="admin-message error" style="display:none"></div>
        <form id="modal-lesson-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="admin-field">
            <label>Lesson Title *</label>
            <input type="text" id="ml-title" value="${escapeHtml(lesson?.title || '')}" placeholder="e.g. Setting up VR Tracking Bounds" required>
          </div>
          <div class="admin-field">
            <label>Lesson Order Number</label>
            <input type="number" id="ml-order" value="${lesson?.lesson_order ?? 1}">
          </div>
          <div class="admin-field">
            <label>Video URL (YouTube or Google Drive)</label>
            <input type="url" id="ml-video" value="${escapeHtml(lesson?.video_url || '')}" placeholder="https://youtube.com/watch?v=... or Drive video">
          </div>
          <div class="admin-field">
            <label>Resource / Documentation Link</label>
            <input type="url" id="ml-resource" value="${escapeHtml(lesson?.resource_url || '')}" placeholder="https://github.com/... or Google Docs">
          </div>
          <div class="admin-field">
            <label>Description / Notes</label>
            <textarea id="ml-desc" rows="3" placeholder="Summary of topics covered...">${escapeHtml(lesson?.description || '')}</textarea>
          </div>
          <div class="admin-field">
            <label>Status</label>
            <select id="ml-status">
              <option value="published" ${lesson?.status !== 'draft' ? 'selected' : ''}>Published</option>
              <option value="draft" ${lesson?.status === 'draft' ? 'selected' : ''}>Draft</option>
            </select>
          </div>
          <div class="admin-confirm-actions" style="margin-top:16px">
            <button type="button" class="admin-btn admin-btn-secondary admin-btn-small" onclick="document.getElementById('lesson-modal').remove()">Cancel</button>
            <button type="submit" class="admin-btn admin-btn-primary admin-btn-small">${lesson ? 'Update Lesson' : 'Save Lesson'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#modal-lesson-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('#ml-title').value.trim();
      if (!title) return;

      const payload = {
        _action: lesson ? 'update_lesson' : 'create_lesson',
        id: lesson ? lesson.id : undefined,
        course_id: courseId,
        title,
        lesson_order: parseInt($('#ml-order').value, 10) || 0,
        video_url: $('#ml-video').value.trim() || null,
        resource_url: $('#ml-resource').value.trim() || null,
        description: $('#ml-desc').value.trim() || null,
        status: $('#ml-status').value,
      };

      try {
        await apiCall('admin-courses', 'POST', payload);
        modal.remove();
        loadLessonManager(courseId);
      } catch (err) {
        const msgEl = $('#modal-lesson-msg');
        msgEl.textContent = err.message || 'Failed to save lesson';
        msgEl.style.display = 'block';
      }
    });
  }

  async function deleteLesson(id, courseId) {
    if (!confirm('Delete this lesson?')) return;
    try {
      await apiCall('admin-courses', 'POST', { _action: 'delete_lesson', id, course_id: courseId });
      loadLessonManager(courseId);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // =========================================================================
  // 12. RESEARCH & PUBLICATIONS MANAGEMENT
  // =========================================================================
  async function loadResearch(stageFilter = 'ALL') {
    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">Research &amp; Publications</h1>
          <p class="admin-main-subtitle">PAPERS, DISCLOSURES &amp; EXPERIMENTAL DOSSIERS</p>
        </div>
        <button class="admin-btn admin-btn-primary admin-btn-small" onclick="window.adminApp.loadResearchForm()">
          + ADD RESEARCH
        </button>
      </div>

      <div class="admin-tabs" id="research-tabs">
        <button class="admin-tab ${stageFilter === 'ALL' ? 'active' : ''}" data-stage="ALL">ALL RESEARCH (ONGOING)</button>
        <button class="admin-tab ${stageFilter === 'draft' ? 'active' : ''}" data-stage="draft">DRAFTS</button>
      </div>

      <div class="admin-events-list" id="research-list">
        <div style="text-align:center;padding:40px"><div class="admin-spinner" style="margin:0 auto"></div></div>
      </div>
    `;

    $$('#research-tabs .admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#research-tabs .admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderResearchList(tab.dataset.stage);
      });
    });

    try {
      const res = await apiCall('admin-research');
      allResearch = res.research || [];
      renderResearchList(stageFilter);
    } catch (err) {
      $('#research-list').innerHTML = `<div class="admin-message error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderResearchList(filter = 'ALL') {
    const listEl = $('#research-list');
    if (!listEl) return;

    let filtered = allResearch;
    if (filter === 'draft') {
      filtered = allResearch.filter(r => r.publication_status === 'draft');
    }

    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="admin-empty-state">
          <h3>No research items found</h3>
          <p>Click "+ ADD RESEARCH" to record a research disclosure or publication.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(r => `
      <div class="admin-event-row" style="display:flex;justify-content:space-between;align-items:center;padding:16px;margin-bottom:12px;background:rgba(255,255,255,0.02);border:1px solid var(--cin-border);border-radius:10px">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:56px;height:48px;border-radius:8px;background:rgba(0,0,0,0.4);border:1px solid var(--cin-border);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${r.concept_image_url ? `<img src="${escapeHtml(r.concept_image_url)}" alt="${escapeHtml(r.title)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<span style=\\'font-size:10px;color:var(--cin-text-dim)\\'>PAPER</span>'"/>` : `<span style="font-family:var(--font-mono);font-size:10px;color:var(--cin-accent-bright)">PAPER</span>`}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <strong style="font-size:15px;color:var(--cin-text)">${escapeHtml(r.title)}</strong>
              <span class="admin-status-badge ${r.publication_status === 'published' ? 'admin-badge-present' : 'admin-badge-past'}">${r.publication_status.toUpperCase()}</span>
              <span class="admin-status-badge admin-badge-model">${escapeHtml(r.research_stage)}</span>
              ${r.featured ? `<span style="font-size:10px;color:#FCD34D;font-family:var(--font-mono)">★ FEATURED</span>` : ''}
            </div>
            <div style="font-size:13px;color:var(--cin-text-secondary);margin-top:2px">
              ${escapeHtml(r.research_division || 'HCI &amp; Simulation')} ${r.research_area ? `· ${escapeHtml(r.research_area)}` : ''}
            </div>
            <div style="font-size:11px;color:var(--cin-text-dim);margin-top:4px">
              Mentor: ${escapeHtml(r.mentor || 'Faculty Lead')} · Slug: <code>${escapeHtml(r.slug)}</code>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.editResearch('${r.id}')">Edit</button>
          <button class="admin-btn admin-btn-ghost admin-btn-tiny" onclick="window.adminApp.toggleResearchPublish('${r.id}', ${r.publication_status !== 'published'})">
            ${r.publication_status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
          <button class="admin-btn admin-btn-danger admin-btn-tiny" onclick="window.adminApp.deleteResearch('${r.id}', '${escapeHtml(r.title)}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  function loadResearchForm(item = null) {
    editingResearch = item;
    const isEdit = !!item;
    const r = item || {};

    const main = $('#admin-main');
    main.innerHTML = `
      <div class="admin-main-header">
        <div>
          <h1 class="admin-main-title">${isEdit ? 'Edit Research Item' : 'New Research Item'}</h1>
          <p class="admin-main-subtitle">RESEARCH DOSSIER, METHODOLOGY &amp; DELIVERABLES</p>
        </div>
        <button class="admin-btn admin-btn-secondary admin-btn-small" onclick="window.adminApp.switchSection('research')">
          ← BACK TO RESEARCH
        </button>
      </div>

      <div id="res-form-msg" class="admin-message" style="display:none"></div>

      <form id="research-form" class="admin-form">
        <!-- Overview -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Overview &amp; Division</h3>
          <div class="admin-form-grid">
            <div class="admin-field full-width">
              <label for="res-title">Research Title *</label>
              <input type="text" id="res-title" value="${escapeHtml(r.title || '')}" placeholder="e.g. Sub-Millimeter Spatial Tracking Accuracy in Holographic Headsets" required>
            </div>

            <div class="admin-field">
              <label for="res-stage">Research Stage *</label>
              <select id="res-stage">
                <option value="PROPOSED" ${r.research_stage === 'PROPOSED' ? 'selected' : ''}>PROPOSED (Initial Proposal)</option>
                <option value="ONGOING" ${r.research_stage === 'ONGOING' ? 'selected' : ''}>ONGOING (Active Laboratory Work)</option>
                <option value="EXPERIMENTAL" ${r.research_stage === 'EXPERIMENTAL' ? 'selected' : ''}>EXPERIMENTAL (Testing &amp; Rigging)</option>
                <option value="VALIDATION" ${r.research_stage === 'VALIDATION' ? 'selected' : ''}>VALIDATION (Peer Review / Testing)</option>
                <option value="COMPLETED" ${r.research_stage === 'COMPLETED' ? 'selected' : ''}>COMPLETED (Final Outcomes)</option>
                <option value="ARCHIVED" ${r.research_stage === 'ARCHIVED' ? 'selected' : ''}>ARCHIVED</option>
              </select>
            </div>

            <div class="admin-field">
              <label for="res-division">Research Division</label>
              <select id="res-division">
                <option value="Healthcare &amp; Surgical XR" ${r.research_division === 'Healthcare &amp; Surgical XR' ? 'selected' : ''}>Healthcare &amp; Surgical XR</option>
                <option value="Industrial Digital Twins" ${r.research_division === 'Industrial Digital Twins' ? 'selected' : ''}>Industrial Digital Twins</option>
                <option value="Autonomous Robotics &amp; Teleoperation" ${r.research_division === 'Autonomous Robotics &amp; Teleoperation' ? 'selected' : ''}>Autonomous Robotics &amp; Teleoperation</option>
                <option value="Cognitive Spatial UI/UX" ${r.research_division === 'Cognitive Spatial UI/UX' ? 'selected' : ''}>Cognitive Spatial UI/UX</option>
                <option value="Defense &amp; Aerospace Simulation" ${r.research_division === 'Defense &amp; Aerospace Simulation' ? 'selected' : ''}>Defense &amp; Aerospace Simulation</option>
                <option value="General Spatial Computing" ${r.research_division === 'General Spatial Computing' ? 'selected' : ''}>General Spatial Computing</option>
              </select>
            </div>

            <div class="admin-field">
              <label for="res-area">Research Area / Discipline</label>
              <input type="text" id="res-area" value="${escapeHtml(r.research_area || '')}" placeholder="e.g. Computer Vision, Haptics, SLAM">
            </div>

            <div class="admin-field">
              <label for="res-slug">URL Slug (leave blank to auto-generate)</label>
              <input type="text" id="res-slug" value="${escapeHtml(r.slug || '')}" placeholder="e.g. sub-millimeter-spatial-tracking">
            </div>

            <div class="admin-field full-width">
              <label for="res-short-summary">Short Executive Summary</label>
              <input type="text" id="res-short-summary" value="${escapeHtml(r.short_summary || '')}" placeholder="High-level 1-2 sentence abstract of the research question and findings">
            </div>

            <div class="admin-field full-width">
              <label for="res-problem">Problem Statement</label>
              <textarea id="res-problem" rows="3" placeholder="What core engineering or scientific challenge is this paper addressing?">${escapeHtml(r.problem_statement || '')}</textarea>
            </div>

            <div class="admin-field full-width">
              <label for="res-objectives">Objectives &amp; Methodology</label>
              <textarea id="res-methodology" rows="4" placeholder="Experimental rig, optical benchmark setups, statistical sampling models...">${escapeHtml(r.methodology || '')}</textarea>
            </div>

            <div class="admin-field full-width">
              <label for="res-findings">Key Findings &amp; Outcomes</label>
              <textarea id="res-findings" rows="3" placeholder="Validated results, latency reduction metrics, error tolerance thresholds...">${escapeHtml(r.findings || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Team & Dates -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Team &amp; Timeline</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label for="res-mentor">Faculty Mentor / Advisor</label>
              <input type="text" id="res-mentor" value="${escapeHtml(r.mentor || '')}" placeholder="e.g. MD Akif / Dr. Faculty Lead">
            </div>

            <div class="admin-field">
              <label for="res-team">Team Members (comma-separated)</label>
              <input type="text" id="res-team" value="${(r.team_members || []).join(', ')}" placeholder="Akif MD, Member 1, Member 2">
            </div>

            <div class="admin-field">
              <label for="res-start">Start Date</label>
              <input type="date" id="res-start" value="${r.start_date ? r.start_date.slice(0, 10) : ''}">
            </div>

            <div class="admin-field">
              <label for="res-completion">Completion Date (or Expected)</label>
              <input type="date" id="res-completion" value="${r.completion_date ? r.completion_date.slice(0, 10) : (r.expected_completion_date ? r.expected_completion_date.slice(0, 10) : '')}">
            </div>
          </div>
        </div>

        <!-- Media & Artifact Links -->
        <div class="admin-form-section">
          <h3 class="admin-form-section-title">Media &amp; Academic Deliverables</h3>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label for="res-concept-img">Concept Image URL (or Google Drive)</label>
              <input type="url" id="res-concept-img" value="${escapeHtml(r.concept_image_url || '')}" placeholder="https://drive.google.com/file/d/.../view or image URL">
              <div id="res-concept-preview" class="admin-media-preview-box"></div>
            </div>

            <div class="admin-field">
              <label for="res-demo-video">Demonstration Video URL (YouTube or Google Drive)</label>
              <input type="url" id="res-demo-video" value="${escapeHtml(r.demo_video_url || '')}" placeholder="https://youtube.com/watch?v=... or Google Drive video">
              <div id="res-demo-preview" class="admin-media-preview-box"></div>
            </div>

            <div class="admin-field">
              <label for="res-report-url">Full Report / Whitepaper PDF URL</label>
              <input type="url" id="res-report-url" value="${escapeHtml(r.report_url || '')}" placeholder="Google Drive PDF or arXiv link">
            </div>

            <div class="admin-field">
              <label for="res-pub-url">Published DOI / Paper Link</label>
              <input type="url" id="res-pub-url" value="${escapeHtml(r.publication_url || '')}" placeholder="https://doi.org/... or IEEE Xplore">
            </div>

            <div class="admin-field">
              <label for="res-github-url">GitHub Repository Link</label>
              <input type="url" id="res-github-url" value="${escapeHtml(r.github_url || '')}" placeholder="https://github.com/xrresearchlab/...">
            </div>

            <div class="admin-field">
              <label for="res-dataset-url">Dataset / Benchmark Archive Link</label>
              <input type="url" id="res-dataset-url" value="${escapeHtml(r.dataset_url || '')}" placeholder="Google Drive folder or Zenodo link">
            </div>

            <div class="admin-field">
              <label for="res-tech">Technologies (comma-separated)</label>
              <input type="text" id="res-tech" value="${(r.technologies || []).join(', ')}" placeholder="PyTorch, OpenXR, Three.js, OpenCV, C++">
            </div>

            <div class="admin-field">
              <label for="res-tags">Tags (comma-separated)</label>
              <input type="text" id="res-tags" value="${(r.tags || []).join(', ')}" placeholder="Spatial AI, HCI, Surgical VR">
            </div>

            <div class="admin-field">
              <label for="res-status">Publication Status</label>
              <select id="res-status">
                <option value="published" ${r.publication_status !== 'draft' && r.publication_status !== 'archived' ? 'selected' : ''}>Published — Visible on Research Page</option>
                <option value="draft" ${r.publication_status === 'draft' ? 'selected' : ''}>Draft — Internal / Not Published</option>
                <option value="archived" ${r.publication_status === 'archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>

            <div class="admin-field">
              <label for="res-order">Display Order</label>
              <input type="number" id="res-order" value="${r.display_order ?? 0}">
            </div>

            <div class="admin-field" style="display:flex;align-items:center;padding-top:24px">
              <label class="admin-toggle">
                <input type="checkbox" id="res-featured" ${r.featured ? 'checked' : ''}>
                <span>Pin as Featured Research Item</span>
              </label>
            </div>
          </div>
        </div>

        <div class="admin-form-actions">
          <button type="submit" class="admin-btn admin-btn-primary" id="res-submit-btn">
            ${isEdit ? 'UPDATE RESEARCH' : 'SAVE RESEARCH'}
          </button>
          <button type="button" class="admin-btn admin-btn-secondary" onclick="window.adminApp.switchSection('research')">
            CANCEL
          </button>
        </div>
      </form>
    `;

    // Live previews
    const imgInput = $('#res-concept-img');
    const imgBox = $('#res-concept-preview');
    if (imgInput && imgBox) {
      if (imgInput.value) window.XRMedia?.renderLivePreview(imgBox, imgInput.value, 'image');
      imgInput.addEventListener('input', () => {
        window.XRMedia?.renderLivePreview(imgBox, imgInput.value, 'image');
      });
    }

    const vidInput = $('#res-demo-video');
    const vidBox = $('#res-demo-preview');
    if (vidInput && vidBox) {
      if (vidInput.value) window.XRMedia?.renderLivePreview(vidBox, vidInput.value, 'video');
      vidInput.addEventListener('input', () => {
        window.XRMedia?.renderLivePreview(vidBox, vidInput.value, 'video');
      });
    }

    $('#research-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveResearch();
    });
  }

  async function saveResearch() {
    const msg = $('#res-form-msg');
    msg.style.display = 'none';

    const title = $('#res-title').value.trim();
    if (!title) {
      msg.className = 'admin-message error';
      msg.textContent = 'Research title is required';
      msg.style.display = 'block';
      return;
    }

    const payload = {
      title,
      slug: $('#res-slug').value.trim() || undefined,
      research_stage: $('#res-stage').value,
      research_division: $('#res-division').value,
      research_area: $('#res-area').value.trim() || null,
      short_summary: $('#res-short-summary').value.trim() || null,
      problem_statement: $('#res-problem').value.trim() || null,
      methodology: $('#res-methodology').value.trim() || null,
      findings: $('#res-findings').value.trim() || null,
      mentor: $('#res-mentor').value.trim() || null,
      team_members: $('#res-team').value.split(',').map(s => s.trim()).filter(Boolean),
      start_date: $('#res-start').value || null,
      completion_date: $('#res-completion').value || null,
      concept_image_url: $('#res-concept-img').value.trim() || null,
      demo_video_url: $('#res-demo-video').value.trim() || null,
      report_url: $('#res-report-url').value.trim() || null,
      publication_url: $('#res-pub-url').value.trim() || null,
      github_url: $('#res-github-url').value.trim() || null,
      dataset_url: $('#res-dataset-url').value.trim() || null,
      technologies: $('#res-tech').value.split(',').map(s => s.trim()).filter(Boolean),
      tags: $('#res-tags').value.split(',').map(s => s.trim()).filter(Boolean),
      publication_status: $('#res-status').value,
      display_order: parseInt($('#res-order').value, 10) || 0,
      featured: $('#res-featured').checked,
    };

    const submitBtn = $('#res-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SAVING...';

    try {
      if (editingResearch) {
        await apiCall(`admin-research?id=${editingResearch.id}`, 'PUT', payload);
      } else {
        await apiCall('admin-research', 'POST', payload);
      }

      msg.className = 'admin-message success';
      msg.textContent = editingResearch ? 'Research updated!' : 'Research created!';
      msg.style.display = 'block';

      setTimeout(() => loadResearch(), 1200);
    } catch (err) {
      msg.className = 'admin-message error';
      msg.textContent = err.message || 'Failed to save research';
      msg.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingResearch ? 'UPDATE RESEARCH' : 'SAVE RESEARCH';
    }
  }

  async function toggleResearchPublish(id, publish) {
    try {
      await apiCall('admin-research', 'POST', {
        _action: 'update_status',
        id,
        publication_status: publish ? 'published' : 'draft',
      });
      loadResearch();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function deleteResearch(id, title) {
    if (!confirm(`Delete research "${title}"? This cannot be undone.`)) return;
    try {
      await apiCall(`admin-research?id=${id}`, 'DELETE');
      loadResearch();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // Export methods to window.adminApp
  window.adminApp = window.adminApp || {};
  window.adminApp.loadMemberForm = loadMemberForm;
  window.adminApp.editLeadMember = editLeadMember;
  window.adminApp.editMember = async (id) => {
    try {
      const res = await apiCall(`admin-members?id=${id}`);
      loadMemberForm(res.member);
    } catch (e) { alert('Error: ' + e.message); }
  };
  window.adminApp.moveMemberStatus = moveMemberStatus;
  window.adminApp.deleteMember = deleteMember;

  window.adminApp.loadCourseForm = loadCourseForm;
  window.adminApp.editCourse = async (id) => {
    try {
      const res = await apiCall(`admin-courses?id=${id}`);
      loadCourseForm(res.course);
    } catch (e) { alert('Error: ' + e.message); }
  };
  window.adminApp.manageLessons = loadLessonManager;
  window.adminApp.openLessonModal = openLessonModal;
  window.adminApp.deleteLesson = deleteLesson;
  window.adminApp.toggleCoursePublish = toggleCoursePublish;
  window.adminApp.deleteCourse = deleteCourse;

  window.adminApp.loadResearchForm = loadResearchForm;
  window.adminApp.editResearch = async (id) => {
    try {
      const res = await apiCall(`admin-research?id=${id}`);
      loadResearchForm(res.research);
    } catch (e) { alert('Error: ' + e.message); }
  };
  window.adminApp.toggleResearchPublish = toggleResearchPublish;
  window.adminApp.deleteResearch = deleteResearch;

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
