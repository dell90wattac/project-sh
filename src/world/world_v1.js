import * as THREE from 'three';

/**
 * Test room — RCPD-lobby inspired layout.
 * Entry platform elevated above main floor, grand staircase down,
 * side staircases up to a wrap-around balcony.
 */
export function createWorld(scene, physicsWorld) {
  const colliders = [];

  // ─── Materials ──────────────────────────────────────────────────────────
  // Create procedural marble texture for floor
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 256;
  floorCanvas.height = 256;
  const floorCtx = floorCanvas.getContext('2d');
  floorCtx.fillStyle = '#E8E8E8';
  floorCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 100; i++) {
    floorCtx.fillStyle = `hsl(${200 + Math.random() * 20}, 20%, ${70 + Math.random() * 20}%)`;
    floorCtx.beginPath();
    floorCtx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 10, 0, Math.PI * 2);
    floorCtx.fill();
  }
  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(4, 4);

  const M = {
    floor:   new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8 }),
    wall:    new THREE.MeshStandardMaterial({ color: 0xF5F5DC, roughness: 0.9 }), // Beige walls
    ceiling: new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.95 }),
    stair:   new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.7 }),
    desk:    new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 }), // Dark wood
    railing: new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.4, metalness: 0.8 }), // Gold railing
    bench:   new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.8 }), // Wood bench
    lamp:    new THREE.MeshStandardMaterial({ color: 0x2F2F2F, roughness: 0.5, metalness: 0.9 }), // Metal lamp
  };

  // Utility: create box, add to scene, register collider
  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  // ─── Dimensions ──────────────────────────────────────────────────────────
  const W          = 30;   // room width  (X: -15 to +15)
  const CEIL       = 15;   // ceiling height
  const PLATFORM_Y = 2;    // entry platform floor surface
  const STAIR_HEIGHT = 5;  // balcony height
  const BACK_Z     = -30;
  const FRONT_Z    =  30;

  // ─── Floors ──────────────────────────────────────────────────────────────
  // Main floor: Z -20 → +20
  box(W, 0.2, 40, 0, -0.1, 0, M.floor);
  // Entry platform: Z +20 → +30
  box(W, 0.2, 10, 0, PLATFORM_Y - 0.1, 25, M.floor);

  // ─── Walls & ceiling ─────────────────────────────────────────────────────
  const DEPTH = 60;
  box(0.2, CEIL, DEPTH, -15, CEIL / 2, 0, M.wall);       // left
  box(0.2, CEIL, DEPTH,  15, CEIL / 2, 0, M.wall);       // right
  box(W,   CEIL, 0.2,   0, CEIL / 2, BACK_Z,  M.wall);  // back
  box(W,   CEIL, 0.2,   0, CEIL / 2, FRONT_Z, M.wall);  // front
  box(W,   0.2,  DEPTH, 0, CEIL + 0.1, 0,     M.ceiling);

  // ─── Down staircase (entry platform → main floor) ────────────────────────
  // 6 steps × 0.33 m each = 2 m drop.  Full room width.
  for (let i = 0; i < 6; i++) {
    const h = (6 - i) * 0.33;
    const z = 24 - i * 0.5;
    box(W, h, 0.5, 0, h / 2, z, M.stair);
  }

  // Handrails for down staircase
  box(W + 0.2, 0.05, 0.05, 0, 2.1, 21.5, M.railing); // Top
  box(0.05, 2.1, 3, -15, 1.05, 21.5, M.railing); // Left
  box(0.05, 2.1, 3, 15, 1.05, 21.5, M.railing); // Right

  // ─── Front desk ──────────────────────────────────────────────────────────
  box(10, 1.5, 3,  0, 0.75,  -10, M.desk);   // counter
  box(10, 2.2, 0.2, 0, 1.1,  -11.5, M.desk);   // back panel

  // Desk details
  // Computer
  box(0.5, 0.1, 0.5, 0, 1.5, -10, new THREE.MeshStandardMaterial({ color: 0x000000 })); // Base
  box(0.4, 0.3, 0.05, 0, 1.65, -10.2, new THREE.MeshStandardMaterial({ color: 0x111111 })); // Screen

  // Chair
  box(0.6, 0.1, 0.6, -1.5, 0.5, -10, new THREE.MeshStandardMaterial({ color: 0x654321 })); // Seat
  box(0.1, 0.5, 0.3, -1.5, 0.75, -10.15, new THREE.MeshStandardMaterial({ color: 0x654321 })); // Back

  // Lamp
  box(0.1, 0.5, 0.1, 1, 0.25, -10, new THREE.MeshStandardMaterial({ color: 0x333333 })); // Base
  box(0.2, 0.3, 0.2, 1, 0.6, -10, new THREE.MeshStandardMaterial({ color: 0xFFFF99 })); // Shade

  // Pencils
  for (let i = 0; i < 3; i++) {
    box(0.01, 0.2, 0.01, 0.1 * i, 1.65, -9.9, new THREE.MeshStandardMaterial({ color: 0xFFFF00 }));
  }

  // Paper
  box(0.3, 0.01, 0.4, -0.2, 1.65, -9.9, new THREE.MeshStandardMaterial({ color: 0xFFFFFF }));

  // ─── Left staircase (against left wall to balcony) ────────────────────────
  const NUM_STEPS = 12;
  const STEP_RISE = STAIR_HEIGHT / NUM_STEPS;
  const STEP_RUN = 1.2;
  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = -8 - i * STEP_RUN;
    box(3.5, h, STEP_RUN, -12, h / 2, z, M.stair);
  }
  // Handrails
  box(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, -10.25, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  box(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, -13.75, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Right staircase (against right wall) ──────────────────────────────────
  for (let i = 0; i < NUM_STEPS; i++) {
    const h = (i + 1) * STEP_RISE;
    const z = -8 - i * STEP_RUN;
    box(3.5, h, STEP_RUN, 12, h / 2, z, M.stair);
  }
  // Handrails
  box(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, 10.25, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);
  box(0.05, STAIR_HEIGHT, NUM_STEPS * STEP_RUN, 13.75, STAIR_HEIGHT / 2, -8 - (NUM_STEPS * STEP_RUN) / 2, M.railing);

  // ─── Balcony (at back, spanning full width) ────────────────────────────────
  const BALCONY_Z = -8 - NUM_STEPS * STEP_RUN;
  box(30, 0.2, 4, 0, STAIR_HEIGHT - 0.1, BALCONY_Z + 2, M.floor);
  // Guardrails
  box(30, 0.05, 0.05, 0, STAIR_HEIGHT + 0.5, BALCONY_Z, M.railing); // Front
  box(30, 0.05, 0.05, 0, STAIR_HEIGHT + 0.5, BALCONY_Z + 4, M.railing); // Back
  box(0.05, 1.0, 4, -15, STAIR_HEIGHT + 0.5, BALCONY_Z + 2, M.railing); // Left
  box(0.05, 1.0, 4, 15, STAIR_HEIGHT + 0.5, BALCONY_Z + 2, M.railing); // Right

  // ─── Benches ───────────────────────────────────────────────────────────
  // Left bench
  box(3, 0.1, 0.8, -10, 0.5, -15, M.bench); // Seat
  box(0.1, 0.8, 0.8, -11.5, 0.4, -15, M.bench); // Left leg
  box(0.1, 0.8, 0.8, -8.5, 0.4, -15, M.bench); // Right leg
  box(0.1, 0.5, 0.8, -10, 0.75, -15.4, M.bench); // Back

  // Right bench
  box(3, 0.1, 0.8, 10, 0.5, -15, M.bench);
  box(0.1, 0.8, 0.8, 8.5, 0.4, -15, M.bench);
  box(0.1, 0.8, 0.8, 11.5, 0.4, -15, M.bench);
  box(0.1, 0.5, 0.8, 10, 0.75, -15.4, M.bench);

  // ─── Water Cooler ──────────────────────────────────────────────────────
  box(0.8, 2, 0.8, 12, 1, -10, new THREE.MeshStandardMaterial({ color: 0xFFFFFF })); // Base
  box(0.5, 0.5, 0.5, 12, 2.25, -10, new THREE.MeshStandardMaterial({ color: 0x0000FF })); // Tank
  box(0.6, 0.1, 0.6, 12, 2.5, -10, new THREE.MeshStandardMaterial({ color: 0xC0C0C0 })); // Top

  // ─── Standing Lamps ─────────────────────────────────────────────────────
  // Near left bench
  box(0.15, 2, 0.15, -10, 1, -14, M.lamp); // Pole
  box(0.4, 0.3, 0.4, -10, 2.15, -14, new THREE.MeshStandardMaterial({ color: 0xFFFF99 })); // Shade
  const lampLight1 = new THREE.PointLight(0xFFFF99, 2, 15);
  lampLight1.position.set(-10, 2, -14);
  scene.add(lampLight1);

  // Near right bench
  box(0.15, 2, 0.15, 10, 1, -14, M.lamp);
  box(0.4, 0.3, 0.4, 10, 2.15, -14, new THREE.MeshStandardMaterial({ color: 0xFFFF99 }));
  const lampLight2 = new THREE.PointLight(0xFFFF99, 2, 15);
  lampLight2.position.set(10, 2, -14);
  scene.add(lampLight2);

  // ─── Lighting (balanced for atmosphere) ───────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x404040, 0.3)); // Soft ambient light

  [
    [0,   CEIL - 1,  5  ],   // main centre
    [0,   CEIL - 1, -10 ],   // back half
    [-10, CEIL - 1, -5  ],   // left zone
    [ 10, CEIL - 1, -5  ],   // right zone
    [0,   CEIL - 1,  20 ],   // stair / entry area
  ].forEach(([x, y, z]) => {
    const pl = new THREE.PointLight(0xfff8f0, 2.0, 40, 1.5); // Adjusted for larger space
    pl.position.set(x, y, z);
    scene.add(pl);
  });

  // ─── Damage Pillar (deals 1 damage/sec on contact) ──────────────────────
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.7, metalness: 0.3 });
  const pillarX = 5, pillarZ = 0;
  const pillarRadius = 0.5;
  const pillarHeight = 3;

  // Cylinder mesh
  const pillarMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius, pillarRadius, pillarHeight, 12),
    pillarMat
  );
  pillarMesh.position.set(pillarX, pillarHeight / 2, pillarZ);
  pillarMesh.castShadow = true;
  pillarMesh.receiveShadow = true;
  scene.add(pillarMesh);

  // Pillar cap (slightly wider top)
  const capMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius * 1.2, pillarRadius * 1.2, 0.15, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.5, metalness: 0.5 })
  );
  capMesh.position.set(pillarX, pillarHeight + 0.075, pillarZ);
  scene.add(capMesh);

  // Register pillar as a collider so player can't walk through it
  colliders.push(new THREE.Box3().setFromObject(pillarMesh));

  // Hazard info for main loop to use
  const hazards = [
    {
      type: 'damagePillar',
      position: { x: pillarX, z: pillarZ },
      radius: pillarRadius + 0.6, // Contact distance (pillar radius + player radius + small buffer)
      damagePerSecond: 1,
      damageType: 'generic',
    },
  ];

  return { colliders, hazards, update: () => {} };
}
