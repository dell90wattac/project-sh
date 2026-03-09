import * as THREE from 'three';

/**
 * Test room — RCPD-lobby inspired.
 * Dense, tight proportions: 14×28×5.5m (≈50×100 player-block units).
 * Lower ceiling, compressed furnishings, narrow aisles between columns and stairs.
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
  floorTexture.repeat.set(4, 4);

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

  // ─── Room dimensions: 14 × 28 × 5.5 (≈ 50×100 player blocks) ───────────
  const W            = 14;     // width  (X: -7 to +7)
  const CEIL         = 5.5;    // ceiling height
  const DEPTH        = 28;     // total depth (Z: -14 to +14)
  const BACK_Z       = -14;
  const FRONT_Z      =  14;
  const PLATFORM_Y   = 0.9;    // entry platform surface height
  const STAIR_HEIGHT = 2.5;    // balcony level

  // ─── Floors ──────────────────────────────────────────────────────────────
  // Main floor: Z -9 to +9  (18 m long)
  box(W, 0.2, 18, 0, -0.1, 0, M.floor);
  // Entry platform: Z +9 to +14  (5 m long)
  box(W, 0.2, 5, 0, PLATFORM_Y - 0.1, 11.5, M.floor);

  // ─── Walls & Ceiling ─────────────────────────────────────────────────────
  box(0.2, CEIL, DEPTH, -7,  CEIL / 2, 0,       M.wall);   // left
  box(0.2, CEIL, DEPTH,  7,  CEIL / 2, 0,       M.wall);   // right
  box(W,   CEIL, 0.2,    0,  CEIL / 2, BACK_Z,  M.wall);   // back
  box(W,   CEIL, 0.2,    0,  CEIL / 2, FRONT_Z, M.wall);   // front
  box(W,   0.2,  DEPTH,  0,  CEIL + 0.1, 0,     M.ceiling);

  // ─── Wainscoting ─────────────────────────────────────────────────────────
  decor(0.11, 1.0, 27,  -6.94, 0.50, 0,                 M.wainscot);
  decor(0.11, 1.0, 27,   6.94, 0.50, 0,                 M.wainscot);
  decor(W,    1.0, 0.11, 0,    0.50, BACK_Z  + 0.055,   M.wainscot);
  decor(W,    1.0, 0.11, 0,    0.50, FRONT_Z - 0.055,   M.wainscot);

  // ─── Crown Molding ───────────────────────────────────────────────────────
  decor(0.13, 0.20, DEPTH, -6.93, CEIL - 0.10, 0,           M.wainscot);
  decor(0.13, 0.20, DEPTH,  6.93, CEIL - 0.10, 0,           M.wainscot);
  decor(W,    0.20, 0.13,   0,    CEIL - 0.10, BACK_Z  + 0.065, M.wainscot);
  decor(W,    0.20, 0.13,   0,    CEIL - 0.10, FRONT_Z - 0.065, M.wainscot);

  // ─── Entry Staircase (platform → main floor, 3 steps × 0.3 m) ───────────
  for (let i = 0; i < 3; i++) {
    const h = (3 - i) * 0.30;
    const z = 11.5 - i * 0.5;
    box(W, h, 0.5, 0, h / 2, z, M.stair);
  }

  // Newel posts
  box(0.18, 1.35, 0.18, -6.9, 0.675, 9.5,  M.railing);
  box(0.18, 1.35, 0.18,  6.9, 0.675, 9.5,  M.railing);
  box(0.18, 1.40, 0.18, -6.9, 0.700, 12.2, M.railing);
  box(0.18, 1.40, 0.18,  6.9, 0.700, 12.2, M.railing);

  // Rails
  box(W + 0.2, 0.06, 0.06, 0, 1.36, 9.5,  M.railing);
  box(W + 0.2, 0.06, 0.06, 0, 1.36, 12.2, M.railing);
  // Balusters (11 evenly spaced across 14 m)
  for (let i = 0; i < 11; i++) {
    decor(0.06, 1.26, 0.06, -6.3 + i * 1.26, 0.67, 9.5, M.railing);
  }

  // ─── Marble Columns (3 pairs) ─────────────────────────────────────────────
  const COLUMN_PAIRS = [{ z: +5 }, { z: -1 }, { z: -7 }];
  for (const { z } of COLUMN_PAIRS) {
    for (const cx of [-3.0, 3.0]) {
      box(0.55, CEIL - 0.6, 0.55, cx, (CEIL - 0.6) / 2, z, M.column); // shaft
      box(0.85, 0.36, 0.85, cx, 0.18, z, M.column);                    // plinth
      box(0.95, 0.26, 0.95, cx, CEIL - 0.47, z, M.column);             // capital
    }
  }

  // ─── Front Desk ──────────────────────────────────────────────────────────
  box(4.5, 0.95, 0.60, 0, 0.475, -4.0, M.desk);                // counter body
  box(4.7, 0.07, 0.76, 0, 0.975, -3.95, M.deskTop);            // marble top
  box(4.5, 2.10, 0.18, 0, 1.05,  -4.70, M.desk);               // back panel
  box(1.8, 0.45, 0.65, 0, 1.22,  -4.0,  M.desk);               // center tower
  box(1.9, 0.06, 0.78, 0, 1.47,  -3.98, M.deskTop);            // tower top

  // Pigeon-hole shelves (3 rows × 5 columns)
  for (let row = 0; row < 3; row++) {
    for (let col = -2; col <= 2; col++) {
      decor(0.05, 0.30, 0.20, col * 0.80, 1.40 + row * 0.40, -4.63, M.wainscot);
    }
  }

  // Monitor
  decor(0.05, 0.30, 0.40,  0,     1.26, -3.92, M.black);
  decor(0.45, 0.30, 0.05,  0,     1.40, -4.10, M.darkGrey);

  // Telephone
  decor(0.20, 0.08, 0.26, -0.75,  1.02, -3.92, M.black);

  // Desk lamp
  decor(0.10, 0.05, 0.10,  0.88,  1.00, -3.90, M.lamp);
  decor(0.05, 0.42, 0.05,  0.88,  1.23, -3.90, M.lamp);
  decor(0.26, 0.18, 0.26,  0.88,  1.47, -3.90, M.lampShade);
  const deskLampLight = new THREE.PointLight(0xFFE890, 1.6, 4.5);
  deskLampLight.position.set(0.88, 1.42, -3.90);
  scene.add(deskLampLight);

  // Inbox tray + paper
  decor(0.32, 0.04, 0.26,  0.40,  1.00, -3.90, M.metal);
  decor(0.26, 0.02, 0.20,  0.40,  1.03, -3.90, M.paper);

  // Pencil cup
  decor(0.09, 0.14, 0.09,  0.22,  1.01, -3.84, M.desk);
  for (let i = 0; i < 3; i++) {
    decor(0.013, 0.19, 0.013, 0.20 + i * 0.016, 1.10, -3.84,
      new THREE.MeshStandardMaterial({ color: 0xFFDD00 }));
  }

  // Chair
  box(0.58, 0.07, 0.58, -1.2, 0.48, -3.80, M.bench);
  decor(0.06, 0.40, 0.58,  -1.2, 0.70, -4.04, M.bench);
  decor(0.05, 0.48, 0.05,  -1.5, 0.24, -3.52, M.lamp);
  decor(0.05, 0.48, 0.05,  -0.9, 0.24, -3.52, M.lamp);
  decor(0.05, 0.48, 0.05,  -1.5, 0.24, -4.06, M.lamp);
  decor(0.05, 0.48, 0.05,  -0.9, 0.24, -4.06, M.lamp);

  // Filing cabinet
  box(0.46, 1.00, 0.58, -2.2, 0.50, -4.45, M.desk);
  decor(0.40, 0.05, 0.02, -2.2, 0.64, -4.17, M.metal);
  decor(0.40, 0.05, 0.02, -2.2, 0.95, -4.17, M.metal);

  // Water cooler (right side aisle before stairs start)
  box(0.65, 1.70, 0.65, 6.2, 0.85, 5.0, M.wainscot);
  decor(0.42, 0.50, 0.42, 6.2, 1.95, 5.0,
    new THREE.MeshStandardMaterial({ color: 0x6688CC, roughness: 0.4, metalness: 0.3 }));
  decor(0.54, 0.07, 0.54, 6.2, 2.20, 5.0, M.metal);

  // ─── Left Staircase (against left wall → balcony) ────────────────────────
  const NUM_STEPS  = 8;
  const STEP_RISE  = STAIR_HEIGHT / NUM_STEPS;  // 0.3125 m
  const STEP_RUN   = 0.80;
  const STAIR_X    = -5.5;
  const STAIR_W    = 2.2;    // stair width; outer edge = -6.6, inner edge = -4.4
  const STAIR_Z0   = -1.5;   // Z of first step centre

  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = STAIR_Z0 - i * STEP_RUN;
    box(STAIR_W, h, STEP_RUN, STAIR_X, h / 2, z, M.stair);
  }

  // Wall-side baseboard
  const STAIR_LEN = NUM_STEPS * STEP_RUN;
  const STAIR_MID_Z = STAIR_Z0 - STAIR_LEN / 2 + STEP_RUN / 2;
  box(0.07, STAIR_HEIGHT + 0.25, STAIR_LEN, -6.6, STAIR_HEIGHT / 2, STAIR_MID_Z, M.railing);

  // Inner balusters (graduated height)
  const leftInnerX = -4.4;
  for (let i = 0; i < 7; i++) {
    const bz   = STAIR_Z0 - i * (STAIR_LEN / 6);
    const topY = (i / 6) * STAIR_HEIGHT;
    const ph   = topY + 0.58;
    decor(0.06, ph, 0.06, leftInnerX, ph / 2, bz, M.railing);
  }
  decor(0.04, STAIR_HEIGHT, STAIR_LEN, leftInnerX, STAIR_HEIGHT / 2, STAIR_MID_Z, M.railing);

  // ─── Right Staircase (mirror) ─────────────────────────────────────────────
  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = STAIR_Z0 - i * STEP_RUN;
    box(STAIR_W, h, STEP_RUN, -STAIR_X, h / 2, z, M.stair);
  }

  box(0.07, STAIR_HEIGHT + 0.25, STAIR_LEN, 6.6, STAIR_HEIGHT / 2, STAIR_MID_Z, M.railing);

  const rightInnerX = 4.4;
  for (let i = 0; i < 7; i++) {
    const bz   = STAIR_Z0 - i * (STAIR_LEN / 6);
    const topY = (i / 6) * STAIR_HEIGHT;
    const ph   = topY + 0.58;
    decor(0.06, ph, 0.06, rightInnerX, ph / 2, bz, M.railing);
  }
  decor(0.04, STAIR_HEIGHT, STAIR_LEN, rightInnerX, STAIR_HEIGHT / 2, STAIR_MID_Z, M.railing);

  // ─── Balcony ─────────────────────────────────────────────────────────────
  const BALCONY_Z_FRONT = STAIR_Z0 - STAIR_LEN;          // ≈ -7.9
  const BALCONY_DEPTH   = Math.abs(BACK_Z - BALCONY_Z_FRONT); // ≈ 6.1
  const BALCONY_MID_Z   = (BALCONY_Z_FRONT + BACK_Z) / 2;

  box(W, 0.2, BALCONY_DEPTH, 0, STAIR_HEIGHT - 0.1, BALCONY_MID_Z, M.floor);

  // Front balustrade: bottom rail + top rail + 12 balusters
  box(W, 0.09, 0.09, 0, STAIR_HEIGHT + 0.04, BALCONY_Z_FRONT, M.railing);
  box(W, 0.09, 0.09, 0, STAIR_HEIGHT + 0.88, BALCONY_Z_FRONT, M.railing);
  for (let i = 0; i < 12; i++) {
    decor(0.07, 0.76, 0.07, -6.3 + i * 1.14, STAIR_HEIGHT + 0.46, BALCONY_Z_FRONT, M.railing);
  }
  // Side rails
  box(0.06, 0.94, BALCONY_DEPTH, -7.0, STAIR_HEIGHT + 0.47, BALCONY_MID_Z, M.railing);
  box(0.06, 0.94, BALCONY_DEPTH,  7.0, STAIR_HEIGHT + 0.47, BALCONY_MID_Z, M.railing);
  // Back rail
  box(W, 0.06, 0.06, 0, STAIR_HEIGHT + 0.88, BACK_Z + 0.5, M.railing);

  // ─── Benches (under balcony overhang, in side-aisle behind stairs) ────────
  // Left bench
  box(1.8, 0.09, 0.72, -5.0, 0.48, -9.0, M.bench);
  box(0.09, 0.48, 0.72, -5.9, 0.24, -9.0, M.bench);
  box(0.09, 0.48, 0.72, -4.1, 0.24, -9.0, M.bench);
  box(0.09, 0.48, 0.72, -5.0, 0.72, -9.37, M.bench);
  decor(0.19, 0.03, 0.55, -5.1, 0.50, -8.86, M.magazine);
  decor(0.19, 0.03, 0.55, -4.7, 0.50, -8.86, M.paper);

  // Right bench
  box(1.8, 0.09, 0.72,  5.0, 0.48, -9.0, M.bench);
  box(0.09, 0.48, 0.72,  4.1, 0.24, -9.0, M.bench);
  box(0.09, 0.48, 0.72,  5.9, 0.24, -9.0, M.bench);
  box(0.09, 0.48, 0.72,  5.0, 0.72, -9.37, M.bench);
  decor(0.19, 0.03, 0.55,  4.9, 0.50, -8.86, M.magazine);
  decor(0.19, 0.03, 0.55,  5.3, 0.50, -8.86, M.paper);

  // ─── Standing Lamps (beside benches) ─────────────────────────────────────
  box(0.12, 1.85, 0.12, -4.8, 0.925, -8.2, M.lamp);
  decor(0.42, 0.30, 0.42, -4.8, 1.95, -8.2, M.lampShade);
  const lampLight1 = new THREE.PointLight(0xFFDF80, 1.8, 8);
  lampLight1.position.set(-4.8, 1.85, -8.2);
  scene.add(lampLight1);

  box(0.12, 1.85, 0.12,  4.8, 0.925, -8.2, M.lamp);
  decor(0.42, 0.30, 0.42,  4.8, 1.95, -8.2, M.lampShade);
  const lampLight2 = new THREE.PointLight(0xFFDF80, 1.8, 8);
  lampLight2.position.set(4.8, 1.85, -8.2);
  scene.add(lampLight2);

  // ─── Wall Sconces (3 pairs, lower mount for shorter walls) ───────────────
  const sconceZ = [6, 0, -7];
  for (const sz of sconceZ) {
    decor(0.26, 0.09, 0.34, -6.87, 2.40, sz, M.lamp);
    decor(0.32, 0.24, 0.32, -6.70, 2.48, sz, M.lampShade);
    const sl = new THREE.PointLight(0xFFE0A0, 1.4, 7);
    sl.position.set(-6.0, 2.44, sz);
    scene.add(sl);

    decor(0.26, 0.09, 0.34,  6.87, 2.40, sz, M.lamp);
    decor(0.32, 0.24, 0.32,  6.70, 2.48, sz, M.lampShade);
    const sr = new THREE.PointLight(0xFFE0A0, 1.4, 7);
    sr.position.set(6.0, 2.44, sz);
    scene.add(sr);
  }

  // ─── Ceiling Point Lights (raised clear of player head) ──────────────────
  scene.add(new THREE.AmbientLight(0x30282C, 0.12));

  [
    [ 0,  5.0,  4 ],
    [ 0,  5.0, -5 ],
    [-4,  5.0,  0 ],
    [ 4,  5.0,  0 ],
    [ 0,  5.0, 12 ],
  ].forEach(([x, y, z]) => {
    const pl = new THREE.PointLight(0xFFF4E8, 2.2, 18, 1.8);
    pl.position.set(x, y, z);
    scene.add(pl);
  });

  // ─── Damage Pillar ────────────────────────────────────────────────────────
  const pillarRadius = 0.40;
  const pillarHeight = 2.5;   // matches STAIR_HEIGHT, fills to balcony soffit
  const pillarX = 2.5, pillarZ = 0;

  const pillarMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius, pillarRadius, pillarHeight, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.7, metalness: 0.3 })
  );
  pillarMesh.position.set(pillarX, pillarHeight / 2, pillarZ);
  pillarMesh.castShadow = true;
  pillarMesh.receiveShadow = true;
  scene.add(pillarMesh);

  const capMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius * 1.2, pillarRadius * 1.2, 0.12, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.5, metalness: 0.5 })
  );
  capMesh.position.set(pillarX, pillarHeight + 0.06, pillarZ);
  scene.add(capMesh);

  colliders.push(new THREE.Box3().setFromObject(pillarMesh));

  const hazards = [
    {
      type: 'damagePillar',
      position: { x: pillarX, z: pillarZ },
      radius: pillarRadius + 0.5,
      damagePerSecond: 1,
      damageType: 'generic',
    },
  ];

  return { colliders, hazards, update: () => {} };
}
