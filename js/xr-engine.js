/**
 * AR/VR Research Lab - Spatial Computing XR OS Engine
 * Inspired by VisionOS, Meta Quest Horizon OS, & High-End Sci-Fi Interfaces
 */

(function () {
  'use strict';

  // Apply saved theme immediately on script execution to prevent FOUC
  try {
    const savedTheme = localStorage.getItem('xr_theme');
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (document.body) {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.classList.remove('dark-mode');
          document.body.classList.add('light-mode');
        });
      }
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (document.body) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.classList.add('dark-mode');
          document.body.classList.remove('light-mode');
        });
      }
    }
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }

  // =========================================================================
  // 1. WEB AUDIO API SPATIAL UI SOUND SYNTHESIZER (ZERO EXTERNAL ASSETS)
  // =========================================================================
  class XRSoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
          this.initialized = true;
        }
      } catch (e) {
        console.warn('Web Audio API not supported', e);
      }
    }

    playHover() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.03);

      gain.gain.setValueAtTime(0.015, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    }

    playClick() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.05);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    }

    playSwoosh() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }
  }

  const xrSound = new XRSoundEngine();

  // Initialize AudioContext on first user interaction
  const unlockAudio = () => {
    xrSound.init();
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
  };
  document.addEventListener('click', unlockAudio);
  document.addEventListener('keydown', unlockAudio);


  // =========================================================================
  // 2. 3D SPATIAL BACKGROUND CANVAS ENGINE WITH SCROLL EXPANSION ANIMATION
  // =========================================================================
  // 2. 3D SPATIAL BACKGROUND SCENE ENGINE
  // =========================================================================


  // =========================================================================
  // 3. 3D SPATIAL PARALLAX & VOLUMETRIC SPECULAR TILT ENGINE
  // =========================================================================
  function initSpatialTiltEngine() {
    const tiltSelector = '.glass-card, .info-card, .member-card, .hero-statement-card, .quote-banner, .vm-card, .philo-card, .lead-card, .grid5 .cell';
    const tiltElements = document.querySelectorAll(tiltSelector);
    const isPointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    tiltElements.forEach(el => {
      // Inject Specular Sheen element if missing
      if (!el.querySelector('.specular-sheen')) {
        const sheen = document.createElement('div');
        sheen.className = 'specular-sheen';
        el.appendChild(sheen);
      }

      if (!isPointerFine) return; // Disable 3D tilt transform on touch devices to ensure smooth scrolling

      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const elX = (mouseX / rect.width) - 0.5;
        const elY = (mouseY / rect.height) - 0.5;

        // 3D Parallax Rotation Pitch & Yaw
        const rotX = -elY * 16; // 16 deg max pitch tilt
        const rotY = elX * 16;  // 16 deg max yaw tilt

        el.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(16px) scale(1.025)`;
        el.style.borderColor = 'rgba(197, 179, 211, 0.55)';
        el.style.boxShadow = `0 24px 50px rgba(197, 179, 211, 0.25), 0 0 30px rgba(245, 203, 203, 0.3)`;

        // Update Dynamic Holographic Specular Light Sheen Coordinates
        const percentX = ((mouseX / rect.width) * 100).toFixed(1);
        const percentY = ((mouseY / rect.height) * 100).toFixed(1);
        el.style.setProperty('--sheen-x', `${percentX}%`);
        el.style.setProperty('--sheen-y', `${percentY}%`);
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(1)';
        el.style.borderColor = '';
        el.style.boxShadow = '';
      });
    });
  }


  // =========================================================================
  // 4. HEADSET BOOT SEQUENCE LOADING SCREEN CONTROLLER
  // =========================================================================
  function initBootSequence() {
    // Inject Boot Screen HTML if missing
    let bootScreen = document.getElementById('xr-boot-screen');
    if (!bootScreen) {
      bootScreen = document.createElement('div');
      bootScreen.id = 'xr-boot-screen';
      bootScreen.innerHTML = `
        <div class="boot-content">
          <div class="simple-3d-spinner">
            <div class="spinner-ring ring-1"></div>
            <div class="spinner-ring ring-2"></div>
            <div class="spinner-ring ring-3"></div>
            <div class="spinner-core"></div>
          </div>
          <h2 class="boot-title"><span class="w-cyan">AR/VR</span> <span class="w-white">RESEARCH</span> <span class="w-coral">LAB</span></h2>
          <div class="boot-progress-bar">
            <div class="boot-progress-fill" id="boot-fill"></div>
          </div>
          <div class="boot-ticker" id="boot-ticker">LOADING...</div>
        </div>
      `;
      document.body.prepend(bootScreen);
    }

    const fill = document.getElementById('boot-fill');
    const ticker = document.getElementById('boot-ticker');
    const steps = [
      "LOADING...",
      "PREPARING EXPERIENCE...",
      "READY"
    ];

    let progress = 0;
    let stepIdx = 0;

    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 30) + 20;
      if (progress > 100) progress = 100;

      if (fill) fill.style.width = progress + '%';

      if (ticker && stepIdx < steps.length) {
        ticker.innerText = steps[stepIdx];
        stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          bootScreen.classList.add('boot-done');
          xrSound.playSwoosh();
          setTimeout(() => {
            if (bootScreen.parentNode) bootScreen.parentNode.removeChild(bootScreen);
          }, 400);
        }, 150);
      }
    }, 80);
  }


  // =========================================================================
  // 5. VISIONOS FLOATING NAVIGATION BAR SCROLL CONTROLLER
  // =========================================================================
  function initSpatialHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    // Shrink and blur on scroll
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // =========================================================================
  // 5B. RESPONSIVE MOBILE DRAWER NAVIGATION CONTROLLER
  // =========================================================================
  function initMobileNav() {
    // Navigation links are rendered as a clean horizontal scrollable tab bar on mobile.
    // Clean up any stale drawer close button if present
    const closeBtn = document.querySelector('.nav-close-btn');
    if (closeBtn && closeBtn.parentNode) {
      closeBtn.parentNode.removeChild(closeBtn);
    }
  }


  // =========================================================================
  // 6. VISIONOS FLOATING SPATIAL MODAL (PROJECT SHOWCASE)
  // =========================================================================
  function initSpatialModal() {
    let modal = document.getElementById('xr-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'xr-modal';
      modal.className = 'xr-modal';
      modal.innerHTML = `
        <div class="xr-modal-backdrop"></div>
        <div class="xr-modal-window">
          <button class="xr-modal-close" id="xr-modal-close" aria-label="Close Window">✕</button>
          <div class="xr-modal-header"></div>
          <div class="xr-modal-body"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  // =========================================================================
  // 1B. DARK MODE THEME CONTROLLER WITH LOCALSTORAGE PERSISTENCE (UPDATE 1)
  // =========================================================================
  function initThemeToggle() {
    const savedTheme = localStorage.getItem('xr_theme');
    // Default to dark mode unless user explicitly chose light
    if (savedTheme === 'light') {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    const attachToggleBtn = (btn) => {
      if (!btn || btn.dataset.themeBound) return;
      btn.dataset.themeBound = 'true';

      const updateLabel = () => {
        const isDark = document.body.classList.contains('dark-mode') || document.documentElement.getAttribute('data-theme') === 'dark';
        btn.innerHTML = isDark ? '🌙 Dark' : '☀️ Light';
        btn.setAttribute('aria-label', `Switch to ${isDark ? 'Light' : 'Dark'} mode`);
      };
      updateLabel();

      btn.addEventListener('click', () => {
        const isCurrentlyDark = document.body.classList.contains('dark-mode');
        if (isCurrentlyDark) {
          // Switch to light mode
          document.body.classList.remove('dark-mode');
          document.body.classList.add('light-mode');
          document.documentElement.setAttribute('data-theme', 'light');
          localStorage.setItem('xr_theme', 'light');
        } else {
          // Switch to dark mode
          document.body.classList.add('dark-mode');
          document.body.classList.remove('light-mode');
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('xr_theme', 'dark');
        }
        updateLabel();
        if (typeof xrSound !== 'undefined' && xrSound.playClick) {
          xrSound.playClick();
        }
      });
    };

    // Attach to existing toggle buttons or inject into header if missing
    document.querySelectorAll('.theme-toggle-btn, #theme-toggle').forEach(attachToggleBtn);

    // Auto inject theme button into header right side if not present
    const headerTop = document.querySelector('.header-top');
    if (headerTop && !document.querySelector('#theme-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'theme-toggle';
      btn.className = 'theme-toggle-btn';
      headerTop.appendChild(btn);
      attachToggleBtn(btn);
    }
  }


  // =========================================================================
  // 2. 3D SPATIAL SPACE CANVAS SCENE (ENLARGED PLANET, 3 ORBITING SATELLITES, & ULTRA-TINY ALIEN ASTRONAUTS WITH PHYSICS THRUSTERS)
  // =========================================================================
  function init3DBackgroundScene() {
    let container = document.getElementById('canvas-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'canvas-container';
      document.body.insertBefore(container, document.body.firstChild);
    }
    if (container.querySelector('canvas') || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();

    const width = window.innerWidth;
    const height = window.innerHeight;

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xc5b3d3, 1.4);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    // Main 3D Space Master Group
    const spaceGroup = new THREE.Group();
    scene.add(spaceGroup);

    // -------------------------------------------------------------------------
    // A. ULTRA-TINY ALIEN CHARACTERS WITH SPINNING PROPELLERS & JETPACK THRUSTERS
    // -------------------------------------------------------------------------
    function createCartoonCharacter(colorHex, scale = 1) {
      const charGroup = new THREE.Group();

      // Cartoon Head
      const headGeo = new THREE.SphereGeometry(0.55 * scale, 24, 24);
      const headMat = new THREE.MeshToonMaterial({ color: colorHex });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.5 * scale;
      charGroup.add(head);

      // Cute Visor / Eyes
      const eyeGeo = new THREE.SphereGeometry(0.24 * scale, 16, 16);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222233 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 0.55 * scale, 0.42 * scale);
      eye.scale.set(1.4, 0.9, 0.5);
      charGroup.add(eye);

      // Antenna Stem
      const antStemGeo = new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, 0.35 * scale);
      const antStemMat = new THREE.MeshToonMaterial({ color: 0xcccccc });
      const antStem = new THREE.Mesh(antStemGeo, antStemMat);
      antStem.position.set(0, 1.1 * scale, 0);
      charGroup.add(antStem);

      // Antenna Ball
      const antBallGeo = new THREE.SphereGeometry(0.12 * scale, 12, 12);
      const antBallMat = new THREE.MeshBasicMaterial({ color: 0xf5cbcb });
      const antBall = new THREE.Mesh(antBallGeo, antBallMat);
      antBall.position.set(0, 1.3 * scale, 0);
      charGroup.add(antBall);

      // --- PROPELLER ON HEAD/ANTENNA ---
      const propellerGroup = new THREE.Group();
      propellerGroup.position.set(0, 1.42 * scale, 0);
      
      const propHubGeo = new THREE.CylinderGeometry(0.06 * scale, 0.06 * scale, 0.08 * scale, 12);
      const propHubMat = new THREE.MeshStandardMaterial({ color: 0x444455, metalness: 0.8 });
      const propHub = new THREE.Mesh(propHubGeo, propHubMat);
      propellerGroup.add(propHub);

      // 3 Spinning Propeller Blades
      for (let b = 0; b < 3; b++) {
        const bladeGeo = new THREE.BoxGeometry(0.55 * scale, 0.02 * scale, 0.12 * scale);
        const bladeMat = new THREE.MeshToonMaterial({ color: 0xeeeeff });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        const bAngle = (b * Math.PI * 2) / 3;
        blade.position.set(Math.cos(bAngle) * 0.25 * scale, 0, Math.sin(bAngle) * 0.25 * scale);
        blade.rotation.y = -bAngle + 0.2;
        propellerGroup.add(blade);
      }
      charGroup.add(propellerGroup);
      charGroup.userData.propeller = propellerGroup;

      // Cartoon Body
      const bodyGeo = new THREE.CylinderGeometry(0.38 * scale, 0.45 * scale, 0.7 * scale, 16);
      const bodyMat = new THREE.MeshToonMaterial({ color: 0xffffff });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = -0.15 * scale;
      charGroup.add(body);

      // Jetpack Backpack
      const packGeo = new THREE.BoxGeometry(0.45 * scale, 0.55 * scale, 0.3 * scale);
      const packMat = new THREE.MeshToonMaterial({ color: colorHex });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.set(0, -0.1 * scale, -0.4 * scale);
      charGroup.add(pack);

      // --- TWIN JETPACK THRUSTERS & FLAMES ---
      const flames = [];
      const nozPositions = [-0.16 * scale, 0.16 * scale];

      nozPositions.forEach(posX => {
        // Metallic Thruster Nozzle
        const nozGeo = new THREE.CylinderGeometry(0.07 * scale, 0.12 * scale, 0.22 * scale, 12);
        const nozMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.2 });
        const noz = new THREE.Mesh(nozGeo, nozMat);
        noz.position.set(posX, -0.42 * scale, -0.4 * scale);
        noz.rotation.x = Math.PI;
        charGroup.add(noz);

        // Glowing Thruster Flame
        const flameGeo = new THREE.ConeGeometry(0.11 * scale, 0.38 * scale, 12);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9900, transparent: true, opacity: 0.9 });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(posX, -0.68 * scale, -0.4 * scale);
        flame.rotation.x = Math.PI;
        charGroup.add(flame);
        flames.push(flame);
      });
      charGroup.userData.flames = flames;

      // Alien Exhaust Particle Stream
      const pCount = 14;
      const pGeo = new THREE.BufferGeometry();
      const pPos = new Float32Array(pCount * 3);
      for (let p = 0; p < pCount; p++) {
        pPos[p * 3] = (Math.random() - 0.5) * 0.15 * scale;
        pPos[p * 3 + 1] = -0.5 * scale - Math.random() * 0.4 * scale;
        pPos[p * 3 + 2] = -0.4 * scale + (Math.random() - 0.5) * 0.15 * scale;
      }
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        color: 0xffcc44,
        size: 0.08 * scale,
        transparent: true,
        opacity: 0.8
      });
      const pParticles = new THREE.Points(pGeo, pMat);
      charGroup.add(pParticles);
      charGroup.userData.pParticles = pParticles;

      return charGroup;
    }

    // Ultra-tiny Aliens roaming around space (scales reduced to 0.12, 0.09, 0.07 so they look very very small)
    const cartoon1 = createCartoonCharacter(0xc5b3d3, 0.12);
    cartoon1.position.set(-2.8, 1.2, 1.0);
    spaceGroup.add(cartoon1);

    const cartoon2 = createCartoonCharacter(0xf5cbcb, 0.09);
    cartoon2.position.set(2.8, -1.2, 1.2);
    spaceGroup.add(cartoon2);

    const cartoon3 = createCartoonCharacter(0x64ffda, 0.07);
    cartoon3.position.set(1.5, 1.8, 0.8);
    spaceGroup.add(cartoon3);

    // -------------------------------------------------------------------------
    // B. 3 HIGH-TECH MINI SATELLITES ORBITING IN DIFFERENT WAYS
    // -------------------------------------------------------------------------
    function createSatellite(solarColorHex = 0x38bdf8, scale = 0.2) {
      const satGroup = new THREE.Group();

      // Main Satellite Chassis Box
      const bodyGeo = new THREE.BoxGeometry(0.5 * scale, 0.5 * scale, 0.7 * scale);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.85, roughness: 0.2 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      satGroup.add(body);

      // Gold Foil Thermal Insulation Shield
      const foilGeo = new THREE.BoxGeometry(0.42 * scale, 0.42 * scale, 0.06 * scale);
      const foilMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.1 });
      const foil = new THREE.Mesh(foilGeo, foilMat);
      foil.position.z = 0.36 * scale;
      satGroup.add(foil);

      // Parabolic Dish Antenna
      const dishGeo = new THREE.CylinderGeometry(0.35 * scale, 0.05 * scale, 0.15 * scale, 16);
      const dishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.3 });
      const dish = new THREE.Mesh(dishGeo, dishMat);
      dish.position.set(0, 0.38 * scale, 0);
      dish.rotation.x = -Math.PI / 4;
      satGroup.add(dish);

      // Dish Feed Horn Pin
      const pinGeo = new THREE.CylinderGeometry(0.02 * scale, 0.02 * scale, 0.25 * scale);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(0, 0.48 * scale, 0.1 * scale);
      satGroup.add(pin);

      // Dual Solar Panel Wings
      const panelWidth = 1.1 * scale;
      const panelHeight = 0.4 * scale;

      [-1, 1].forEach(side => {
        const armGeo = new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, 0.3 * scale);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x444455 });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.rotation.z = Math.PI / 2;
        arm.position.x = side * 0.38 * scale;
        satGroup.add(arm);

        const panelGeo = new THREE.BoxGeometry(panelWidth, panelHeight, 0.03 * scale);
        const panelMat = new THREE.MeshStandardMaterial({ color: solarColorHex, metalness: 0.6, roughness: 0.3 });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.x = side * (0.38 * scale + panelWidth / 2);
        satGroup.add(panel);

        const gridGeo = new THREE.BoxGeometry(panelWidth * 0.96, panelHeight * 0.92, 0.04 * scale);
        const gridMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.45 });
        const grid = new THREE.Mesh(gridGeo, gridMat);
        grid.position.x = side * (0.38 * scale + panelWidth / 2);
        satGroup.add(grid);
      });

      // Signal Beacon Light
      const beaconGeo = new THREE.SphereGeometry(0.1 * scale, 12, 12);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(0, -0.32 * scale, 0);
      satGroup.add(beacon);
      satGroup.userData.beacon = beacon;

      return satGroup;
    }

    // 3 Small Satellites (scales 0.22, 0.18, 0.15)
    const sat1 = createSatellite(0x38bdf8, 0.22); // Cyan Solar Panels
    const sat2 = createSatellite(0xec4899, 0.18); // Pink Solar Panels
    const sat3 = createSatellite(0x10b981, 0.15); // Emerald Solar Panels

    spaceGroup.add(sat1);
    spaceGroup.add(sat2);
    spaceGroup.add(sat3);

    // -------------------------------------------------------------------------
    // C. EVEN BIGGER MAJESTIC PLANET WITH 4D HYPERCUBE CIVILIZATION CORE
    // -------------------------------------------------------------------------
    const planetGeo = new THREE.SphereGeometry(3.2, 36, 36);
    const planetMat = new THREE.MeshToonMaterial({ color: 0x9b7bb8, transparent: true, opacity: 1.0 });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(0.2, -0.4, -2.8);

    // Planet Outer & Inner Wireframe Rings
    const ringGeo = new THREE.TorusGeometry(4.8, 0.14, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf5cbcb, wireframe: true });
    const pRing = new THREE.Mesh(ringGeo, ringMat);
    pRing.rotation.x = Math.PI / 2.3;
    planet.add(pRing);

    const innerRingGeo = new THREE.TorusGeometry(4.1, 0.05, 16, 64);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const pRingInner = new THREE.Mesh(innerRingGeo, innerRingMat);
    pRingInner.rotation.x = Math.PI / 2.3;
    planet.add(pRingInner);

    // Cartoon Craters on Planet Surface
    const craterMat = new THREE.MeshToonMaterial({ color: 0x8262a0, transparent: true, opacity: 1.0 });
    const craterGeo = new THREE.SphereGeometry(0.55, 16, 16);

    const crater1 = new THREE.Mesh(craterGeo, craterMat);
    crater1.position.set(1.9, 1.6, 1.8);
    crater1.scale.set(1, 0.3, 1);
    planet.add(crater1);

    const crater2 = new THREE.Mesh(craterGeo, craterMat);
    crater2.position.set(-1.6, -1.1, 2.3);
    crater2.scale.set(0.7, 0.25, 0.7);
    planet.add(crater2);

    const crater3 = new THREE.Mesh(craterGeo, craterMat);
    crater3.position.set(0.4, -2.1, 2.2);
    crater3.scale.set(0.5, 0.2, 0.5);
    planet.add(crater3);

    // -------------------------------------------------------------------------
    // D. 4D TESSERACT HYPERCUBE STRUCTURE INSIDE PLANET CORE (ADVANCED CIVILIZATION)
    // -------------------------------------------------------------------------
    const coreGroup = new THREE.Group();
    planet.add(coreGroup);

    // Outer 3D Hypercube Frame
    const outerHyperGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const outerHyperMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, wireframe: true });
    const outerHyper = new THREE.Mesh(outerHyperGeo, outerHyperMat);
    coreGroup.add(outerHyper);

    // Inner 3D Hypercube Frame
    const innerHyperGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    const innerHyperMat = new THREE.MeshBasicMaterial({ color: 0x64ffda, wireframe: true });
    const innerHyper = new THREE.Mesh(innerHyperGeo, innerHyperMat);
    coreGroup.add(innerHyper);

    // 8 Hyper-Edge Struts Connecting Outer to Inner Corners
    const hyperStrutsGroup = new THREE.Group();
    const corners = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1],  [1, -1, 1],  [1, 1, 1],  [-1, 1, 1]
    ];
    corners.forEach(c => {
      const pOuter = new THREE.Vector3(c[0] * 1.1, c[1] * 1.1, c[2] * 1.1);
      const pInner = new THREE.Vector3(c[0] * 0.55, c[1] * 0.55, c[2] * 0.55);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([pOuter, pInner]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xec4899, linewidth: 2 });
      const strut = new THREE.Line(lineGeo, lineMat);
      hyperStrutsGroup.add(strut);
    });
    coreGroup.add(hyperStrutsGroup);

    // Intersecting 4D Hyper-Rings
    const tRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 16, 64), new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }));
    const tRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 16, 64), new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true }));
    tRing2.rotation.x = Math.PI / 2;
    coreGroup.add(tRing1);
    coreGroup.add(tRing2);

    // Quantum Core Energy Orb & Core Particle Field
    const orbGeo = new THREE.IcosahedronGeometry(0.55, 2);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.9 });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    coreGroup.add(orb);

    const cCount = 60;
    const cGeo = new THREE.BufferGeometry();
    const cPos = new Float32Array(cCount * 3);
    for (let i = 0; i < cCount * 3; i += 3) {
      cPos[i] = (Math.random() - 0.5) * 1.6;
      cPos[i + 1] = (Math.random() - 0.5) * 1.6;
      cPos[i + 2] = (Math.random() - 0.5) * 1.6;
    }
    cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
    const cMat = new THREE.PointsMaterial({ color: 0x64ffda, size: 0.07, transparent: true, opacity: 0.85 });
    const coreParticles = new THREE.Points(cGeo, cMat);
    coreGroup.add(coreParticles);

    spaceGroup.add(planet);

    // Starfield particles
    const starCount = 380;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 20;
      starPos[i + 1] = (Math.random() - 0.5) * 20;
      starPos[i + 2] = (Math.random() - 0.5) * 20;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Mouse Parallax
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Resize Handler
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    // Animation Loop with Scroll-Driven Zoom Into Planet Core & 4D Civilization Hypercube
    let clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Scroll Progress calculation
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      const scrollProgress = Math.min(Math.max(scrollY / maxScroll, 0), 1);

      // Scroll-driven smooth camera zoom fly-through into planet core
      const targetCamZ = 8.0 - scrollProgress * 10.2;
      const targetCamX = (0.2 - scrollProgress * 0.2) + mouseX * 0.3;
      const targetCamY = (-0.4 + scrollProgress * 0.0) - mouseY * 0.2;

      camera.position.z += (targetCamZ - camera.position.z) * 0.08;
      camera.position.x += (targetCamX - camera.position.x) * 0.08;
      camera.position.y += (targetCamY - camera.position.y) * 0.08;

      // Planet Shell Translucent Dissolve as user zooms inside
      const planetOpacity = Math.max(0.12, 1.0 - (scrollProgress * 1.6));
      planetMat.opacity = planetOpacity;
      craterMat.opacity = planetOpacity;

      // Continuous Subtle Floating & Rotation for Planet
      planet.position.x = 0.2 + Math.sin(elapsed * 0.12) * 0.5;
      planet.position.y = -0.4 + Math.cos(elapsed * 0.15) * 0.25;
      planet.rotation.y += 0.004;

      // 4D Tesseract Rotation Animations (Advanced Civilization Quantum Core)
      outerHyper.rotation.x = elapsed * 0.5;
      outerHyper.rotation.y = elapsed * 0.7;

      innerHyper.rotation.x = -elapsed * 0.9;
      innerHyper.rotation.z = elapsed * 0.6;

      hyperStrutsGroup.rotation.x = elapsed * 0.5;
      hyperStrutsGroup.rotation.y = elapsed * 0.7;

      tRing1.rotation.y = elapsed * 0.8;
      tRing1.rotation.z = elapsed * 0.4;

      tRing2.rotation.x = elapsed * 0.8;
      tRing2.rotation.y = -elapsed * 0.5;

      orb.rotation.x = elapsed * 1.2;
      orb.rotation.y = elapsed * 1.5;
      const orbScale = 1.0 + Math.sin(elapsed * 4) * 0.12;
      orb.scale.set(orbScale, orbScale, orbScale);

      coreParticles.rotation.y += 0.01;

      // -----------------------------------------------------------------------
      // B. 3 SATELLITES ORBITING THE PLANET IN 3 DIFFERENT WAYS
      // -----------------------------------------------------------------------
      // Satellite 1: Low-Inclination Fast Equatorial Orbit
      const a1 = elapsed * 0.65;
      const s1X = planet.position.x + Math.cos(a1) * 5.6;
      const s1Y = planet.position.y + Math.sin(a1 * 2.0) * 0.35 + Math.sin(a1) * 0.8;
      const s1Z = planet.position.z + Math.sin(a1) * 4.6;
      sat1.position.set(s1X, s1Y, s1Z);
      sat1.rotation.y = a1 + Math.PI / 2;
      sat1.rotation.z = Math.sin(elapsed * 2) * 0.1;
      if (sat1.userData.beacon) {
        sat1.userData.beacon.material.opacity = 0.4 + Math.sin(elapsed * 6) * 0.5;
      }

      // Satellite 2: High-Inclination Polar Orbit (Crossing North/South Poles)
      const a2 = elapsed * 0.48 + 1.8;
      const s2X = planet.position.x + Math.sin(a2) * 1.8;
      const s2Y = planet.position.y + Math.cos(a2) * 5.8;
      const s2Z = planet.position.z + Math.sin(a2 * 1.2) * 4.2;
      sat2.position.set(s2X, s2Y, s2Z);
      sat2.rotation.x = a2;
      sat2.rotation.z = elapsed * 0.3;
      if (sat2.userData.beacon) {
        sat2.userData.beacon.material.opacity = 0.4 + Math.cos(elapsed * 7) * 0.5;
      }

      // Satellite 3: Retrograde Deep Elliptical Orbit (Reverse Direction & Wide Tilt)
      const a3 = -elapsed * 0.42 + 4.0;
      const s3X = planet.position.x + Math.cos(a3) * 6.2;
      const s3Y = planet.position.y + Math.sin(a3) * 2.8;
      const s3Z = planet.position.z + Math.sin(a3 * 1.3) * 5.0;
      sat3.position.set(s3X, s3Y, s3Z);
      sat3.rotation.y = -a3;
      sat3.rotation.x = Math.sin(elapsed * 1.5) * 0.2;
      if (sat3.userData.beacon) {
        sat3.userData.beacon.material.opacity = 0.4 + Math.sin(elapsed * 8) * 0.5;
      }

      // -----------------------------------------------------------------------
      // A. ULTRA-TINY ALIEN CHARACTERS FREE-ROAMING IN SPACE
      // -----------------------------------------------------------------------
      const aliens = [
        { mesh: cartoon1, speedX: 0.35, speedY: 0.48, radX: 5.4, radY: 2.5, offsetX: -1.4, offsetY: 1.0, phase: 0 },
        { mesh: cartoon2, speedX: 0.30, speedY: 0.42, radX: 5.8, radY: 2.8, offsetX: 1.8, offsetY: -1.0, phase: 2.0 },
        { mesh: cartoon3, speedX: 0.40, speedY: 0.35, radX: 4.8, radY: 2.0, offsetX: 1.0, offsetY: 1.6, phase: 4.0 }
      ];

      aliens.forEach((a) => {
        if (!a.mesh) return;

        a.mesh.position.x = Math.sin(elapsed * a.speedX + a.phase) * a.radX + a.offsetX;
        a.mesh.position.y = Math.cos(elapsed * a.speedY + a.phase) * a.radY + a.offsetY;
        a.mesh.position.z = Math.sin(elapsed * 0.3 + a.phase) * 1.5 + 0.8;

        a.mesh.rotation.y = elapsed * 0.6 + a.phase;
        a.mesh.rotation.z = Math.sin(elapsed * 0.8 + a.phase) * 0.2;

        if (a.mesh.userData.propeller) {
          a.mesh.userData.propeller.rotation.y += 0.4;
        }

        if (a.mesh.userData.flames) {
          a.mesh.userData.flames.forEach(f => {
            const scaleY = 0.7 + Math.random() * 0.6;
            f.scale.set(1, scaleY, 1);
          });
        }

        if (a.mesh.userData.pParticles) {
          const pArr = a.mesh.userData.pParticles.geometry.attributes.position.array;
          const count = pArr.length / 3;
          for (let p = 0; p < count; p++) {
            pArr[p * 3 + 1] -= 0.03;
            if (pArr[p * 3 + 1] < -1.2) {
              pArr[p * 3 + 1] = -0.5;
              pArr[p * 3] = (Math.random() - 0.5) * 0.1;
              pArr[p * 3 + 2] = -0.4 + (Math.random() - 0.5) * 0.1;
            }
          }
          a.mesh.userData.pParticles.geometry.attributes.position.needsUpdate = true;
        }
      });

      // Mouse Parallax smooth interpolation
      spaceGroup.rotation.y += (mouseX * 0.2 - spaceGroup.rotation.y) * 0.05;
      spaceGroup.rotation.x += (mouseY * 0.12 - spaceGroup.rotation.x) * 0.05;

      renderer.render(scene, camera);
    }

    animate();
  }


  // =========================================================================
  // 5. 3D ROTATING SHAPE CANVASES FOR OUR WORK 6 DOMAIN POST CARDS (UPDATE 5)
  // =========================================================================
  // =========================================================================
  // 5. HIGH-QUALITY ANIMATED 3D MODELS FOR 6 RESEARCH DIVISIONS
  // =========================================================================
  function initDomainCardCanvases() {
    const domains = [
      {
        id: 'canvas-engineering',
        type: 'engineering',
        modelPath: '3d objects/non-military_consumer_uav_drone.glb',
        primaryColor: 0xc5b3d3,
        accentColor: 0xa855f7,
        initialRotX: 0.25,
        targetScaleMultiplier: 3.4
      },
      {
        id: 'canvas-placements',
        type: 'placements',
        modelPath: '3d objects/graduate cap.glb',
        primaryColor: 0xf5cbcb,
        accentColor: 0xec4899,
        initialRotX: 0.35,
        targetScaleMultiplier: 3.4
      },
      {
        id: 'canvas-healthcare',
        type: 'healthcare',
        modelPath: '3d objects/syringe_background_env.glb',
        primaryColor: 0x64ffda,
        accentColor: 0x10b981,
        initialRotX: 0.1,
        modelOrientation: { x: Math.PI / 2, y: 0, z: 0 },
        targetScaleMultiplier: 3.5
      },
      {
        id: 'canvas-tourism',
        type: 'tourism',
        modelPath: '3d objects/eiffel_tower.glb',
        primaryColor: 0xa855f7,
        accentColor: 0x38bdf8,
        initialRotX: 0.1,
        targetScaleMultiplier: 3.6
      },
      {
        id: 'canvas-entertainment',
        type: 'entertainment',
        modelPath: '3d objects/wheel_of_brisbane_ferris_wheel_low-poly_free.glb',
        primaryColor: 0xec4899,
        accentColor: 0xf59e0b,
        initialRotX: 0.05,
        targetScaleMultiplier: 3.5
      },
      {
        id: 'canvas-building',
        type: 'building',
        modelPath: '3d objects/building_no_19_form_tokyo_otemachi_building_pack.glb',
        primaryColor: 0x38bdf8,
        accentColor: 0x6366f1,
        initialRotX: 0.2,
        targetScaleMultiplier: 3.5
      }
    ];

    domains.forEach(d => {
      const container = document.getElementById(d.id);
      if (!container || typeof THREE === 'undefined') return;
      if (container.querySelector('canvas')) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0, 4.2);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(220, 220);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
      container.appendChild(renderer.domElement);

      // Studio Lighting setup for realistic GLTF/PBR Rendering
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
      scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2);
      dirLight1.position.set(4, 6, 5);
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.3);
      dirLight2.position.set(-4, -2, -3);
      scene.add(dirLight2);

      const pointLight = new THREE.PointLight(d.accentColor, 1.8, 12);
      pointLight.position.set(0, -2, 3);
      scene.add(pointLight);

      const masterGroup = new THREE.Group();
      scene.add(masterGroup);

      // Load 3D GLB Model
      if (typeof THREE.GLTFLoader !== 'undefined') {
        const loader = new THREE.GLTFLoader();
        loader.load(
          encodeURI(d.modelPath),
          (gltf) => {
            const model = gltf.scene;

            // Apply custom model orientation (e.g. standing up the syringe vertically)
            if (d.modelOrientation) {
              if (d.modelOrientation.x) model.rotation.x = d.modelOrientation.x;
              if (d.modelOrientation.y) model.rotation.y = d.modelOrientation.y;
              if (d.modelOrientation.z) model.rotation.z = d.modelOrientation.z;
              model.updateMatrixWorld(true);
            }

            // Compute Bounding Box after applying orientation to auto-center and scale
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            // Center the model's pivot
            model.position.x -= center.x;
            model.position.y -= center.y;
            model.position.z -= center.z;

            // Normalize scale so model fits nicely inside viewport
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
              const targetScale = (d.targetScaleMultiplier || 2.3) / maxDim;
              masterGroup.scale.set(targetScale, targetScale, targetScale);
            }

            masterGroup.add(model);
          },
          undefined,
          (err) => {
            console.warn(`Could not load GLB for ${d.id}, falling back:`, err);
            // Fallback wireframe geometric placeholder
            const geo = new THREE.IcosahedronGeometry(1.0, 1);
            const mat = new THREE.MeshStandardMaterial({
              color: d.primaryColor,
              roughness: 0.2,
              metalness: 0.8,
              wireframe: true
            });
            masterGroup.add(new THREE.Mesh(geo, mat));
          }
        );
      } else {
        const geo = new THREE.IcosahedronGeometry(1.0, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: d.primaryColor,
          roughness: 0.2,
          metalness: 0.8,
          wireframe: true
        });
        masterGroup.add(new THREE.Mesh(geo, mat));
      }

      // Interactive High-Sensitivity Mouse & Touch Controller
      const card = container.closest('.domain-card');
      let targetRotX = 0, targetRotY = 0;
      let isHovered = false;
      let isDragging = false;
      let dragStartX = 0, dragStartY = 0;
      let dragOffsetRotX = 0, dragOffsetRotY = 0;

      if (card) {
        card.addEventListener('mouseenter', () => {
          isHovered = true;
        });

        // High-sensitivity mouse tracking across card
        card.addEventListener('mousemove', (e) => {
          if (isDragging) return;
          const rect = card.getBoundingClientRect();
          const normX = (e.clientX - rect.left) / rect.width - 0.5;
          const normY = (e.clientY - rect.top) / rect.height - 0.5;

          // Increased rotation sensitivity (yaw ±2.8 rad, pitch ±1.8 rad)
          targetRotY = normX * 3.2;
          targetRotX = -normY * 2.2;
        });

        card.addEventListener('mouseleave', () => {
          isHovered = false;
          isDragging = false;
          targetRotX = 0;
          targetRotY = 0;
        });

        // Direct Drag-to-Rotate Support on Canvas
        container.addEventListener('mousedown', (e) => {
          isDragging = true;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          e.stopPropagation();
        });

        window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const deltaX = e.clientX - dragStartX;
          const deltaY = e.clientY - dragStartY;
          dragStartX = e.clientX;
          dragStartY = e.clientY;

          dragOffsetRotY += deltaX * 0.03;
          dragOffsetRotX += deltaY * 0.03;
        });

        window.addEventListener('mouseup', () => {
          isDragging = false;
        });
      }

      const clock = new THREE.Clock();

      function animate() {
        requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();

        if (isDragging) {
          // Direct drag rotation
          masterGroup.rotation.y = dragOffsetRotY;
          masterGroup.rotation.x = d.initialRotX + dragOffsetRotX;
          masterGroup.position.z = 0.35;
        } else if (isHovered) {
          // Interactive cursor tracking with high responsiveness
          masterGroup.rotation.y += (targetRotY + dragOffsetRotY - masterGroup.rotation.y) * 0.14;
          masterGroup.rotation.x += (d.initialRotX + targetRotX + dragOffsetRotX - masterGroup.rotation.x) * 0.14;

          // Subtle float and lifted hover depth
          masterGroup.position.y = Math.sin(elapsed * 3.0) * 0.08;
          masterGroup.position.z += (0.3 - masterGroup.position.z) * 0.12;
        } else {
          // Smooth continuous idle rotation when unhovered
          dragOffsetRotY += 0.014;
          masterGroup.rotation.y += (dragOffsetRotY - masterGroup.rotation.y) * 0.08;
          masterGroup.rotation.x += (d.initialRotX - masterGroup.rotation.x) * 0.08;

          // Gentle idle bobbing
          masterGroup.position.y = Math.sin(elapsed * 2.0) * 0.06;
          masterGroup.position.z += (0 - masterGroup.position.z) * 0.1;
        }

        renderer.render(scene, camera);
      }

      animate();
    });
  }

  // =========================================================================
  // 6. RENDER 3D THUMBNAILS FOR PROJECT CARDS (STATE 2)
  // =========================================================================
  window.initProjectCardThumbnails = function () {
    document.querySelectorAll('.project-thumb-canvas').forEach(container => {
      if (container.querySelector('canvas') || typeof THREE === 'undefined') return;

      const colorHex = parseInt(container.getAttribute('data-color') || '0xa855f7', 16);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 3.5;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      const light = new THREE.DirectionalLight(0xffffff, 1.5);
      light.position.set(3, 4, 5);
      scene.add(light);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));

      const mesh = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.7, 0.22, 64, 16),
        new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2, metalness: 0.6 })
      );
      scene.add(mesh);

      function animateThumb() {
        requestAnimationFrame(animateThumb);
        mesh.rotation.y += 0.02;
        mesh.rotation.x += 0.01;
        renderer.render(scene, camera);
      }
      animateThumb();
    });
  };


  // =========================================================================
  // 7. BULLETPROOF 65% CARD ENLARGEMENT FOCUS SPOTLIGHT (UPDATE 7)
  // =========================================================================
  function initCardEnlargementFocus() {
    let overlay = document.querySelector('.enlarge-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'enlarge-modal-overlay';
      overlay.innerHTML = `
        <div class="enlarge-modal-card" id="enlarge-modal-content">
          <button class="enlarge-modal-close" id="enlarge-modal-close" aria-label="Close View">×</button>
          <div id="enlarge-modal-body"></div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const closeBtn = document.getElementById('enlarge-modal-close');
    const modalBody = document.getElementById('enlarge-modal-body');

    const closeModal = () => {
      overlay.classList.remove('active');
      xrSound.playClick();
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Attach click listener to all cards with touch-drag check
    const cardSelectors = '.info-card, .member-card, .glass-card, .domain-card, .lead-card, .philo-card, .vm-card';
    document.querySelectorAll(cardSelectors).forEach(card => {
      let touchStartY = 0;
      let isTouchDrag = false;

      card.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 0) {
          touchStartY = e.touches[0].clientY;
          isTouchDrag = false;
        }
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length > 0) {
          if (Math.abs(e.touches[0].clientY - touchStartY) > 10) {
            isTouchDrag = true;
          }
        }
      }, { passive: true });

      card.addEventListener('click', (e) => {
        if (isTouchDrag) return; // Prevent triggering modal when scrolling on mobile touchscreens
        // Exclude interactive elements
        if (e.target.closest('a, button, input, textarea')) return;

        // Clone content for enlarged spotlight modal
        const clone = card.cloneNode(true);
        // Remove nested buttons from clone
        clone.querySelectorAll('button, .hover-progress-bar, .specular-sheen').forEach(el => el.remove());

        modalBody.innerHTML = '';
        modalBody.appendChild(clone);

        overlay.classList.add('active');
        xrSound.playSwoosh();
      });
    });
  }



  // =========================================================================
  // 9. INITIALIZE XR ENGINE UPON DOM READY
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initBootSequence();
    init3DBackgroundScene();
    initDomainCardCanvases();
    initCardEnlargementFocus();
    initSpatialTiltEngine();
    initSpatialHeader();
    initMobileNav();
    initSpatialModal();
    initHoverExpandEngine();
  });

})();

