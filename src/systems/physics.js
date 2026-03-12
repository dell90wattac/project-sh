import * as CANNON from 'cannon-es';

// ─── Physics World ─────────────────────────────────────────────────────────
export function createPhysicsWorld() {
  const world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.3;
  
  return world;
}

// ─── Body Helpers ──────────────────────────────────────────────────────────
// Create a dynamic rigidbody (for enemies, moveable objects)
export function createDynamicBody(world, mass, shape, position = { x: 0, y: 0, z: 0 }) {
  const body = new CANNON.Body({ mass, shape });
  body.position.set(position.x, position.y, position.z);
  world.addBody(body);
  return body;
}

// Create a static rigidbody (for world geometry, floors)
export function createStaticBody(world, shape, position = { x: 0, y: 0, z: 0 }) {
  const body = new CANNON.Body({ mass: 0, shape });
  body.position.set(position.x, position.y, position.z);
  world.addBody(body);
  return body;
}

// Create a kinematic body (for player, controlled objects)
export function createKinematicBody(world, shape, position = { x: 0, y: 0, z: 0 }) {
  const body = new CANNON.Body({ mass: 0, shape }); // mass 0 = infinite mass / kinematic
  body.position.set(position.x, position.y, position.z);
  body.collisionResponse = 0; // Kinematic
  world.addBody(body);
  return body;
}

// ─── Shape Helpers ─────────────────────────────────────────────────────────
export function createBoxShape(width, height, depth) {
  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
  return shape;
}

export function createSphereShape(radius) {
  const shape = new CANNON.Sphere(radius);
  return shape;
}

export function createCapsuleShape(radius, length) {
  // Approximate capsule with a sphere compound shape
  // Cannon-es doesn't have native capsule, so we use a sphere for now
  // (For true capsule, you'd use CompoundBody or ConvexPolyhedron)
  return new CANNON.Sphere(radius);
}

// ─── Sync Three.js with Cannon ─────────────────────────────────────────────
// Copy physics body transform to Three.js mesh
export function syncBodyToMesh(body, mesh) {
  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
}

// Copy Three.js mesh transform to physics body (for kinematic bodies)
export function syncMeshToBody(mesh, body) {
  body.position.copy(mesh.position);
  body.quaternion.copy(mesh.quaternion);
}

// ─── Raycast Helper ────────────────────────────────────────────────────────
// Simple raycast for weapons/detection using Cannon-ES raycastClosest
export function raycast(world, from, to) {
  const result = new CANNON.RaycastResult();

  const hit = world.raycastClosest(
    new CANNON.Vec3(from.x, from.y, from.z),
    new CANNON.Vec3(to.x, to.y, to.z),
    {},
    result,
  );

  if (hit) {
    return {
      body: result.body,
      point: result.hitPointWorld,
      distance: result.distance,
    };
  }
  return null;
}

// ─── World Step ────────────────────────────────────────────────────────────
export function stepPhysics(world, deltaTime) {
  world.step(1 / 60, deltaTime, 3); // Fixed 60 FPS substeps, max 3 iterations
}
