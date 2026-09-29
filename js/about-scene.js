/**
 * XR Research Lab — About Page 3D Spatial Background Scene
 * Three.js 3D Cosmos Scene: Planet, 4D Tesseract Core, 3 Orbiting Satellites,
 * and Tiny Astronaut Characters with Thruster Flames.
 * Visible through the Glossy Glassmorphism Cards.
 */

(function () {
  'use strict';

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

    // Ambient & Directional Lighting — Cinematic Blue & White
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x60a5fa, 1.4);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    // Main 3D Space Master Group
    const spaceGroup = new THREE.Group();
    scene.add(spaceGroup);

    // -------------------------------------------------------------------------
    // A. ULTRA-TINY ALIEN ASTRONAUT CHARACTERS WITH PROPELLERS & JETPACK THRUSTERS
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
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
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
      const antBallMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
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
        const nozGeo = new THREE.CylinderGeometry(0.07 * scale, 0.12 * scale, 0.22 * scale, 12);
        const nozMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.2 });
        const noz = new THREE.Mesh(nozGeo, nozMat);
        noz.position.set(posX, -0.42 * scale, -0.4 * scale);
        noz.rotation.x = Math.PI;
        charGroup.add(noz);

        const flameGeo = new THREE.ConeGeometry(0.11 * scale, 0.38 * scale, 12);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(posX, -0.68 * scale, -0.4 * scale);
        flame.rotation.x = Math.PI;
        charGroup.add(flame);
        flames.push(flame);
      });
      charGroup.userData.flames = flames;

      return charGroup;
    }

    // Ultra-tiny Aliens roaming around space
    const cartoon1 = createCartoonCharacter(0x3b82f6, 0.12);
    cartoon1.position.set(-2.8, 1.2, 1.0);
    spaceGroup.add(cartoon1);

    const cartoon2 = createCartoonCharacter(0x60a5fa, 0.09);
    cartoon2.position.set(2.8, -1.2, 1.2);
    spaceGroup.add(cartoon2);

    const cartoon3 = createCartoonCharacter(0x38bdf8, 0.07);
    cartoon3.position.set(1.5, 1.8, 0.8);
    spaceGroup.add(cartoon3);

    // -------------------------------------------------------------------------
    // B. 3 HIGH-TECH SATELLITES ORBITING
    // -------------------------------------------------------------------------
    function createSatellite(solarColorHex = 0x38bdf8, scale = 0.2) {
      const satGroup = new THREE.Group();

      const bodyGeo = new THREE.BoxGeometry(0.5 * scale, 0.5 * scale, 0.7 * scale);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.85, roughness: 0.2 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      satGroup.add(body);

      const foilGeo = new THREE.BoxGeometry(0.42 * scale, 0.42 * scale, 0.06 * scale);
      const foilMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.95, roughness: 0.1 });
      const foil = new THREE.Mesh(foilGeo, foilMat);
      foil.position.z = 0.36 * scale;
      satGroup.add(foil);

      const dishGeo = new THREE.CylinderGeometry(0.35 * scale, 0.05 * scale, 0.15 * scale, 16);
      const dishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.3 });
      const dish = new THREE.Mesh(dishGeo, dishMat);
      dish.position.set(0, 0.38 * scale, 0);
      dish.rotation.x = -Math.PI / 4;
      satGroup.add(dish);

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

      const beaconGeo = new THREE.SphereGeometry(0.1 * scale, 12, 12);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9 });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(0, -0.32 * scale, 0);
      satGroup.add(beacon);
      satGroup.userData.beacon = beacon;

      return satGroup;
    }

    const sat1 = createSatellite(0x38bdf8, 0.22);
    const sat2 = createSatellite(0x60a5fa, 0.18);
    const sat3 = createSatellite(0x93c5fd, 0.15);

    spaceGroup.add(sat1);
    spaceGroup.add(sat2);
    spaceGroup.add(sat3);

    // -------------------------------------------------------------------------
    // C. ENLARGED PLANET WITH WIREFRAME RINGS & 4D HYPERCUBE CORE
    // -------------------------------------------------------------------------
    const planetGeo = new THREE.SphereGeometry(3.2, 36, 36);
    const planetMat = new THREE.MeshToonMaterial({ color: 0x1e293b, transparent: true, opacity: 1.0 });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(0.2, -0.4, -2.8);

    // Planet Outer & Inner Wireframe Rings
    const ringGeo = new THREE.TorusGeometry(4.8, 0.14, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true });
    const pRing = new THREE.Mesh(ringGeo, ringMat);
    pRing.rotation.x = Math.PI / 2.3;
    planet.add(pRing);

    const innerRingGeo = new THREE.TorusGeometry(4.1, 0.05, 16, 64);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.6 });
    const pRingInner = new THREE.Mesh(innerRingGeo, innerRingMat);
    pRingInner.rotation.x = Math.PI / 2.3;
    planet.add(pRingInner);

    // Craters on Planet Surface
    const craterMat = new THREE.MeshToonMaterial({ color: 0x0f172a, transparent: true, opacity: 1.0 });
    const craterGeo = new THREE.SphereGeometry(0.55, 16, 16);

    const crater1 = new THREE.Mesh(craterGeo, craterMat);
    crater1.position.set(1.9, 1.6, 1.8);
    crater1.scale.set(1, 0.3, 1);
    planet.add(crater1);

    const crater2 = new THREE.Mesh(craterGeo, craterMat);
    crater2.position.set(-1.6, -1.1, 2.3);
    crater2.scale.set(0.7, 0.25, 0.7);
    planet.add(crater2);

    // -------------------------------------------------------------------------
    // D. 4D TESSERACT HYPERCUBE STRUCTURE INSIDE PLANET CORE
    // -------------------------------------------------------------------------
    const coreGroup = new THREE.Group();
    planet.add(coreGroup);

    const outerHyperGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const outerHyperMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true });
    const outerHyper = new THREE.Mesh(outerHyperGeo, outerHyperMat);
    coreGroup.add(outerHyper);

    const innerHyperGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    const innerHyperMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, wireframe: true });
    const innerHyper = new THREE.Mesh(innerHyperGeo, innerHyperMat);
    coreGroup.add(innerHyper);

    const hyperStrutsGroup = new THREE.Group();
    const corners = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1],  [1, -1, 1],  [1, 1, 1],  [-1, 1, 1]
    ];
    corners.forEach(c => {
      const pOuter = new THREE.Vector3(c[0] * 1.1, c[1] * 1.1, c[2] * 1.1);
      const pInner = new THREE.Vector3(c[0] * 0.55, c[1] * 0.55, c[2] * 0.55);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([pOuter, pInner]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
      const strut = new THREE.Line(lineGeo, lineMat);
      hyperStrutsGroup.add(strut);
    });
    coreGroup.add(hyperStrutsGroup);

    const tRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 16, 64), new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }));
    const tRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 16, 64), new THREE.MeshBasicMaterial({ color: 0x60a5fa, wireframe: true }));
    tRing2.rotation.x = Math.PI / 2;
    coreGroup.add(tRing1);
    coreGroup.add(tRing2);

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
    const cMat = new THREE.PointsMaterial({ color: 0x60a5fa, size: 0.07, transparent: true, opacity: 0.85 });
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

    // Animation Loop with Scroll-Driven Zoom
    let clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      const scrollY = window.scrollY || window.pageYOffset || 0;
      const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      const scrollProgress = Math.min(Math.max(scrollY / maxScroll, 0), 1);

      // Smooth camera zoom
      const targetCamZ = 8.0 - scrollProgress * 10.2;
      const targetCamX = (0.2 - scrollProgress * 0.2) + mouseX * 0.3;
      const targetCamY = (-0.4 + scrollProgress * 0.0) - mouseY * 0.2;

      camera.position.z += (targetCamZ - camera.position.z) * 0.08;
      camera.position.x += (targetCamX - camera.position.x) * 0.08;
      camera.position.y += (targetCamY - camera.position.y) * 0.08;

      const planetOpacity = Math.max(0.12, 1.0 - (scrollProgress * 1.6));
      planetMat.opacity = planetOpacity;
      craterMat.opacity = planetOpacity;

      // Planet floating
      planet.position.x = 0.2 + Math.sin(elapsed * 0.12) * 0.5;
      planet.position.y = -0.4 + Math.cos(elapsed * 0.15) * 0.25;
      planet.rotation.y += 0.004;

      // 4D Core rotation
      outerHyper.rotation.x = elapsed * 0.5;
      outerHyper.rotation.y = elapsed * 0.7;
      innerHyper.rotation.x = -elapsed * 0.9;
      innerHyper.rotation.z = elapsed * 0.6;
      hyperStrutsGroup.rotation.x = elapsed * 0.5;
      hyperStrutsGroup.rotation.y = elapsed * 0.7;
      tRing1.rotation.y = elapsed * 0.8;
      tRing2.rotation.x = elapsed * 0.8;
      orb.rotation.x = elapsed * 1.2;
      orb.rotation.y = elapsed * 1.5;
      const orbScale = 1.0 + Math.sin(elapsed * 4) * 0.12;
      orb.scale.set(orbScale, orbScale, orbScale);
      coreParticles.rotation.y += 0.01;

      // Satellites
      const a1 = elapsed * 0.65;
      sat1.position.set(planet.position.x + Math.cos(a1) * 5.6, planet.position.y + Math.sin(a1) * 0.8, planet.position.z + Math.sin(a1) * 4.6);
      sat1.rotation.y = a1 + Math.PI / 2;
      if (sat1.userData.beacon) sat1.userData.beacon.material.opacity = 0.4 + Math.sin(elapsed * 6) * 0.5;

      const a2 = elapsed * 0.48 + 1.8;
      sat2.position.set(planet.position.x + Math.sin(a2) * 1.8, planet.position.y + Math.cos(a2) * 5.8, planet.position.z + Math.sin(a2 * 1.2) * 4.2);
      sat2.rotation.x = a2;
      if (sat2.userData.beacon) sat2.userData.beacon.material.opacity = 0.4 + Math.cos(elapsed * 7) * 0.5;

      const a3 = -elapsed * 0.42 + 4.0;
      sat3.position.set(planet.position.x + Math.cos(a3) * 6.2, planet.position.y + Math.sin(a3) * 2.8, planet.position.z + Math.sin(a3 * 1.3) * 5.0);
      sat3.rotation.y = -a3;
      if (sat3.userData.beacon) sat3.userData.beacon.material.opacity = 0.4 + Math.sin(elapsed * 8) * 0.5;

      // Aliens
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
        if (a.mesh.userData.propeller) a.mesh.userData.propeller.rotation.y += 0.4;
        if (a.mesh.userData.flames) {
          a.mesh.userData.flames.forEach(f => {
            f.scale.set(1, 0.7 + Math.random() * 0.6, 1);
          });
        }
      });

      // Mouse Parallax
      spaceGroup.rotation.y += (mouseX * 0.2 - spaceGroup.rotation.y) * 0.05;
      spaceGroup.rotation.x += (mouseY * 0.12 - spaceGroup.rotation.x) * 0.05;

      renderer.render(scene, camera);
    }

    animate();
  }

  // Scroll Reveal Intersection Observer
  function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(r => observer.observe(r));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init3DBackgroundScene();
      initScrollReveal();
    });
  } else {
    init3DBackgroundScene();
    initScrollReveal();
  }
})();
