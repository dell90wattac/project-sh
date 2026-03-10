# Changelog

All notable changes to Project SH are documented here.

---

## [Session 11] — 2026-03-09
### Added
- **Door entity + door physics system** (`src/entities/door.js`, `src/systems/door.js`)
  - Door entity: pivot-hinged `BoxGeometry` panel with handle; configurable width (1.0 m), height (2.2 m), thickness (0.08 m)
  - Physics-based torque model: player hitbox overlap generates contact force; force × lever arm → torque → angular acceleration, divided by moment of inertia ($I = \frac{1}{3} m L^2$, 40 kg door)
  - Bidirectional swing — detects which side the player is on and pushes accordingly
  - Push detection zone (0.59 m) is wider than pushback zone (0.34 m) so force registers before collision resolution cancels the overlap
  - `applyPlayerPushback()` — soft collision that prevents walking through the door, called after `player.update()` each frame
  - Auto-close spring (0.02 strength, 0.998 damping) — barely perceptible creep back to closed, like gravity on heavy worn hinges
  - Air cushion near frame — exponential dampening (`pow(0.75, closeness)`) in a ~3° zone as the door approaches closed; only brakes *before* crossing the frame, allowing slight overshoot and natural settle
  - Snap-to-closed at <0.06° and near-zero velocity
  - Max swing angle: ±117° (`π × 0.65`)

- **Door push hand animation** (`src/player/viewmodel.js`)
  - Both hands rise, press forward, and spread apart as `doorBlend` increases (proximity + facing)
  - Palms rotate outward (pitch back + roll) to face the door surface
  - Normal weapon sway, walk bob, recoil, and reload animations fade out proportionally during door interaction
  - Dynamic forward press intensifies when the door is actively moving (`doorAngularVel`)
  - Subtle micro-motion oscillation when hands are held against the door
  - `rotation.z` set via assignment (not `+=`) to prevent frame accumulation
  - `position.z` set to base + offset (not `+=`) — fixes original bug where hands left the body permanently

- **Door opening in left wall** (`src/world/world.js`)
  - Left wall split into two segments with 1.0 m door opening at Z=2.0–3.0
  - Wainscoting and crown molding also split to match
  - Decorative door frame (lintel + two jambs) in wainscot material
  - Door entity placed at hinge position (X=-6.9, Z=2.0)
  - Door removed from static `colliders[]` — collision handled dynamically by door system

- **Small room beyond door** (`src/world/world.js`)
  - 4 m × 4 m square room on left side of wall (centered on door opening)
  - Floor, ceiling, 3 walls (front, back, far side); shared materials with main lobby
  - Interior point light (warm, 1.4 intensity, 6 m range)

- **Door system integration** (`src/main.js`)
  - `createDoorSystem()` imported and wired; updates each frame before player
  - `doorSystem.getInteraction()` passed to `player.update()` → viewmodel
  - `doorSystem.applyPlayerPushback()` called after player movement

### Changed
- **Left bench and side table moved** — Z=3.0 → **Z=4.5** to clear the door swing area (`src/world/world.js`)

### Fixed
- **Hands permanently leaving body** — `position.z += doorForward` accumulated every frame; changed to `position.z = -0.15 + doorForward`
- **Door impossible to open** — door `Box3` was in static `colliders[]`, pushback prevented player from reaching push zone
- **Door couldn't be pushed from back side** — bidirectional `side` detection based on player's local X position relative to door plane

---

## [Session 10] — 2026-03-09
### Changed
- **Layout reorganization for coherent spatial flow** (`src/world/world.js`)
  - **Staircases flush against walls** — eliminated 1.9 m gaps
    - Left staircase: center X=-4 → **X=-5.9** (spans X=-7.0 to -4.8)
    - Right staircase: center X=+4 → **X=+5.9** (spans X=+4.8 to +7.0)
  - **Staircase start pushed back** — Z=-2 → **Z=-5** (into transition zone, `STAIR_START_Z` constant added)
  - **Balcony flipped orientation** — now extends **backward** (Z=-11.4 to -13.8) overlooking main floor, not forward
    - Front railing at Z=-11.4 spans center only (X=-4.8 to +4.8); gaps where stairs connect
    - Newel posts at X=±4.8 (staircase-to-balcony junction); side rails along walls; back rail near Z=-13.8
  - **Front desk repositioned to center** — Z=-4.0 → **Z=0.0** (visible from entry, centered in room)
  - **Benches moved to front hall** — Z=-7.0 → **Z=+3.0** (between columns and entry, flanking central walkway)
  - **Standing lamps follow benches** — Z=-6.0 → **Z=+4.2** (illuminate seating area)
  - **Column Z positions shifted** — [+5, -1, -7] → **[+5, +1, -3]** (avoid staircase zones)
  - **Wall sconce Z positions** — [5, 1, -3, -7] → **[8, 3, -2, -5]** (entry to staircase start)
  - **Ceiling lights repositioned** — now above entry (Z=9), seating (Z=3), desk (Z=0), and transition zones (Z=±3)
  - **Damage pillar moved** — X=1.5, Z=0 → **X=0, Z=-4** (transition zone, clear of desk)
  - **Back-area floor added** — Z=-10 to -14 (under balcony overhang, prevents void when player looks underneath)

- **Chandelier repositioning** (`src/main.js`)
  - Repositioned along center axis: Z=[0, -5, -5] → **Z=[0, 6, -4]**
  - Illuminates entry hall, desk area, and transition zone in a visual line

- **Item spawn repositioning** (`src/main.js`)
  - Ammo pickups: Z=-2.0 → **Z=+1.5** (in front of desk, immediately visible from entry)
  - Healing items: Z=-3.5 → **Z=-1.0** (behind desk, encourages exploration)

### Result
The room now reads as a **grand RCPD/museum lobby** with clear spatial narrative:
1. **Entry zone** (Z=+7 to +14) — elevated platform, descent
2. **Front hall** (Z=+2 to +7) — open reception area with seating
3. **Central zone** (Z=-2 to +2) — check-in desk with mid-level columns
4. **Transition** (Z=-3 to -5) — back columns, hazard, lighting transition
5. **Staircase zone** (Z=-5 to -11.4) — dual ascending staircases, flush to walls
6. **Balcony** (Z=-11.4 to -13.8) — upper gallery with front and side railings

---

## [Session 9] — 2026-03-09
### Changed
- **Room dimensions dramatically compressed** (`src/world/world.js`)
  - Width: 20 m → **14 m** (X: ±7)
  - Depth: 40 m → **28 m** (Z: ±14)
  - Ceiling: 10 m → **5.5 m**
  - Proportions are approximately 50×100 player-block units

- **All world elements repositioned to match new room scale**
  - Entry platform: Y=1.5 → **1.0**, Z=+9..+14
  - Front staircase: 6 steps → **3 steps** (0.3 m rise each, 0.5 m run)
  - Side staircases: 10 steps → **8 steps**, 2.5 m wide → **2.2 m**, centered at X=±5.5, `STAIR_HEIGHT` 3.5 m → **2.5 m**, start Z=-1.5, run 0.8 m each
  - Balcony: full-width at Y=2.5, Z≈-7.9 to -14
  - Column pairs: X=±4.5 → **X=±3.0**, Z=[+5, -1, -7]
  - Front desk: 7 m → **4.5 m** wide, moved to Z=-4.0
  - Benches: behind staircases at X=±5.0, Z=-9 (under balcony overhang)
  - Water cooler: right side aisle at (6.2, 0, +5)
  - Damage pillar: height matches `STAIR_HEIGHT` (2.5 m)
  - Player spawn: Z=7 → **Z=4**

- **Chandeliers resized for lower ceiling** (`src/main.js`)
  - Outer chains: 3.0 m → **1.0 m**; inner arms: 1.2 m → **0.55 m**
  - Bottom bulb at ≈3.3 m (was 3.7 m) — clears player eye level
  - 4 chandeliers → **3**, hung at Y=5.2 at Z=[+4, -4, -10]

- **Fog density increased**: 0.035 → **0.055** (tighter room reads hazier)

- **Dev server cache fixed** (`server.js`)
  - Added `Cache-Control: no-cache, no-store, must-revalidate` headers
  - Browser was serving stale JS due to missing cache headers

---

## [Session 8] — 2026-03-09
### Added
- **Inventory drag-and-drop** (`src/ui/inventory.js`)
  - Left-click and drag any occupied grid slot or the equipped slot to move items
  - Drag ghost icon follows the virtual cursor while dragging; source slot dims to 25% opacity
  - Drop target slots highlight in real time: **green** = valid, **red** = invalid
  - Drop rules:
    - Empty slot → moves item there
    - Same stackable type with room → fills target stack, leaves any remainder in source slot
    - Same stackable type but target is already full → red border + **STACK FULL** feedback
    - Different type with a combine recipe → combines (consumes ingredients, places result)
    - Different type with no recipe → red border + **CANNOT COMBINE** feedback, item returns
    - Equipped slot (from grid item) → equips if item is equippable, otherwise **CANNOT EQUIP**
    - Outside the inventory panel → drops item on the ground at player's feet
    - Inside panel but not on any slot → drag cancelled, item returns
  - Escape key cancels an in-progress drag

- **Right-click context menu** (`src/ui/inventory.js`)
  - Right-click any occupied slot to open the action menu (Use / Equip / Drop)
  - Menu is fully driven by the virtual cursor — hover highlight and click detection use `cursorX/cursorY` so it works correctly under pointer lock
  - **Use** — only shown for `usable: true` items; calls `playerHealth.heal()` and decrements stack quantity. Shows **ALREADY AT FULL HP** if no healing applied
  - **Equip** — only shown for `equippable: true` items not currently in the equipped slot
  - **Drop** — only shown for `droppable: true` items; spawns the item in the world
  - Non-usable items (e.g. ammo, handgun) never show a Use option

- **Item use wired up** — healing items (H1 +2 HP, H2 +5 HP, H3 +8 HP) now correctly heal the player when used via the context menu; the item is consumed from the stack

- **Ground item auto-spread** (`src/systems/worldItems.js`)
  - `spawnDrop` now calls `findClearDropPosition` before placing a pickup mesh
  - Tries 13 candidate positions (centre, 8 cardinal/diagonal offsets at 0.85 u, 4 wider offsets) in order; picks the first clear one
  - Falls back to a random wider-radius position if all candidates are occupied
  - Dropped items never overlap on the ground regardless of drop count

- **New inventory methods** (`src/systems/inventory.js`)
  - `unequipToSlot(slotIndex)` — unequips the equipped item to a specific empty grid slot
  - `swapEquippedWithSlot(slotIndex)` — swaps equipped item with an equippable grid slot item

### Removed
- Combine mode (yellow cursor, two-step click flow) — superseded by direct drag-and-drop combining

---

## [Session 7] — 2026-03-09
### Changed
- **Inventory interaction: right-click → left-click**
  - All inventory actions (context menu, combine mode) now triggered by left-click
  - Removed separate right-click handler; unified into a single left-click handler
  - Info text updated to "Left-click for options"

- **Healing items renamed and rebalanced**
  - `healingA` → **Healing Item 1** (heals 2 HP, was 5)
  - `healingB` → **Healing Item 2** (heals 5 HP, was 3)
  - `healingC` → **Healing Item 3** (heals 8 HP, combined result; `combinable: false`)
  - Recipe unchanged: Healing Item 1 + Healing Item 2 → Healing Item 3

- **Stack limits**
  - Handgun ammo `maxStack`: 999 → **27** per slot; overflow fills a new stack
  - All healing items `maxStack`: 99 → **3** per slot regardless of type

- **Full-stack indicator** — stack count displays in **green** when slot is at max capacity

- **Inventory full notification** — "INVENTORY FULL" message appears for 2 seconds when pickup fails because all 9 grid slots are occupied

### Changed (Starting Loadout)
- Removed starting ammo and healing items from player inventory
- Replaced with world pickups near spawn:
  - Three full ammo stacks (27 bullets each) on the floor
  - One Healing Item 1 and one Healing Item 2 on the floor

---

## [Session 6] — 2026-03-08
### Added
- **Item Registry System** (`src/systems/itemRegistry.js`)
  - Centralized item definitions (ammo, healing herbs, handgun, medical items)
  - Item properties: stackable, maxStack, usable, equippable, droppable, combinable
  - 3D appearance config (color, size, shape) for world items
  - Recipe system: Healing Herb + First Aid Spray → Mixed Medicine (heals 8 HP)

- **Inventory System Overhaul**
  - Separate equipped weapon slot (displays above 3×3 grid)
  - New methods: `equipItem()`, `unequipItem()`, `moveItem()`, `useItem()`, `combineItems()`, `dropItem()`
  - maxStack enforcement from registry
  - Starting loadout: 100 ammo, 1 First Aid Spray in grid, Handgun equipped

- **World Items / Pickups**
  - 3D rotating mesh pickups in the scene
  - THREE.Raycaster hover detection (3-unit range from camera)
  - Hover text overlay: "Item Name — Press E to pick up"
  - Pickup/drop lifecycle, auto-disposal of meshes on pickup
  - Weapon pickups auto-equip to weapon slot

- **Inventory UI Overhaul**
  - Colored rectangle icons with 2-character initials (instead of placeholder SVGs)
  - Equipped weapon slot with gold border
  - Right-click context menu: Use, Combine, Equip, Drop
  - Combine mode: yellow cursor, click target to combine items
  - Item names displayed in each slot

- **Enhanced E-Key Logic**
  - Pickup if looking at item (raycaster hovering)
  - Else open/close inventory
  - One-key intuitive interaction

---

## [Session 5] — 2026-03-08
### Added
- **Universal Health System** (`src/systems/health.js`)
  - Factory function: `createHealth(maxHealth)`
  - Scale: 1–10 (10 = healthy, 0 = dead)
  - Damage types support (`'generic'`, `'fire'`, etc.)
  - Flat damage resistances per type
  - Event callbacks: `onDamage`, `onDeath`, `onHeal`, `reset`
  - Same system ready for enemies

- **HUD Redesign**
  - Relocated to bottom-right corner
  - Health shown as 10 pip bars (dynamic color: green → orange → red)
  - Ammo counter: "MAG / RESERVE" with color coding

- **Damage Visual Effects**
  - CSS-based red vignette overlay
  - Heartbeat pulse synchronized to heartbeat frequency
    - HP ≤ 3: subtle slow pulse
    - HP 2: medium pulse
    - HP 1: heavy, fast, deep red pulse
  - Brief red flash on any damage (regardless of HP)

- **Low-Health Player Sway**
  - At 1 HP: camera drifts with wobbly sine-wave pattern
  - Two overlapping frequencies for organic feel
  - Settles when healing above 1 HP

- **Death System**
  - Dark red death screen fades in with "YOU DIED" text
  - All player input disabled
  - Auto-reset after 4 seconds (health restored, player repositioned, effects cleared)

- **Damage Pillar Hazard**
  - Dark stone cylinder (radius 0.5m, height 3m)
  - Positioned at (5, 0, 0) on main floor
  - Deals 1 damage per second on contact
  - Both collision box (blocks movement) and hazard (tick damage)

- **Hazard System Infrastructure**
  - World exports `hazards[]` array alongside `colliders[]`
  - Each hazard defines: position, radius, damagePerSecond, damageType
  - Main loop checks player distance each frame
  - Tick damage applied at 1-second intervals
  - Timer resets when player leaves range

---

## [Session 4] — 2026-03-08
### Added
- **Inventory System** (`src/systems/inventory.js`)
  - 9-slot 3×3 grid
  - Item stacking: each slot holds one item type with unlimited quantity
  - Toggle with **E key**
  - Methods: `addItem()`, `removeItem()`, `getItemCount()`, `getItems()`

- **Gun System** (`src/systems/weapons.js`)
  - 9-round magazine capacity
  - Semi-automatic with 0.1s fire rate cooldown
  - **Real bullet economy**: Unspent rounds are discarded on reload (creates resource tension)
  - Hitscan raycast for instant hit detection (100m range)
  - Fire with **left-click**, reload with **R key**

- **Gun Animations** (viewmodel)
  - Recoil kick on fire: hand kicks back -0.02m Y offset + 0.05 rad rotation
  - Recoil decay: 0.15s smooth falloff
  - Reload animation during 1.2s reload duration: hand rotates 45° and lowers smoothly
  - All applied to right-hand viewmodel

- **Inventory UI**
  - 3×3 grid overlay with item count overlays
  - Opens centered on screen with semi-transparent dark background
  - Appears only when inventory is active

- **In-Game Cursor**
  - Green glowing circle (2px border + center dot)
  - Tracks mouse movement using pointer lock deltas
  - Appears when inventory opens, disappears when closed
  - Allows clicking inventory items while keeping game running

- **HUD Ammo Counter**
  - Top-right corner (green text with glow)
  - Format: "MAG / RESERVE"
  - Color-coded: green (normal), orange (< 3 rounds), red (empty)
  - Updates every frame

- **Game Loop Continuity**
  - Pointer lock stays active entire time (no defocus)
  - Camera rotation frozen while inventory open (saved quaternion restored each frame)
  - WASD movement continues while inventory open — game runs in background, not paused

---

## [Session 3] — 2026-03-08
### Added
- **Cannon-es Physics Integration** (`src/systems/physics.js`)
  - Lightweight Cannon.js port imported via CDN
  - Physics world steps every frame
  - Hybrid collision approach:
    - Player: fast AABB collision detection (proven, maintains 60 FPS)
    - World: static boxes registered as physics bodies
    - Future enemies: will use dynamic rigidbodies

- **Physics-Ready Architecture**
  - No physics-based puzzles (RE7-style gameplay)
  - World collision boxes prepared for interactive objects and enemies
  - Raycast system ready for future use

---

## [Session 2] — 2026-03-08
### Added
- **Dual-Hand First-Person Viewmodel**
  - Left hand with flashlight, right hand with pistol
  - Independent bob/sway animation per hand
  - Hands centered at (±0.08, -0.1, -0.15) relative to camera
  - Left hand leads sway; right hand lags for natural feel

- **Flashlight System**
  - F-key toggle
  - SpotLight child of left hand, follows hand position/rotation via scene graph
  - Soft cone lighting (32° cone, penumbra 0.45, decay 1.4) for ambient spillage
  - Naturally moves with hand in world space

- **Environment Expansion**
  - Grand entrance staircase (6 steps down)
  - Side staircases (12 steps up) linking to full-width back balcony
  - Expanded lighting: 5 point lights + 4 large chandeliers for layered illumination
  - Soft ambient lighting (0x404040, 0.3 intensity)

- **Collision Detection with Step-Climbing**
  - AABB-based collision system
  - Automatic step-climbing (0.45m max step height)
  - Fast and responsive at 60 FPS
  - Player can walk up stairs without jumping

---

## [Session 1] — 2026-03-08
### Added
- **Project Initialization**
  - First-person survival horror game in browser
  - Three.js 0.169.0 via CDN importmap
  - Vanilla JavaScript (ES Modules)
  - No game engine, no bundler

- **Core Renderer & Game Loop**
  - Canvas renderer (WebGL)
  - 60 FPS game loop
  - Scene setup with perspective camera

- **Grand Cathedral Museum Environment**
  - 30m wide × 60m deep × 15m ceiling
  - Procedural marble floor textures
  - Initial furniture and details: desk, benches, water cooler, standing lamps

- **Player Controller**
  - WASD/arrow movement
  - Spacebar jump
  - Shift sprint
  - Pointer lock + fallback mouse-look
  - Custom gravity physics (no external engine) with velocity and jump impulse

- **Initial HUD System**
  - Basic UI overlay framework

---

## Release Timeline
| Version | Session | Date | Status |
|---------|---------|------|--------|
| v0.9 | Session 9 | 2026-03-09 | Room Scale Compression & Cache Fix |
| v0.8 | Session 8 | 2026-03-09 | Drag-and-Drop Inventory & Item Use |
| v0.7 | Session 7 | 2026-03-09 | Inventory Debugging & Item Rebalance |
| v0.6 | Session 6 | 2026-03-08 | Item Registry & Pickups |
| v0.5 | Session 5 | 2026-03-08 | Health System & Damage Effects |
| v0.4 | Session 4 | 2026-03-08 | Gun & Inventory |
| v0.3 | Session 3 | 2026-03-08 | Physics Integration |
| v0.2 | Session 2 | 2026-03-08 | Dual-Hand Viewmodel & Flashlight |
| v0.1 | Session 1 | 2026-03-08 | Project Init & Cathedral |
