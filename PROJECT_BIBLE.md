# PROJECT SH — Project Bible
*Living guideline. Updated for high-level structural changes only.*

---

## Concept
A first-person survival horror game built entirely in the browser — no traditional game engine.
Built collaboratively, evolved iteratively. Ideas added as they emerge.

**Note:** This project is built entirely by AI agents. All code, systems, and features are generated and implemented by Claude. The user provides design direction, feedback, and strategic decisions.

---

## Tech Stack
- **Renderer:** Three.js (via CDN)
- **Physics:** Cannon-es (lightweight Cannon.js port, via CDN)
- **Audio:** Web Audio API
- **Language:** Vanilla JavaScript (ES Modules)
- **Entry point:** `index.html` → loads `src/main.js`
- **No bundler** — runs directly in browser via local server or file

---

## Project Structure
```
Project SH/
├── PROJECT_BIBLE.md       ← This file
├── index.html             ← Entry point
├── src/
│   ├── main.js            ← Game bootstrap, loop, hazard/death logic
│   ├── world/
│   │   └── world.js       ← Environment, collision, hazards (damage pillar)
│   ├── player/
│   │   ├── player.js      ← Player controller, camera, low-health sway
│   │   └── viewmodel.js   ← First-person hands, flashlight, gun anims
│   ├── entities/          ← (Future) Enemies, NPCs, interactables
│   ├── systems/
│   │   ├── itemRegistry.js ← Item definitions, recipes, lookup functions
│   │   ├── inventory.js   ← 9-slot grid + equipped slot, use/combine/drop
│   │   ├── worldItems.js  ← 3D pickups, raycaster hover, pickup/drop lifecycle
│   │   ├── weapons.js     ← Gun system (fire, reload, ammo)
│   │   ├── physics.js     ← Cannon-es wrapper & raycast
│   │   └── health.js      ← Universal health system (player & enemies)
│   └── ui/
│       ├── hud.js         ← Bottom-right HUD (health pips + ammo)
│       ├── inventory.js   ← Inventory UI (3×3 grid + equipped slot + context menu)
│       └── damageEffects.js ← Heartbeat vignette, damage flash, death screen
├── assets/
│   ├── textures/
│   ├── models/
│   ├── audio/
│   └── data/              ← JSON configs, maps, dialogue
```

---

## Core Gameplay Pillars
*(Evolving — add/remove as the game takes shape)*
1. **Tension over action** — scarcity, darkness, sound design drive fear
2. **Exploration** — environments reward careful movement
3. **Survival systems** — health (1–10 scale), ammo scarcity, inventory management. Future: stamina, sanity, damage resistances

---

## Current State
- **Phase:** Alpha / Playable Prototype
- **What exists:** 
  - **Grand cathedral museum** (30m wide, 60m deep, 15m ceiling) with procedural marble floor textures
  - **Player controller** with WASD/arrow movement, spacebar jump, Shift sprint, pointer lock + fallback mouse-look
  - **Dual-hand first-person viewmodel** (left hand with flashlight, right hand with pistol) with independent bob/sway animation
  - **Flashlight system** (F-key toggle) with soft cone lighting that moves naturally with the left hand in world space
  - **Environment layout:** Grand entrance staircase (6 steps down), side staircases (12 steps up) linking to full-width back balcony
  - **Furniture & details:** Desk, benches, water cooler, standing lamps, 4 large chandeliers
  - **Collision detection** with AABB-based step-climbing (0.45m max step height) — fast and responsive
  - **Custom gravity physics** (no external engine) with velocity and jump impulse
  - **Cannon-es physics world** active and stepping — ready for dynamic enemy rigidbodies and interactive objects (no physics-based puzzles, RE7-style)
  
  **NEW (Session 4):**
  - **Inventory system:** 9-slot grid (3×3), real item stacking. Each slot holds one item type with unlimited quantity. Toggle with **E key**.
  - **Gun system:** 9-round magazine, semi-automatic with 0.1s fire rate cooldown. **Real bullet economy** — bullets not fired are lost on reload. Hitscan raycast for instant hit detection (100m range). Fire with **left-click**, reload with **R key**.
  - **Gun animations:** Recoil kick on fire (hand kicks back -0.02m Y offset + 0.05 rad rotation, 0.15s decay). Reload animation during 1.2s reload duration (hand rotates up 45° and lowers smoothly). All animations applied to right-hand viewmodel.
  - **Inventory UI:** 3×3 grid overlay with placeholder images (noise-based SVG) and item count overlays in bottom-right. Opens centered on screen with semi-transparent dark background.
  - **In-game cursor:** Green glowing circle (2px border + center dot) that tracks mouse movement using pointer lock deltas. Appears when inventory opens, disappears when closed. Allows clicking inventory items while keeping game running.
  - **HUD:** Ammo counter in top-right corner (green text with glow): "MAG / RESERVE" format. Color-coded: green (normal), orange (< 3 rounds), red (empty). Updates every frame.
  - **Game loop continuity:** Pointer lock stays active entire time (no defocus). Camera rotation frozen while inventory open (saved quaternion restored each frame). WASD movement **continues while inventory open** — game runs in background, not paused.

  **NEW (Session 5):**
  - **Universal health system:** `createHealth(maxHealth)` factory. Scale 1–10 (10 = healthy, 0 = dead). Supports damage types (`'generic'`, `'fire'`, etc.) and flat resistances per type. Event callbacks for onDamage, onDeath, onHeal. Reset method for respawn. Same system will be used for enemies.
  - **HUD redesign:** Moved to bottom-right corner. Health shown as 10 pip bars (color shifts: green → orange → red as HP drops). Ammo display below with "MAG / RESERVE" format, color-coded as before. Clean monospace styling.
  - **Damage visual effects:** Red vignette overlay with heartbeat pulse at HP ≤3. At HP 3: subtle slow pulse. At HP 2: medium pulse. At HP 1: heavy, fast, deep red pulse. Brief red flash on any damage taken (regardless of HP). All driven by CSS radial-gradient overlay.
  - **Low-health player sway:** At 1 HP, camera drifts with a wobbly sine-wave pattern (two overlapping frequencies for organic feel). Gradually settles when healing above 1 HP.
  - **Death system:** When HP hits 0, death screen fades in (dark red background + "YOU DIED" text). All player input disabled during death. Game auto-resets after 4 seconds (health restored, player repositioned, effects cleared).
  - **Damage pillar:** Dark stone cylinder (radius 0.5m, height 3m) at position (5, 0, 0) on main floor. Deals 1 damage per second while player is within contact range. Registered as both a collision box (can't walk through) and a hazard (tick damage). Cap detail on top for visibility.
  - **Hazard system:** World now exports `hazards[]` array alongside `colliders[]`. Each hazard defines position, radius, damagePerSecond, and damageType. Main loop checks player distance each frame and applies tick damage (1-second intervals). Timer resets when player leaves range.

  **NEW (Session 6):**
  - **Item Registry:** `src/systems/itemRegistry.js` — Pure data module defining all item types (ammo, healingA/B/C, handgun) with properties: name, stackable, maxStack, usable, equippable, droppable, combinable, useEffect, modelConfig (3D appearance), initials (2-char icon label). Combination recipes defined here (Healing Herb + First Aid Spray = Mixed Medicine, heals 8 HP with bonus).
  - **Inventory overhaul:** Equipped weapon slot separate from 3×3 grid. New methods: equipItem, unequipItem, moveItem, useItem (applies heal from registry), combineItems (checks recipes then same-type merge), dropItem/dropEquipped. maxStack enforcement from registry. Existing ammo API unchanged (weapons.js untouched).
  - **World items / pickups:** `src/systems/worldItems.js` — 3D colored meshes in the scene that slowly rotate. THREE.Raycaster from screen center (3-unit range) detects what player looks at. Hover text overlay: "Item Name — Press E to pick up". Pickup auto-equips weapons to weapon slot. Dropped items spawn at player's feet (1.5 units forward).
  - **Inventory UI overhaul:** Equipped weapon slot (gold border, above grid). Colored rectangle icons with 2-letter initials instead of placeholder SVGs. Right-click context menu: Use (heals), Combine (enters yellow-cursor combine mode → click target), Equip (for weapons), Drop (spawns world item). Item names in each slot.
  - **E key dual purpose:** When inventory closed: pickup if looking at item, else open inventory. When open: close inventory.
  - **Starting loadout:** 100 ammo + 1 First Aid Spray in inventory, Handgun in equipped slot, 1 Healing Herb placed on desk as world pickup.

- **What's next:**
  - **Architecture:** Culling system for fully-open maze. Room zones with frustum culling. Creaky door interaction + animations. Loads adjacent rooms as player approaches.
  - **Gameplay:** Enemy AI and rigidbodies, damage types & resistances on enemies, sound design (ambient, footsteps, door creaks, gunfire), expanded environments (more connected rooms), more weapon types, ammo/health pickups scattered in world, item descriptions/tooltips
  - **Lighting strategy:** Most environment lighting will be baked into textures/lightmaps (static). Only the flashlight and select moving lights (torches, enemies) will be realtime dynamic. This keeps performance headroom for a sprawling maze.

---

## Maintenance Notes for Future AI Agents
- **Keep `CHANGELOG.md` updated** whenever major features are added or systems modified. Include session number, date, bullet points of what changed, and any architectural decisions. This preserves project history and helps new agents understand what's been done.
- **When editing `PROJECT_BIBLE.md`**, only update it for high-level structural changes or major feature additions (new systems, architectural shifts). Micro-tweaks and bug fixes don't need a Bible entry.
- **Use the Decisions Log** (below) to timestamp any irreversible architectural choices (rendering approach, physics strategy, etc.).

---

## Technical Notes
- **Physics architecture:** Cannon-es (0.20.0) world active every frame. Player controller uses kinematic body (no gravity), collision detection via fast AABB (proven system, 60 FPS). Static world boxes registered as physics bodies — ready for dynamic enemies/objects. No physics-based puzzles; RE7-style inventory (pick up/put down). This hybrid approach: fast player movement + future-ready for enemy rigidbodies and raycasts.
- **Flashlight implementation:** SpotLight child of leftHandGroup; automatically follows hand position/rotation via Three.js scene graph hierarchy. Penumbra 0.45 for soft edges, cone 32° with decay 1.4 for ambient spillage.
- **Lighting balance:** Soft ambient (0x404040, 0.3 intensity) + 5 point lights + 4 chandeliers for layered illumination in dark museum setting
- **Lighting strategy (forward):** As the maze expands, most environment lighting will be **baked** into textures/lightmaps to maintain performance. Only the player's **flashlight** (always dynamic) and select **moving lights** (torch items, enemy lights) will use realtime lighting. This hybrid approach supports a sprawling maze while keeping light count under control.
- **Hand positioning:** Centered at (±0.08, -0.1, -0.15) relative to camera for natural keyboard-like viewpoint. Left hand leads sway; right hand lags for independent feel.
- **Viewmodel animations:** Entirely decoupled from physics. Sway responds to mouse movement (lag/lead per hand). Head bob syncs to walk phase. All pure visual — untouched by physics refactor, runs smooth at 60 FPS.

**NEW (Session 4):**
- **Inventory backend:** Factory function `createInventory()` returns API for `addItem(type, qty)`, `removeItem(type, qty)`, `getItemCount(type)`, `getItems()`. State encapsulated in closure. 9-slot array, each slot holds `{ itemType, quantity }`. Starts with 100 ammo for testing.
- **Gun system:** Factory function `createGun(inventory, physicsWorld, camera)`. Hitscan raycast from camera forward direction. Magazine state tracked separately from reserve ammo (via inventory). **Key mechanic:** reload discards current magazine contents (e.g., fire 2 from 9-round mag, reload = lose 7 bullets, pull 9 from reserve). Fire-rate cooldown (0.1s) blocks rapid fire. Reload duration (1.2s) displayed as progress via `getAmmoState()`.
- **Viewmodel recoil/reload:** Separate state machine in `createViewModel()`. Fire sets `recoilKick = -RECOIL_MAGNITUDE`, decays over `RECOIL_DECAY_TIME` (0.15s). Reload animation: `reloadProgress` (0 to 1) drives hand rotation (45° at peak), smooth up-down lift. Applied to `rightHandGroup` position/rotation.
- **Inventory UI/Cursor hybrid:** Inventory container appends to `ui-root` with `z-index: 1000`. Separate cursor div (`z-index: 999`) with green glowing circle. Cursor position tracked via `e.movementX/Y` deltas (pointer lock compatibile). Both show/hide together when toggling inventory.
- **Pointer lock architecture:** Pointer lock **always active** (never unlocked). Camera rotation prevented by freezing its quaternion while inventory open (saved on open, restored each frame in game loop). This avoids browser "press escape" UI and keeps WASD responsive. Fallback mouse-look also respects frozen quaternion.
- **Input routing:** Player exports `keys` object (updated by keydown/keyup listeners). Main loop checks `keys['KeyE']` for inventory toggle, `keys['KeyR']` for reload, `keys['MouseLeft']` for fire. Gun fire + reload blocked when `inventoryUI.isOpen() === true`. All input conditional on inventory state except inventory toggle itself and movement keys.

**NEW (Session 5):**
- **Health system architecture:** `createHealth(maxHealth)` returns closure-encapsulated state. Damage pipeline: `takeDamage(amount, type)` → apply resistance → clamp to 0 → fire onDamage callback → check death → fire onDeath. Resistances stored as `{ type: flatReduction }` map. Same factory used for player and future enemies — just pass different maxHealth and resistances.
- **Damage effect rendering:** CSS-only overlays (no Three.js post-processing). Heartbeat uses `radial-gradient` with dynamic opacity driven by `sin()` squared for sharp pulse shape. Two overlapping frequencies in low-health sway for organic drift (0.7× and 1.3× base frequency). Death screen uses CSS transitions for smooth fade-in.
- **Hazard tick system:** `hazardTimers{}` object in main.js tracks per-hazard accumulated time. When timer ≥ 1.0s, damage dealt and timer decremented by 1.0 (not reset to 0) for consistent tick rate even at varying frame rates. Timer resets to 0 when player exits hazard range.
- **HUD pip system:** 10 individual `div` elements with dynamic background color and opacity. Colors transition through green (HP 6–10) → orange (HP 4–5) → dark orange (HP 2–3) → red (HP 1). Empty pips shown at 15% opacity with gray background for visual reference.
- **Death/reset flow:** `playerHealth.onDeath()` → `damageEffects.triggerDeath()` → 4s timer → `resetGame()` in main.js. Reset restores health, clears effects, repositions player to spawn, resets hazard timers. All input blocked during death via `playerHealth.isDead()` checks in main loop.

**NEW (Session 6):**
- **Item registry architecture:** Frozen `ITEMS` object keyed by item ID string. Each def contains display info (name, initials), behavior flags (stackable, usable, equippable, droppable, combinable), limits (maxStack), effects (useEffect: { type, amount }), and 3D appearance (modelConfig: { color, size, shape }). `RECIPES[]` array for cross-item combinations with bidirectional lookup. All pure functions — no state.
- **Inventory equipped slot:** Separate `equipped` object alongside `slots[9]`. `equipItem(slotIndex)` swaps grid→equipped (or swap if already equipped). `setEquippedDirect()` for initial game setup. Gun system unaffected — still reads `inventory.getItemCount('ammo')`.
- **World items raycaster:** `THREE.Raycaster` with `far = 3` units, cast from `camera` at screen center `(0,0)`. Only pickup meshes tested via `intersectObjects(pickupMeshes)`. Meshes tagged with `userData.pickup = true`. Hover label is a simple fixed-position div below crosshair.
- **Pickup/drop lifecycle:** `spawnPickup(type, qty, pos)` creates mesh + registers in array. `tryPickup()` removes mesh, disposes geometry/material, adds to inventory. `spawnDrop()` calculates drop position from player pos + camera forward (Y=0.3).
- **Right-click under pointer lock:** Native `contextmenu` event suppressed globally. Right-click detected via `mousedown` with `e.button === 2`. Hit-testing uses `getBoundingClientRect()` on slot divs vs tracked cursor position. Context menu is a positioned div (z-index 1100) with hover-highlighted options.
- **Combine flow:** Right-click → Combine → `combineMode = true` + cursor turns yellow → left-click target slot → `combineItems(source, target)` checks recipes first (consumes 1 of each ingredient, produces result), then same-type merge as fallback → exits combine mode. Escape cancels.
- **E key dual logic:** Edge-detected (lastEKeyState). Priority: inventory open → close. Else hovered pickup → tryPickup. Else → open inventory. Raycaster updates every frame in `worldItems.update(dt)` so `getHovered()` always current.

---

## Major Decisions Log
| Date | Decision |
|------|----------|
| 2026-03-08 | Project started. Three.js chosen as renderer. No game engine — pure JS. |
| 2026-03-08 (session 2) | Scaled environment to cathedral proportions (30m×60m×15m). Committed to dual-hand viewmodel with separate left/right animations. Flashlight implemented as child of left hand for world-space following. |
| 2026-03-08 (session 3) | Integrated Cannon-es physics engine. Hybrid collision approach: player uses fast AABB (proven, 60 FPS), world boxes + future enemies use Cannon rigidbodies. Physics world stepping every frame, ready for RE7-style gameplay (enemies, no physics puzzles). |
| 2026-03-08 (session 4) | Gun & Inventory System. **Real bullet economy:** Reload discards unspent rounds from magazine (creates resource tension). **9-round magazine** enforces frequent reloads. **Pointer lock never released** (stays active entire session); camera rotation frozen via quaternion save/restore when inventory open. **In-game cursor** tracks pointer lock deltas (green glowing circle). **No pause** — game loop, physics, WASD continue while inventory open. Hitscan fire (instant, 100m range). Fire-rate + reload timing provides clear player feedback. |
| 2026-03-08 (session 5) | Health & Damage Systems. **Universal health system** (1–10 scale) shared between player and future enemies. Damage types + resistances prepped for future use. **HUD moved to bottom-right** with health pip bar + ammo counter. **Heartbeat vignette** at low health (CSS overlay, intensity scales with HP). **Low-health sway** at 1 HP (organic camera drift). **Death sequence** (red screen + "YOU DIED" + 4s auto-reset). **Damage pillar** as first hazard object (1 dmg/sec tick). **Hazard system** in world (extensible array for future environmental hazards). |
| 2026-03-08 (session 6) | Item System & Pickups. **Item registry** — pure data definitions for all items (ammo, healing herbs, handgun) with properties, recipes, 3D configs. **Inventory overhaul** — equipped weapon slot, use/combine/drop/equip methods, maxStack, recipe-based combination (Herb + Spray = Mixed Medicine, 8 HP). **World pickups** — 3D rotating meshes, THREE.Raycaster hover detection, E-key pickup, drop-to-world. **Inventory UI** — right-click context menu, combine mode (yellow cursor), equipped slot display, colored icons with initials. **E key dual purpose** — pickup items when looking at them, else toggle inventory. RE7-style item management. |
| 2026-03-08 (session 7 planning) | **World Architecture: Culling + Fully Open.** Decision to build a sprawling maze with **frustum culling** (not loading screens). Rooms loaded/unloaded based on camera frustum visibility. **Creaky doors** as interactive feature between zones. Lighting strategy: **baked into textures/lightmaps** (static) + realtime flashlight + select moving lights. This preserves performance headroom while delivering immersive open-world feel. |
