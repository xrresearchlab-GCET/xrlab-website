/**
 * AR/VR Research Lab - Spatial Computing XR OS Engine
 * Inspired by VisionOS, Meta Quest Horizon OS, & High-End Sci-Fi Interfaces
 */

(function () {
  'use strict';

  // Apply saved theme immediately on script execution to prevent FOUC
  try {
    const savedTheme = localStorage.getItem('xr_theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (document.body) {
        document.body.classList.add('dark-mode');
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.classList.add('dark-mode');
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
  // =========================================================================
  // =========================================================================
  // 2. 3D SPATIAL XR HEADSET CANVAS ENGINE WITH SCROLL EXPANSION ANIMATION
  // =========================================================================
  function init3DBackgroundScene() {
    const container = document.getElementById('canvas-container');
    if (!container || typeof THREE === 'undefined') return;

    // Check if canvas already initialized
    if (container.querySelector('canvas')) return;

    const scene = new THREE.Scene();

    const rect = container.getBoundingClientRect();
    const width = rect.width || (window.innerWidth * 0.46);
    const height = rect.height || (window.innerHeight * 0.8);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.z = 7;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create 3D XR Visor Headset Group
    const xrHeadsetGroup = new THREE.Group();

    // 1. Visor Main Frame Shield (Soft Lavender Wireframe)
    const visorGeo = new THREE.BoxGeometry(3.6, 1.8, 1.3, 6, 4, 4);
    const visorMat = new THREE.MeshBasicMaterial({
      color: 0xC5B3D3,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    xrHeadsetGroup.add(visorMesh);

    // 2. Visor Front Glass Shield (Soft Pastel Pink Tinted Translucent Front Plate)
    const shieldGeo = new THREE.PlaneGeometry(3.4, 1.6, 4, 4);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xFFE2E2,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.position.z = 0.66;
    xrHeadsetGroup.add(shieldMesh);

    // 3. Dual Spatial Optical Lens Rings (Left & Right Eye Display Lenses)
    const lensGeo = new THREE.TorusGeometry(0.52, 0.07, 16, 32);
    const lensMat = new THREE.MeshBasicMaterial({
      color: 0xC5B3D3,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });

    const leftLens = new THREE.Mesh(lensGeo, lensMat);
    leftLens.position.set(-0.85, 0, 0.67);
    xrHeadsetGroup.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeo, lensMat);
    rightLens.position.set(0.85, 0, 0.67);
    xrHeadsetGroup.add(rightLens);

    // 4. Ergonomic Headband Strap Ring (Rose Blush Primary)
    const strapGeo = new THREE.TorusGeometry(2.1, 0.1, 16, 48);
    const strapMat = new THREE.MeshBasicMaterial({
      color: 0xF5CBCB,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    const strapMesh = new THREE.Mesh(strapGeo, strapMat);
    strapMesh.rotation.x = Math.PI / 2;
    strapMesh.position.z = -0.4;
    xrHeadsetGroup.add(strapMesh);

    // 5. 6DOF Spatial Tracking Sensors (Glowing Lavender Corner Cameras)
    const sensorGeo = new THREE.OctahedronGeometry(0.14, 1);
    const sensorMat = new THREE.MeshBasicMaterial({
      color: 0xC5B3D3,
      wireframe: true,
      transparent: true,
      opacity: 0.9
    });

    const sensorPositions = [
      [-1.7, 0.8, 0.65],
      [1.7, 0.8, 0.65],
      [-1.7, -0.8, 0.65],
      [1.7, -0.8, 0.65]
    ];

    sensorPositions.forEach(pos => {
      const sensor = new THREE.Mesh(sensorGeo, sensorMat);
      sensor.position.set(...pos);
      xrHeadsetGroup.add(sensor);
    });

    // 6. Floating Spatial Orbit Ring surrounding Headset
    const orbitGeo = new THREE.TorusGeometry(3.3, 0.03, 16, 64);
    const orbitMat = new THREE.MeshBasicMaterial({
      color: 0xC5B3D3,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
    orbitMesh.rotation.x = 1.1;
    orbitMesh.rotation.y = 0.5;
    xrHeadsetGroup.add(orbitMesh);

    scene.add(xrHeadsetGroup);

    // Floating Particles System in Soft Lavender & White
    const particleCount = 220;
    const particlesGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 16;
      positions[i + 1] = (Math.random() - 0.5) * 16;
      positions[i + 2] = (Math.random() - 0.5) * 16;
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particlesMat = new THREE.PointsMaterial({
      color: 0xC5B3D3,
      size: 0.055,
      transparent: true,
      opacity: 0.6
    });
    const particleSystem = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particleSystem);

    // Interactive Mouse Parallax
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // 3D Scroll Expansion Physics Engine (Expands headset object as user moves down)
    let targetScale = 1.0;
    let currentScale = 1.0;
    let targetRotSpeed = 1.0;
    let currentRotSpeed = 1.0;

    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY || window.pageYOffset;
      // Object expands smoothly as user scrolls down the page
      targetScale = 1.0 + Math.min(scrollY / 320, 2.5);
      targetRotSpeed = 1.0 + Math.min(scrollY / 600, 2.0);
    });

    // Wireframe Color / Speed Toggle Button (HUD Button)
    let speedMultiplier = 1;
    const toggleBtn = document.getElementById('toggle-canvas-wireframe');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        speedMultiplier = speedMultiplier === 1 ? 2.5 : 1;
        visorMat.color.setHex(speedMultiplier > 1 ? 0xF5CBCB : 0xC5B3D3);
        lensMat.color.setHex(speedMultiplier > 1 ? 0xF5CBCB : 0xC5B3D3);
      });
    }

    const hudCoords = document.getElementById('hud-coords');

    // Handle Window Resize
    window.addEventListener('resize', () => {
      const r = container.getBoundingClientRect();
      const w = r.width || window.innerWidth;
      const h = r.height || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);

      // Lerp scale expansion for fluid organic response to scrolling down
      currentScale += (targetScale - currentScale) * 0.07;
      currentRotSpeed += (targetRotSpeed - currentRotSpeed) * 0.07;

      xrHeadsetGroup.scale.set(currentScale, currentScale, currentScale);
      particleSystem.scale.set(1 + (currentScale - 1) * 0.5, 1 + (currentScale - 1) * 0.5, 1 + (currentScale - 1) * 0.5);

      const effectiveSpeed = speedMultiplier * currentRotSpeed;
      xrHeadsetGroup.rotation.y += 0.006 * effectiveSpeed;
      xrHeadsetGroup.rotation.x = Math.sin(Date.now() * 0.001) * 0.15;

      orbitMesh.rotation.z += 0.008 * effectiveSpeed;
      leftLens.rotation.z += 0.01 * effectiveSpeed;
      rightLens.rotation.z -= 0.01 * effectiveSpeed;

      particleSystem.rotation.y += 0.001 * effectiveSpeed;

      camera.position.x += (mouseX * 1.2 - camera.position.x) * 0.05;
      camera.position.y += (-mouseY * 1.2 - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      if (hudCoords && Math.random() > 0.85) {
        const posX = Math.floor(xrHeadsetGroup.rotation.x * 100);
        const posY = Math.floor(xrHeadsetGroup.rotation.y * 100);
        const posZ = Math.floor(currentScale * 100);
        hudCoords.innerText = `X:${posX} Y:${posY} SCALE:${posZ}%`;
      }

      renderer.render(scene, camera);
    }
    animate();
  }


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
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
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
        const isDark = document.body.classList.toggle('dark-mode');
        if (isDark) {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('xr_theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('xr_theme', 'light');
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
  // 2. 3D SPATIAL SPACE CANVAS SCENE (FUN CARTOONS & ROCKETS WITH FUMES) (UPDATE 3 & 4)
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

    // Ambient & Point Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xc5b3d3, 1.4);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    // Main 3D Space Master Group
    const spaceGroup = new THREE.Group();
    scene.add(spaceGroup);

    // -------------------------------------------------------------------------
    // A. FUN ROAMING 3D CARTOON ASTRONAUT / ROBOT CHARACTERS
    // -------------------------------------------------------------------------
    function createCartoonCharacter(colorHex, scale = 1) {
      const charGroup = new THREE.Group();

      // Cartoon Head
      const headGeo = new THREE.SphereGeometry(0.55 * scale, 24, 24);
      const headMat = new THREE.MeshToonMaterial({ color: colorHex });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.5 * scale;
      charGroup.add(head);

      // Cute Big Visor / Eyes
      const eyeGeo = new THREE.SphereGeometry(0.24 * scale, 16, 16);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222233 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 0.55 * scale, 0.42 * scale);
      eye.scale.set(1.4, 0.9, 0.5);
      charGroup.add(eye);

      // Antenna with Glowing Ball
      const antStemGeo = new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, 0.35 * scale);
      const antStemMat = new THREE.MeshToonMaterial({ color: 0xcccccc });
      const antStem = new THREE.Mesh(antStemGeo, antStemMat);
      antStem.position.set(0, 1.1 * scale, 0);
      charGroup.add(antStem);

      const antBallGeo = new THREE.SphereGeometry(0.12 * scale, 12, 12);
      const antBallMat = new THREE.MeshBasicMaterial({ color: 0xf5cbcb });
      const antBall = new THREE.Mesh(antBallGeo, antBallMat);
      antBall.position.set(0, 1.3 * scale, 0);
      charGroup.add(antBall);

      // Cartoon Body
      const bodyGeo = new THREE.CylinderGeometry(0.38 * scale, 0.45 * scale, 0.7 * scale, 16);
      const bodyMat = new THREE.MeshToonMaterial({ color: 0xffffff });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = -0.15 * scale;
      charGroup.add(body);

      // Cute Backpack Jetpack
      const packGeo = new THREE.BoxGeometry(0.45 * scale, 0.55 * scale, 0.3 * scale);
      const packMat = new THREE.MeshToonMaterial({ color: colorHex });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.set(0, -0.1 * scale, -0.4 * scale);
      charGroup.add(pack);

      return charGroup;
    }

    const cartoon1 = createCartoonCharacter(0xc5b3d3, 1.1);
    cartoon1.position.set(-3.2, 0.8, 0);
    spaceGroup.add(cartoon1);

    const cartoon2 = createCartoonCharacter(0xf5cbcb, 0.85);
    cartoon2.position.set(3.4, -1.0, 0.5);
    spaceGroup.add(cartoon2);

    // -------------------------------------------------------------------------
    // B. 3D ROCKET WITH ENGINE FUMES / SMOKE TRAIL
    // -------------------------------------------------------------------------
    const rocketGroup = new THREE.Group();

    // Rocket Body Cone + Cylinder
    const rBodyGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.5, 16);
    const rBodyMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const rBody = new THREE.Mesh(rBodyGeo, rBodyMat);
    rocketGroup.add(rBody);

    // Rocket Nose Cone
    const rNoseGeo = new THREE.ConeGeometry(0.35, 0.8, 16);
    const rNoseMat = new THREE.MeshToonMaterial({ color: 0xf5cbcb });
    const rNose = new THREE.Mesh(rNoseGeo, rNoseMat);
    rNose.position.y = 1.15;
    rocketGroup.add(rNose);

    // Rocket Fin Wings (3 Fins)
    for (let i = 0; i < 3; i++) {
      const finGeo = new THREE.BoxGeometry(0.12, 0.6, 0.45);
      const finMat = new THREE.MeshToonMaterial({ color: 0xc5b3d3 });
      const fin = new THREE.Mesh(finGeo, finMat);
      const angle = (i * Math.PI * 2) / 3;
      fin.position.set(Math.cos(angle) * 0.4, -0.5, Math.sin(angle) * 0.4);
      fin.rotation.y = -angle;
      rocketGroup.add(fin);
    }

    // Rocket Nozzle
    const nozGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.25, 12);
    const nozMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const nozzle = new THREE.Mesh(nozGeo, nozMat);
    nozzle.position.y = -0.88;
    rocketGroup.add(nozzle);

    rocketGroup.rotation.z = -Math.PI / 4;
    rocketGroup.position.set(0.5, 1.5, 0.8);
    spaceGroup.add(rocketGroup);

    // Dynamic Rocket Fumes / Smoke Particle Emitter
    const fumeCount = 120;
    const fumesGeo = new THREE.BufferGeometry();
    const fumePositions = new Float32Array(fumeCount * 3);
    const fumeVelocities = [];

    for (let i = 0; i < fumeCount; i++) {
      fumePositions[i * 3] = (Math.random() - 0.5) * 0.5;
      fumePositions[i * 3 + 1] = -1.0 - Math.random() * 1.8;
      fumePositions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

      fumeVelocities.push({
        x: (Math.random() - 0.5) * 0.025,
        y: -0.05 - Math.random() * 0.035,
        z: (Math.random() - 0.5) * 0.025,
        life: Math.random()
      });
    }
    fumesGeo.setAttribute('position', new THREE.BufferAttribute(fumePositions, 3));

    const fumesMat = new THREE.PointsMaterial({
      color: 0xf5cbcb,
      size: 0.22,
      transparent: true,
      opacity: 0.85
    });
    const fumeParticles = new THREE.Points(fumesGeo, fumesMat);
    rocketGroup.add(fumeParticles);

    // -------------------------------------------------------------------------
    // C. CARTOON PLANET & STARFIELD
    // -------------------------------------------------------------------------
    const planetGeo = new THREE.SphereGeometry(0.85, 24, 24);
    const planetMat = new THREE.MeshToonMaterial({ color: 0xc5b3d3 });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(0, -2.2, -1.2);

    const ringGeo = new THREE.TorusGeometry(1.4, 0.08, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf5cbcb, wireframe: true });
    const pRing = new THREE.Mesh(ringGeo, ringMat);
    pRing.rotation.x = Math.PI / 2.5;
    planet.add(pRing);
    spaceGroup.add(planet);

    // Starfield particles
    const starCount = 300;
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

    // Animation Loop with Continuous 3D Spatial Roaming (UPDATE 1)
    let clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // A. Continuous 3D Spatial Roaming for Rocket (Orbital Trajectory & Dynamic Direction Heading)
      const rSpeed = 0.45;
      const rX = Math.sin(elapsed * rSpeed) * 5.5;
      const rY = Math.cos(elapsed * rSpeed * 0.7) * 2.8;
      const rZ = Math.sin(elapsed * rSpeed * 1.2) * 1.5;

      // Calculate direction velocity vector to rotate rocket along flight path
      const nextX = Math.sin((elapsed + 0.05) * rSpeed) * 5.5;
      const nextY = Math.cos((elapsed + 0.05) * rSpeed * 0.7) * 2.8;
      const nextZ = Math.sin((elapsed + 0.05) * rSpeed * 1.2) * 1.5;

      const dir = new THREE.Vector3(nextX - rX, nextY - rY, nextZ - rZ).normalize();

      rocketGroup.position.set(rX, rY, rZ);
      if (dir.lengthSq() > 0.0001) {
        const targetRotZ = Math.atan2(dir.y, dir.x) - Math.PI / 2;
        const targetRotY = Math.atan2(dir.x, dir.z);
        rocketGroup.rotation.z += (targetRotZ - rocketGroup.rotation.z) * 0.1;
        rocketGroup.rotation.y += (targetRotY - rocketGroup.rotation.y) * 0.1;
      }

      // Continuous Fume Trail update spawning behind rocket nozzle
      const posArr = fumeParticles.geometry.attributes.position.array;
      for (let i = 0; i < fumeCount; i++) {
        const vel = fumeVelocities[i];
        posArr[i * 3 + 1] += vel.y;
        posArr[i * 3] += vel.x;

        if (posArr[i * 3 + 1] < -2.8) {
          posArr[i * 3] = (Math.random() - 0.5) * 0.4;
          posArr[i * 3 + 1] = -0.9;
          posArr[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
        }
      }
      fumeParticles.geometry.attributes.position.needsUpdate = true;

      // B. Continuous 3D Free-Space Roaming for Cartoon Aliens / Astronauts
      // Alien 1 - Drifts freely across upper and left screen bounds
      cartoon1.position.x = Math.sin(elapsed * 0.35) * 4.5 - 1.2;
      cartoon1.position.y = Math.cos(elapsed * 0.48) * 2.2 + 0.5;
      cartoon1.position.z = Math.sin(elapsed * 0.3) * 1.6;
      cartoon1.rotation.y = elapsed * 0.5;
      cartoon1.rotation.z = Math.sin(elapsed * 0.8) * 0.25;

      // Alien 2 - Drifts freely across lower and right screen bounds
      cartoon2.position.x = Math.cos(elapsed * 0.3 + 2.0) * 4.8 + 0.8;
      cartoon2.position.y = Math.sin(elapsed * 0.42 + 1.5) * 2.4 - 0.6;
      cartoon2.position.z = Math.cos(elapsed * 0.35) * 1.5;
      cartoon2.rotation.y = -elapsed * 0.6;
      cartoon2.rotation.x = Math.cos(elapsed * 0.7) * 0.2;

      // C. Continuous Orbit for Planet & Rings
      planet.position.x = Math.sin(elapsed * 0.15) * 2.2;
      planet.position.y = -2.0 + Math.cos(elapsed * 0.18) * 0.6;
      planet.rotation.y += 0.008;

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
      { id: 'canvas-engineering', type: 'engineering', primaryColor: 0xc5b3d3, accentColor: 0xa855f7 },
      { id: 'canvas-placements', type: 'placements', primaryColor: 0xf5cbcb, accentColor: 0xec4899 },
      { id: 'canvas-healthcare', type: 'healthcare', primaryColor: 0x64ffda, accentColor: 0x10b981 },
      { id: 'canvas-tourism', type: 'tourism', primaryColor: 0xa855f7, accentColor: 0x38bdf8 },
      { id: 'canvas-entertainment', type: 'entertainment', primaryColor: 0xec4899, accentColor: 0xf59e0b },
      { id: 'canvas-building', type: 'building', primaryColor: 0x38bdf8, accentColor: 0x6366f1 }
    ];

    domains.forEach(d => {
      const container = document.getElementById(d.id);
      if (!container || typeof THREE === 'undefined') return;
      if (container.querySelector('canvas')) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.z = 4.2;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(160, 160);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      const light1 = new THREE.DirectionalLight(0xffffff, 1.4);
      light1.position.set(3, 4, 5);
      scene.add(light1);

      const light2 = new THREE.PointLight(d.accentColor, 1.5, 10);
      light2.position.set(-2, -2, 2);
      scene.add(light2);

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));

      const masterGroup = new THREE.Group();
      scene.add(masterGroup);

      // Construct Domain Specific 3D Models
      if (d.type === 'engineering') {
        // Engineering: Multi-Layer Mechanical Industrial Gear & Shaft Engine Assembly (UPDATE 3)
        const gearGroup = new THREE.Group();

        // Main center gear hub
        const mainHub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.72, 0.72, 0.28, 24),
          new THREE.MeshStandardMaterial({ color: d.primaryColor, metalness: 0.85, roughness: 0.2 })
        );
        gearGroup.add(mainHub);

        // 8 Extruded Industrial Gear Teeth
        const toothCount = 8;
        for (let i = 0; i < toothCount; i++) {
          const tooth = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.28, 0.32),
            new THREE.MeshStandardMaterial({ color: d.primaryColor, metalness: 0.75, roughness: 0.25 })
          );
          const angle = (i * Math.PI * 2) / toothCount;
          tooth.position.set(Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85);
          tooth.rotation.y = -angle;
          gearGroup.add(tooth);
        }

        // Center Axle Shaft
        const axle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.65, 16),
          new THREE.MeshStandardMaterial({ color: d.accentColor, metalness: 0.9, roughness: 0.15 })
        );
        gearGroup.add(axle);

        // Interlocking Inner Wireframe Cog
        const innerCog = new THREE.Mesh(
          new THREE.CylinderGeometry(0.48, 0.48, 0.35, 12),
          new THREE.MeshBasicMaterial({ color: d.accentColor, wireframe: true })
        );
        gearGroup.add(innerCog);

        masterGroup.add(gearGroup);
      } else if (d.type === 'placements') {
        // Placements: Octahedron Crystal Trophy & Orbit Ring
        const trophy = new THREE.Mesh(
          new THREE.OctahedronGeometry(1.0, 0),
          new THREE.MeshStandardMaterial({ color: d.primaryColor, roughness: 0.1, metalness: 0.8 })
        );
        masterGroup.add(trophy);

        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.3, 0.04, 16, 48),
          new THREE.MeshBasicMaterial({ color: d.accentColor })
        );
        ring.rotation.x = Math.PI / 3;
        masterGroup.add(ring);
      } else if (d.type === 'healthcare') {
        // Healthcare: DNA Double Helix Strand
        const dnaGroup = new THREE.Group();
        const sphereGeo = new THREE.SphereGeometry(0.12, 12, 12);
        const matA = new THREE.MeshStandardMaterial({ color: d.primaryColor });
        const matB = new THREE.MeshStandardMaterial({ color: d.accentColor });

        for (let i = -6; i <= 6; i++) {
          const y = i * 0.22;
          const angle = i * 0.45;
          const x1 = Math.cos(angle) * 0.7;
          const z1 = Math.sin(angle) * 0.7;

          const s1 = new THREE.Mesh(sphereGeo, matA);
          s1.position.set(x1, y, z1);
          dnaGroup.add(s1);

          const s2 = new THREE.Mesh(sphereGeo, matB);
          s2.position.set(-x1, y, -z1);
          dnaGroup.add(s2);

          // Connecting rungs
          const rungGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4);
          const rungMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
          const rung = new THREE.Mesh(rungGeo, rungMat);
          rung.position.set(0, y, 0);
          rung.rotation.z = Math.PI / 2;
          rung.rotation.y = angle;
          dnaGroup.add(rung);
        }
        masterGroup.add(dnaGroup);
      } else if (d.type === 'tourism') {
        // Tourism & Culture: Orbital Globe
        const globe = new THREE.Mesh(
          new THREE.SphereGeometry(0.85, 20, 20),
          new THREE.MeshStandardMaterial({ color: d.primaryColor, wireframe: true })
        );
        masterGroup.add(globe);

        const orb1 = new THREE.Mesh(
          new THREE.TorusGeometry(1.25, 0.04, 16, 40),
          new THREE.MeshBasicMaterial({ color: d.accentColor })
        );
        orb1.rotation.x = Math.PI / 2.5;
        masterGroup.add(orb1);
      } else if (d.type === 'entertainment') {
        // Entertainment: Spatial 3D VR Headset & Gaming Optics (UPDATE 3)
        const headsetGroup = new THREE.Group();

        // Curved VR Main Chassis Box
        const mainChassis = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 0.62, 0.7, 4, 4, 4),
          new THREE.MeshStandardMaterial({ color: d.primaryColor, roughness: 0.25, metalness: 0.65 })
        );
        headsetGroup.add(mainChassis);

        // Curved Dark Reflective Glass Visor Faceplate
        const glassVisor = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.56, 0.12),
          new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.05, metalness: 0.95 })
        );
        glassVisor.position.z = 0.36;
        headsetGroup.add(glassVisor);

        // Dual Glowing Camera Optics Rings
        const lensGeo = new THREE.TorusGeometry(0.16, 0.035, 16, 24);
        const lensMat = new THREE.MeshBasicMaterial({ color: d.accentColor });
        const leftLens = new THREE.Mesh(lensGeo, lensMat);
        leftLens.position.set(-0.3, 0, 0.43);
        headsetGroup.add(leftLens);

        const rightLens = new THREE.Mesh(lensGeo, lensMat);
        rightLens.position.set(0.3, 0, 0.43);
        headsetGroup.add(rightLens);

        // Halo Headstrap
        const haloStrap = new THREE.Mesh(
          new THREE.TorusGeometry(0.68, 0.05, 12, 32, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.4 })
        );
        haloStrap.rotation.x = -Math.PI / 2;
        haloStrap.position.set(0, 0.28, -0.05);
        headsetGroup.add(haloStrap);

        masterGroup.add(headsetGroup);
      } else {
        // Building & Infrastructure: Lattice Skyscraper Cube
        const lattice = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 1.4, 1.1, 4, 5, 4),
          new THREE.MeshStandardMaterial({ color: d.primaryColor, wireframe: true })
        );
        masterGroup.add(lattice);

        const coreBlock = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.9, 0.6),
          new THREE.MeshStandardMaterial({ color: d.accentColor, roughness: 0.3 })
        );
        masterGroup.add(coreBlock);
      }

      // Parallax Tilt Controller for Card
      const card = container.closest('.domain-card');
      let targetRotX = 0, targetRotY = 0;

      if (card) {
        card.addEventListener('mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          targetRotY = x * 0.8;
          targetRotX = -y * 0.8;
        });

        card.addEventListener('mouseleave', () => {
          targetRotX = 0;
          targetRotY = 0;
        });
      }

      const clock = new THREE.Clock();

      function animate() {
        requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();

        // Continuous Rotation
        masterGroup.rotation.y += 0.015;
        masterGroup.rotation.x += 0.008;

        // Floating Idle Bobbing
        masterGroup.position.y = Math.sin(elapsed * 2.2) * 0.12;

        // Smooth Parallax Interpolation
        masterGroup.rotation.y += (targetRotY - masterGroup.rotation.y) * 0.1;
        masterGroup.rotation.x += (targetRotX - masterGroup.rotation.x) * 0.1;

        renderer.render(scene, camera);
      }

      animate();
    });
  }

  // =========================================================================
  // 6. RENDER 3D THUMBNAILS FOR PROJECT CARDS (STATE 2)
  // =========================================================================
  window.initProjectCardThumbnails = function() {
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

