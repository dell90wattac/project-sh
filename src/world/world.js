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
  const W          = 14;
  const CEIL       = 5.5;
  const PLATFORM_Y = 1.0;
  const STAIR_HEIGHT = 2.5;
  const BACK_Z     = -14;
  const FRONT_Z    =  14;

  // ─── Floors ──────────────────────────────────────────────────────────────
  box(W, 0.2, 20, 0, -0.1, 0, M.floor);
  box(W, 0.2,  4, 0, -0.1, -12, M.floor);                // back area under balcony
  box(W, 0.2,  5, 0, PLATFORM_Y - 0.1, 11.5, M.floor);

  // ─── Walls & Ceiling ─────────────────────────────────────────────────────
  const DEPTH = 28;
  box(0.2, CEIL, DEPTH, -7, CEIL / 2, 0, M.wall);
  box(0.2, CEIL, DEPTH,  7, CEIL / 2, 0, M.wall);
  box(W,   CEIL, 0.2,   0, CEIL / 2, BACK_Z,  M.wall);
  box(W,   CEIL, 0.2,   0, CEIL / 2, FRONT_Z, M.wall);
  box(W,   0.2,  DEPTH, 0, CEIL + 0.1, 0,     M.ceiling);

  // ─── Wainscoting (lower wall panels) ─────────────────────────────────────
  // Slightly proud of walls to cast shadow lines, makes room feel tighter
  decor(0.12, 1.5, 26,   -6.94, 0.75, 0,      M.wainscot); // left
  decor(0.12, 1.5, 26,    6.94, 0.75, 0,      M.wainscot); // right
  decor(14,   1.5, 0.12,  0, 0.75, BACK_Z  + 0.06, M.wainscot); // back
  decor(14,   1.5, 0.12,  0, 0.75, FRONT_Z - 0.06, M.wainscot); // front

  // ─── Crown Molding ───────────────────────────────────────────────────────
  decor(0.18, 0.20, 28,   -6.91, CEIL - 0.10, 0,          M.wainscot); // left
  decor(0.18, 0.20, 28,    6.91, CEIL - 0.10, 0,          M.wainscot); // right
  decor(14,   0.20, 0.18,  0, CEIL - 0.10, BACK_Z  + 0.09, M.wainscot); // back
  decor(14,   0.20, 0.18,  0, CEIL - 0.10, FRONT_Z - 0.09, M.wainscot); // front

  // ─── Down Staircase (entry platform → main floor) ────────────────────────
  for (let i = 0; i < 3; i++) {
    const h = (3 - i) * 0.33;
    const z = 8.5 - i * 0.5;
    box(W, h, 0.5, 0, h / 2, z, M.stair);
  }

  // Newel posts at base and top of down staircase
  box(0.22, 1.4, 0.22, -6.9, 0.7, 7.3, M.railing);
  box(0.22, 1.4, 0.22,  6.9, 0.7, 7.3, M.railing);
  box(0.22, 1.5, 0.22, -6.9, 0.75, 9.0, M.railing);
  box(0.22, 1.5, 0.22,  6.9, 0.75, 9.0, M.railing);

  // Top & bottom rails
  box(W + 0.2, 0.06, 0.06, 0, 1.1, 7.3, M.railing);
  box(W + 0.2, 0.06, 0.06, 0, 1.1, 9.0, M.railing);
  // Balusters along front staircase — 10 evenly spaced
  for (let i = 0; i < 10; i++) {
    const bx = -6.5 + i * 1.44;
    decor(0.06, 1.0, 0.06, bx, 0.55, 7.3, M.railing);
  }

  // ─── Marble Columns (3 pairs, create columned nave) ───────────────────────
  const COLUMN_PAIRS = [
    { z: +5 },
    { z: +1 },
    { z: -3 },
  ];
  for (const { z } of COLUMN_PAIRS) {
    for (const cx of [-3.0, 3.0]) {
      // Shaft
      box(0.45, 4.5, 0.45, cx, 2.25, z, M.column);
      // Base plinth
      box(0.70, 0.30, 0.70, cx, 0.15, z, M.column);
      // Capital
      box(0.75, 0.25, 0.75, cx, 4.62, z, M.column);
    }
  }

  // ─── Front Desk (centered at Z=0) ────────────────────────────────────────
  // Main counter body
  box(4.5, 1.1, 0.7, 0, 0.55, 0.0, M.desk);
  // Marble counter top
  box(4.7, 0.08, 0.9, 0, 1.12, 0.05, M.deskTop);
  // Back panel (tall dark wood)
  box(4.5, 2.0, 0.2, 0, 1.0, -0.75, M.desk);
  // Raised center check-in tower
  box(1.5, 0.55, 0.72, 0, 1.42, 0.0, M.desk);
  box(1.6, 0.07, 0.85, 0, 1.72, 0.02, M.deskTop); // tower top cap

  // Pigeon-hole shelves on back panel (rows of small dividers)
  for (let row = 0; row < 2; row++) {
    for (let col = -2; col <= 2; col++) {
      decor(0.06, 0.30, 0.18, col * 0.9, 1.55 + row * 0.40, -0.68, M.wainscot);
    }
  }

  // Computer monitor
  decor(0.06, 0.30, 0.40, 0, 1.30, 0.1, M.black);       // base
  decor(0.44, 0.30, 0.06, 0, 1.46, -0.10, M.darkGrey);  // screen

  // Telephone
  decor(0.20, 0.08, 0.26, -0.75, 1.17, 0.1, M.black);

  // Desk lamp: base + arm + shade
  decor(0.10, 0.05, 0.10, 1.0, 1.15, 0.15, M.lamp);     // base
  decor(0.05, 0.42, 0.05, 1.0, 1.38, 0.15, M.lamp);     // arm
  decor(0.26, 0.18, 0.26, 1.0, 1.62, 0.15, M.lampShade); // shade
  const deskLampLight = new THREE.PointLight(0xFFE890, 1.8, 5);
  deskLampLight.position.set(1.0, 1.55, 0.15);
  scene.add(deskLampLight);

  // Inbox tray + paper
  decor(0.32, 0.04, 0.26, 0.4, 1.15, 0.15, M.metal);
  decor(0.26, 0.02, 0.20, 0.4, 1.18, 0.15, M.paper);

  // Pencil cup
  decor(0.09, 0.14, 0.09, 0.22, 1.16, 0.22, M.desk);
  // Pencils
  for (let i = 0; i < 4; i++) {
    decor(0.013, 0.20, 0.013, 0.20 + i * 0.016, 1.25, 0.22, new THREE.MeshStandardMaterial({ color: 0xFFDD00 }));
  }

  // Chair (left of center)
  box(0.60, 0.08, 0.60, -1.0, 0.52, 0.1, M.bench);       // seat
  decor(0.06, 0.42, 0.60, -1.0, 0.75, -0.16, M.bench);   // back
  decor(0.05, 0.50, 0.05, -1.30, 0.25, 0.38, M.lamp);    // leg FL
  decor(0.05, 0.50, 0.05, -0.70, 0.25, 0.38, M.lamp);    // leg FR
  decor(0.05, 0.50, 0.05, -1.30, 0.25, -0.18, M.lamp);   // leg BL
  decor(0.05, 0.50, 0.05, -0.70, 0.25, -0.18, M.lamp);   // leg BR

  // Filing cabinet behind desk (left side)
  box(0.46, 1.0, 0.58, -1.7, 0.50, -0.55, M.desk);
  decor(0.40, 0.05, 0.02, -1.7, 0.65, -0.28, M.metal);  // drawer 1 handle
  decor(0.40, 0.05, 0.02, -1.7, 0.95, -0.28, M.metal);  // drawer 2 handle

  // Water cooler
  box(0.60, 1.4, 0.60, 5.0, 0.70, 0.0, M.wainscot);
  decor(0.40, 0.42, 0.40, 5.0, 1.61, 0.0, new THREE.MeshStandardMaterial({ color: 0x6688CC, roughness: 0.4, metalness: 0.3 }));
  decor(0.50, 0.06, 0.50, 5.0, 1.84, 0.0, M.metal);

  // ─── Left Staircase (flush against left wall → balcony) ──────────────────
  const NUM_STEPS = 8;
  const STEP_RISE = STAIR_HEIGHT / NUM_STEPS;
  const STEP_RUN  = 0.8;
  const STAIR_START_Z = -5;

  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = STAIR_START_Z - i * STEP_RUN;
    box(2.2, h, STEP_RUN, -5.9, h / 2, z, M.stair);
  }

  // Left staircase: wall-side baseboard (flush at X=-7)
  box(0.07, STAIR_HEIGHT + 0.2, NUM_STEPS * STEP_RUN,
      -7.0, STAIR_HEIGHT / 2, STAIR_START_Z - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  // Left staircase: inner vertical balusters (stepping up)
  const leftInnerX = -4.8;
  for (let i = 0; i < 8; i++) {
    const bz   = STAIR_START_Z - i * (NUM_STEPS * STEP_RUN / 7);
    const topY = (i / 7) * STAIR_HEIGHT;
    const postH = topY + 0.55;
    decor(0.06, postH, 0.06, leftInnerX, postH / 2, bz, M.railing);
  }
  // Inner top rail
  decor(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN,
        leftInnerX, STAIR_HEIGHT / 2, STAIR_START_Z - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Right Staircase (flush against right wall) ─────────────────────────
  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = STAIR_START_Z - i * STEP_RUN;
    box(2.2, h, STEP_RUN, 5.9, h / 2, z, M.stair);
  }

  // Right staircase: wall-side baseboard (flush at X=+7)
  box(0.07, STAIR_HEIGHT + 0.2, NUM_STEPS * STEP_RUN,
      7.0, STAIR_HEIGHT / 2, STAIR_START_Z - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  // Right staircase: inner vertical balusters
  const rightInnerX = 4.8;
  for (let i = 0; i < 8; i++) {
    const bz   = STAIR_START_Z - i * (NUM_STEPS * STEP_RUN / 7);
    const topY = (i / 7) * STAIR_HEIGHT;
    const postH = topY + 0.55;
    decor(0.06, postH, 0.06, rightInnerX, postH / 2, bz, M.railing);
  }
  // Inner top rail
  decor(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN,
        rightInnerX, STAIR_HEIGHT / 2, STAIR_START_Z - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Balcony ─────────────────────────────────────────────────────────────
  const BALCONY_Z = STAIR_START_Z - NUM_STEPS * STEP_RUN; // -11.4
  const BALCONY_DEPTH = 2.4;
  const BALCONY_CENTER_Z = BALCONY_Z - BALCONY_DEPTH / 2; // -12.6
  const BALCONY_BACK_Z = BALCONY_Z - BALCONY_DEPTH;       // -13.8

  // Balcony floor (extends backward from staircase tops toward back wall)
  box(14, 0.2, BALCONY_DEPTH, 0, STAIR_HEIGHT - 0.1, BALCONY_CENTER_Z, M.floor);

  // Front balustrade (center span only — gaps where staircases connect)
  // Left staircase: X=-7 to -4.8, Right: X=+4.8 to +7
  const FRONT_RAIL_W = 9.6; // spans X=-4.8 to +4.8
  box(FRONT_RAIL_W, 0.08, 0.08, 0, STAIR_HEIGHT + 0.04, BALCONY_Z, M.railing); // bottom rail
  box(FRONT_RAIL_W, 0.08, 0.08, 0, STAIR_HEIGHT + 0.90, BALCONY_Z, M.railing); // top rail
  for (let i = 0; i < 10; i++) {
    decor(0.07, 0.76, 0.07, -4.4 + i * 0.978, STAIR_HEIGHT + 0.46, BALCONY_Z, M.railing);
  }
  // Newel posts at staircase-to-balcony connection points
  box(0.15, 0.95, 0.15, -4.8, STAIR_HEIGHT + 0.47, BALCONY_Z, M.railing);
  box(0.15, 0.95, 0.15,  4.8, STAIR_HEIGHT + 0.47, BALCONY_Z, M.railing);

  // Side guard rails (along walls, spanning balcony depth)
  box(0.06, 0.95, BALCONY_DEPTH, -7, STAIR_HEIGHT + 0.47, BALCONY_CENTER_Z, M.railing);
  box(0.06, 0.95, BALCONY_DEPTH,  7, STAIR_HEIGHT + 0.47, BALCONY_CENTER_Z, M.railing);
  // Back rail (near back wall)
  box(14, 0.06, 0.06, 0, STAIR_HEIGHT + 0.86, BALCONY_BACK_Z, M.railing);

  // ─── Benches (front hall, between columns and walls) ─────────────────────
  // Left bench
  box(2.0, 0.10, 0.70, -4.5, 0.52, 3.0, M.bench);           // seat
  box(0.10, 0.50, 0.70, -5.5, 0.25, 3.0, M.bench);          // left leg
  box(0.10, 0.50, 0.70, -3.5, 0.25, 3.0, M.bench);          // right leg
  box(0.10, 0.50, 0.70, -4.5, 0.75, 2.62, M.bench);         // back
  decor(0.10, 0.26, 0.70, -5.5, 0.64, 3.0, M.bench);        // left armrest
  decor(0.10, 0.26, 0.70, -3.5, 0.64, 3.0, M.bench);        // right armrest
  decor(0.20, 0.03, 0.56, -4.7, 0.54, 3.15, M.magazine);    // magazine 1
  decor(0.20, 0.03, 0.56, -4.2, 0.54, 3.15, M.paper);       // magazine 2

  // Left side table
  box(0.50, 0.45, 0.48, -5.9, 0.22, 3.0, M.bench);
  box(0.56, 0.05, 0.54, -5.9, 0.47, 3.0, M.bench);
  decor(0.20, 0.03, 0.56, -5.9, 0.51, 3.0, M.magazine);

  // Right bench
  box(2.0, 0.10, 0.70, 4.5, 0.52, 3.0, M.bench);
  box(0.10, 0.50, 0.70, 3.5, 0.25, 3.0, M.bench);
  box(0.10, 0.50, 0.70, 5.5, 0.25, 3.0, M.bench);
  box(0.10, 0.50, 0.70, 4.5, 0.75, 2.62, M.bench);
  decor(0.10, 0.26, 0.70, 3.5, 0.64, 3.0, M.bench);
  decor(0.10, 0.26, 0.70, 5.5, 0.64, 3.0, M.bench);
  decor(0.20, 0.03, 0.56, 4.3, 0.54, 3.15, M.magazine);
  decor(0.20, 0.03, 0.56, 4.8, 0.54, 3.15, M.paper);

  // Right side table
  box(0.50, 0.45, 0.48, 5.9, 0.22, 3.0, M.bench);
  box(0.56, 0.05, 0.54, 5.9, 0.47, 3.0, M.bench);
  decor(0.20, 0.03, 0.56, 5.9, 0.51, 3.0, M.magazine);

  // ─── Standing Lamps ──────────────────────────────────────────────────────
  // Left lamp (near bench, front hall)
  box(0.12, 1.8, 0.12, -4.5, 0.90, 4.2, M.lamp);
  decor(0.38, 0.28, 0.38, -4.5, 1.96, 4.2, M.lampShade);
  const lampLight1 = new THREE.PointLight(0xFFDF80, 2.0, 8);
  lampLight1.position.set(-4.5, 1.8, 4.2);
  scene.add(lampLight1);

  // Right lamp (near bench, front hall)
  box(0.12, 1.8, 0.12, 4.5, 0.90, 4.2, M.lamp);
  decor(0.38, 0.28, 0.38, 4.5, 1.96, 4.2, M.lampShade);
  const lampLight2 = new THREE.PointLight(0xFFDF80, 2.0, 8);
  lampLight2.position.set(4.5, 1.8, 4.2);
  scene.add(lampLight2);

  // ─── Wall Sconces (8 total — 4 per side wall) ─────────────────────────────
  const sconceZPositions = [8, 3, -2, -5];
  for (const sz of sconceZPositions) {
    // Left wall
    decor(0.22, 0.08, 0.32, -6.85, 2.5, sz, M.lamp);           // bracket
    decor(0.28, 0.22, 0.28, -6.68, 2.58, sz, M.lampShade);     // shade
    const sl = new THREE.PointLight(0xFFE0A0, 1.2, 6);
    sl.position.set(-6.1, 2.5, sz);
    scene.add(sl);

    // Right wall
    decor(0.22, 0.08, 0.32, 6.85, 2.5, sz, M.lamp);
    decor(0.28, 0.22, 0.28, 6.68, 2.58, sz, M.lampShade);
    const sr = new THREE.PointLight(0xFFE0A0, 1.2, 6);
    sr.position.set(6.1, 2.5, sz);
    scene.add(sr);
  }

  // ─── Lighting ─────────────────────────────────────────────────────────────
  // Very dim ambient — let point lights do the heavy lifting for mood
  scene.add(new THREE.AmbientLight(0x30282C, 0.12));

  // Ceiling point lights (tighter falloff for smaller room)
  [
    [ 0, CEIL - 0.3,  9  ],
    [ 0, CEIL - 0.3,  3  ],
    [ 0, CEIL - 0.3,  0  ],
    [-3, CEIL - 0.3, -3  ],
    [ 3, CEIL - 0.3, -3  ],
  ].forEach(([x, y, z]) => {
    const pl = new THREE.PointLight(0xFFF4E8, 2.2, 15, 1.8);
    pl.position.set(x, y, z);
    scene.add(pl);
  });

  // ─── Damage Pillar (deals 1 damage/sec on contact) ────────────────────────
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.7, metalness: 0.3 });
  const pillarX = 0, pillarZ = -4;
  const pillarRadius = 0.4;
  const pillarHeight = 2.5;

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
      radius: pillarRadius + 0.6,
      damagePerSecond: 1,
      damageType: 'generic',
    },
  ];

  return { colliders, hazards, update: () => {} };
}
