// ─── World Items / Pickups ──────────────────────────────────────────────────
// Manages 3D pickup meshes in the scene. Handles raycasting for hover detection,
// pickup interaction, and dropping items back into the world.

import * as THREE from 'three';
import { getItemDef } from './itemRegistry.js';

export function createWorldItems(scene, camera, inventory) {
  const pickups = []; // Array of { mesh, itemType, quantity }
  const raycaster = new THREE.Raycaster();
  raycaster.far = 3; // 3 unit pickup range
  const screenCenter = new THREE.Vector2(0, 0);
  let hoveredPickup = null;

  // ── Hover text overlay ──────────────────────────────────────────────────
  const hoverLabel = document.createElement('div');
  hoverLabel.id = 'pickup-hover-label';
  hoverLabel.style.cssText = `
    position: fixed;
    top: 55%;
    left: 50%;
    transform: translateX(-50%);
    color: #ffffff;
    font-family: monospace;
    font-size: 14px;
    text-align: center;
    pointer-events: none;
    z-index: 100;
    text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1);
    display: none;
  `;
  const uiRoot = document.getElementById('ui-root') || document.body;
  uiRoot.appendChild(hoverLabel);

  // ── Inventory full notification ──────────────────────────────────────
  const fullLabel = document.createElement('div');
  fullLabel.id = 'inventory-full-label';
  fullLabel.style.cssText = `
    position: fixed;
    top: 48%;
    left: 50%;
    transform: translateX(-50%);
    color: #ff4444;
    font-family: monospace;
    font-size: 15px;
    font-weight: bold;
    text-align: center;
    pointer-events: none;
    z-index: 101;
    text-shadow: 0 0 8px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,1);
    letter-spacing: 0.1em;
    display: none;
  `;
  fullLabel.textContent = 'INVENTORY FULL';
  uiRoot.appendChild(fullLabel);
  let fullLabelTimer = 0;

  function showFullNotification() {
    fullLabel.style.display = 'block';
    fullLabelTimer = 2.0;
  }

  // ── Create pickup mesh ──────────────────────────────────────────────────
  function createPickupMesh(itemType, position) {
    const def = getItemDef(itemType);
    if (!def) return null;
    const config = def.modelConfig;

    let geometry;
    if (config.shape === 'cylinder') {
      geometry = new THREE.CylinderGeometry(config.size[0] / 2, config.size[0] / 2, config.size[1], 8);
    } else {
      geometry = new THREE.BoxGeometry(config.size[0], config.size[1], config.size[2]);
    }

    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.7,
      metalness: 0.3,
      emissive: config.color,
      emissiveIntensity: 0.15,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.pickup = true;
    scene.add(mesh);
    return mesh;
  }

  // ── Raycaster update ────────────────────────────────────────────────────
  function updateRaycast() {
    raycaster.setFromCamera(screenCenter, camera);

    const pickupMeshes = pickups.map(p => p.mesh);
    if (pickupMeshes.length === 0) {
      hoveredPickup = null;
      hoverLabel.style.display = 'none';
      return;
    }

    const intersects = raycaster.intersectObjects(pickupMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const pickup = pickups.find(p => p.mesh === hit.object);
      if (pickup) {
        hoveredPickup = pickup;
        const def = getItemDef(pickup.itemType);
        const qtyText = pickup.quantity > 1 ? ` (x${pickup.quantity})` : '';
        hoverLabel.textContent = `${def.name}${qtyText} — Press E to pick up`;
        hoverLabel.style.display = 'block';
        return;
      }
    }

    hoveredPickup = null;
    hoverLabel.style.display = 'none';
  }

  // ── Attempt pickup ──────────────────────────────────────────────────────
  function tryPickup() {
    if (!hoveredPickup) return false;

    const { itemType, quantity, mesh } = hoveredPickup;
    const def = getItemDef(itemType);

    if (def.equippable) {
      const currentEquip = inventory.getEquipped();
      if (!currentEquip.itemType) {
        inventory.setEquippedDirect(itemType, quantity);
      } else {
        const added = inventory.addItem(itemType, quantity);
        if (!added) {
          showFullNotification();
          return false;
        }
      }
    } else {
      const added = inventory.addItem(itemType, quantity);
      if (!added) {
        showFullNotification();
        return false;
      }
    }

    // Remove from world
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    const idx = pickups.indexOf(hoveredPickup);
    if (idx !== -1) pickups.splice(idx, 1);
    hoveredPickup = null;
    hoverLabel.style.display = 'none';
    return true;
  }

  // ── Spawn a pickup at a world position (level setup) ────────────────────
  function spawnPickup(itemType, quantity, position) {
    const mesh = createPickupMesh(itemType, position);
    if (mesh) {
      pickups.push({ mesh, itemType, quantity });
    }
  }

  // ── Drop an item from inventory into the world ──────────────────────────
  function spawnDrop(itemType, quantity, playerPosition, cameraDirection) {
    const dropPos = new THREE.Vector3(
      playerPosition.x + cameraDirection.x * 1.5,
      0.3,
      playerPosition.z + cameraDirection.z * 1.5
    );
    const mesh = createPickupMesh(itemType, dropPos);
    if (mesh) {
      pickups.push({ mesh, itemType, quantity });
    }
  }

  // ── Update (called every frame) ─────────────────────────────────────────
  function update(dt) {
    updateRaycast();
    // Slowly rotate all pickups for visibility
    for (const pickup of pickups) {
      pickup.mesh.rotation.y += dt * 1.5;
    }
    // Fade out inventory full notification
    if (fullLabelTimer > 0) {
      fullLabelTimer -= dt;
      if (fullLabelTimer <= 0) {
        fullLabel.style.display = 'none';
      }
    }
  }

  function getHovered() {
    return hoveredPickup;
  }

  function destroy() {
    for (const pickup of pickups) {
      scene.remove(pickup.mesh);
      pickup.mesh.geometry.dispose();
      pickup.mesh.material.dispose();
    }
    pickups.length = 0;
    hoverLabel.remove();
  }

  return {
    update,
    tryPickup,
    spawnPickup,
    spawnDrop,
    getHovered,
    destroy,
  };
}
