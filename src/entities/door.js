import * as THREE from 'three';

export function createDoor({
  width = 1.0,
  height = 2.2,
  thickness = 0.08,
  color = 0x8B4513,
} = {}) {
  const pivot = new THREE.Group();

  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, height, width),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
  );
  // Hinge at local (0, 0, 0) with door extending +Z
  doorMesh.position.set(thickness / 2, height / 2, width / 2);
  doorMesh.castShadow = true;
  doorMesh.receiveShadow = true;
  pivot.add(doorMesh);

  // Simple handle (right side of the door)
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0xA88C55, roughness: 0.35, metalness: 0.7 })
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.set(thickness + 0.02, height * 0.55, width * 0.8);
  pivot.add(handle);

  return {
    pivot,
    mesh: doorMesh,
    width,
    height,
    thickness,
  };
}
