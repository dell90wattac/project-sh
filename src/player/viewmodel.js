import * as THREE from 'three';

/**
 * First-person viewmodel — two-handed pistol grip with visible forearms.
 * Attached as a child of the camera. Sways behind mouse movement
 * and bobs with walking.
 */
export function createViewModel(camera) {
  const group = new THREE.Group();
  group.position.set(0, -0.32, -0.45);
  camera.add(group);

  // ─── Materials ───────────────────────────────────────────────────────────
  const skin      = new THREE.MeshStandardMaterial({ color: 0xD4A574, roughness: 0.8 });
  const gunMat    = new THREE.MeshStandardMaterial({ color: 0x0D0D0D, roughness: 0.25, metalness: 0.9 });
  const gripMat   = new THREE.MeshStandardMaterial({ color: 0x1A1410, roughness: 0.95 });
  const flashMat  = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.4, metalness: 0.7 });
  const flashGrip = new THREE.MeshStandardMaterial({ color: 0x2D2416, roughness: 0.9 });

  // ─── Gun Animation State ─────────────────────────────────────────────────
  let recoilKick = 0; // Current recoil offset (0 to negative)
  let recoilDecay = 0; // Time since last shot (for decay)
  const RECOIL_MAGNITUDE = 0.02;
  const RECOIL_DECAY_TIME = 0.15;
  const RECOIL_ROTATION = 0.05;

  function box(w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  function cylinder(radiusTop, radiusBottom, height, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height), mat);
    mesh.position.set(x, y, z);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  // ─── LEFT HAND & FLASHLIGHT (separate object) ─────────────────────────────
  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(-0.08, -0.1, -0.15);
  group.add(leftHandGroup);

  // Left palm/hand
  leftHandGroup.add(box(0.095, 0.08, 0.095, 0, 0, 0, skin));
  // Left fingers (gripping flashlight)
  leftHandGroup.add(box(0.08, 0.04, 0.075, -0.02, 0.04, 0.05, skin));
  
  // Flashlight body (cylinder-like, held in left hand)
  const flashbody = cylinder(0.025, 0.028, 0.24, 0.01, 0.01, -0.05, flashMat, 0, 0, Math.PI / 2);
  leftHandGroup.add(flashbody);
  // Flashlight grip (textured handle)
  leftHandGroup.add(cylinder(0.032, 0.032, 0.12, 0.01, 0.01, 0.12, flashGrip, 0, 0, Math.PI / 2));
  // Reflector ring
  leftHandGroup.add(cylinder(0.035, 0.033, 0.02, 0.01, 0.01, -0.19, new THREE.MeshStandardMaterial({ color: 0xB8860B, roughness: 0.3, metalness: 0.8 }), 0, 0, Math.PI / 2));
  // Lens (glowing golden)
  leftHandGroup.add(cylinder(0.032, 0.032, 0.01, 0.01, 0.01, -0.24, new THREE.MeshBasicMaterial({ color: 0xFFDD66, emissive: 0x664400 }), 0, 0, Math.PI / 2));
  
  // Left forearm (from hand back toward player)
  leftHandGroup.add(box(0.075, 0.075, 0.32, -0.08, -0.08, 0.18, skin, 0.4, 0.15));

  // Spotlight mounted on flashlight (child of left hand so it follows the hand automatically)
  const flashlightLight = new THREE.SpotLight(0xffffff, 32, 85, Math.PI / 180 * 32, 0.45);
  flashlightLight.decay = 1.4;
  flashlightLight.position.set(0.01, 0.01, -0.24); // Lens local position
  leftHandGroup.add(flashlightLight);

  const flashlightTarget = new THREE.Object3D();
  flashlightTarget.position.set(0.01, 0.01, -60); // Far out in -Z direction
  leftHandGroup.add(flashlightTarget);
  flashlightLight.target = flashlightTarget;

  // ─── RIGHT HAND & GUN (separate object) ────────────────────────────────────
  const rightHandGroup = new THREE.Group();
  rightHandGroup.position.set(0.08, -0.1, -0.15);
  group.add(rightHandGroup);

  // Right palm/hand
  rightHandGroup.add(box(0.095, 0.085, 0.095, 0, 0, 0, skin));
  // Right fingers
  rightHandGroup.add(box(0.075, 0.04, 0.08, 0.02, 0.03, 0.06, skin));

  // Pistol (right hand grips)
  // Slide (upper barrel)
  rightHandGroup.add(box(0.038, 0.052, 0.25, -0.01, 0.04, -0.02, gunMat));
  // Frame (lower part)
  rightHandGroup.add(box(0.042, 0.035, 0.18, -0.01, -0.02, 0.01, gunMat));
  // Barrel tip
  rightHandGroup.add(box(0.025, 0.025, 0.08, -0.01, 0.045, -0.18, gunMat));
  // Grip (brown handle)
  rightHandGroup.add(box(0.038, 0.12, 0.055, -0.01, -0.08, 0.08, gripMat));
  // Trigger guard detail
  rightHandGroup.add(box(0.035, 0.028, 0.025, -0.01, -0.01, 0.05, gunMat));

  // Right forearm (from hand back toward player)
  rightHandGroup.add(box(0.075, 0.075, 0.35, 0.08, -0.08, 0.22, skin, 0.45, -0.2));

  // ─── Sway & Bob State ─────────────────────────────────────────────────────
  const swayTarget  = new THREE.Vector2(0, 0);
  const swayCurrent = new THREE.Vector2(0, 0);
  const leftSwayOffset = new THREE.Vector2(-0.3, 0);     // Left hand leads slightly on sway
  const rightSwayOffset = new THREE.Vector2(0.3, 0);    // Right hand lags slightly on sway
  let bobPhase = 0;

  function update(dt, isMoving, isSprinting, mouseDX, mouseDY, flashlightOn, gunState = {}) {
    // ── Mouse sway (builds up over time, weapons lag behind look) ────────
    swayTarget.x += -mouseDX * 0.0008;
    swayTarget.y +=  mouseDY * 0.0008;
    swayCurrent.x += (swayTarget.x - swayCurrent.x) * 0.07;
    swayCurrent.y += (swayTarget.y - swayCurrent.y) * 0.07;
    swayTarget.multiplyScalar(0.80);

    // ── Walk bob ────────────────────────────────────────────────────────
    let bobX = 0, bobY = 0;
    if (isMoving) {
      const freq = isSprinting ? 10 : 6.5;
      bobPhase += dt * freq;
      bobX = Math.cos(bobPhase) * (isSprinting ? 0.018 : 0.010);
      bobY = Math.sin(bobPhase * 2) * (isSprinting ? 0.016 : 0.008);
    } else {
      bobPhase *= 0.9;
    }

    // ── Gun Recoil Animation ────────────────────────────────────────────
    if (gunState.isFiring) {
      // Player just fired - apply recoil kick
      recoilKick = -RECOIL_MAGNITUDE;
      recoilDecay = 0;
    } else if (recoilKick < 0) {
      // Decay recoil back to zero
      recoilDecay += dt;
      const progress = Math.min(recoilDecay / RECOIL_DECAY_TIME, 1);
      recoilKick = -RECOIL_MAGNITUDE * (1 - progress);
    }

    // ── Gun Reload Animation ────────────────────────────────────────────
    let reloadRotation = 0;
    let reloadLift = 0;
    if (gunState.isReloading) {
      // Progress from 0 to 1 during reload
      const reloadProgress = gunState.reloadProgress || 0;
      // Rotate hand up 45 degrees at peak (0.5s in)
      const midProgress = Math.abs(reloadProgress - 0.5) * 2; // 0 at peak, 1 at start/end
      reloadRotation = (1 - midProgress) * 0.785; // 45 degrees = ~0.785 rad
      reloadLift = Math.sin(reloadProgress * Math.PI) * 0.05; // Smooth up-down lift
    }

    // ── Apply to LEFT HAND (higher frequency bob, leads on sway) ────────
    leftHandGroup.position.x = -0.08 + (swayCurrent.x + leftSwayOffset.x) * 0.6 + bobX * 0.4;
    leftHandGroup.position.y = -0.1 + (swayCurrent.y + leftSwayOffset.y) * 0.4 + bobY * 0.6;
    leftHandGroup.rotation.y = (swayCurrent.x + leftSwayOffset.x) * 0.3;
    leftHandGroup.rotation.x = -(swayCurrent.y + leftSwayOffset.y) * 0.2;

    // Update leftHandGroup matrix for world transforms
    leftHandGroup.updateMatrixWorld(true);

    // Update flashlight target direction (light is now child of leftHandGroup, so it follows automatically)
    // Flashlight points along local -Z axis
    const flashLocalForward = new THREE.Vector3(0, 0, -60);
    flashlightTarget.position.copy(flashLocalForward);

    // ── Apply to RIGHT HAND (weapon stays steadier, lags on sway) ───────
    rightHandGroup.position.x = 0.08 + (swayCurrent.x + rightSwayOffset.x) * 0.4 + bobX * 0.5 + recoilKick;
    rightHandGroup.position.y = -0.1 + (swayCurrent.y + rightSwayOffset.y) * 0.3 + bobY + reloadLift;
    rightHandGroup.rotation.y = (swayCurrent.x + rightSwayOffset.x) * 0.35 + recoilKick * 2;
    rightHandGroup.rotation.x = -(swayCurrent.y + rightSwayOffset.y) * 0.25 + recoilKick * 3 + reloadRotation;
    
    // ── Flashlight on/off ───────────────────────────────────────────────
    flashlightLight.visible = flashlightOn;
  }

  return { group, update };
}
