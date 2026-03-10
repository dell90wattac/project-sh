import * as THREE from 'three';

export function createFog(scene) {
  // ─── Procedural wisp texture (soft circular gradient) ──────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(40, 32, 26, 0.5)');
  gradient.addColorStop(0.4, 'rgba(40, 32, 26, 0.2)');
  gradient.addColorStop(1, 'rgba(40, 32, 26, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const fogTexture = new THREE.CanvasTexture(canvas);

  // ─── Wisp material (lit by scene lights automatically) ─────────────────────
  const wispMaterial = new THREE.MeshStandardMaterial({
    map: fogTexture,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 1.0,
    metalness: 0.0,
    color: 0x3A3028,
  });

  // ─── Room bounds ───────────────────────────────────────────────────────────
  const ROOM_W = 14;
  const ROOM_D = 28;
  const ROOM_MIN_Z = -14;
  const ROOM_MAX_Z = 14;
  const CEIL = 5.5;
  const WISP_COUNT = 20;

  // ─── Create fog wisps ──────────────────────────────────────────────────────
  const wisps = [];

  for (let i = 0; i < WISP_COUNT; i++) {
    const size = 4 + Math.random() * 5;
    const geom = new THREE.PlaneGeometry(size, size);
    const mat = wispMaterial.clone();
    mat.opacity = 0.12 + Math.random() * 0.14;

    const mesh = new THREE.Mesh(geom, mat);

    mesh.position.set(
      (Math.random() - 0.5) * (ROOM_W - 2),
      0.8 + Math.random() * (CEIL - 2),
      ROOM_MIN_Z + Math.random() * ROOM_D,
    );

    mesh.rotation.x = Math.random() * Math.PI;
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.rotation.z = Math.random() * Math.PI;

    mesh.renderOrder = 1;
    scene.add(mesh);

    wisps.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.03,
        (Math.random() - 0.5) * 0.10,
      ),
      rotSpeed: (Math.random() - 0.5) * 0.1,
    });
  }

  // ─── Ground fog plane ──────────────────────────────────────────────────────
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = 256;
  groundCanvas.height = 256;
  const gCtx = groundCanvas.getContext('2d');
  const gGrad = gCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gGrad.addColorStop(0, 'rgba(60, 50, 40, 0.45)');
  gGrad.addColorStop(0.6, 'rgba(60, 50, 40, 0.2)');
  gGrad.addColorStop(1, 'rgba(60, 50, 40, 0)');
  gCtx.fillStyle = gGrad;
  gCtx.fillRect(0, 0, 256, 256);

  const groundFog = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W - 1, ROOM_D - 2),
    new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(groundCanvas),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0,
      color: 0x4A3E30,
    }),
  );
  groundFog.rotation.x = -Math.PI / 2;
  groundFog.position.set(0, 0.05, 0);
  groundFog.renderOrder = 0;
  scene.add(groundFog);

  let groundBreathPhase = 0;

  // ─── Update ────────────────────────────────────────────────────────────────
  function update(dt) {
    for (const wisp of wisps) {
      const m = wisp.mesh;
      m.position.addScaledVector(wisp.velocity, dt);
      m.rotation.y += wisp.rotSpeed * dt;

      // Wrap around room bounds
      if (m.position.x > ROOM_W / 2)  m.position.x = -ROOM_W / 2;
      if (m.position.x < -ROOM_W / 2) m.position.x = ROOM_W / 2;
      if (m.position.z > ROOM_MAX_Z)   m.position.z = ROOM_MIN_Z;
      if (m.position.z < ROOM_MIN_Z)   m.position.z = ROOM_MAX_Z;

      // Clamp and bounce height
      m.position.y = THREE.MathUtils.clamp(m.position.y, 0.5, CEIL - 0.5);
      if (m.position.y <= 0.5 || m.position.y >= CEIL - 0.5) {
        wisp.velocity.y *= -1;
      }
    }

    // Ground fog breathing
    groundBreathPhase += dt * 0.5;
    groundFog.material.opacity = 0.25 + Math.sin(groundBreathPhase) * 0.08;
  }

  return { update };
}
