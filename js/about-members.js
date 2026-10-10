/**
 * XR Research Lab — About Page Dynamic Members Integration
 * Loads and renders live lab members from /api/members-public (connected to Admin Panel)
 * Supports 3D Model Viewers, Avatar Portraits, Role/Year Meta Badges, and Active/Alumni filtering.
 */

(function () {
  'use strict';

  let allMembers = [];
  let currentFilter = 'PRESENT'; // Default to active researchers

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveModelUrl(rawUrl) {
    if (!rawUrl) return '';
    if (window.XRMedia && typeof window.XRMedia.parseGoogleDriveUrl === 'function') {
      const drive = window.XRMedia.parseGoogleDriveUrl(rawUrl);
      if (drive && drive.downloadUrl) return drive.downloadUrl;
    }
    return rawUrl;
  }

  function resolveImageUrl(rawUrl) {
    if (!rawUrl) return '';
    if (window.XRMedia && typeof window.XRMedia.parseGoogleDriveUrl === 'function') {
      const drive = window.XRMedia.parseGoogleDriveUrl(rawUrl);
      if (drive && drive.imageUrl) return drive.imageUrl;
    }
    return rawUrl;
  }

  async function fetchPublicMembers() {
    try {
      let res = await fetch('/api/members-public');
      if (!res.ok) {
        res = await fetch('/.netlify/functions/members-public');
      }
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.members) ? data.members : null;
    } catch (err) {
      console.warn('XR Lab: Could not load dynamic members from API, keeping fallback cards.', err);
      return null;
    }
  }

  function renderMemberCards(gridEl, members) {
    let filtered = members;
    if (currentFilter !== 'ALL') {
      filtered = members.filter(m => m.status === currentFilter);
    }

    if (!filtered || filtered.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 24px; background: rgba(10, 14, 24, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; color: var(--cin-text-secondary, #94a3b8);">
          <div style="font-size: 28px; margin-bottom: 12px;">👥</div>
          <h4 style="color: #fff; font-size: 16px; margin: 0 0 6px;">No members listed in this category</h4>
          <p style="font-size: 13px; margin: 0; color: var(--cin-text-dim, #64748b);">Active and alumni members can be added and managed via the XR Lab Admin Panel.</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = filtered.map((m, idx) => {
      const hasModel = !!m.model_url;
      const modelSrc = hasModel ? resolveModelUrl(m.model_url) : '';
      const imgSrc = m.fallback_image_url ? resolveImageUrl(m.fallback_image_url) : '';
      const orderNum = String((m.display_order || (idx + 1))).padStart(2, '0');

      // Top Avatar / 3D Box
      let visualBox = '';
      if (hasModel) {
        visualBox = `
          <div class="member-3d-viewport">
            <span class="member-3d-tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              3D MODEL
            </span>
            <model-viewer
              src="${escapeHtml(modelSrc)}"
              auto-rotate
              camera-controls
              shadow-intensity="1"
              exposure="1"
              loading="lazy"
              alt="${escapeHtml(m.full_name)} 3D Avatar">
            </model-viewer>
          </div>
        `;
      } else if (imgSrc) {
        visualBox = `
          <div class="member-avatar-box member-avatar-photo">
            <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(m.full_name)}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'avatar-placeholder-icon\\'>${escapeHtml(orderNum)}</span>'"/>
          </div>
        `;
      } else {
        visualBox = `
          <div class="member-avatar-box">
            <span class="avatar-placeholder-icon">${escapeHtml(orderNum)}</span>
          </div>
        `;
      }

      // Meta Badges from tagline / status
      let metaBadgesHtml = '';
      if (m.tagline) {
        const parts = m.tagline.split(/[•,|]/).map(s => s.trim()).filter(Boolean);
        if (parts.length) {
          metaBadgesHtml = parts.map(p => `<span class="meta-badge">${escapeHtml(p)}</span>`).join('');
        }
      }
      const statusBadge = m.status === 'PAST' 
        ? `<span class="meta-badge status-alumni">Alumni</span>`
        : `<span class="meta-badge status-active">Active</span>`;
      metaBadgesHtml += statusBadge;

      // Contact Row
      let contactRows = '';
      if (m.email) {
        contactRows += `<span>EMAIL: <a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></span>`;
      }
      if (m.public_profile_url) {
        contactRows += `<span>PROFILE: <a href="${escapeHtml(m.public_profile_url)}" target="_blank" rel="noopener noreferrer">View Portfolio &rarr;</a></span>`;
      }
      if (!contactRows) {
        contactRows = `<span>AFFILIATION: <strong style="color:var(--cin-text-secondary)">GCET XR Research Lab</strong></span>`;
      }

      return `
        <div class="member-card ${m.role && m.role.toLowerCase().includes('lead') ? 'head-card' : ''}" data-status="${escapeHtml(m.status)}">
          ${visualBox}
          <div class="member-name">${escapeHtml(m.full_name)}</div>
          <div class="member-role">${escapeHtml(m.role || 'Researcher')}</div>
          <div class="member-meta">${metaBadgesHtml}</div>
          <p class="member-desc">${escapeHtml(m.about || m.tagline || 'Contributing to spatial computing and immersive technologies.')}</p>
          <div class="member-contact-row">
            ${contactRows}
          </div>
        </div>
      `;
    }).join('');
  }

  async function initAboutMembers() {
    const gridEl = document.getElementById('about-member-grid');
    if (!gridEl) return;

    // Filter Buttons
    const filterButtons = document.querySelectorAll('.about-team-filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'PRESENT';
        if (allMembers && allMembers.length > 0) {
          renderMemberCards(gridEl, allMembers);
        } else {
          // If using static fallback, filter static cards by data-status
          const staticCards = gridEl.querySelectorAll('.member-card');
          staticCards.forEach(card => {
            const status = card.dataset.status || 'PRESENT';
            if (currentFilter === 'ALL' || status === currentFilter) {
              card.style.display = '';
            } else {
              card.style.display = 'none';
            }
          });
        }
      });
    });

    // Fetch members from database
    const members = await fetchPublicMembers();
    if (members && members.length > 0) {
      allMembers = members;
      renderMemberCards(gridEl, allMembers);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAboutMembers);
  } else {
    initAboutMembers();
  }
})();
