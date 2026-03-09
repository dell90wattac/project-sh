import * as THREE from 'three';

/**
 * Test room — RCPD-lobby inspired layout.
 * Reworked for claustrophobic grandeur: columns, wainscoting, dense balustrades,
 * layered lighting, and heavy furniture to make the space feel enclosed despite its scale.
 */
export function createWorld(scene, physicsWorld) {
  const colliders = [];

  // ─── Materials ──────────────────────────────────────────────────────────
  // Procedural marble texture for floor
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
  // Subtle vein lines
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
  floorTexture.repeat.set(6, 6);

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

  // Non-collider decoration (no Box3 push)
  function decor(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ─── Dimensions ──────────────────────────────────────────────────────────
  const W          = 30;
  const CEIL       = 15;
  const PLATFORM_Y = 2;
  const STAIR_HEIGHT = 5;
  const BACK_Z     = -30;
  const FRONT_Z    =  30;

  // ─── Floors ──────────────────────────────────────────────────────────────
  box(W, 0.2, 40, 0, -0.1, 0, M.floor);
  box(W, 0.2, 10, 0, PLATFORM_Y - 0.1, 25, M.floor);

  // ─── Walls & Ceiling ─────────────────────────────────────────────────────
  const DEPTH = 60;
  box(0.2, CEIL, DEPTH, -15, CEIL / 2, 0, M.wall);
  box(0.2, CEIL, DEPTH,  15, CEIL / 2, 0, M.wall);
  box(W,   CEIL, 0.2,    0, CEIL / 2, BACK_Z,  M.wall);
  box(W,   CEIL, 0.2,    0, CEIL / 2, FRONT_Z, M.wall);
  box(W,   0.2,  DEPTH,  0, CEIL + 0.1, 0,     M.ceiling);

  // ─── Wainscoting (lower wall panels) ─────────────────────────────────────
  // Slightly proud of walls to cast shadow lines, makes room feel tighter
  decor(0.12, 1.5, 58,   -14.94, 0.75, 0,      M.wainscot); // left
  decor(0.12, 1.5, 58,    14.94, 0.75, 0,      M.wainscot); // right
  decor(30,   1.5, 0.12,  0, 0.75, BACK_Z  + 0.06, M.wainscot); // back
  decor(30,   1.5, 0.12,  0, 0.75, FRONT_Z - 0.06, M.wainscot); // front

  // ─── Crown Molding ───────────────────────────────────────────────────────
  decor(0.18, 0.28, 60,   -14.91, CEIL - 0.14, 0,          M.wainscot); // left
  decor(0.18, 0.28, 60,    14.91, CEIL - 0.14, 0,          M.wainscot); // right
  decor(30,   0.28, 0.18,  0, CEIL - 0.14, BACK_Z  + 0.09, M.wainscot); // back
  decor(30,   0.28, 0.18,  0, CEIL - 0.14, FRONT_Z - 0.09, M.wainscot); // front

  // ─── Down Staircase (entry platform → main floor) ────────────────────────
  for (let i = 0; i < 6; i++) {
    const h = (6 - i) * 0.25;
    const z = 16 - i * 0.5;
    box(W, h, 0.5, 0, h / 2, z, M.stair);
  }

  // Newel posts at base and top of down staircase (heavy square pillars)
  box(0.25, 2.4, 0.25, -14.9, 1.2, 22.0, M.railing);
  box(0.25, 2.4, 0.25,  14.9, 1.2, 22.0, M.railing);
  box(0.25, 2.6, 0.25, -14.9, 1.3, 24.5, M.railing);
  box(0.25, 2.6, 0.25,  14.9, 1.3, 24.5, M.railing);

  // Top & bottom rails
  box(W + 0.2, 0.07, 0.07,  0, 2.15, 21.5, M.railing);
  box(W + 0.2, 0.07, 0.07,  0, 2.15, 24.5, M.railing);
  // Balusters along front staircase — 20 evenly spaced
  for (let i = 0; i < 20; i++) {
    const bx = -14.5 + i * 1.52;
    decor(0.07, 2.1, 0.07, bx, 1.05, 21.5, M.railing);
  }

  // ─── Marble Columns (3 pairs, create columned nave) ───────────────────────
  const COLUMN_PAIRS = [
    { z: +12 },
    { z:  -2 },
    { z: -14 },
  ];
  for (const { z } of COLUMN_PAIRS) {
    for (const cx of [-7, 7]) {
      // Shaft
      box(0.75, 13.0, 0.75, cx, 6.5, z, M.column);
      // Base plinth
      box(1.15, 0.55, 1.15, cx, 0.275, z, M.column);
      // Capital
      box(1.25, 0.4, 1.25, cx, 13.2, z, M.column);
    }
  }

  // ─── Front Desk ──────────────────────────────────────────────────────────
  // Main counter body
  box(10, 1.1, 0.7, 0, 0.55, -10.6, M.desk);
  // Marble counter top
  box(10.2, 0.08, 0.9, 0, 1.12, -10.55, M.deskTop);
  // Back panel (tall dark wood)
  box(10, 2.5, 0.2, 0, 1.25, -11.35, M.desk);
  // Raised center check-in tower
  box(3.0, 0.55, 0.72, 0, 1.42, -10.6, M.desk);
  box(3.1, 0.07, 0.85, 0, 1.72, -10.58, M.deskTop); // tower top cap

  // Pigeon-hole shelves on back panel (rows of small dividers)
  for (let row = 0; row < 3; row++) {
    for (let col = -4; col <= 4; col++) {
      decor(0.06, 0.35, 0.22, col * 1.1, 1.6 + row * 0.45, -11.28, M.wainscot);
    }
  }

  // Computer monitor
  decor(0.06, 0.34, 0.46, 0, 1.32, -10.5, M.black);     // base
  decor(0.5,  0.34, 0.06, 0, 1.49, -10.72, M.darkGrey);  // screen

  // Telephone
  decor(0.22, 0.09, 0.30, -0.85, 1.18, -10.5, M.black);

  // Desk lamp: base + arm + shade
  decor(0.12, 0.06, 0.12, 1.2, 1.16, -10.42, M.lamp);   // base
  decor(0.06, 0.48, 0.06, 1.2, 1.42, -10.42, M.lamp);   // arm
  decor(0.30, 0.20, 0.30, 1.2, 1.69, -10.42, M.lampShade); // shade
  const deskLampLight = new THREE.PointLight(0xFFE890, 1.8, 6);
  deskLampLight.position.set(1.2, 1.6, -10.42);
  scene.add(deskLampLight);

  // Inbox tray + paper
  decor(0.36, 0.04, 0.30, 0.5, 1.16, -10.42, M.metal);
  decor(0.30, 0.02, 0.24, 0.5, 1.19, -10.42, M.paper);

  // Pencil cup
  decor(0.1, 0.16, 0.1, 0.3, 1.17, -10.35, M.desk);
  // Pencils
  for (let i = 0; i < 4; i++) {
    decor(0.015, 0.22, 0.015, 0.28 + i * 0.018, 1.28, -10.35, new THREE.MeshStandardMaterial({ color: 0xFFDD00 }));
  }

  // Chair (left of center)
  box(0.65, 0.08, 0.65, -1.5, 0.52, -10.5, M.bench);     // seat
  decor(0.07, 0.46, 0.65, -1.5, 0.77, -10.78, M.bench);  // back
  decor(0.06, 0.52, 0.06, -1.82, 0.26, -10.18, M.lamp);  // leg FL
  decor(0.06, 0.52, 0.06, -1.18, 0.26, -10.18, M.lamp);  // leg FR
  decor(0.06, 0.52, 0.06, -1.82, 0.26, -10.82, M.lamp);  // leg BL
  decor(0.06, 0.52, 0.06, -1.18, 0.26, -10.82, M.lamp);  // leg BR

  // Filing cabinet behind desk (left side)
  box(0.52, 1.1, 0.65, -3.6, 0.55, -11.1, M.desk);
  decor(0.45, 0.06, 0.02, -3.6, 0.72, -10.79, M.metal);  // drawer 1 handle
  decor(0.45, 0.06, 0.02, -3.6, 1.05, -10.79, M.metal);  // drawer 2 handle

  // Water cooler (moved to fit new layout)
  box(0.8, 1.9, 0.8, 12, 0.95, -10, M.wainscot);
  decor(0.5, 0.55, 0.5, 12, 2.2, -10, new THREE.MeshStandardMaterial({ color: 0x6688CC, roughness: 0.4, metalness: 0.3 }));
  decor(0.62, 0.08, 0.62, 12, 2.5, -10, M.metal);

  // ─── Left Staircase (against left wall → balcony) ────────────────────────
  const NUM_STEPS = 12;
  const STEP_RISE = STAIR_HEIGHT / NUM_STEPS;
  const STEP_RUN  = 1.2;

  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = -4 - i * STEP_RUN;
    box(2.5, h, STEP_RUN, -8, h / 2, z, M.stair);
  }

  // Left staircase: wall-side baseboard
  box(0.08, STAIR_HEIGHT + 0.3, NUM_STEPS * STEP_RUN, -13.75, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  // Left staircase: inner vertical balusters (stepping up)
  const leftInnerX = -10.25;
  for (let i = 0; i < 11; i++) {
    const bz   = -8 - i * (NUM_STEPS * STEP_RUN / 10);
    const topY = (i / 10) * STAIR_HEIGHT;
    const postH = topY + 0.65;
    decor(0.07, postH, 0.07, leftInnerX, postH / 2, bz, M.railing);
  }
  // Inner top rail
  decor(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, leftInnerX, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Right Staircase (against right wall) ────────────────────────────────
  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = -4 - i * STEP_RUN;
    box(2.5, h, STEP_RUN, 8, h / 2, z, M.stair);
  }

  // Right staircase: wall-side baseboard
  box(0.08, STAIR_HEIGHT + 0.3, NUM_STEPS * STEP_RUN, 13.75, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  // Right staircase: inner vertical balusters
  const rightInnerX = 10.25;
  for (let i = 0; i < 11; i++) {
    const bz   = -8 - i * (NUM_STEPS * STEP_RUN / 10);
    const topY = (i / 10) * STAIR_HEIGHT;
    const postH = topY + 0.65;
    decor(0.07, postH, 0.07, rightInnerX, postH / 2, bz, M.railing);
  }
  // Inner top rail
  decor(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, rightInnerX, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Balcony ─────────────────────────────────────────────────────────────
  const BALCONY_Z = -8 - NUM_STEPS * STEP_RUN;
  box(30, 0.2, 4, 0, STAIR_HEIGHT - 0.1, BALCONY_Z + 2, M.floor);

  // Dense front balustrade: bottom rail + top rail + 29 balusters
  box(30, 0.10, 0.10, 0, STAIR_HEIGHT + 0.05, BALCONY_Z, M.railing); // bottom rail
  box(30, 0.10, 0.10, 0, STAIR_HEIGHT + 1.05, BALCONY_Z, M.railing); // top rail
  for (let i = 0; i < 29; i++) {
    decor(0.08, 0.90, 0.08, -14 + i * 1.0, STAIR_HEIGHT + 0.55, BALCONY_Z, M.railing);
  }
  // Side guard rails
  box(0.07, 1.1, 4, -15, STAIR_HEIGHT + 0.55, BALCONY_Z + 2, M.railing);
  box(0.07, 1.1, 4,  15, STAIR_HEIGHT + 0.55, BALCONY_Z + 2, M.railing);
  // Back rail
  box(30, 0.07, 0.07, 0, STAIR_HEIGHT + 1.0, BALCONY_Z + 4, M.railing);

  // ─── Benches ─────────────────────────────────────────────────────────────
  // Left bench
  box(3.0, 0.10, 0.85, -10, 0.52, -15, M.bench);          // seat
  box(0.10, 0.52, 0.85, -11.5, 0.26, -15, M.bench);       // left leg
  box(0.10, 0.52, 0.85,  -8.5, 0.26, -15, M.bench);       // right leg
  box(0.10, 0.52, 0.85, -10, 0.78, -15.43, M.bench);      // back
  decor(0.10, 0.28, 0.85, -11.5, 0.67, -15, M.bench);     // left armrest
  decor(0.10, 0.28, 0.85,  -8.5, 0.67, -15, M.bench);     // right armrest
  decor(0.22, 0.03, 0.65, -10.2, 0.54, -14.82, M.magazine); // magazine 1
  decor(0.22, 0.03, 0.65,  -9.7, 0.54, -14.82, M.paper);    // magazine 2

  // Left side table
  box(0.60, 0.50, 0.55, -13.2, 0.25, -15, M.bench);
  box(0.68, 0.06, 0.63, -13.2, 0.53, -15, M.bench);
  decor(0.22, 0.03, 0.65, -13.2, 0.57, -15, M.magazine);

  // Right bench
  box(3.0, 0.10, 0.85, 10, 0.52, -15, M.bench);
  box(0.10, 0.52, 0.85,  8.5, 0.26, -15, M.bench);
  box(0.10, 0.52, 0.85, 11.5, 0.26, -15, M.bench);
  box(0.10, 0.52, 0.85, 10, 0.78, -15.43, M.bench);
  decor(0.10, 0.28, 0.85,  8.5, 0.67, -15, M.bench);
  decor(0.10, 0.28, 0.85, 11.5, 0.67, -15, M.bench);
  decor(0.22, 0.03, 0.65,  9.8, 0.54, -14.82, M.magazine);
  decor(0.22, 0.03, 0.65, 10.3, 0.54, -14.82, M.paper);

  // Right side table
  box(0.60, 0.50, 0.55, 13.2, 0.25, -15, M.bench);
  box(0.68, 0.06, 0.63, 13.2, 0.53, -15, M.bench);
  decor(0.22, 0.03, 0.65, 13.2, 0.57, -15, M.magazine);

  // ─── Standing Lamps ──────────────────────────────────────────────────────
  // Left lamp (near bench)
  box(0.15, 2.1, 0.15, -10, 1.05, -13.5, M.lamp);
  decor(0.5, 0.35, 0.5, -10, 2.27, -13.5, M.lampShade);
  const lampLight1 = new THREE.PointLight(0xFFDF80, 2.2, 12);
  lampLight1.position.set(-10, 2.1, -13.5);
  scene.add(lampLight1);

  // Right lamp (near bench)
  box(0.15, 2.1, 0.15, 10, 1.05, -13.5, M.lamp);
  decor(0.5, 0.35, 0.5, 10, 2.27, -13.5, M.lampShade);
  const lampLight2 = new THREE.PointLight(0xFFDF80, 2.2, 12);
  lampLight2.position.set(10, 2.1, -13.5);
  scene.add(lampLight2);

  // ─── Wall Sconces (8 total — 4 per side wall) ─────────────────────────────
  const sconceZPositions = [12, 4, -4, -12];
  for (const sz of sconceZPositions) {
    // Left wall
    decor(0.30, 0.10, 0.40, -14.75, 3.05, sz, M.lamp);           // bracket
    decor(0.38, 0.28, 0.38, -14.55, 3.15, sz, M.lampShade);      // shade
    const sl = new THREE.PointLight(0xFFE0A0, 1.4, 9);
    sl.position.set(-13.8, 3.1, sz);
    scene.add(sl);

    // Right wall
    decor(0.30, 0.10, 0.40, 14.75, 3.05, sz, M.lamp);
    decor(0.38, 0.28, 0.38, 14.55, 3.15, sz, M.lampShade);
    const sr = new THREE.PointLight(0xFFE0A0, 1.4, 9);
    sr.position.set(13.8, 3.1, sz);
    scene.add(sr);
  }

  // ─── Lighting ─────────────────────────────────────────────────────────────
  // Very dim ambient — let point lights do the heavy lifting for mood
  scene.add(new THREE.AmbientLight(0x30282C, 0.12));

  // Ceiling point lights (reduced count, warmer, tighter falloff for pooling)
  [
    [0,   CEIL - 1,  5  ],
    [0,   CEIL - 1, -10 ],
    [-10, CEIL - 1, -5  ],
    [ 10, CEIL - 1, -5  ],
    [0,   CEIL - 1,  20 ],
  ].forEach(([x, y, z]) => {
    const pl = new THREE.PointLight(0xFFF4E8, 2.5, 32, 1.8);
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
