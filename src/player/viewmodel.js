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
  
  // Create procedural pixel-art gun texture
  const gunTextureCanvas = document.createElement('canvas');
  gunTextureCanvas.width = 64;
  gunTextureCanvas.height = 64;
  const gunCtx = gunTextureCanvas.getContext('2d');
  // Base dark metal color
  gunCtx.fillStyle = '#1a1a1a';
  gunCtx.fillRect(0, 0, 64, 64);
  // Add pixel streaks for metallic worn look
  gunCtx.fillStyle = '#2d2d2d';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    const w = Math.random() * 3 + 1;
    const h = Math.random() * 6 + 2;
    gunCtx.fillRect(x, y, w, h);
  }
  // Highlight edges
  gunCtx.fillStyle = '#3a3a3a';
  gunCtx.fillRect(0, 0, 64, 2);
  gunCtx.fillRect(0, 0, 2, 64);
  const gunTexture = new THREE.CanvasTexture(gunTextureCanvas);
  gunTexture.magFilter = THREE.NearestFilter;
  gunTexture.minFilter = THREE.NearestFilter;
  
  const gunMat    = new THREE.MeshStandardMaterial({ map: gunTexture, roughness: 0.25, metalness: 0.9 });
  const gripMat   = new THREE.MeshStandardMaterial({ color: 0x1A1410, roughness: 0.95 });
  const flashMat  = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.4, metalness: 0.7 });
  const flashGrip = new THREE.MeshStandardMaterial({ color: 0x2D2416, roughness: 0.9 });

  // ─── Gun Animation State ─────────────────────────────────────────────────
  let recoilKick = 0; // Current recoil offset (0 to negative)
  let recoilDecay = 0; // Time since last shot (for decay)
  const RECOIL_MAGNITUDE = 0.02;
  const RECOIL_DECAY_TIME = 0.15;
  const RECOIL_ROTATION = 0.05;
  let shotKickTimer = 0;
  const SHOT_KICK_DURATION = 0.12;
  const SHOT_KICK_LIFT = 0.02;
  const SHOT_KICK_ROTATION = 0.04;

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
  const flashlightLight = new THREE.SpotLight(0xFFF8EA, 24, 80, Math.PI / 180 * 40, 0.78);
  flashlightLight.decay = 1.3;
  flashlightLight.position.set(0.01, 0.01, -0.19); // Slightly behind lens so nearby geometry catches light correctly
  flashlightLight.castShadow = true;
  flashlightLight.shadow.mapSize.set(512, 512);
  flashlightLight.shadow.bias = -0.0002;
  flashlightLight.shadow.normalBias = 0.02;
  flashlightLight.shadow.camera.near = 0.15;
  flashlightLight.shadow.camera.far = 26;
  flashlightLight.shadow.camera.fov = 46;
  leftHandGroup.add(flashlightLight);

  const flashlightTarget = new THREE.Object3D();
  flashlightTarget.position.set(0.01, 0.01, -60); // Far out in -Z direction
  leftHandGroup.add(flashlightTarget);
  flashlightLight.target = flashlightTarget;

  // Secondary spill cone keeps very close walls/doors from collapsing into a tiny hotspot.
  const flashlightSpill = new THREE.SpotLight(0xFFEED2, 9, 22, Math.PI / 180 * 78, 0.98);
  flashlightSpill.decay = 1.05;
  flashlightSpill.position.set(0.01, 0.01, -0.17);
  flashlightSpill.castShadow = false;
  leftHandGroup.add(flashlightSpill);

  const flashlightSpillTarget = new THREE.Object3D();
  flashlightSpillTarget.position.set(0.01, 0.01, -18);
  leftHandGroup.add(flashlightSpillTarget);
  flashlightSpill.target = flashlightSpillTarget;

  // ─── RIGHT HAND & GUN (separate object) ────────────────────────────────────
  const rightHandGroup = new THREE.Group();
  rightHandGroup.position.set(0.08, -0.1, -0.15);
  group.add(rightHandGroup);

  // Right palm/hand
  rightHandGroup.add(box(0.095, 0.085, 0.095, 0, 0, 0, skin));
  // Right fingers
  rightHandGroup.add(box(0.075, 0.04, 0.08, 0.02, 0.03, 0.06, skin));

  // Pistol (right hand grips) — Enhanced with more detail
  // Slide (upper barrel area) — Now with more segmentation
  rightHandGroup.add(box(0.038, 0.052, 0.25, -0.01, 0.04, -0.02, gunMat));
  // Slide serrations (textured detail on top)
  rightHandGroup.add(box(0.035, 0.008, 0.20, -0.01, 0.065, -0.01, gunMat));
  
  // Frame (lower part) — More detailed
  rightHandGroup.add(box(0.042, 0.035, 0.18, -0.01, -0.02, 0.01, gunMat));
  // Frame rail detail
  rightHandGroup.add(box(0.038, 0.008, 0.16, -0.01, -0.038, 0.03, gunMat));
  
  // Barrel tip
  rightHandGroup.add(box(0.025, 0.025, 0.10, -0.01, 0.045, -0.18, gunMat));
  
  // Grip (brown handle) — Larger and more substantial
  rightHandGroup.add(box(0.042, 0.14, 0.062, -0.01, -0.08, 0.08, gripMat));
  // Grip texture ridges
  rightHandGroup.add(box(0.038, 0.002, 0.055, -0.01, -0.06, 0.06, new THREE.MeshStandardMaterial({ color: 0x0D0D0A, roughness: 0.9 })));
  rightHandGroup.add(box(0.038, 0.002, 0.055, -0.01, -0.03, 0.08, new THREE.MeshStandardMaterial({ color: 0x0D0D0A, roughness: 0.9 })));
  
  // Trigger guard detail — More defined
  rightHandGroup.add(box(0.038, 0.035, 0.032, -0.01, -0.01, 0.04, gunMat));
  
  // Hammer area (back of slide)
  rightHandGroup.add(box(0.020, 0.032, 0.020, 0.01, 0.042, 0.14, gunMat));
  
  // Sights (front and rear)
  rightHandGroup.add(box(0.006, 0.028, 0.008, -0.01, 0.075, -0.22, gunMat)); // Front sight
  rightHandGroup.add(box(0.006, 0.024, 0.008, -0.01, 0.068, 0.10, gunMat)); // Rear sight
  
  // Magazine well indicator
  rightHandGroup.add(box(0.038, 0.010, 0.035, -0.01, -0.045, 0.03, gunMat));

  // Right forearm (from hand back toward player)
  rightHandGroup.add(box(0.075, 0.075, 0.35, 0.08, -0.08, 0.22, skin, 0.45, -0.2));

  // ─── Muzzle Flash Light System ─────────────────────────────────────────────
  // Muzzle flash spawns at gun barrel tip, emits directionally forward
  const MUZZLE_FLASH_DURATION = 0.15; // seconds — how long the flash lasts (faster fade)
  const MUZZLE_FLASH_INTENSITY_PEAK = 40; // peak brightness (SpotLight value) - more intense
  const MUZZLE_FLASH_RANGE = 50; // light radius in meters
  const MUZZLE_FLASH_ANGLE = Math.PI / 180 * 90; // 90-degree cone spread (more diffuse)
  
  // Create muzzle flash spotlight at barrel tip (positioned in right hand group local space)
  // Barrel tip is at approximately (-0.01, 0.045, -0.18) in right hand coordinates, pointing in -Z direction
  const muzzleFlashLight = new THREE.SpotLight(0xFFE5B4, 0, MUZZLE_FLASH_RANGE, MUZZLE_FLASH_ANGLE, 0.7);
  muzzleFlashLight.decay = 1.8;
  muzzleFlashLight.position.set(-0.01, 0.045, -0.18);
  // Profiling mode: enable muzzle flash shadows to measure cost during shots.
  muzzleFlashLight.castShadow = true;
  muzzleFlashLight.shadow.mapSize.set(512, 512);
  muzzleFlashLight.shadow.bias = -0.0002;
  muzzleFlashLight.shadow.normalBias = 0.02;
  muzzleFlashLight.shadow.camera.near = 0.08;
  muzzleFlashLight.shadow.camera.far = 18;
  muzzleFlashLight.shadow.camera.fov = 95;
  rightHandGroup.add(muzzleFlashLight);

  // Create target for the muzzle flash light (points forward from barrel)
  const muzzleFlashTarget = new THREE.Object3D();
  muzzleFlashTarget.position.set(-0.01, 0.045, -50); // Far out in -Z direction
  rightHandGroup.add(muzzleFlashTarget);
  muzzleFlashLight.target = muzzleFlashTarget;

  let muzzleFlashTimer = 0; // Time since flash was triggered (0 = not active)
  let prevFireState = false; // Track previous frame's firing state to detect shot

  // ─── Sway & Bob State ─────────────────────────────────────────────────────
  const swayTarget  = new THREE.Vector2(0, 0);
  const swayCurrent = new THREE.Vector2(0, 0);
  const leftSwayOffset = new THREE.Vector2(-0.3, 0);     // Left hand leads slightly on sway
  const rightSwayOffset = new THREE.Vector2(0.3, 0);    // Right hand lags slightly on sway
  let bobPhase = 0;

  function update(dt, isMoving, isSprinting, mouseDX, mouseDY, flashlightOn, gunState = {}, doorInteraction = null) {
    // ── Muzzle Flash System ──────────────────────────────────────────────
    // Detect shot: isFiring transitions from false to true
    const currentFireState = gunState.isFiring || false;
    if (currentFireState && !prevFireState) {
      // Shot just fired! Trigger muzzle flash
      muzzleFlashTimer = MUZZLE_FLASH_DURATION;
      recoilKick = -RECOIL_MAGNITUDE;
      recoilDecay = 0;
      shotKickTimer = SHOT_KICK_DURATION;
    }
    prevFireState = currentFireState;

    // Update muzzle flash fade
    if (muzzleFlashTimer > 0) {
      muzzleFlashTimer -= dt;
      
      // Calculate fade: full brightness at start, fade to zero
      const fadeProgress = 1 - (muzzleFlashTimer / MUZZLE_FLASH_DURATION);
      
      // Non-linear fade for natural gunflash effect: quick bright peak, then fast fade
      // Use cubic easing to fade faster at the end (quadratic would be softer)
      const easeOutFade = fadeProgress * fadeProgress;
      
      muzzleFlashLight.intensity = MUZZLE_FLASH_INTENSITY_PEAK * (1 - easeOutFade);
    } else {
      muzzleFlashLight.intensity = 0;
    }

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
    if (recoilKick < 0) {
      // Decay recoil back to zero
      recoilDecay += dt;
      const progress = Math.min(recoilDecay / RECOIL_DECAY_TIME, 1);
      recoilKick = -RECOIL_MAGNITUDE * (1 - progress);
    }

    // ── Per-shot upward kick animation ─────────────────────────────────
    let shotKickLift = 0;
    let shotKickPitch = 0;
    if (shotKickTimer > 0) {
      shotKickTimer = Math.max(0, shotKickTimer - dt);
      const kickProgress = 1 - (shotKickTimer / SHOT_KICK_DURATION);
      const kickPulse = Math.sin(kickProgress * Math.PI);
      shotKickLift = kickPulse * SHOT_KICK_LIFT;
      shotKickPitch = kickPulse * SHOT_KICK_ROTATION;
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
    // Door interaction pose (hands up / flatten to door)
    let doorBlend = doorInteraction?.doorBlend || 0;
    if (!Number.isFinite(doorBlend)) doorBlend = 0;
    doorBlend = Math.max(0, Math.min(1, doorBlend));
    let doorYaw = 0;
    if (doorBlend > 0.001 && doorInteraction?.doorNormal) {
      const invCamQuat = camera.quaternion.clone().invert();
      const localNormal = doorInteraction.doorNormal.clone().applyQuaternion(invCamQuat);
      localNormal.y = 0;
      if (localNormal.lengthSq() > 0.0001) {
        localNormal.normalize();
        const doorTangent = new THREE.Vector3(localNormal.z, 0, -localNormal.x).normalize();
        const forward = new THREE.Vector3(0, 0, -1);
        if (doorTangent.dot(forward) < 0) doorTangent.negate();
        doorYaw = Math.atan2(doorTangent.x, -doorTangent.z);
        if (!Number.isFinite(doorYaw)) doorYaw = 0;
        doorYaw = Math.max(-0.3, Math.min(0.3, doorYaw));
      }
    }

    // ── Door push animation ─────────────────────────────────────────────
    // Smoothed door blend for animation (avoids popping)
    const db = doorBlend;
    // Dynamic push motion: hands press forward more when door is actively moving
    const doorAngVel = doorInteraction?.doorAngularVel || 0;
    const pushIntensity = Math.min(1, Math.abs(doorAngVel) * 3.0);

    // Base pose offsets (hands rise and move forward toward door)
    const doorLift = 0.18 * db;            // raise hands up to door height
    const doorForward = (-0.12 - 0.06 * pushIntensity) * db;  // push forward, more when actively pushing
    const doorSpread = 0.06 * db;          // hands spread apart (palms on door)
    const doorYawApply = doorYaw * db * 0.5;

    // Palms rotate outward to face the door (pitch wrists back, roll palms flat)
    const doorPitchL = -0.55 * db;         // left wrist tilts back (palm faces forward)
    const doorPitchR = -0.55 * db;         // right wrist tilts back
    const doorRollL = 0.2 * db;            // left palm rolls slightly outward
    const doorRollR = -0.2 * db;           // right palm rolls slightly outward

    // Subtle breathing/pressing micro-motion when holding against door
    const pushTime = performance.now() * 0.001;
    const microPush = db > 0.3 ? Math.sin(pushTime * 2.5) * 0.004 * db : 0;

    // ── Apply to LEFT HAND ──────────────────────────────────────────────
    leftHandGroup.position.x = -0.08 + (swayCurrent.x + leftSwayOffset.x) * 0.6 * (1 - db * 0.7) + bobX * 0.4 * (1 - db);
    leftHandGroup.position.y = -0.1 + (swayCurrent.y + leftSwayOffset.y) * 0.4 * (1 - db * 0.7) + bobY * 0.6 * (1 - db);
    leftHandGroup.rotation.y = (swayCurrent.x + leftSwayOffset.x) * 0.3 * (1 - db);
    leftHandGroup.rotation.x = -(swayCurrent.y + leftSwayOffset.y) * 0.2 * (1 - db);

    leftHandGroup.position.y += doorLift;
    leftHandGroup.position.z = -0.15 + doorForward + microPush;
    leftHandGroup.position.x += -doorSpread;
    leftHandGroup.rotation.y += doorYawApply;
    leftHandGroup.rotation.x += doorPitchL;
    leftHandGroup.rotation.z = doorRollL;

    // Update leftHandGroup matrix for world transforms
    leftHandGroup.updateMatrixWorld(true);

    // Update flashlight target direction (light is now child of leftHandGroup, so it follows automatically)
    // Flashlight points along local -Z axis
    const flashLocalForward = new THREE.Vector3(0, 0, -60);
    flashlightTarget.position.copy(flashLocalForward);

    // ── Apply to RIGHT HAND ─────────────────────────────────────────────
    rightHandGroup.position.x = 0.08 + (swayCurrent.x + rightSwayOffset.x) * 0.4 * (1 - db * 0.7) + bobX * 0.5 * (1 - db) + recoilKick * (1 - db);
    rightHandGroup.position.y = -0.1 + (swayCurrent.y + rightSwayOffset.y) * 0.3 * (1 - db) + bobY * (1 - db) + reloadLift * (1 - db) + shotKickLift * (1 - db);
    rightHandGroup.rotation.y = (swayCurrent.x + rightSwayOffset.x) * 0.35 * (1 - db) + recoilKick * 2 * (1 - db);
    rightHandGroup.rotation.x = -(swayCurrent.y + rightSwayOffset.y) * 0.25 * (1 - db) + recoilKick * 3 * (1 - db) + reloadRotation * (1 - db) - shotKickPitch * (1 - db);

    rightHandGroup.position.y += doorLift;
    rightHandGroup.position.z = -0.15 + doorForward + microPush;
    rightHandGroup.position.x += doorSpread;
    rightHandGroup.rotation.y += doorYawApply;
    rightHandGroup.rotation.x += doorPitchR;
    rightHandGroup.rotation.z = doorRollR;
    
    // Update rightHandGroup matrix for world transforms (ensures muzzle flash light direction is correct)
    rightHandGroup.updateMatrixWorld(true);
    
    // ── Flashlight on/off ───────────────────────────────────────────────
    flashlightLight.visible = flashlightOn;
    flashlightSpill.visible = flashlightOn;
  }

  return { group, update };
}
