/**
 * XR Research Lab — Cinematic Homepage Engine
 * Research division selector with video backgrounds, navigation, and transitions
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. RESEARCH DIVISIONS DATA
  //    Each division supports: title, description, video, poster, gradient
  //    Video fields are placeholders — swap with real 3D-rendered videos later.
  // =========================================================================
  const researchDivisions = [
    {
      key: 'engineering',
      title: 'ENGINEERING',
      description: 'Mechanical simulations, CAD model visualization, and structural digital twins built for real-time 3D engineering analysis.',
      video: null,       // Future: 'videos/engineering.mp4'
      poster: null,      // Future: 'images/posters/engineering.jpg'
      gradient: 'linear-gradient(135deg, #0a1628 0%, #0f1f3d 30%, #0b1223 60%, #060a12 100%)',
      projects: [],
      ctaLink: '#'
    },
    {
      key: 'placements',
      title: 'PLACEMENTS',
      description: 'Industry-ready training, technical skill showcases, and career placement portfolios in spatial technology.',
      video: null,
      poster: null,
      gradient: 'linear-gradient(135deg, #0d1117 0%, #161b22 30%, #0f1318 60%, #080a0e 100%)',
      projects: [],
      ctaLink: '#'
    },
    {
      key: 'healthcare',
      title: 'HEALTHCARE',
      description: 'Surgical VR training, medical anatomy visualization, and AR-assisted clinical simulations for next-generation healthcare.',
      video: null,
      poster: null,
      gradient: 'linear-gradient(135deg, #0a1220 0%, #0d1a2d 30%, #091018 60%, #060910 100%)',
      projects: [],
      ctaLink: '#'
    },
    {
      key: 'tourism',
      title: 'TOURISM & CULTURE',
      description: 'Heritage site preservation, virtual museum walkthroughs, and interactive cultural spatial experiences.',
      video: null,
      poster: null,
      gradient: 'linear-gradient(135deg, #120e0a 0%, #1a150d 30%, #0f0c08 60%, #0a0806 100%)',
      projects: [],
      ctaLink: '#'
    },
    {
      key: 'entertainment',
      title: 'ENTERTAINMENT',
      description: 'Interactive 3D spatial gaming, Holo-Stage performance simulators, and live WebGL audio-visual experiences.',
      video: null,
      poster: null,
      gradient: 'linear-gradient(135deg, #12081a 0%, #1a0d24 30%, #0f0814 60%, #08050a 100%)',
      projects: [
        {
          title: 'Entertainment 3D Interactive WebGL Demo Game',
          desc: 'Interactive WebGL 3D game experience built with Unity & WebGL, featuring real-time spatial graphics and controls.',
          tags: ['Unity 3D', 'WebGL Game', 'Spatial Computing'],
          status: 'Completed',
          isLiveDemo: true,
          actionKey: 'entertainment_demo',
          demoUrl: 'projects/entertainment/demo game/index.html'
        }
      ],
      ctaLink: '#'
    },
    {
      key: 'building',
      title: 'BUILDING & INFRASTRUCTURE',
      description: 'BIM architecture walkthroughs, civil engineering visualization, and smart city digital twins.',
      video: null,
      poster: null,
      gradient: 'linear-gradient(135deg, #0e0f12 0%, #14161c 30%, #0b0c0f 60%, #07080a 100%)',
      projects: [],
      ctaLink: '#'
    }
  ];


  // =========================================================================
  // 2. STATE
  // =========================================================================
  let activeDivisionIndex = 0;
  let isTransitioning = false;


  // =========================================================================
  // 3. DOM REFERENCES
  // =========================================================================
  let heroTitle, heroDesc, heroCta, heroBg, divisionTrack;


  // =========================================================================
  // 4. INITIALIZATION
  // =========================================================================
  function init() {
    heroTitle = document.getElementById('hero-title');
    heroDesc = document.getElementById('hero-desc');
    heroCta = document.getElementById('hero-cta');
    heroBg = document.getElementById('cin-hero-bg');
    divisionTrack = document.getElementById('cin-division-track');

    if (heroTitle && divisionTrack) {
      buildBackgrounds();
      buildDivisionSelector();
      selectDivision(0, true);
    }

    initNavigation();
    initHeaderScroll();
    initSmoothScroll();
    initGlowSystem();
  }

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#' || href === '') return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }


  // =========================================================================
  // 5. BUILD BACKGROUND ELEMENTS
  //    Creates one background element per division (video or placeholder gradient)
  // =========================================================================
  function buildBackgrounds() {
    researchDivisions.forEach((div, index) => {
      if (div.video) {
        // Video background
        const video = document.createElement('video');
        video.className = 'bg-video';
        video.setAttribute('muted', '');
        video.setAttribute('loop', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('preload', 'metadata');
        video.setAttribute('aria-hidden', 'true');
        if (div.poster) {
          video.setAttribute('poster', div.poster);
        }
        video.dataset.divIndex = index;

        const source = document.createElement('source');
        source.src = div.video;
        source.type = 'video/mp4';
        video.appendChild(source);

        heroBg.appendChild(video);
      } else {
        // Gradient placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'bg-placeholder';
        placeholder.style.background = div.gradient;
        placeholder.dataset.divIndex = index;
        heroBg.appendChild(placeholder);
      }
    });
  }


  // =========================================================================
  // 6. BUILD DIVISION SELECTOR (Bottom navigation)
  // =========================================================================
  function buildDivisionSelector() {
    researchDivisions.forEach((div, index) => {
      const item = document.createElement('button');
      item.className = 'cin-division-item';
      item.setAttribute('aria-label', `View ${div.title} division`);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      item.dataset.index = index;

      const number = String(index + 1).padStart(2, '0');

      item.innerHTML = `
        <span class="division-number">${number}</span>
        <span class="division-name">${div.title}</span>
      `;

      item.addEventListener('click', () => {
        if (!isTransitioning && activeDivisionIndex !== index) {
          selectDivision(index, false);
        }
      });

      divisionTrack.appendChild(item);
    });
  }


  // =========================================================================
  // 7. SELECT DIVISION — Core transition logic
  // =========================================================================
  function selectDivision(index, instant) {
    if (index < 0 || index >= researchDivisions.length) return;

    const division = researchDivisions[index];
    const prevIndex = activeDivisionIndex;
    activeDivisionIndex = index;

    // Update selector active state
    const items = divisionTrack.querySelectorAll('.cin-division-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === index);
      item.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });

    // Scroll active item into view on mobile
    const activeItem = items[index];
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    if (instant) {
      // Instant update (initial load)
      updateContent(division);
      updateBackground(index, prevIndex, true);
    } else {
      // Animated transition
      isTransitioning = true;

      // Exit animation for content
      heroTitle.classList.add('cin-content-exit');
      heroDesc.classList.add('cin-content-exit');
      heroCta.classList.add('cin-content-exit');

      // Crossfade background
      updateBackground(index, prevIndex, false);

      setTimeout(() => {
        updateContent(division);

        // Remove exit, add enter
        heroTitle.classList.remove('cin-content-exit');
        heroDesc.classList.remove('cin-content-exit');
        heroCta.classList.remove('cin-content-exit');

        heroTitle.classList.add('cin-content-enter');
        heroDesc.classList.add('cin-content-enter');
        heroCta.classList.add('cin-content-enter');

        setTimeout(() => {
          heroTitle.classList.remove('cin-content-enter');
          heroDesc.classList.remove('cin-content-enter');
          heroCta.classList.remove('cin-content-enter');
          isTransitioning = false;
        }, 500);
      }, 300);
    }
  }


  // =========================================================================
  // 8. UPDATE HERO CONTENT TEXT
  // =========================================================================
  function updateContent(division) {
    heroTitle.textContent = division.title;
    heroDesc.textContent = division.description;

    // Update CTA link to Project Space filtered by division
    heroCta.href = `project-space.html?type=experiential&division=${encodeURIComponent(division.title)}`;
    heroCta.querySelector('.cta-text').textContent = 'EXPLORE IN PROJECT SPACE';
  }


  // =========================================================================
  // 9. UPDATE BACKGROUND — Crossfade between divisions
  //    Only the active video plays; all others are paused.
  // =========================================================================
  function updateBackground(newIndex, oldIndex, instant) {
    const bgs = heroBg.children;

    for (let i = 0; i < bgs.length; i++) {
      const bg = bgs[i];
      const bgIndex = parseInt(bg.dataset.divIndex);

      if (bgIndex === newIndex) {
        bg.classList.add('active');
        // Play video if applicable
        if (bg.tagName === 'VIDEO') {
          bg.play().catch(() => {});
        }
      } else {
        if (instant) {
          bg.classList.remove('active');
        } else {
          // Delayed removal for crossfade
          bg.classList.remove('active');
        }
        // Pause inactive videos
        if (bg.tagName === 'VIDEO') {
          bg.pause();
        }
      }
    }
  }


  // =========================================================================
  // 10. NAVIGATION — Desktop dropdowns + Mobile menu
  // =========================================================================
  function initNavigation() {
    // Desktop Dropdowns (Explore & Connect)
    const dropdownWraps = document.querySelectorAll('.cin-nav-dropdown');

    dropdownWraps.forEach(wrap => {
      const trigger = wrap.querySelector('.cin-dropdown-trigger');
      const dropdown = wrap.querySelector('.cin-dropdown');

      if (trigger && dropdown) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const wasOpen = wrap.classList.contains('open');

          // Close all other dropdowns
          dropdownWraps.forEach(w => {
            if (w !== wrap) {
              w.classList.remove('open');
              const t = w.querySelector('.cin-dropdown-trigger');
              if (t) t.setAttribute('aria-expanded', 'false');
            }
          });

          // Toggle current
          wrap.classList.toggle('open', !wasOpen);
          trigger.setAttribute('aria-expanded', !wasOpen);
        });

        // Keyboard: Escape to close
        wrap.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            wrap.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
          }
        });
      }
    });

    // Close desktop dropdowns on outside click
    document.addEventListener('click', (e) => {
      dropdownWraps.forEach(wrap => {
        if (!wrap.contains(e.target)) {
          wrap.classList.remove('open');
          const trigger = wrap.querySelector('.cin-dropdown-trigger');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Mobile hamburger
    const hamburger = document.getElementById('cin-hamburger');
    const mobileOverlay = document.getElementById('cin-mobile-overlay');

    if (hamburger && mobileOverlay) {
      hamburger.addEventListener('click', () => {
        const isOpen = hamburger.classList.toggle('open');
        mobileOverlay.classList.toggle('open', isOpen);
        hamburger.setAttribute('aria-expanded', isOpen);
        mobileOverlay.setAttribute('aria-hidden', !isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
      });

      // Close on overlay click outside menu
      mobileOverlay.addEventListener('click', (e) => {
        if (e.target === mobileOverlay) {
          hamburger.classList.remove('open');
          mobileOverlay.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
          mobileOverlay.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
      });

      // Close on regular link click
      mobileOverlay.querySelectorAll('.cin-mobile-link:not(.cin-mobile-accordion-trigger), .cin-mobile-sub').forEach(link => {
        link.addEventListener('click', () => {
          hamburger.classList.remove('open');
          mobileOverlay.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
          mobileOverlay.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        });
      });
    }

    // Mobile accordions (Explore & Connect)
    const mobileAccordions = document.querySelectorAll('.cin-mobile-accordion');
    mobileAccordions.forEach(acc => {
      const trigger = acc.querySelector('.cin-mobile-accordion-trigger');
      const dropdown = acc.querySelector('.cin-mobile-dropdown');

      if (trigger && dropdown) {
        trigger.addEventListener('click', () => {
          const isOpen = dropdown.classList.toggle('open');
          trigger.setAttribute('aria-expanded', isOpen);
          const chevron = trigger.querySelector('.mobile-chevron');
          if (chevron) chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
        });
      }
    });
  }


  // =========================================================================
  // 11. HEADER SCROLL BEHAVIOR
  // =========================================================================
  function initHeaderScroll() {
    const header = document.getElementById('cin-header');
    if (!header) return;

    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 40) {
            header.classList.add('scrolled');
          } else {
            header.classList.remove('scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }


  // =========================================================================
  // 12. KEYBOARD NAVIGATION FOR DIVISION SELECTOR
  // =========================================================================
  document.addEventListener('keydown', (e) => {
    // Only when focus is on division items or hero area
    const hero = document.getElementById('cin-hero');
    if (!hero) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      const next = (activeDivisionIndex + 1) % researchDivisions.length;
      selectDivision(next, false);
      const items = divisionTrack?.querySelectorAll('.cin-division-item');
      if (items && items[next]) items[next].focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      const prev = (activeDivisionIndex - 1 + researchDivisions.length) % researchDivisions.length;
      selectDivision(prev, false);
      const items = divisionTrack?.querySelectorAll('.cin-division-item');
      if (items && items[prev]) items[prev].focus();
    }
  });


  // =========================================================================
  // 14. DYNAMIC GLOW & WAVE INTERACTION SYSTEM (Tasks 1, 2, 3)
  // =========================================================================
  function initGlowSystem() {
    // Prevent multiple initializations
    if (document.getElementById('glow-interactive-layer')) return;

    const isTouchOnly = () => {
      return (
        window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
        (window.innerWidth <= 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0))
      );
    };

    // Create Main Glow Container
    const glowLayer = document.createElement('div');
    glowLayer.id = 'glow-interactive-layer';
    glowLayer.className = 'glow-interactive-layer';
    glowLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glowLayer);

    // Desktop Elements (Task 1: Pure Glow Aura)
    const cursorAura = document.createElement('div');
    cursorAura.className = 'glow-cursor-desktop glow-cursor-aura';
    glowLayer.appendChild(cursorAura);

    // Mobile / Android Touch Element (Task 3)
    const touchGlow = document.createElement('div');
    touchGlow.className = 'glow-touch-point';
    glowLayer.appendChild(touchGlow);

    // Coordinate & state tracking
    let mouseX = -500;
    let mouseY = -500;
    let auraX = -500;
    let auraY = -500;
    let isMouseOnScreen = false;
    let isTouching = false;
    let activeBox = null;
    let lastWaveTime = 0;
    let lastWaveX = -1000;
    let lastWaveY = -1000;

    // Helper: spawn radiating wave ripples
    function spawnWave(x, y, isClick = false) {
      if (isTouching || isTouchOnly() || activeBox) return;
      const wave = document.createElement('div');
      wave.className = isClick ? 'glow-cursor-wave wave-click' : 'glow-cursor-wave';
      wave.style.left = `${x}px`;
      wave.style.top = `${y}px`;
      glowLayer.appendChild(wave);

      setTimeout(() => {
        if (wave.parentNode) wave.parentNode.removeChild(wave);
      }, isClick ? 800 : 700);
    }

    // --- Task 1: Desktop Mouse Movement & Waves ---
    window.addEventListener('mousemove', (e) => {
      if (isTouching) return;

      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!isMouseOnScreen) {
        isMouseOnScreen = true;
        auraX = mouseX;
        auraY = mouseY;
        if (!activeBox) {
          cursorAura.style.opacity = '1';
        }
      } else if (!activeBox && !cursorAura.classList.contains('in-box')) {
        cursorAura.style.opacity = '1';
      }

      // Generate radiating energy wave pulses along cursor path (only outside boxes)
      const now = performance.now();
      const dist = Math.hypot(mouseX - lastWaveX, mouseY - lastWaveY);
      if (!activeBox && dist > 50 && (now - lastWaveTime > 120)) {
        spawnWave(mouseX, mouseY, false);
        lastWaveX = mouseX;
        lastWaveY = mouseY;
        lastWaveTime = now;
      }
    }, { passive: true });

    window.addEventListener('mousedown', (e) => {
      if (isTouching || isTouchOnly() || activeBox) return;
      spawnWave(e.clientX, e.clientY, true);
    });

    document.addEventListener('mouseleave', () => {
      isMouseOnScreen = false;
      cursorAura.style.opacity = '0';
      if (activeBox) {
        activeBox.classList.remove('is-glow-active');
        activeBox = null;
      }
      cursorAura.classList.remove('in-box');
    });

    // --- Task 2: Box Glow & Spotlight System ---
    const boxSelectors = [
      '.cin-division-item',
      '.intro-btn-primary',
      '.intro-btn-secondary',
      '.cin-hero-cta',
      '.cin-nav-cta',
      '.cin-nav-dropdown-item',
      '.about-card',
      '.stat-card',
      '.member-card',
      '.feature-card',
      '.objective-card',
      '.timeline-card',
      '.resource-card',
      '.project-card',
      '.cin-card',
      '.intro-badge',
      '.domain-card',
      '.glass-card',
      '.info-card',
      '.hero-statement-card',
      '.vm-card',
      '.philo-card',
      '.lead-card',
      '.step-card',
      '.curriculum-card',
      '.overview-block',
      '[data-glow-box]'
    ].join(', ');

    document.addEventListener('mousemove', (e) => {
      if (isTouching || isTouchOnly()) return;

      const box = e.target.closest(boxSelectors);

      if (box) {
        if (activeBox && activeBox !== box) {
          activeBox.classList.remove('is-glow-active');
        }
        activeBox = box;
        box.classList.add('is-glow-active');

        // Suppress cursor glow completely while inside a box so only the box glows
        cursorAura.classList.add('in-box');
        cursorAura.style.opacity = '0';

        const rect = box.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        box.style.setProperty('--box-glow-x', `${relX}px`);
        box.style.setProperty('--box-glow-y', `${relY}px`);
      } else if (activeBox) {
        activeBox.classList.remove('is-glow-active');
        activeBox = null;

        // Restore cursor glow when leaving the box
        cursorAura.classList.remove('in-box');
        if (isMouseOnScreen) {
          cursorAura.style.opacity = '1';
        }
      }
    }, { passive: true });

    // --- Task 3: Mobile & Android Finger Touch Glow ---
    function spawnTouchRipple(x, y) {
      const ripple = document.createElement('div');
      ripple.className = 'glow-touch-ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      glowLayer.appendChild(ripple);

      setTimeout(() => {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 650);
    }

    window.addEventListener('touchstart', (e) => {
      isTouching = true;
      // Suppress desktop cursor aura completely
      cursorAura.style.opacity = '0';

      const touch = e.touches[0];
      if (touch) {
        touchGlow.style.left = `${touch.clientX}px`;
        touchGlow.style.top = `${touch.clientY}px`;
        touchGlow.classList.add('active');
        spawnTouchRipple(touch.clientX, touch.clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      if (touch) {
        touchGlow.style.left = `${touch.clientX}px`;
        touchGlow.style.top = `${touch.clientY}px`;
      }
    }, { passive: true });

    const handleTouchEnd = () => {
      touchGlow.classList.remove('active');
      setTimeout(() => {
        isTouching = false;
      }, 350);
    };

    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    // --- High-Performance GPU Render Loop ---
    function render() {
      if (isMouseOnScreen && !isTouching && !isTouchOnly()) {
        // Fluid, aerodynamic ambient aura trailing
        auraX += (mouseX - auraX) * 0.22;
        auraY += (mouseY - auraY) * 0.22;

        cursorAura.style.transform = `translate3d(${auraX}px, ${auraY}px, 0) translate(-50%, -50%)`;
      }

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  }


  // =========================================================================
  // 13. INIT ON DOM READY
  // =========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
