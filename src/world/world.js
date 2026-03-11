import * as THREE from 'three';
import { createDoor } from '../entities/door.js';
import { createLobbyZombieSentry } from '../entities/zombies.js';

/**
 * Test room — RCPD-lobby inspired layout.
 * Reworked for claustrophobic grandeur: columns, wainscoting, dense balustrades,
 * layered lighting, and heavy furniture to make the space feel enclosed despite its scale.
 */
export function createWorld(scene, physicsWorld) {
  const colliders = [];
  const hazards = [];
  const doors = [];
  const enemies = [];
  const shakeables = [];
  const staticWorldObjects = new Set();
  const roomMap = new Map();
  const roomVisibility = new Map();
  const roomTransitionCursors = new Map();
  const objectRoomMemberships = new Map();
  let activeRoomId = 'lobby';

  function assignObjectToRoom(roomId, object3D) {
    const room = roomMap.get(roomId);
    if (!room) return;
    if (!room.objects.includes(object3D)) {
      room.objects.push(object3D);
    }

    let memberships = objectRoomMemberships.get(object3D);
    if (!memberships) {
      memberships = new Set();
      objectRoomMemberships.set(object3D, memberships);
    }
    memberships.add(roomId);
  }

  function recomputeObjectVisibility(object3D) {
    const memberships = objectRoomMemberships.get(object3D);
    if (!memberships || memberships.size === 0) return;

    let shouldBeVisible = false;
    for (const roomId of memberships) {
      if (roomVisibility.get(roomId) !== false) {
        shouldBeVisible = true;
        break;
      }
    }

    object3D.visible = shouldBeVisible;
  }

  function registerRoom(id, bounds, connections = [], meta = {}) {
    roomMap.set(id, {
      id,
      bounds,
      connections,
      label: meta.label || id,
      zone: meta.zone || 'default',
      objects: [],
      colliders: [],
      hazards: [],
    });
    roomVisibility.set(id, true);
  }

  function withRoom(roomId, fn) {
    const previous = activeRoomId;
    activeRoomId = roomId;
    try {
      return fn();
    } finally {
      activeRoomId = previous;
    }
  }

  function registerObject(object3D) {
    scene.add(object3D);
    assignObjectToRoom(activeRoomId, object3D);
    recomputeObjectVisibility(object3D);
    return object3D;
  }

  function registerLight(light) {
    return registerObject(light);
  }

  function registerCollider(collider) {
    colliders.push(collider);
    const room = roomMap.get(activeRoomId);
    if (room) room.colliders.push(collider);
  }

  function registerHazard(hazard) {
    hazards.push(hazard);
    const room = roomMap.get(activeRoomId);
    if (room) room.hazards.push(hazard);
  }

  function markStaticWorldObject(object3D, options = {}) {
    if (!object3D) return object3D;
    object3D.userData.isStaticWorldObject = true;
    // Explicit per-object override wins over legacy exclusion flag.
    if (typeof options.shockwaveShake === 'boolean') {
      if (options.shockwaveShake) {
        delete object3D.userData.excludeShockwaveShake;
      } else {
        object3D.userData.excludeShockwaveShake = true;
      }
    } else if (options.excludeShockwaveShake === true) {
      object3D.userData.excludeShockwaveShake = true;
    }
    if (options.shockwavePhysicsControlled === true) {
      object3D.userData.shockwavePhysicsControlled = true;
    }
    staticWorldObjects.add(object3D);
    return object3D;
  }

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

  function box(w, h, d, x, y, z, mat, options = {}) {
    const mesh = registerObject(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    markStaticWorldObject(mesh, options);
    registerCollider(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  // Non-collider decoration (no Box3 push)
  function decor(w, h, d, x, y, z, mat, options = {}) {
    const mesh = registerObject(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    markStaticWorldObject(mesh, options);
    return mesh;
  }

  // ─── Dimensions ──────────────────────────────────────────────────────────
  const W          = 14;
  const CEIL       = 5.5;
  const PLATFORM_Y = 1.0;
  const STAIR_HEIGHT = 2.5;
  const BACK_Z     = -14;
  const FRONT_Z    =  14;
  const LEFT_WALL_X = -7;
  const RIGHT_WALL_X = 7;
  const WALL_THICK = 0.2;

  // Door parameters (left wall)
  const DOOR_WIDTH = 1.0;
  const DOOR_HEIGHT = 2.2;
  const DOOR_THICK = 0.08;
  const DOOR_HINGE_Z = 2.0;
  const DOOR_OPENING_MIN_Z = DOOR_HINGE_Z;
  const DOOR_OPENING_MAX_Z = DOOR_HINGE_Z + DOOR_WIDTH;
  const DOOR_OPENING_CENTER_Z = (DOOR_OPENING_MIN_Z + DOOR_OPENING_MAX_Z) / 2;
  const DOOR_INNER_X = LEFT_WALL_X + WALL_THICK / 2;

  // Offshoot chain dimensions (left of the lobby)
  const OFFSHOOT_ROOM_W = 4.0;
  const OFFSHOOT_ROOM_D = 4.0;
  const OFFSHOOT_CENTER_Z = DOOR_OPENING_CENTER_Z;
  const OFFSHOOT_MIN_Z = OFFSHOOT_CENTER_Z - OFFSHOOT_ROOM_D / 2;
  const OFFSHOOT_MAX_Z = OFFSHOOT_CENTER_Z + OFFSHOOT_ROOM_D / 2;
  const OFFSHOOT_STEP_X = OFFSHOOT_ROOM_W + WALL_THICK;

  const SIDE_ROOM_EAST_CENTER_X = LEFT_WALL_X - OFFSHOOT_ROOM_W / 2 - 0.2;
  const SIDE_ROOM_MID_CENTER_X = SIDE_ROOM_EAST_CENTER_X - OFFSHOOT_STEP_X;
  const SIDE_ROOM_WEST_CENTER_X = SIDE_ROOM_MID_CENTER_X - OFFSHOOT_STEP_X;
  const EAST_MID_PARTITION_X = SIDE_ROOM_EAST_CENTER_X - OFFSHOOT_ROOM_W / 2 - WALL_THICK / 2;
  const MID_WEST_PARTITION_X = SIDE_ROOM_MID_CENTER_X - OFFSHOOT_ROOM_W / 2 - WALL_THICK / 2;

  // ─── East Wing (administration) dimensions ────────────────────────────────
  const EAST_CEIL       = 3.0;   // Lower office ceiling
  const EAST_DOOR_OPENING_MIN_Z = DOOR_HINGE_Z;          // 2.0
  const EAST_DOOR_OPENING_MAX_Z = DOOR_HINGE_Z + DOOR_WIDTH; // 3.0
  const EAST_DOOR_INNER_X = RIGHT_WALL_X - WALL_THICK / 2; // 6.9

  // Hallway runs east from lobby right wall
  const EAST_HALL_MIN_X = RIGHT_WALL_X + WALL_THICK;      // 7.2
  const EAST_HALL_MAX_X = 19.0;
  const EAST_HALL_W     = EAST_HALL_MAX_X - EAST_HALL_MIN_X; // 11.8
  const EAST_HALL_CENTER_X = (EAST_HALL_MIN_X + EAST_HALL_MAX_X) / 2; // 13.1
  const EAST_HALL_MIN_Z = 1.0;
  const EAST_HALL_MAX_Z = 4.0;
  const EAST_HALL_D     = EAST_HALL_MAX_Z - EAST_HALL_MIN_Z; // 3.0
  const EAST_HALL_CENTER_Z = (EAST_HALL_MIN_Z + EAST_HALL_MAX_Z) / 2; // 2.5

  // North rooms (reception + admin office) sit above hallway
  const EAST_NORTH_MIN_Z = EAST_HALL_MAX_Z + WALL_THICK;  // 4.2
  const EAST_NORTH_MAX_Z = 8.5;
  const EAST_NORTH_D    = EAST_NORTH_MAX_Z - EAST_NORTH_MIN_Z; // 4.3
  const EAST_NORTH_CENTER_Z = (EAST_NORTH_MIN_Z + EAST_NORTH_MAX_Z) / 2;

  // South rooms (manager + kitchenette) sit below hallway
  const EAST_SOUTH_MIN_Z = -3.0;
  const EAST_SOUTH_MAX_Z = EAST_HALL_MIN_Z - WALL_THICK;  // 0.8
  const EAST_SOUTH_D    = EAST_SOUTH_MAX_Z - EAST_SOUTH_MIN_Z; // 3.8
  const EAST_SOUTH_CENTER_Z = (EAST_SOUTH_MIN_Z + EAST_SOUTH_MAX_Z) / 2;

  // Partition wall between left/right room columns
  const EAST_PARTITION_X = 13.0;

  // Left column rooms (reception / manager)
  const EAST_LEFT_MIN_X  = EAST_HALL_MIN_X;               // 7.2
  const EAST_LEFT_MAX_X  = EAST_PARTITION_X - WALL_THICK / 2; // 12.9
  const EAST_LEFT_W      = EAST_LEFT_MAX_X - EAST_LEFT_MIN_X; // 5.7
  const EAST_LEFT_CENTER_X = (EAST_LEFT_MIN_X + EAST_LEFT_MAX_X) / 2;

  // Right column rooms (admin / kitchenette)
  const EAST_RIGHT_MIN_X = EAST_PARTITION_X + WALL_THICK / 2; // 13.1
  const EAST_RIGHT_MAX_X = EAST_HALL_MAX_X;                // 19.0
  const EAST_RIGHT_W     = EAST_RIGHT_MAX_X - EAST_RIGHT_MIN_X; // 5.9
  const EAST_RIGHT_CENTER_X = (EAST_RIGHT_MIN_X + EAST_RIGHT_MAX_X) / 2;

  // Director's office at end of hallway
  const EAST_DIR_MIN_X = EAST_HALL_MAX_X + WALL_THICK;    // 19.2
  const EAST_DIR_MAX_X = 24.5;
  const EAST_DIR_W     = EAST_DIR_MAX_X - EAST_DIR_MIN_X; // 5.3
  const EAST_DIR_CENTER_X = (EAST_DIR_MIN_X + EAST_DIR_MAX_X) / 2;
  const EAST_DIR_MIN_Z = -1.0;
  const EAST_DIR_MAX_Z = 6.0;
  const EAST_DIR_D     = EAST_DIR_MAX_Z - EAST_DIR_MIN_Z; // 7.0
  const EAST_DIR_CENTER_Z = (EAST_DIR_MIN_Z + EAST_DIR_MAX_Z) / 2;

  // Door positions along hallway walls (X positions of hinge centers)
  const EAST_DOOR_RECEPTION_X = 9.5;
  const EAST_DOOR_ADMIN_X     = 15.5;
  const EAST_DOOR_MANAGER_X   = 9.5;
  const EAST_DOOR_KITCHEN_X   = 15.5;

  registerRoom(
    'lobby',
    new THREE.Box3(
      new THREE.Vector3(LEFT_WALL_X - 0.2, -1.0, BACK_Z - 0.2),
      new THREE.Vector3(RIGHT_WALL_X + 0.2, CEIL + 0.5, FRONT_Z + 0.2)
    ),
    ['sideRoomEast', 'eastHallway'],
    { label: 'Main Lobby', zone: 'lobby' }
  );

  function offshootBounds(centerX) {
    return new THREE.Box3(
      new THREE.Vector3(centerX - OFFSHOOT_ROOM_W / 2 - WALL_THICK / 2, -1.0, OFFSHOOT_MIN_Z - WALL_THICK / 2),
      new THREE.Vector3(centerX + OFFSHOOT_ROOM_W / 2 + WALL_THICK / 2, CEIL + 0.5, OFFSHOOT_MAX_Z + WALL_THICK / 2)
    );
  }

  registerRoom(
    'sideRoomEast',
    offshootBounds(SIDE_ROOM_EAST_CENTER_X),
    ['lobby', 'sideRoomMid'],
    { label: 'Offshoot East', zone: 'offshootA' }
  );

  registerRoom(
    'sideRoomMid',
    offshootBounds(SIDE_ROOM_MID_CENTER_X),
    ['sideRoomEast', 'sideRoomWest'],
    { label: 'Offshoot Mid', zone: 'offshootB' }
  );

  registerRoom(
    'sideRoomWest',
    offshootBounds(SIDE_ROOM_WEST_CENTER_X),
    ['sideRoomMid'],
    { label: 'Offshoot West', zone: 'offshootC' }
  );

  // ─── East Wing Room Registrations ─────────────────────────────────────────
  registerRoom(
    'eastHallway',
    new THREE.Box3(
      new THREE.Vector3(EAST_HALL_MIN_X - 0.2, -1.0, EAST_HALL_MIN_Z - 0.2),
      new THREE.Vector3(EAST_HALL_MAX_X + 0.2, EAST_CEIL + 0.5, EAST_HALL_MAX_Z + 0.2)
    ),
    ['lobby', 'eastReception', 'eastAdmin', 'eastManager', 'eastKitchen', 'eastDirector'],
    { label: 'East Hallway', zone: 'eastHallway' }
  );

  registerRoom(
    'eastReception',
    new THREE.Box3(
      new THREE.Vector3(EAST_LEFT_MIN_X - 0.2, -1.0, EAST_NORTH_MIN_Z - 0.2),
      new THREE.Vector3(EAST_LEFT_MAX_X + 0.2, EAST_CEIL + 0.5, EAST_NORTH_MAX_Z + 0.2)
    ),
    ['eastHallway'],
    { label: 'Reception Office', zone: 'eastReception' }
  );

  registerRoom(
    'eastAdmin',
    new THREE.Box3(
      new THREE.Vector3(EAST_RIGHT_MIN_X - 0.2, -1.0, EAST_NORTH_MIN_Z - 0.2),
      new THREE.Vector3(EAST_RIGHT_MAX_X + 0.2, EAST_CEIL + 0.5, EAST_NORTH_MAX_Z + 0.2)
    ),
    ['eastHallway'],
    { label: 'Admin Office', zone: 'eastAdmin' }
  );

  registerRoom(
    'eastManager',
    new THREE.Box3(
      new THREE.Vector3(EAST_LEFT_MIN_X - 0.2, -1.0, EAST_SOUTH_MIN_Z - 0.2),
      new THREE.Vector3(EAST_LEFT_MAX_X + 0.2, EAST_CEIL + 0.5, EAST_SOUTH_MAX_Z + 0.2)
    ),
    ['eastHallway'],
    { label: "Manager's Office", zone: 'eastManager' }
  );

  registerRoom(
    'eastKitchen',
    new THREE.Box3(
      new THREE.Vector3(EAST_RIGHT_MIN_X - 0.2, -1.0, EAST_SOUTH_MIN_Z - 0.2),
      new THREE.Vector3(EAST_RIGHT_MAX_X + 0.2, EAST_CEIL + 0.5, EAST_SOUTH_MAX_Z + 0.2)
    ),
    ['eastHallway'],
    { label: 'Kitchenette', zone: 'eastKitchen' }
  );

  registerRoom(
    'eastDirector',
    new THREE.Box3(
      new THREE.Vector3(EAST_DIR_MIN_X - 0.2, -1.0, EAST_DIR_MIN_Z - 0.2),
      new THREE.Vector3(EAST_DIR_MAX_X + 0.2, EAST_CEIL + 0.5, EAST_DIR_MAX_Z + 0.2)
    ),
    ['eastHallway'],
    { label: "Director's Office", zone: 'eastDirector' }
  );

  // ─── Floors ──────────────────────────────────────────────────────────────
  box(W, 0.2, 20, 0, -0.1, 0, M.floor);
  box(W, 0.2,  4, 0, -0.1, -12, M.floor);                // back area under balcony
  box(W, 0.2,  5, 0, PLATFORM_Y - 0.1, 11.5, M.floor);

  // ─── Walls & Ceiling ─────────────────────────────────────────────────────
  const DEPTH = 28;
  // Left wall split to create a door opening
  const leftWallFrontDepth = DOOR_OPENING_MIN_Z - BACK_Z;
  const leftWallBackDepth = FRONT_Z - DOOR_OPENING_MAX_Z;
  if (leftWallFrontDepth > 0) {
    const centerZ = (BACK_Z + DOOR_OPENING_MIN_Z) / 2;
    box(WALL_THICK, CEIL, leftWallFrontDepth, LEFT_WALL_X, CEIL / 2, centerZ, M.wall);
  }
  if (leftWallBackDepth > 0) {
    const centerZ = (DOOR_OPENING_MAX_Z + FRONT_Z) / 2;
    box(WALL_THICK, CEIL, leftWallBackDepth, LEFT_WALL_X, CEIL / 2, centerZ, M.wall);
  }
  // Right wall split to create a door opening for east wing
  const rightWallFrontDepth = DOOR_OPENING_MIN_Z - BACK_Z;
  const rightWallBackDepth = FRONT_Z - DOOR_OPENING_MAX_Z;
  if (rightWallFrontDepth > 0) {
    const centerZ = (BACK_Z + DOOR_OPENING_MIN_Z) / 2;
    box(WALL_THICK, CEIL, rightWallFrontDepth, RIGHT_WALL_X, CEIL / 2, centerZ, M.wall);
  }
  if (rightWallBackDepth > 0) {
    const centerZ = (DOOR_OPENING_MAX_Z + FRONT_Z) / 2;
    box(WALL_THICK, CEIL, rightWallBackDepth, RIGHT_WALL_X, CEIL / 2, centerZ, M.wall);
  }
  box(W,   CEIL, 0.2,   0, CEIL / 2, BACK_Z,  M.wall);
  box(W,   CEIL, 0.2,   0, CEIL / 2, FRONT_Z, M.wall);
  box(W,   0.2,  DEPTH, 0, CEIL + 0.1, 0,     M.ceiling);

  // ─── Wainscoting (lower wall panels) ─────────────────────────────────────
  // Slightly proud of walls to cast shadow lines, makes room feel tighter
  // Left wainscot split to leave door opening
  const leftWainscotDepthA = DOOR_OPENING_MIN_Z - BACK_Z - 0.2;
  const leftWainscotDepthB = FRONT_Z - DOOR_OPENING_MAX_Z - 0.2;
  if (leftWainscotDepthA > 0) {
    decor(0.12, 1.5, leftWainscotDepthA, -6.94, 0.75, (BACK_Z + DOOR_OPENING_MIN_Z) / 2, M.wainscot);
  }
  if (leftWainscotDepthB > 0) {
    decor(0.12, 1.5, leftWainscotDepthB, -6.94, 0.75, (DOOR_OPENING_MAX_Z + FRONT_Z) / 2, M.wainscot);
  }
  // Right wainscot split to leave door opening
  const rightWainscotDepthA = DOOR_OPENING_MIN_Z - BACK_Z - 0.2;
  const rightWainscotDepthB = FRONT_Z - DOOR_OPENING_MAX_Z - 0.2;
  if (rightWainscotDepthA > 0) {
    decor(0.12, 1.5, rightWainscotDepthA, 6.94, 0.75, (BACK_Z + DOOR_OPENING_MIN_Z) / 2, M.wainscot);
  }
  if (rightWainscotDepthB > 0) {
    decor(0.12, 1.5, rightWainscotDepthB, 6.94, 0.75, (DOOR_OPENING_MAX_Z + FRONT_Z) / 2, M.wainscot);
  }
  decor(14,   1.5, 0.12,  0, 0.75, BACK_Z  + 0.06, M.wainscot); // back
  decor(14,   1.5, 0.12,  0, 0.75, FRONT_Z - 0.06, M.wainscot); // front

  // ─── Crown Molding ───────────────────────────────────────────────────────
  // Left crown molding split to leave door opening
  if (leftWallFrontDepth > 0) {
    decor(0.18, 0.20, leftWallFrontDepth, -6.91, CEIL - 0.10, (BACK_Z + DOOR_OPENING_MIN_Z) / 2, M.wainscot);
  }
  if (leftWallBackDepth > 0) {
    decor(0.18, 0.20, leftWallBackDepth, -6.91, CEIL - 0.10, (DOOR_OPENING_MAX_Z + FRONT_Z) / 2, M.wainscot);
  }
  // Right crown molding split to leave door opening
  if (rightWallFrontDepth > 0) {
    decor(0.18, 0.20, rightWallFrontDepth, 6.91, CEIL - 0.10, (BACK_Z + DOOR_OPENING_MIN_Z) / 2, M.wainscot);
  }
  if (rightWallBackDepth > 0) {
    decor(0.18, 0.20, rightWallBackDepth, 6.91, CEIL - 0.10, (DOOR_OPENING_MAX_Z + FRONT_Z) / 2, M.wainscot);
  }
  decor(14,   0.20, 0.18,  0, CEIL - 0.10, BACK_Z  + 0.09, M.wainscot); // back
  decor(14,   0.20, 0.18,  0, CEIL - 0.10, FRONT_Z - 0.09, M.wainscot); // front

  // ─── Picture Rail Trim (mid-wall band above sconces) ─────────────────────
  const PICTURE_RAIL_Y = 2.72;
  if (leftWallFrontDepth > 0) {
    decor(0.14, 0.10, leftWallFrontDepth, -6.93, PICTURE_RAIL_Y, (BACK_Z + DOOR_OPENING_MIN_Z) / 2, M.wainscot);
  }
  if (leftWallBackDepth > 0) {
    decor(0.14, 0.10, leftWallBackDepth, -6.93, PICTURE_RAIL_Y, (DOOR_OPENING_MAX_Z + FRONT_Z) / 2, M.wainscot);
  }
  if (rightWallFrontDepth > 0) {
    decor(0.14, 0.10, rightWallFrontDepth, 6.93, PICTURE_RAIL_Y, (BACK_Z + DOOR_OPENING_MIN_Z) / 2, M.wainscot);
  }
  if (rightWallBackDepth > 0) {
    decor(0.14, 0.10, rightWallBackDepth, 6.93, PICTURE_RAIL_Y, (DOOR_OPENING_MAX_Z + FRONT_Z) / 2, M.wainscot);
  }
  decor(14, 0.10, 0.14, 0, PICTURE_RAIL_Y, BACK_Z + 0.07, M.wainscot);
  decor(14, 0.10, 0.14, 0, PICTURE_RAIL_Y, FRONT_Z - 0.07, M.wainscot);

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
  registerLight(deskLampLight);

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
  box(2.0, 0.10, 0.70, -4.5, 0.52, 4.5, M.bench);           // seat
  box(0.10, 0.50, 0.70, -5.5, 0.25, 4.5, M.bench);          // left leg
  box(0.10, 0.50, 0.70, -3.5, 0.25, 4.5, M.bench);          // right leg
  box(0.10, 0.50, 0.70, -4.5, 0.75, 4.12, M.bench);         // back
  decor(0.10, 0.26, 0.70, -5.5, 0.64, 4.5, M.bench);        // left armrest
  decor(0.10, 0.26, 0.70, -3.5, 0.64, 4.5, M.bench);        // right armrest
  decor(0.20, 0.03, 0.56, -4.7, 0.54, 4.65, M.magazine);    // magazine 1
  decor(0.20, 0.03, 0.56, -4.2, 0.54, 4.65, M.paper);       // magazine 2

  // Left side table
  box(0.50, 0.45, 0.48, -5.9, 0.22, 4.5, M.bench);
  box(0.56, 0.05, 0.54, -5.9, 0.47, 4.5, M.bench);
  decor(0.20, 0.03, 0.56, -5.9, 0.51, 4.5, M.magazine);

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
  registerLight(lampLight1);

  // Right lamp (near bench, front hall)
  box(0.12, 1.8, 0.12, 4.5, 0.90, 4.2, M.lamp);
  decor(0.38, 0.28, 0.38, 4.5, 1.96, 4.2, M.lampShade);
  const lampLight2 = new THREE.PointLight(0xFFDF80, 2.0, 8);
  lampLight2.position.set(4.5, 1.8, 4.2);
  registerLight(lampLight2);

  // ─── Wall Sconces (8 total — 4 per side wall) ─────────────────────────────
  const sconceZPositions = [8, 3, -2, -5];
  // Right wall sconce at Z=3 conflicts with new door opening; shift to Z=5.5
  const rightSconceZPositions = [8, 5.5, -2, -5];
  for (const sz of sconceZPositions) {
    // Left wall
    decor(0.22, 0.08, 0.32, -6.85, 2.5, sz, M.lamp);           // bracket
    decor(0.28, 0.22, 0.28, -6.68, 2.58, sz, M.lampShade);     // shade
    const sl = new THREE.PointLight(0xFFE0A0, 1.2, 6);
    sl.position.set(-6.1, 2.5, sz);
    registerLight(sl);
  }
  for (const sz of rightSconceZPositions) {
    // Right wall
    decor(0.22, 0.08, 0.32, 6.85, 2.5, sz, M.lamp);
    decor(0.28, 0.22, 0.28, 6.68, 2.58, sz, M.lampShade);
    const sr = new THREE.PointLight(0xFFE0A0, 1.2, 6);
    sr.position.set(6.1, 2.5, sz);
    registerLight(sr);
  }

  // ─── Lighting ─────────────────────────────────────────────────────────────
  // Very dim ambient — let point lights do the heavy lifting for mood
  registerLight(new THREE.AmbientLight(0x30282C, 0.12));

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
    registerLight(pl);
  });

  // ─── Damage Pillar (deals 1 damage/sec on contact) ────────────────────────
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.7, metalness: 0.3 });
  const pillarX = 0, pillarZ = -4;
  const pillarRadius = 0.4;
  const pillarHeight = 2.5;

  const pillarMesh = registerObject(new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius, pillarRadius, pillarHeight, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.7, metalness: 0.3 })
  ));
  pillarMesh.position.set(pillarX, pillarHeight / 2, pillarZ);
  pillarMesh.castShadow = true;
  pillarMesh.receiveShadow = true;

  const capMesh = registerObject(new THREE.Mesh(
    new THREE.CylinderGeometry(pillarRadius * 1.2, pillarRadius * 1.2, 0.12, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.5, metalness: 0.5 })
  ));
  capMesh.position.set(pillarX, pillarHeight + 0.06, pillarZ);

  registerCollider(new THREE.Box3().setFromObject(pillarMesh));

  registerHazard({
    type: 'damagePillar',
    position: { x: pillarX, z: pillarZ },
    radius: pillarRadius + 0.6,
    damagePerSecond: 1,
    damageType: 'generic',
  });

  // First enemy visual prototype: static zombie parked behind the desk.
  // Add a dedicated world collider so the player cannot walk through it.
  const zombieSentry = createLobbyZombieSentry();
  zombieSentry.mesh.rotation.y = 2.75;

  const zombieHalfSize = new THREE.Vector3(0.28, 0.9, 0.24);
  const zombieFootOffsetY = 0.02;

  function makeZombieColliderAt(x, z) {
    return new THREE.Box3(
      new THREE.Vector3(x - zombieHalfSize.x, zombieFootOffsetY, z - zombieHalfSize.z),
      new THREE.Vector3(x + zombieHalfSize.x, zombieFootOffsetY + zombieHalfSize.y * 2, z + zombieHalfSize.z)
    );
  }

  function intersectsExistingWorld(collider) {
    for (const existing of colliders) {
      // Ignore floor slabs so feet can rest on ground.
      if (existing.max.y <= 0.05) continue;
      if (collider.intersectsBox(existing)) return true;
    }
    return false;
  }

  const zombieSpawnCandidates = [
    new THREE.Vector3(1.8, 0, -2.6),
    new THREE.Vector3(2.3, 0, -2.6),
    new THREE.Vector3(1.2, 0, -2.6),
    new THREE.Vector3(2.0, 0, -2.1),
    new THREE.Vector3(2.0, 0, -3.0),
  ];

  let chosenZombiePos = zombieSpawnCandidates[0];
  let zombieCollider = makeZombieColliderAt(chosenZombiePos.x, chosenZombiePos.z);
  for (const candidate of zombieSpawnCandidates) {
    const testCollider = makeZombieColliderAt(candidate.x, candidate.z);
    if (!intersectsExistingWorld(testCollider)) {
      chosenZombiePos = candidate;
      zombieCollider = testCollider;
      break;
    }
  }

  zombieSentry.mesh.position.copy(chosenZombiePos);
  zombieSentry.components.collision = {
    shape: 'aabb',
    box: zombieCollider,
    halfSize: zombieHalfSize.clone(),
    footOffsetY: zombieFootOffsetY,
    syncFromEntity(enemyEntity) {
      const p = enemyEntity.mesh.position;
      this.box.min.set(p.x - this.halfSize.x, this.footOffsetY, p.z - this.halfSize.z);
      this.box.max.set(p.x + this.halfSize.x, this.footOffsetY + this.halfSize.y * 2, p.z + this.halfSize.z);
    },
  };

  registerObject(zombieSentry.mesh);
  registerCollider(zombieCollider);
  enemies.push(zombieSentry);

  // --- Door: lobby <-> offshoot east ---
  const primaryDoorRef = addLinkedDoor({
    id: 'doorLobbyEast',
    roomA: 'lobby',
    roomB: 'sideRoomEast',
    hingeX: DOOR_INNER_X,
    hingeZ: DOOR_HINGE_Z,
    color: 0x6F4A2A,
  });

  // Door frame (decorative)
  decor(0.06, DOOR_HEIGHT + 0.1, 0.08, LEFT_WALL_X + 0.04, DOOR_HEIGHT / 2, DOOR_OPENING_MIN_Z - 0.02, M.wainscot);
  decor(0.06, DOOR_HEIGHT + 0.1, 0.08, LEFT_WALL_X + 0.04, DOOR_HEIGHT / 2, DOOR_OPENING_MAX_Z + 0.02, M.wainscot);
  decor(0.06, 0.08, DOOR_WIDTH + 0.2, LEFT_WALL_X + 0.04, DOOR_HEIGHT + 0.04, DOOR_OPENING_CENTER_Z, M.wainscot);

  // Right wall door frame (decorative) — east wing entrance
  decor(0.06, DOOR_HEIGHT + 0.1, 0.08, RIGHT_WALL_X - 0.04, DOOR_HEIGHT / 2, DOOR_OPENING_MIN_Z - 0.02, M.wainscot);
  decor(0.06, DOOR_HEIGHT + 0.1, 0.08, RIGHT_WALL_X - 0.04, DOOR_HEIGHT / 2, DOOR_OPENING_MAX_Z + 0.02, M.wainscot);
  decor(0.06, 0.08, DOOR_WIDTH + 0.2, RIGHT_WALL_X - 0.04, DOOR_HEIGHT + 0.04, DOOR_OPENING_CENTER_Z, M.wainscot);

  // Door collision is handled dynamically by the door system (not a static collider)

  // --- Offshoot chain: east (existing) -> mid -> west ---
  function buildPartitionWithOpening(xCenter, openingMinZ, openingMaxZ, adjacentRoomId = null) {
    const lowerDepth = openingMinZ - OFFSHOOT_MIN_Z;
    const upperDepth = OFFSHOOT_MAX_Z - openingMaxZ;
    const partitionObjects = [];

    function track(object3D) {
      partitionObjects.push(object3D);
      if (adjacentRoomId) registerExternalRoomObject(adjacentRoomId, object3D);
    }

    if (lowerDepth > 0) {
      const lowerCenterZ = (OFFSHOOT_MIN_Z + openingMinZ) / 2;
      track(box(WALL_THICK, CEIL, lowerDepth, xCenter, CEIL / 2, lowerCenterZ, M.wall));
      track(decor(0.12, 1.5, lowerDepth - 0.08, xCenter + 0.03, 0.75, lowerCenterZ, M.wainscot));
    }
    if (upperDepth > 0) {
      const upperCenterZ = (openingMaxZ + OFFSHOOT_MAX_Z) / 2;
      track(box(WALL_THICK, CEIL, upperDepth, xCenter, CEIL / 2, upperCenterZ, M.wall));
      track(decor(0.12, 1.5, upperDepth - 0.08, xCenter + 0.03, 0.75, upperCenterZ, M.wainscot));
    }

    // Simple trim around each interior doorway opening
    track(decor(0.06, DOOR_HEIGHT + 0.1, 0.08, xCenter + 0.05, DOOR_HEIGHT / 2, openingMinZ - 0.02, M.wainscot));
    track(decor(0.06, DOOR_HEIGHT + 0.1, 0.08, xCenter + 0.05, DOOR_HEIGHT / 2, openingMaxZ + 0.02, M.wainscot));
    track(decor(0.06, 0.08, DOOR_WIDTH + 0.2, xCenter + 0.05, DOOR_HEIGHT + 0.04, (openingMinZ + openingMaxZ) / 2, M.wainscot));

    return partitionObjects;
  }

  function buildOffshootRoom(roomId, centerX, lightColor, lightIntensity) {
    withRoom(roomId, () => {
      // Floor & ceiling
      box(OFFSHOOT_ROOM_W, 0.2, OFFSHOOT_ROOM_D, centerX, -0.1, OFFSHOOT_CENTER_Z, M.floor);
      box(OFFSHOOT_ROOM_W, 0.2, OFFSHOOT_ROOM_D, centerX, CEIL + 0.1, OFFSHOOT_CENTER_Z, M.ceiling);

      // Front/back walls
      box(OFFSHOOT_ROOM_W, CEIL, WALL_THICK, centerX, CEIL / 2, OFFSHOOT_MIN_Z, M.wall);
      box(OFFSHOOT_ROOM_W, CEIL, WALL_THICK, centerX, CEIL / 2, OFFSHOOT_MAX_Z, M.wall);

      // Per-room local light (kept room-owned for culling)
      const roomLight = new THREE.PointLight(lightColor, lightIntensity, 6.5);
      roomLight.position.set(centerX, CEIL - 0.65, OFFSHOOT_CENTER_Z);
      registerLight(roomLight);
    });
  }

  function addLinkedDoor({
    id,
    roomA,
    roomB,
    hingeX,
    hingeZ = DOOR_HINGE_Z,
    hingeRotY = 0,
    color = 0x6F4A2A,
  }) {
    const doorEntity = createDoor({
      width: DOOR_WIDTH,
      height: DOOR_HEIGHT,
      thickness: DOOR_THICK,
      color,
    });

    // When hingeRotY is non-zero, wrap the pivot in a parent group so the
    // door physics system (which reads getWorldQuaternion) inherits the
    // rotation transparently.  Standard (0) case is unchanged.
    let rootObject;
    if (hingeRotY) {
      const wrapper = new THREE.Group();
      wrapper.position.set(hingeX, 0, hingeZ);
      wrapper.rotation.y = hingeRotY;
      doorEntity.pivot.position.set(0, 0, 0);
      wrapper.add(doorEntity.pivot);
      rootObject = wrapper;
    } else {
      doorEntity.pivot.position.set(hingeX, 0, hingeZ);
      rootObject = doorEntity.pivot;
    }

    // Doors use dedicated shockwave physics and must never be in static shakeables.
    rootObject.traverse?.(child => {
      child.userData.shockwavePhysicsControlled = true;
      child.userData.excludeShockwaveShake = true;
    });

    withRoom(roomA, () => {
      registerObject(rootObject);
    });
    registerExternalRoomObject(roomB, rootObject);

    const doorRef = {
      id,
      roomIds: [roomA, roomB],
      door: doorEntity,
    };
    doors.push(doorRef);
    return doorRef;
  }

  buildOffshootRoom('sideRoomEast', SIDE_ROOM_EAST_CENTER_X, 0xFFEAC8, 1.45);
  buildOffshootRoom('sideRoomMid', SIDE_ROOM_MID_CENTER_X, 0xFDE2BA, 1.35);
  buildOffshootRoom('sideRoomWest', SIDE_ROOM_WEST_CENTER_X, 0xF7D9A8, 1.25);

  // Exterior west wall of the farthest room
  withRoom('sideRoomWest', () => {
    box(
      WALL_THICK,
      CEIL,
      OFFSHOOT_ROOM_D,
      SIDE_ROOM_WEST_CENTER_X - OFFSHOOT_ROOM_W / 2,
      CEIL / 2,
      OFFSHOOT_CENTER_Z,
      M.wall
    );
  });

  // Interior partitions with door openings (east<->mid and mid<->west)
  withRoom('sideRoomEast', () => {
    buildPartitionWithOpening(EAST_MID_PARTITION_X, DOOR_OPENING_MIN_Z, DOOR_OPENING_MAX_Z, 'sideRoomMid');
  });
  withRoom('sideRoomMid', () => {
    buildPartitionWithOpening(MID_WEST_PARTITION_X, DOOR_OPENING_MIN_Z, DOOR_OPENING_MAX_Z, 'sideRoomWest');
  });

  // Physical doors for offshoot room-to-room transitions
  addLinkedDoor({
    id: 'doorEastMid',
    roomA: 'sideRoomEast',
    roomB: 'sideRoomMid',
    hingeX: EAST_MID_PARTITION_X + WALL_THICK / 2,
    hingeZ: DOOR_HINGE_Z,
    color: 0x6A4327,
  });

  addLinkedDoor({
    id: 'doorMidWest',
    roomA: 'sideRoomMid',
    roomB: 'sideRoomWest',
    hingeX: MID_WEST_PARTITION_X + WALL_THICK / 2,
    hingeZ: DOOR_HINGE_Z,
    color: 0x5D3A22,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ███ EAST WING — Administration Area ███████████████████████████████████████
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Lobby → East Hallway door (standard orientation like left-wall door) ---
  addLinkedDoor({
    id: 'doorLobbyEastWing',
    roomA: 'lobby',
    roomB: 'eastHallway',
    hingeX: EAST_DOOR_INNER_X,
    hingeZ: DOOR_HINGE_Z,
    color: 0x6F4A2A,
  });

  // ─── East Hallway Geometry ────────────────────────────────────────────────
  withRoom('eastHallway', () => {
    // Floor & ceiling
    box(EAST_HALL_W, 0.2, EAST_HALL_D, EAST_HALL_CENTER_X, -0.1, EAST_HALL_CENTER_Z, M.floor);
    box(EAST_HALL_W, 0.2, EAST_HALL_D, EAST_HALL_CENTER_X, EAST_CEIL + 0.1, EAST_HALL_CENTER_Z, M.ceiling);

    // ─── North wall (Z = EAST_HALL_MAX_Z) — split for reception + admin doors ───
    // Segment 1: left of reception door
    const nSeg1W = EAST_DOOR_RECEPTION_X - DOOR_WIDTH / 2 - EAST_HALL_MIN_X;
    if (nSeg1W > 0) {
      const cx = (EAST_HALL_MIN_X + EAST_DOOR_RECEPTION_X - DOOR_WIDTH / 2) / 2;
      box(nSeg1W, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_HALL_MAX_Z, M.wall);
      decor(nSeg1W - 0.08, 1.5, 0.12, cx, 0.75, EAST_HALL_MAX_Z - 0.06, M.wainscot);
      decor(nSeg1W - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_HALL_MAX_Z - 0.09, M.wainscot);
    }
    // Segment 2: between reception and admin doors
    const nSeg2Left  = EAST_DOOR_RECEPTION_X + DOOR_WIDTH / 2;
    const nSeg2Right = EAST_DOOR_ADMIN_X - DOOR_WIDTH / 2;
    const nSeg2W = nSeg2Right - nSeg2Left;
    if (nSeg2W > 0) {
      const cx = (nSeg2Left + nSeg2Right) / 2;
      box(nSeg2W, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_HALL_MAX_Z, M.wall);
      decor(nSeg2W - 0.08, 1.5, 0.12, cx, 0.75, EAST_HALL_MAX_Z - 0.06, M.wainscot);
      decor(nSeg2W - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_HALL_MAX_Z - 0.09, M.wainscot);
    }
    // Segment 3: right of admin door
    const nSeg3W = EAST_HALL_MAX_X - (EAST_DOOR_ADMIN_X + DOOR_WIDTH / 2);
    if (nSeg3W > 0) {
      const cx = (EAST_DOOR_ADMIN_X + DOOR_WIDTH / 2 + EAST_HALL_MAX_X) / 2;
      box(nSeg3W, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_HALL_MAX_Z, M.wall);
      decor(nSeg3W - 0.08, 1.5, 0.12, cx, 0.75, EAST_HALL_MAX_Z - 0.06, M.wainscot);
      decor(nSeg3W - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_HALL_MAX_Z - 0.09, M.wainscot);
    }
    // Door frame trim — reception door (north wall)
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_RECEPTION_X - DOOR_WIDTH / 2 - 0.02, DOOR_HEIGHT / 2, EAST_HALL_MAX_Z - 0.05, M.wainscot);
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_RECEPTION_X + DOOR_WIDTH / 2 + 0.02, DOOR_HEIGHT / 2, EAST_HALL_MAX_Z - 0.05, M.wainscot);
    decor(DOOR_WIDTH + 0.2, 0.08, 0.06, EAST_DOOR_RECEPTION_X, DOOR_HEIGHT + 0.04, EAST_HALL_MAX_Z - 0.05, M.wainscot);
    // Door frame trim — admin door (north wall)
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_ADMIN_X - DOOR_WIDTH / 2 - 0.02, DOOR_HEIGHT / 2, EAST_HALL_MAX_Z - 0.05, M.wainscot);
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_ADMIN_X + DOOR_WIDTH / 2 + 0.02, DOOR_HEIGHT / 2, EAST_HALL_MAX_Z - 0.05, M.wainscot);
    decor(DOOR_WIDTH + 0.2, 0.08, 0.06, EAST_DOOR_ADMIN_X, DOOR_HEIGHT + 0.04, EAST_HALL_MAX_Z - 0.05, M.wainscot);

    // ─── South wall (Z = EAST_HALL_MIN_Z) — split for manager + kitchen doors ───
    const sSeg1W = EAST_DOOR_MANAGER_X - DOOR_WIDTH / 2 - EAST_HALL_MIN_X;
    if (sSeg1W > 0) {
      const cx = (EAST_HALL_MIN_X + EAST_DOOR_MANAGER_X - DOOR_WIDTH / 2) / 2;
      box(sSeg1W, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_HALL_MIN_Z, M.wall);
      decor(sSeg1W - 0.08, 1.5, 0.12, cx, 0.75, EAST_HALL_MIN_Z + 0.06, M.wainscot);
      decor(sSeg1W - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_HALL_MIN_Z + 0.09, M.wainscot);
    }
    const sSeg2Left  = EAST_DOOR_MANAGER_X + DOOR_WIDTH / 2;
    const sSeg2Right = EAST_DOOR_KITCHEN_X - DOOR_WIDTH / 2;
    const sSeg2W = sSeg2Right - sSeg2Left;
    if (sSeg2W > 0) {
      const cx = (sSeg2Left + sSeg2Right) / 2;
      box(sSeg2W, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_HALL_MIN_Z, M.wall);
      decor(sSeg2W - 0.08, 1.5, 0.12, cx, 0.75, EAST_HALL_MIN_Z + 0.06, M.wainscot);
      decor(sSeg2W - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_HALL_MIN_Z + 0.09, M.wainscot);
    }
    const sSeg3W = EAST_HALL_MAX_X - (EAST_DOOR_KITCHEN_X + DOOR_WIDTH / 2);
    if (sSeg3W > 0) {
      const cx = (EAST_DOOR_KITCHEN_X + DOOR_WIDTH / 2 + EAST_HALL_MAX_X) / 2;
      box(sSeg3W, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_HALL_MIN_Z, M.wall);
      decor(sSeg3W - 0.08, 1.5, 0.12, cx, 0.75, EAST_HALL_MIN_Z + 0.06, M.wainscot);
      decor(sSeg3W - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_HALL_MIN_Z + 0.09, M.wainscot);
    }
    // Door frame trim — manager door (south wall)
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_MANAGER_X - DOOR_WIDTH / 2 - 0.02, DOOR_HEIGHT / 2, EAST_HALL_MIN_Z + 0.05, M.wainscot);
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_MANAGER_X + DOOR_WIDTH / 2 + 0.02, DOOR_HEIGHT / 2, EAST_HALL_MIN_Z + 0.05, M.wainscot);
    decor(DOOR_WIDTH + 0.2, 0.08, 0.06, EAST_DOOR_MANAGER_X, DOOR_HEIGHT + 0.04, EAST_HALL_MIN_Z + 0.05, M.wainscot);
    // Door frame trim — kitchen door (south wall)
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_KITCHEN_X - DOOR_WIDTH / 2 - 0.02, DOOR_HEIGHT / 2, EAST_HALL_MIN_Z + 0.05, M.wainscot);
    decor(0.08, DOOR_HEIGHT + 0.1, 0.06, EAST_DOOR_KITCHEN_X + DOOR_WIDTH / 2 + 0.02, DOOR_HEIGHT / 2, EAST_HALL_MIN_Z + 0.05, M.wainscot);
    decor(DOOR_WIDTH + 0.2, 0.08, 0.06, EAST_DOOR_KITCHEN_X, DOOR_HEIGHT + 0.04, EAST_HALL_MIN_Z + 0.05, M.wainscot);

    // ─── East end wall (X = EAST_HALL_MAX_X) — split for director door ───
    const eSeg1D = EAST_DOOR_OPENING_MIN_Z - EAST_HALL_MIN_Z;
    if (eSeg1D > 0) {
      const cz = (EAST_HALL_MIN_Z + EAST_DOOR_OPENING_MIN_Z) / 2;
      box(WALL_THICK, EAST_CEIL, eSeg1D, EAST_HALL_MAX_X, EAST_CEIL / 2, cz, M.wall);
      decor(0.12, 1.5, eSeg1D - 0.08, EAST_HALL_MAX_X - 0.06, 0.75, cz, M.wainscot);
      decor(0.18, 0.20, eSeg1D - 0.08, EAST_HALL_MAX_X - 0.09, EAST_CEIL - 0.10, cz, M.wainscot);
    }
    const eSeg2D = EAST_HALL_MAX_Z - EAST_DOOR_OPENING_MAX_Z;
    if (eSeg2D > 0) {
      const cz = (EAST_DOOR_OPENING_MAX_Z + EAST_HALL_MAX_Z) / 2;
      box(WALL_THICK, EAST_CEIL, eSeg2D, EAST_HALL_MAX_X, EAST_CEIL / 2, cz, M.wall);
      decor(0.12, 1.5, eSeg2D - 0.08, EAST_HALL_MAX_X - 0.06, 0.75, cz, M.wainscot);
      decor(0.18, 0.20, eSeg2D - 0.08, EAST_HALL_MAX_X - 0.09, EAST_CEIL - 0.10, cz, M.wainscot);
    }
    // Door frame trim — director door (east end wall)
    decor(0.06, DOOR_HEIGHT + 0.1, 0.08, EAST_HALL_MAX_X - 0.05, DOOR_HEIGHT / 2, EAST_DOOR_OPENING_MIN_Z - 0.02, M.wainscot);
    decor(0.06, DOOR_HEIGHT + 0.1, 0.08, EAST_HALL_MAX_X - 0.05, DOOR_HEIGHT / 2, EAST_DOOR_OPENING_MAX_Z + 0.02, M.wainscot);
    decor(0.06, 0.08, DOOR_WIDTH + 0.2, EAST_HALL_MAX_X - 0.05, DOOR_HEIGHT + 0.04, DOOR_OPENING_CENTER_Z, M.wainscot);

    // ─── Hallway ceiling lights (3 evenly spaced) ───
    const hallLightSpacing = EAST_HALL_W / 4;
    for (let i = 1; i <= 3; i++) {
      const lx = EAST_HALL_MIN_X + hallLightSpacing * i;
      const hl = new THREE.PointLight(0xFFF4E8, 1.8, 10, 1.8);
      hl.position.set(lx, EAST_CEIL - 0.3, EAST_HALL_CENTER_Z);
      registerLight(hl);
    }

    // ─── Hallway wall sconces (2 per side) ───
    const hallSconceXPositions = [10.0, 16.0];
    for (const sx of hallSconceXPositions) {
      // North wall sconces
      decor(0.32, 0.08, 0.22, sx, 2.5, EAST_HALL_MAX_Z - 0.15, M.lamp);
      decor(0.28, 0.22, 0.28, sx, 2.58, EAST_HALL_MAX_Z - 0.32, M.lampShade);
      const sn = new THREE.PointLight(0xFFE0A0, 1.2, 6);
      sn.position.set(sx, 2.5, EAST_HALL_MAX_Z - 0.6);
      registerLight(sn);
      // South wall sconces
      decor(0.32, 0.08, 0.22, sx, 2.5, EAST_HALL_MIN_Z + 0.15, M.lamp);
      decor(0.28, 0.22, 0.28, sx, 2.58, EAST_HALL_MIN_Z + 0.32, M.lampShade);
      const ss = new THREE.PointLight(0xFFE0A0, 1.2, 6);
      ss.position.set(sx, 2.5, EAST_HALL_MIN_Z + 0.6);
      registerLight(ss);
    }
  });

  // ─── East Wing Room Builder ───────────────────────────────────────────────
  function buildEastRoom(roomId, minX, maxX, minZ, maxZ, doorWall, doorX, lightColor, lightIntensity) {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    withRoom(roomId, () => {
      // Floor & ceiling
      box(w, 0.2, d, cx, -0.1, cz, M.floor);
      box(w, 0.2, d, cx, EAST_CEIL + 0.1, cz, M.ceiling);

      // ─── Walls ─── (split the hallway-facing wall for the door opening)
      // Far wall (opposite hallway-facing side)
      if (doorWall === 'south') {
        // Door is on south face (minZ). Far wall is north (maxZ).
        box(w, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, maxZ, M.wall);
        decor(w - 0.08, 1.5, 0.12, cx, 0.75, maxZ - 0.06, M.wainscot);
        decor(w - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, maxZ - 0.09, M.wainscot);
        // Hallway-facing wall (south, split for door)
        const dMinX = doorX - DOOR_WIDTH / 2;
        const dMaxX = doorX + DOOR_WIDTH / 2;
        const seg1W = dMinX - minX;
        if (seg1W > 0.1) {
          const scx = (minX + dMinX) / 2;
          box(seg1W, EAST_CEIL, WALL_THICK, scx, EAST_CEIL / 2, minZ, M.wall);
          decor(seg1W - 0.08, 1.5, 0.12, scx, 0.75, minZ + 0.06, M.wainscot);
          decor(seg1W - 0.08, 0.20, 0.18, scx, EAST_CEIL - 0.10, minZ + 0.09, M.wainscot);
        }
        const seg2W = maxX - dMaxX;
        if (seg2W > 0.1) {
          const scx = (dMaxX + maxX) / 2;
          box(seg2W, EAST_CEIL, WALL_THICK, scx, EAST_CEIL / 2, minZ, M.wall);
          decor(seg2W - 0.08, 1.5, 0.12, scx, 0.75, minZ + 0.06, M.wainscot);
          decor(seg2W - 0.08, 0.20, 0.18, scx, EAST_CEIL - 0.10, minZ + 0.09, M.wainscot);
        }
      } else {
        // Door is on north face (maxZ). Far wall is south (minZ).
        box(w, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, minZ, M.wall);
        decor(w - 0.08, 1.5, 0.12, cx, 0.75, minZ + 0.06, M.wainscot);
        decor(w - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, minZ + 0.09, M.wainscot);
        // Hallway-facing wall (north, split for door)
        const dMinX = doorX - DOOR_WIDTH / 2;
        const dMaxX = doorX + DOOR_WIDTH / 2;
        const seg1W = dMinX - minX;
        if (seg1W > 0.1) {
          const scx = (minX + dMinX) / 2;
          box(seg1W, EAST_CEIL, WALL_THICK, scx, EAST_CEIL / 2, maxZ, M.wall);
          decor(seg1W - 0.08, 1.5, 0.12, scx, 0.75, maxZ - 0.06, M.wainscot);
          decor(seg1W - 0.08, 0.20, 0.18, scx, EAST_CEIL - 0.10, maxZ - 0.09, M.wainscot);
        }
        const seg2W = maxX - dMaxX;
        if (seg2W > 0.1) {
          const scx = (dMaxX + maxX) / 2;
          box(seg2W, EAST_CEIL, WALL_THICK, scx, EAST_CEIL / 2, maxZ, M.wall);
          decor(seg2W - 0.08, 1.5, 0.12, scx, 0.75, maxZ - 0.06, M.wainscot);
          decor(seg2W - 0.08, 0.20, 0.18, scx, EAST_CEIL - 0.10, maxZ - 0.09, M.wainscot);
        }
      }

      // East wall (right side)
      box(WALL_THICK, EAST_CEIL, d, maxX, EAST_CEIL / 2, cz, M.wall);
      decor(0.12, 1.5, d - 0.08, maxX - 0.06, 0.75, cz, M.wainscot);
      decor(0.18, 0.20, d - 0.08, maxX - 0.09, EAST_CEIL - 0.10, cz, M.wainscot);

      // West wall (left side)
      box(WALL_THICK, EAST_CEIL, d, minX, EAST_CEIL / 2, cz, M.wall);
      decor(0.12, 1.5, d - 0.08, minX + 0.06, 0.75, cz, M.wainscot);
      decor(0.18, 0.20, d - 0.08, minX + 0.09, EAST_CEIL - 0.10, cz, M.wainscot);

      // Ceiling light
      const rl = new THREE.PointLight(lightColor, lightIntensity, 8, 1.8);
      rl.position.set(cx, EAST_CEIL - 0.3, cz);
      registerLight(rl);

      // Wall sconce on far wall (opposite door)
      const farZ = doorWall === 'south' ? maxZ : minZ;
      const sconceOffsetZ = doorWall === 'south' ? -0.15 : 0.15;
      const shadeOffsetZ  = doorWall === 'south' ? -0.32 : 0.32;
      const lightOffsetZ  = doorWall === 'south' ? -0.6 : 0.6;
      decor(0.32, 0.08, 0.22, cx, 2.5, farZ + sconceOffsetZ, M.lamp);
      decor(0.28, 0.22, 0.28, cx, 2.58, farZ + shadeOffsetZ, M.lampShade);
      const scLight = new THREE.PointLight(0xFFE0A0, 1.2, 6);
      scLight.position.set(cx, 2.5, farZ + lightOffsetZ);
      registerLight(scLight);
    });
  }

  // ─── Build north rooms (door on south face = hallway north wall) ──────────
  buildEastRoom(
    'eastReception',
    EAST_LEFT_MIN_X, EAST_LEFT_MAX_X,
    EAST_NORTH_MIN_Z, EAST_NORTH_MAX_Z,
    'south', EAST_DOOR_RECEPTION_X,
    0xFFF4E8, 1.6
  );

  buildEastRoom(
    'eastAdmin',
    EAST_RIGHT_MIN_X, EAST_RIGHT_MAX_X,
    EAST_NORTH_MIN_Z, EAST_NORTH_MAX_Z,
    'south', EAST_DOOR_ADMIN_X,
    0xFFF4E8, 1.6
  );

  // ─── Build south rooms (door on north face = hallway south wall) ──────────
  buildEastRoom(
    'eastManager',
    EAST_LEFT_MIN_X, EAST_LEFT_MAX_X,
    EAST_SOUTH_MIN_Z, EAST_SOUTH_MAX_Z,
    'north', EAST_DOOR_MANAGER_X,
    0xFDE2BA, 1.5
  );

  buildEastRoom(
    'eastKitchen',
    EAST_RIGHT_MIN_X, EAST_RIGHT_MAX_X,
    EAST_SOUTH_MIN_Z, EAST_SOUTH_MAX_Z,
    'north', EAST_DOOR_KITCHEN_X,
    0xFDE2BA, 1.5
  );

  // ─── Director's Office (larger room at end of hallway) ────────────────────
  withRoom('eastDirector', () => {
    const w = EAST_DIR_W;
    const d = EAST_DIR_D;
    const cx = EAST_DIR_CENTER_X;
    const cz = EAST_DIR_CENTER_Z;

    // Floor & ceiling
    box(w, 0.2, d, cx, -0.1, cz, M.floor);
    box(w, 0.2, d, cx, EAST_CEIL + 0.1, cz, M.ceiling);

    // North wall
    box(w, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_DIR_MAX_Z, M.wall);
    decor(w - 0.08, 1.5, 0.12, cx, 0.75, EAST_DIR_MAX_Z - 0.06, M.wainscot);
    decor(w - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_DIR_MAX_Z - 0.09, M.wainscot);

    // South wall
    box(w, EAST_CEIL, WALL_THICK, cx, EAST_CEIL / 2, EAST_DIR_MIN_Z, M.wall);
    decor(w - 0.08, 1.5, 0.12, cx, 0.75, EAST_DIR_MIN_Z + 0.06, M.wainscot);
    decor(w - 0.08, 0.20, 0.18, cx, EAST_CEIL - 0.10, EAST_DIR_MIN_Z + 0.09, M.wainscot);

    // East wall (far end)
    box(WALL_THICK, EAST_CEIL, d, EAST_DIR_MAX_X, EAST_CEIL / 2, cz, M.wall);
    decor(0.12, 1.5, d - 0.08, EAST_DIR_MAX_X - 0.06, 0.75, cz, M.wainscot);
    decor(0.18, 0.20, d - 0.08, EAST_DIR_MAX_X - 0.09, EAST_CEIL - 0.10, cz, M.wainscot);

    // West wall (hallway-facing, split for door at Z 2.0→3.0)
    const dirDoorMinZ = EAST_DOOR_OPENING_MIN_Z;
    const dirDoorMaxZ = EAST_DOOR_OPENING_MAX_Z;
    const wSeg1D = dirDoorMinZ - EAST_DIR_MIN_Z;
    if (wSeg1D > 0) {
      const scz = (EAST_DIR_MIN_Z + dirDoorMinZ) / 2;
      box(WALL_THICK, EAST_CEIL, wSeg1D, EAST_DIR_MIN_X, EAST_CEIL / 2, scz, M.wall);
      decor(0.12, 1.5, wSeg1D - 0.08, EAST_DIR_MIN_X + 0.06, 0.75, scz, M.wainscot);
      decor(0.18, 0.20, wSeg1D - 0.08, EAST_DIR_MIN_X + 0.09, EAST_CEIL - 0.10, scz, M.wainscot);
    }
    const wSeg2D = EAST_DIR_MAX_Z - dirDoorMaxZ;
    if (wSeg2D > 0) {
      const scz = (dirDoorMaxZ + EAST_DIR_MAX_Z) / 2;
      box(WALL_THICK, EAST_CEIL, wSeg2D, EAST_DIR_MIN_X, EAST_CEIL / 2, scz, M.wall);
      decor(0.12, 1.5, wSeg2D - 0.08, EAST_DIR_MIN_X + 0.06, 0.75, scz, M.wainscot);
      decor(0.18, 0.20, wSeg2D - 0.08, EAST_DIR_MIN_X + 0.09, EAST_CEIL - 0.10, scz, M.wainscot);
    }
    // Door frame (west wall of director's office)
    decor(0.06, DOOR_HEIGHT + 0.1, 0.08, EAST_DIR_MIN_X + 0.05, DOOR_HEIGHT / 2, dirDoorMinZ - 0.02, M.wainscot);
    decor(0.06, DOOR_HEIGHT + 0.1, 0.08, EAST_DIR_MIN_X + 0.05, DOOR_HEIGHT / 2, dirDoorMaxZ + 0.02, M.wainscot);
    decor(0.06, 0.08, DOOR_WIDTH + 0.2, EAST_DIR_MIN_X + 0.05, DOOR_HEIGHT + 0.04, (dirDoorMinZ + dirDoorMaxZ) / 2, M.wainscot);

    // Two ceiling lights (room is larger)
    const rl1 = new THREE.PointLight(0xFFF4E8, 1.8, 10, 1.8);
    rl1.position.set(cx, EAST_CEIL - 0.3, cz - d / 4);
    registerLight(rl1);
    const rl2 = new THREE.PointLight(0xFFF4E8, 1.8, 10, 1.8);
    rl2.position.set(cx, EAST_CEIL - 0.3, cz + d / 4);
    registerLight(rl2);

    // Two sconce pairs on east wall (far end)
    const dirSconceZ = [cz - 1.5, cz + 1.5];
    for (const sz of dirSconceZ) {
      decor(0.22, 0.08, 0.32, EAST_DIR_MAX_X - 0.15, 2.5, sz, M.lamp);
      decor(0.28, 0.22, 0.28, EAST_DIR_MAX_X - 0.32, 2.58, sz, M.lampShade);
      const dsl = new THREE.PointLight(0xFFE0A0, 1.2, 6);
      dsl.position.set(EAST_DIR_MAX_X - 0.6, 2.5, sz);
      registerLight(dsl);
    }
  });

  // ─── East Wing Doors (hallway to rooms) ───────────────────────────────────
  // Reception door (north wall, rotated +π/2 so door swings into room)
  addLinkedDoor({
    id: 'doorHallReception',
    roomA: 'eastHallway',
    roomB: 'eastReception',
    hingeX: EAST_DOOR_RECEPTION_X - DOOR_WIDTH / 2,
    hingeZ: EAST_HALL_MAX_Z,
    hingeRotY: Math.PI / 2,
    color: 0x6A4327,
  });

  // Admin door (north wall)
  addLinkedDoor({
    id: 'doorHallAdmin',
    roomA: 'eastHallway',
    roomB: 'eastAdmin',
    hingeX: EAST_DOOR_ADMIN_X - DOOR_WIDTH / 2,
    hingeZ: EAST_HALL_MAX_Z,
    hingeRotY: Math.PI / 2,
    color: 0x6A4327,
  });

  // Manager door (south wall, rotated -π/2)
  addLinkedDoor({
    id: 'doorHallManager',
    roomA: 'eastHallway',
    roomB: 'eastManager',
    hingeX: EAST_DOOR_MANAGER_X + DOOR_WIDTH / 2,
    hingeZ: EAST_HALL_MIN_Z,
    hingeRotY: -Math.PI / 2,
    color: 0x6A4327,
  });

  // Kitchen door (south wall)
  addLinkedDoor({
    id: 'doorHallKitchen',
    roomA: 'eastHallway',
    roomB: 'eastKitchen',
    hingeX: EAST_DOOR_KITCHEN_X + DOOR_WIDTH / 2,
    hingeZ: EAST_HALL_MIN_Z,
    hingeRotY: -Math.PI / 2,
    color: 0x6A4327,
  });

  // Director door (hallway end wall, standard orientation)
  addLinkedDoor({
    id: 'doorHallDirector',
    roomA: 'eastHallway',
    roomB: 'eastDirector',
    hingeX: EAST_HALL_MAX_X + WALL_THICK / 2,
    hingeZ: DOOR_HINGE_Z,
    color: 0x5D3A22,
  });

  function setRoomVisibility(roomId, visible) {
    const room = roomMap.get(roomId);
    if (!room) return;
    if (roomVisibility.get(roomId) === visible) return;
    roomVisibility.set(roomId, visible);
    roomTransitionCursors.delete(roomId);
    for (const object3D of room.objects) {
      recomputeObjectVisibility(object3D);
    }
  }

  function setRoomVisibilityProgressive(roomId, visible, maxMeshes) {
    const room = roomMap.get(roomId);
    if (!room) return { processed: 0, remaining: 0, complete: true };

    const objects = room.objects;
    const total = objects.length;

    if (total === 0) {
      roomVisibility.set(roomId, visible);
      roomTransitionCursors.delete(roomId);
      return { processed: 0, remaining: 0, complete: true };
    }

    roomVisibility.set(roomId, visible);

    let cursor = roomTransitionCursors.get(roomId);
    if (!cursor || cursor.targetVisible !== visible) {
      cursor = { targetVisible: visible, index: 0 };
      roomTransitionCursors.set(roomId, cursor);
    }

    let processed = 0;
    while (cursor.index < total && processed < maxMeshes) {
      recomputeObjectVisibility(objects[cursor.index]);
      cursor.index++;
      processed++;
    }

    const remaining = total - cursor.index;
    if (remaining === 0) {
      roomTransitionCursors.delete(roomId);
    }

    return { processed, remaining, complete: remaining === 0 };
  }

  function getRoomObjectCount(roomId) {
    const room = roomMap.get(roomId);
    return room ? room.objects.length : 0;
  }

  function getRoomIds() {
    return Array.from(roomMap.keys());
  }

  function getRoomConnections(roomId) {
    const room = roomMap.get(roomId);
    return room ? room.connections : [];
  }

  function getRoomMeta(roomId) {
    const room = roomMap.get(roomId);
    if (!room) return null;
    return {
      id: room.id,
      label: room.label,
      zone: room.zone,
      connections: room.connections,
    };
  }

  function getRoomAtPosition(position, padding = 0.0, preferredRoomId = null) {
    const roomMatches = [];
    for (const room of roomMap.values()) {
      const min = room.bounds.min;
      const max = room.bounds.max;
      if (
        position.x >= min.x - padding && position.x <= max.x + padding &&
        position.y >= min.y - padding && position.y <= max.y + padding &&
        position.z >= min.z - padding && position.z <= max.z + padding
      ) {
        roomMatches.push(room);
      }
    }

    if (roomMatches.length === 0) return null;

    if (preferredRoomId) {
      const preferredRoom = roomMatches.find(room => room.id === preferredRoomId);
      if (preferredRoom) return preferredRoom.id;
    }

    if (roomMatches.length === 1) return roomMatches[0].id;

    let bestRoom = roomMatches[0];
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const room of roomMatches) {
      const center = room.bounds.getCenter(new THREE.Vector3());
      const dx = position.x - center.x;
      const dy = position.y - center.y;
      const dz = position.z - center.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestRoom = room;
      }
    }

    return bestRoom.id;
  }

  function registerExternalRoomObject(roomId, object3D, options = {}) {
    if (!roomMap.has(roomId)) return;
    assignObjectToRoom(roomId, object3D);
    recomputeObjectVisibility(object3D);

    if (options.staticWorld === true) {
      if (object3D && typeof object3D.traverse === 'function') {
        object3D.traverse(child => {
          if (child && child.isMesh) {
            markStaticWorldObject(child, options);
          }
        });
      } else if (object3D && object3D.isMesh) {
        markStaticWorldObject(object3D, options);
      }

      rebuildStaticShakeables();
    }
  }

  function registerExternalStaticRoomObject(roomId, object3D, options = {}) {
    registerExternalRoomObject(roomId, object3D, {
      ...options,
      staticWorld: true,
    });
  }

  function isFlatStaticPlane(mesh) {
    if (!mesh || !mesh.geometry) return false;
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return false;

    const sx = Math.abs((bounds.max.x - bounds.min.x) * mesh.scale.x);
    const sy = Math.abs((bounds.max.y - bounds.min.y) * mesh.scale.y);
    const sz = Math.abs((bounds.max.z - bounds.min.z) * mesh.scale.z);
    const dims = [sx, sy, sz].sort((a, b) => a - b);

    const thin = dims[0] <= 0.22;
    const broad = dims[2] >= 3.0;
    const tallOrWide = dims[1] >= 2.0;
    return thin && broad && tallOrWide;
  }

  function rebuildStaticShakeables() {
    shakeables.length = 0;

    for (const object3D of staticWorldObjects) {
      if (!object3D || !object3D.isMesh) continue;

      if (object3D.userData.excludeShockwaveShake === true) continue;
      if (object3D.userData.shockwavePhysicsControlled === true) continue;
      if (isFlatStaticPlane(object3D)) continue;

      shakeables.push(object3D);
    }
  }

  // Canonical rule: shockwave shake applies to static world props across rooms,
  // excluding flat structural planes and objects with dedicated shockwave physics.
  rebuildStaticShakeables();

  return {
    colliders,
    hazards,
    enemies,
    shakeables,
    door: primaryDoorRef.door,
    doors,
    update: () => {},
    getEnemies: () => enemies,
    getShakeables: () => shakeables,
    getRoomIds,
    getRoomConnections,
    getRoomMeta,
    getRoomAtPosition,
    setRoomVisibility,
    setRoomVisibilityProgressive,
    getRoomObjectCount,
    registerExternalRoomObject,
    registerExternalStaticRoomObject,
  };
}
