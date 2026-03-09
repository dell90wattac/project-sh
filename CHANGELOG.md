# Changelog

All notable changes to Project SH are documented here.

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
| v0.8 | Session 8 | 2026-03-09 | Drag-and-Drop Inventory & Item Use |
| v0.7 | Session 7 | 2026-03-09 | Inventory Debugging & Item Rebalance |
| v0.6 | Session 6 | 2026-03-08 | Item Registry & Pickups |
| v0.5 | Session 5 | 2026-03-08 | Health System & Damage Effects |
| v0.4 | Session 4 | 2026-03-08 | Gun & Inventory |
| v0.3 | Session 3 | 2026-03-08 | Physics Integration |
| v0.2 | Session 2 | 2026-03-08 | Dual-Hand Viewmodel & Flashlight |
| v0.1 | Session 1 | 2026-03-08 | Project Init & Cathedral |
