/* Hero 3D background — wireframe icosahedron + particle field, mouse parallax */
(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const heroSection = canvas.closest('.hero');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    heroSection.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 6;

  function sizeToHero() {
    const w = heroSection.clientWidth;
    const h = heroSection.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  sizeToHero();

  // Kept small and pushed to the right/back so it never overlaps the hero text column
  const isNarrow = window.innerWidth < 900;

  // Colors tuned per theme so the wireframe/particles stay visible against
  // both a near-black and a near-white hero background.
  const THEME_COLORS = {
    dark: {
      mesh1: 0x39ff88, mesh2: 0x22e8c4, particle: 0xffffff,
      op1: isNarrow ? 0.17 : 0.27, op2: isNarrow ? 0.13 : 0.2, particleOp: 0.5,
    },
    light: {
      mesh1: 0x0a7a43, mesh2: 0x0d7a6c, particle: 0x6f8f7d,
      op1: isNarrow ? 0.16 : 0.25, op2: isNarrow ? 0.12 : 0.18, particleOp: 0.45,
    },
  };
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  // Centered horizontally, dropped into the empty zone below the hero text/CTA/photo
  // so it reads as an ambient presence in the middle of the page without crossing
  // through readable text or hiding behind the photo frame.
  const geometry = new THREE.IcosahedronGeometry(2.5, 1);
  const material = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, -1.6, -7);
  scene.add(mesh);

  const geometry2 = new THREE.IcosahedronGeometry(1.5, 0);
  const material2 = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true });
  const mesh2 = new THREE.Mesh(geometry2, material2);
  mesh2.position.set(-1.8, -3.4, -9);
  scene.add(mesh2);

  // Particle field
  const particleCount = window.innerWidth < 700 ? 220 : 480;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 14;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({ size: 0.02, transparent: true });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  function applyTheme(name) {
    const t = THEME_COLORS[name] || THEME_COLORS.dark;
    material.color.setHex(t.mesh1);
    material.opacity = t.op1;
    material2.color.setHex(t.mesh2);
    material2.opacity = t.op2;
    particleMat.color.setHex(t.particle);
    particleMat.opacity = t.particleOp;
  }
  applyTheme(currentTheme());
  window.addEventListener('themechange', (e) => applyTheme(e.detail.theme));

  // Mouse parallax target
  let mouseX = 0, mouseY = 0;
  let targetRotX = 0, targetRotY = 0;
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  });

  window.addEventListener('resize', sizeToHero);

  const clock = new THREE.Clock();

  // Only burn GPU/CPU while the hero is actually on screen and the tab is
  // visible — otherwise this loop would render forever in the background,
  // even while scrolled deep into other sections or in a backgrounded tab.
  let rafId = null;
  let heroVisible = true;
  function shouldRun() {
    return heroVisible && !document.hidden;
  }

  function animate() {
    if (!shouldRun()) { rafId = null; return; }
    rafId = requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (!reducedMotion) {
      mesh.rotation.x += delta * 0.15;
      mesh.rotation.y += delta * 0.2;
      mesh2.rotation.x -= delta * 0.1;
      mesh2.rotation.y -= delta * 0.12;
      particles.rotation.y += delta * 0.02;
    }

    targetRotY += (mouseX * 0.3 - targetRotY) * 0.03;
    targetRotX += (mouseY * 0.2 - targetRotX) * 0.03;
    scene.rotation.y = targetRotY;
    scene.rotation.x = targetRotX;

    renderer.render(scene, camera);
  }

  function wake() {
    if (rafId !== null || !shouldRun()) return;
    clock.getDelta(); // drop the paused duration so motion doesn't jump on resume
    rafId = requestAnimationFrame(animate);
  }

  if ('IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) wake();
    });
    heroObserver.observe(heroSection);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake();
  });

  wake();
})();
