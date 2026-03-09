import * as THREE from 'three';

/**
 * Test room — RCPD-lobby inspired layout.
 * Compressed ~50% tighter for claustrophobic grandeur: 20×40×10m room with
 * columns, wainscoting, dense balustrades, layered lighting, and heavy furniture.
 */
export function createWorld(scene, physicsWorld) {
  const colliders = [];

  // ─── Materials ──────────────────────────────────────────────────────────
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 256;
  floorCanvas.height = 256;
  const floorCtx = floorCanvas.getContext('2d');
  floorCtx.fillStyle = '#E8E8E8';
  floorCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    floorCtx.fillStyle = `hsl(${200 + Math.random() * 20}, 20%, ${65 + Math.random() * 20}%)`;
    floorCtx.beginPath();
    floorCtx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 10, 0, Math.PI * 2);
    floorCtx.fill();
  }
  for (let i = 0; i < 20; i++) {
    floorCtx.strokeStyle = `rgba(160,155,145,0.4)`;
    floorCtx.lineWidth = Math.random() * 2 + 0.5;
    floorCtx.beginPath();
    const x0 = Math.random() * 256;
    const y0 = Math.random() * 256;
    floorCtx.moveTo(x0, y0);
    floorCtx.bezierCurveTo(
      x0 + Math.random() * 80 - 40, y0 + Math.random() * 80 - 40,
      x0 + Math.random() * 80 - 40, y0 + Math.random() * 80 - 40,
      x0 + Math.random() * 120 - 60, y0 + Math.random() * 120 - 60
    );
    floorCtx.stroke();
  }
  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(5, 5);

  const M = {
    floor:      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.75 }),
    wall:       new THREE.MeshStandardMaterial({ color: 0xF0EDE4, roughness: 0.92 }),
    ceiling:    new THREE.MeshStandardMaterial({ color: 0xF8F6F0, roughness: 0.97 }),
    stair:      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.7 }),
    desk:       new THREE.MeshStandardMaterial({ color: 0x6B3410, roughness: 0.85 }),
    deskTop:    new THREE.MeshStandardMaterial({ color: 0xD8CEB8, roughness: 0.65, metalness: 0.05 }),
    railing:    new THREE.MeshStandardMaterial({ color: 0xC8A840, roughness: 0.35, metalness: 0.85 }),
    bench:      new THREE.MeshStandardMaterial({ color: 0x5C3A1E, roughness: 0.8 }),
    lamp:       new THREE.MeshStandardMaterial({ color: 0x282828, roughness: 0.45, metalness: 0.92 }),
    lampShade:  new THREE.MeshStandardMaterial({ color: 0xFFF8CC, roughness: 0.6, emissive: 0x443300, emissiveIntensity: 0.3 }),
    column:     new THREE.MeshStandardMaterial({ color: 0xC8C0B0, roughness: 0.88 }),
    wainscot:   new THREE.MeshStandardMaterial({ color: 0xC8BA98, roughness: 0.95 }),
    metal:      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.8 }),
    black:      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }),
    darkGrey:   new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.6 }),
    paper:      new THREE.MeshStandardMaterial({ color: 0xF5F0E0, roughness: 0.9 }),
    magazine:   new THREE.MeshStandardMaterial({ color: 0x8B2020, roughness: 0.9 }),
  };

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  function decor(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ─── Dimensions (compressed ~50%) ───────────────────────────────────────
  const W          = 20;     // room width  (X: -10 to +10)
  const CEIL       = 10;     // ceiling height
  const PLATFORM_Y = 1.5;    // entry platform floor surface
  const STAIR_HEIGHT = 3.5;  // balcony height
  const BACK_Z     = -20;
  const FRONT_Z    =  20;
  const DEPTH      = 40;

  // ─── Floors ──────────────────────────────────────────────────────────────
  // Main floor: Z -13 → +13
  box(W, 0.2, 26, 0, -0.1, 0, M.floor);
  // Entry platform: Z +13 → +20
  box(W, 0.2, 7, 0, PLATFORM_Y - 0.1, 16.5, M.floor);

  // ─── Walls & Ceiling ─────────────────────────────────────────────────────
  box(0.2, CEIL, DEPTH, -10, CEIL / 2, 0, M.wall);       // left
  box(0.2, CEIL, DEPTH,  10, CEIL / 2, 0, M.wall);       // right
  box(W,   CEIL, 0.2,    0, CEIL / 2, BACK_Z,  M.wall);  // back
  box(W,   CEIL, 0.2,    0, CEIL / 2, FRONT_Z, M.wall);  // front
  box(W,   0.2,  DEPTH,  0, CEIL + 0.1, 0,     M.ceiling);

  // ─── Wainscoting (lower wall panels) ─────────────────────────────────────
  decor(0.12, 1.5, 38,   -9.94, 0.75, 0,      M.wainscot);
  decor(0.12, 1.5, 38,    9.94, 0.75, 0,      M.wainscot);
  decor(20,   1.5, 0.12,  0, 0.75, BACK_Z  + 0.06, M.wainscot);
  decor(20,   1.5, 0.12,  0, 0.75, FRONT_Z - 0.06, M.wainscot);

  // ─── Crown Molding ───────────────────────────────────────────────────────
  decor(0.18, 0.28, DEPTH, -9.91, CEIL - 0.14, 0,          M.wainscot);
  decor(0.18, 0.28, DEPTH,  9.91, CEIL - 0.14, 0,          M.wainscot);
  decor(W,    0.28, 0.18,   0, CEIL - 0.14, BACK_Z  + 0.09, M.wainscot);
  decor(W,    0.28, 0.18,   0, CEIL - 0.14, FRONT_Z - 0.09, M.wainscot);

  // ─── Down Staircase (entry platform → main floor) ────────────────────────
  // 6 steps × 0.25m each = 1.5m drop (matching PLATFORM_Y)
  for (let i = 0; i < 6; i++) {
    const h = (6 - i) * 0.25;
    const z = 16 - i * 0.5;
    box(W, h, 0.5, 0, h / 2, z, M.stair);
  }

  // Newel posts
  box(0.25, 2.0, 0.25, -9.9, 1.0, 14.0, M.railing);
  box(0.25, 2.0, 0.25,  9.9, 1.0, 14.0, M.railing);
  box(0.25, 2.1, 0.25, -9.9, 1.05, 16.5, M.railing);
  box(0.25, 2.1, 0.25,  9.9, 1.05, 16.5, M.railing);

  // Top & bottom rails
  box(W + 0.2, 0.07, 0.07, 0, 1.65, 13.5, M.railing);
  box(W + 0.2, 0.07, 0.07, 0, 1.65, 16.5, M.railing);
  // Balusters along front staircase — 13 evenly spaced
  for (let i = 0; i < 13; i++) {
    const bx = -9.5 + i * 1.58;
    decor(0.07, 1.6, 0.07, bx, 0.83, 13.5, M.railing);
  }

  // ─── Marble Columns (3 pairs, create columned nave) ───────────────────────
  const COLUMN_PAIRS = [
    { z: +8 },
    { z: -1 },
    { z: -9 },
  ];
  for (const { z } of COLUMN_PAIRS) {
    for (const cx of [-4.5, 4.5]) {
      box(0.75, CEIL - 1, 0.75, cx, (CEIL - 1) / 2, z, M.column);    // shaft
      box(1.15, 0.55, 1.15, cx, 0.275, z, M.column);                  // plinth
      box(1.25, 0.4, 1.25, cx, CEIL - 0.8, z, M.column);              // capital
    }
  }

  // ─── Front Desk ──────────────────────────────────────────────────────────
  // Main counter body
  box(7, 1.1, 0.7, 0, 0.55, -7, M.desk);
  // Marble counter top
  box(7.2, 0.08, 0.9, 0, 1.12, -6.95, M.deskTop);
  // Back panel (tall dark wood)
  box(7, 2.5, 0.2, 0, 1.25, -7.75, M.desk);
  // Raised center check-in tower
  box(2.2, 0.55, 0.72, 0, 1.42, -7, M.desk);
  box(2.3, 0.07, 0.85, 0, 1.72, -6.98, M.deskTop);

  // Pigeon-hole shelves on back panel (3 rows × 6 columns)
  for (let row = 0; row < 3; row++) {
    for (let col = -2; col <= 3; col++) {
      decor(0.06, 0.35, 0.22, col * 1.05 - 0.25, 1.6 + row * 0.45, -7.68, M.wainscot);
    }
  }

  // Computer monitor
  decor(0.06, 0.34, 0.46, 0, 1.32, -6.9, M.black);
  decor(0.5,  0.34, 0.06, 0, 1.49, -7.12, M.darkGrey);

  // Telephone
  decor(0.22, 0.09, 0.30, -0.85, 1.18, -6.9, M.black);

  // Desk lamp
  decor(0.12, 0.06, 0.12, 1.0, 1.16, -6.85, M.lamp);
  decor(0.06, 0.48, 0.06, 1.0, 1.42, -6.85, M.lamp);
  decor(0.30, 0.20, 0.30, 1.0, 1.69, -6.85, M.lampShade);
  const deskLampLight = new THREE.PointLight(0xFFE890, 1.8, 5);
  deskLampLight.position.set(1.0, 1.6, -6.85);
  scene.add(deskLampLight);

  // Inbox tray + paper
  decor(0.36, 0.04, 0.30, 0.45, 1.16, -6.85, M.metal);
  decor(0.30, 0.02, 0.24, 0.45, 1.19, -6.85, M.paper);

  // Pencil cup + pencils
  decor(0.1, 0.16, 0.1, 0.25, 1.17, -6.78, M.desk);
  for (let i = 0; i < 4; i++) {
    decor(0.015, 0.22, 0.015, 0.23 + i * 0.018, 1.28, -6.78, new THREE.MeshStandardMaterial({ color: 0xFFDD00 }));
  }

  // Chair (left of center)
  box(0.65, 0.08, 0.65, -1.3, 0.52, -6.9, M.bench);
  decor(0.07, 0.46, 0.65, -1.3, 0.77, -7.18, M.bench);
  decor(0.06, 0.52, 0.06, -1.62, 0.26, -6.58, M.lamp);
  decor(0.06, 0.52, 0.06, -0.98, 0.26, -6.58, M.lamp);
  decor(0.06, 0.52, 0.06, -1.62, 0.26, -7.22, M.lamp);
  decor(0.06, 0.52, 0.06, -0.98, 0.26, -7.22, M.lamp);

  // Filing cabinet behind desk
  box(0.52, 1.1, 0.65, -2.5, 0.55, -7.5, M.desk);
  decor(0.45, 0.06, 0.02, -2.5, 0.72, -7.19, M.metal);
  decor(0.45, 0.06, 0.02, -2.5, 1.05, -7.19, M.metal);

  // Water cooler
  box(0.8, 1.9, 0.8, 8.5, 0.95, -7, M.wainscot);
  decor(0.5, 0.55, 0.5, 8.5, 2.2, -7, new THREE.MeshStandardMaterial({ color: 0x6688CC, roughness: 0.4, metalness: 0.3 }));
  decor(0.62, 0.08, 0.62, 8.5, 2.5, -7, M.metal);

  // ─── Left Staircase (against left wall → balcony) ────────────────────────
  const NUM_STEPS = 10;
  const STEP_RISE = STAIR_HEIGHT / NUM_STEPS;   // 0.35m per step
  const STEP_RUN  = 1.0;

  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = -4 - i * STEP_RUN;
    box(2.5, h, STEP_RUN, -8, h / 2, z, M.stair);
  }

  // Left staircase: wall-side baseboard
  box(0.08, STAIR_HEIGHT + 0.3, NUM_STEPS * STEP_RUN, -9.25, STAIR_HEIGHT / 2, -4 - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  // Left staircase: inner vertical balusters (stepping up)
  const leftInnerX = -6.75;
  for (let i = 0; i < 9; i++) {
    const bz   = -4 - i * (NUM_STEPS * STEP_RUN / 8);
    const topY = (i / 8) * STAIR_HEIGHT;
    const postH = topY + 0.65;
    decor(0.07, postH, 0.07, leftInnerX, postH / 2, bz, M.railing);
  }
  decor(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, leftInnerX, STAIR_HEIGHT / 2, -4 - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Right Staircase (against right wall) ────────────────────────────────
  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = -4 - i * STEP_RUN;
    box(2.5, h, STEP_RUN, 8, h / 2, z, M.stair);
  }

  box(0.08, STAIR_HEIGHT + 0.3, NUM_STEPS * STEP_RUN, 9.25, STAIR_HEIGHT / 2, -4 - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  const rightInnerX = 6.75;
  for (let i = 0; i < 9; i++) {
    const bz   = -4 - i * (NUM_STEPS * STEP_RUN / 8);
    const topY = (i / 8) * STAIR_HEIGHT;
    const postH = topY + 0.65;
    decor(0.07, postH, 0.07, rightInnerX, postH / 2, bz, M.railing);
  }
  decor(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, rightInnerX, STAIR_HEIGHT / 2, -4 - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Balcony ─────────────────────────────────────────────────────────────
  const BALCONY_Z = -4 - NUM_STEPS * STEP_RUN;   // -14
  box(W, 0.2, 4, 0, STAIR_HEIGHT - 0.1, BALCONY_Z + 2, M.floor);

  // Dense front balustrade: bottom rail + top rail + 19 balusters
  box(W, 0.10, 0.10, 0, STAIR_HEIGHT + 0.05, BALCONY_Z, M.railing);
  box(W, 0.10, 0.10, 0, STAIR_HEIGHT + 1.05, BALCONY_Z, M.railing);
  for (let i = 0; i < 19; i++) {
    decor(0.08, 0.90, 0.08, -9 + i * 1.0, STAIR_HEIGHT + 0.55, BALCONY_Z, M.railing);
  }
  // Side guard rails
  box(0.07, 1.1, 4, -10, STAIR_HEIGHT + 0.55, BALCONY_Z + 2, M.railing);
  box(0.07, 1.1, 4,  10, STAIR_HEIGHT + 0.55, BALCONY_Z + 2, M.railing);
  // Back rail
  box(W, 0.07, 0.07, 0, STAIR_HEIGHT + 1.0, BALCONY_Z + 4, M.railing);

  // ─── Benches ─────────────────────────────────────────────────────────────
  // Left bench
  box(2.5, 0.10, 0.85, -6.5, 0.52, -10, M.bench);
  box(0.10, 0.52, 0.85, -7.75, 0.26, -10, M.bench);
  box(0.10, 0.52, 0.85, -5.25, 0.26, -10, M.bench);
  box(0.10, 0.52, 0.85, -6.5, 0.78, -10.43, M.bench);
  decor(0.10, 0.28, 0.85, -7.75, 0.67, -10, M.bench);
  decor(0.10, 0.28, 0.85, -5.25, 0.67, -10, M.bench);
  decor(0.22, 0.03, 0.65, -6.7, 0.54, -9.82, M.magazine);
  decor(0.22, 0.03, 0.65, -6.2, 0.54, -9.82, M.paper);

  // Left side table
  box(0.60, 0.50, 0.55, -8.7, 0.25, -10, M.bench);
  box(0.68, 0.06, 0.63, -8.7, 0.53, -10, M.bench);
  decor(0.22, 0.03, 0.65, -8.7, 0.57, -10, M.magazine);

  // Right bench
  box(2.5, 0.10, 0.85, 6.5, 0.52, -10, M.bench);
  box(0.10, 0.52, 0.85, 5.25, 0.26, -10, M.bench);
  box(0.10, 0.52, 0.85, 7.75, 0.26, -10, M.bench);
  box(0.10, 0.52, 0.85, 6.5, 0.78, -10.43, M.bench);
  decor(0.10, 0.28, 0.85, 5.25, 0.67, -10, M.bench);
  decor(0.10, 0.28, 0.85, 7.75, 0.67, -10, M.bench);
  decor(0.22, 0.03, 0.65, 6.3, 0.54, -9.82, M.magazine);
  decor(0.22, 0.03, 0.65, 6.8, 0.54, -9.82, M.paper);

  // Right side table
  box(0.60, 0.50, 0.55, 8.7, 0.25, -10, M.bench);
  box(0.68, 0.06, 0.63, 8.7, 0.53, -10, M.bench);
  decor(0.22, 0.03, 0.65, 8.7, 0.57, -10, M.magazine);

  // ─── Standing Lamps ──────────────────────────────────────────────────────
  // Left lamp (near bench)
  box(0.15, 2.1, 0.15, -6.5, 1.05, -9, M.lamp);
  decor(0.5, 0.35, 0.5, -6.5, 2.27, -9, M.lampShade);
  const lampLight1 = new THREE.PointLight(0xFFDF80, 2.2, 10);
  lampLight1.position.set(-6.5, 2.1, -9);
  scene.add(lampLight1);

  // Right lamp (near bench)
  box(0.15, 2.1, 0.15, 6.5, 1.05, -9, M.lamp);
  decor(0.5, 0.35, 0.5, 6.5, 2.27, -9, M.lampShade);
  const lampLight2 = new THREE.PointLight(0xFFDF80, 2.2, 10);
  lampLight2.position.set(6.5, 2.1, -9);
  scene.add(lampLight2);

  // ─── Wall Sconces (6 total — 3 per side wall) ────────────────────────────
  const sconceZPositions = [8, 0, -8];
  for (const sz of sconceZPositions) {
    // Left wall
    decor(0.30, 0.10, 0.40, -9.75, 3.05, sz, M.lamp);
    decor(0.38, 0.28, 0.38, -9.55, 3.15, sz, M.lampShade);
    const sl = new THREE.PointLight(0xFFE0A0, 1.6, 8);
    sl.position.set(-8.8, 3.1, sz);
    scene.add(sl);

    // Right wall
    decor(0.30, 0.10, 0.40, 9.75, 3.05, sz, M.lamp);
    decor(0.38, 0.28, 0.38, 9.55, 3.15, sz, M.lampShade);
    const sr = new THREE.PointLight(0xFFE0A0, 1.6, 8);
    sr.position.set(8.8, 3.1, sz);
    scene.add(sr);
  }

  // ─── Lighting ─────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x30282C, 0.12));

  [
    [0,   CEIL - 1,  3  ],
    [0,   CEIL - 1, -7  ],
    [-6,  CEIL - 1, -3  ],
    [ 6,  CEIL - 1, -3  ],
    [0,   CEIL - 1,  14 ],
  ].forEach(([x, y, z]) => {
    const pl = new THREE.PointLight(0xFFF4E8, 2.5, 24, 1.8);
    pl.position.set(x, y, z);
    scene.add(pl);
  });

  // ─── Damage Pillar (deals 1 damage/sec on contact) ────────────────────────
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.7, metalness: 0.3 });
  const pillarX = 3.5, pillarZ = 0;
  const pillarRadius = 0.5;
  const pillarHeight = 3;

  const pillarMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius, pillarRadius, pillarHeight, 12),
    pillarMat
  );
  pillarMesh.position.set(pillarX, pillarHeight / 2, pillarZ);
  pillarMesh.castShadow = true;
  pillarMesh.receiveShadow = true;
  scene.add(pillarMesh);

  const capMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius * 1.2, pillarRadius * 1.2, 0.15, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.5, metalness: 0.5 })
  );
  capMesh.position.set(pillarX, pillarHeight + 0.075, pillarZ);
  scene.add(capMesh);

  colliders.push(new THREE.Box3().setFromObject(pillarMesh));

  const hazards = [
    {
      type: 'damagePillar',
      position: { x: pillarX, z: pillarZ },
      radius: pillarRadius + 0.6,
      damagePerSecond: 1,
      damageType: 'generic',
    },
  ];

  return { colliders, hazards, update: () => {} };
}
