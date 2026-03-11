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

  // ─── Fog zones ─────────────────────────────────────────────────────────────
  // Each zone defines bounds, ceiling height, wisp count, and ground fog extent
  const fogZones = [
    { // Main Lobby
      minX: -7, maxX: 7, minZ: -14, maxZ: 14,
      ceil: 5.5, wispCount: 20, groundW: 13, groundD: 26,
      groundX: 0, groundZ: 0,
    },
    { // East Hallway + offices combined envelope
      minX: 7.2, maxX: 24.5, minZ: -3.0, maxZ: 8.5,
      ceil: 3.0, wispCount: 12, groundW: 16, groundD: 10,
      groundX: 15.85, groundZ: 2.75,
    },
  ];

  // ─── Create fog wisps per zone ─────────────────────────────────────────────
  const wisps = [];

  for (const zone of fogZones) {
    const zoneW = zone.maxX - zone.minX;
    const zoneD = zone.maxZ - zone.minZ;
    for (let i = 0; i < zone.wispCount; i++) {
      const size = 4 + Math.random() * 5;
      const geom = new THREE.PlaneGeometry(size, size);
      const mat = wispMaterial.clone();
      mat.opacity = 0.12 + Math.random() * 0.14;

      const mesh = new THREE.Mesh(geom, mat);

      mesh.position.set(
        zone.minX + Math.random() * zoneW,
        0.8 + Math.random() * (zone.ceil - 2),
        zone.minZ + Math.random() * zoneD,
      );

      mesh.rotation.x = Math.random() * Math.PI;
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.rotation.z = Math.random() * Math.PI;

      mesh.renderOrder = 1;
      scene.add(mesh);

      wisps.push({
        mesh,
        zone,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.03,
          (Math.random() - 0.5) * 0.10,
        ),
        rotSpeed: (Math.random() - 0.5) * 0.1,
      });
    }
  }

  // ─── Ground fog planes (one per zone) ──────────────────────────────────────
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
  const groundFogTexture = new THREE.CanvasTexture(groundCanvas);

  const groundFogs = [];
  for (const zone of fogZones) {
    const gfMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.groundW, zone.groundD),
      new THREE.MeshStandardMaterial({
        map: groundFogTexture,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 1.0,
        metalness: 0.0,
        color: 0x4A3E30,
      }),
    );
    gfMesh.rotation.x = -Math.PI / 2;
    gfMesh.position.set(zone.groundX, 0.05, zone.groundZ);
    gfMesh.renderOrder = 0;
    scene.add(gfMesh);
    groundFogs.push(gfMesh);
  }

  let groundBreathPhase = 0;

  // ─── Update ────────────────────────────────────────────────────────────────
  function update(dt) {
    for (const wisp of wisps) {
      const m = wisp.mesh;
      const z = wisp.zone;
      m.position.addScaledVector(wisp.velocity, dt);
      m.rotation.y += wisp.rotSpeed * dt;

      // Wrap around zone bounds
      if (m.position.x > z.maxX) m.position.x = z.minX;
      if (m.position.x < z.minX) m.position.x = z.maxX;
      if (m.position.z > z.maxZ) m.position.z = z.minZ;
      if (m.position.z < z.minZ) m.position.z = z.maxZ;

      // Clamp and bounce height
      m.position.y = THREE.MathUtils.clamp(m.position.y, 0.5, z.ceil - 0.5);
      if (m.position.y <= 0.5 || m.position.y >= z.ceil - 0.5) {
        wisp.velocity.y *= -1;
      }
    }

    // Ground fog breathing
    groundBreathPhase += dt * 0.5;
    const opacity = 0.25 + Math.sin(groundBreathPhase) * 0.08;
    for (const gf of groundFogs) {
      gf.material.opacity = opacity;
    }
  }

  return { update };
}
