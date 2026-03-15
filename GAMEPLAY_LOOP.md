# Gameplay Loop — 10-Minute Test Slice

Reference document for the current gameplay progression. All encounters, items, and triggers are defined in `src/main.js`.

---

## Overview

The player spawns in the lobby with an empty handgun. They must scavenge ammo, solve a 3-key chain through the east wing offices, survive escalating spider encounters, and escape through a locked door at the back of the lobby — fighting through a 100-spider finale to get there.

## Player Start

- **Position:** (0, 2.9, 4) — lobby center, facing the room
- **Loadout:** Handgun equipped, 0 ammo (empty magazine, standard ammo selected)
- **Health:** 10 HP

---

## Progression Flow

### 1. Lobby Scavenge (0:00–1:30)

Player explores the lobby to find initial supplies:

| Item | Quantity | Location |
|------|----------|----------|
| Regular ammo | 18 | Front desk area (-1.5, 0.3, 1.5) |
| Regular ammo | 9 | Nearby (1.5, 0.3, 1.5) |
| Healing A | 1 | (-1, 0.3, -1) |
| West Wing Key | 1 | (0.3, 0.3, -3.5) — optional |

The **West Wing Key** (`key:doorLobbyEast`) unlocks access to the south offshoot rooms — an optional detour with bonus supplies.

### 2. Enter East Wing (1:30–3:00)

Player finds the east hallway entrance (unlocked). On entering:

**Trigger D1** — `playerZone: eastHallway`
- 4 spiders drop from the ceiling (Y=2.8, wallNormal pointing down)
- Positions spread along the hallway
- First combat encounter — player should have ~27 regular ammo

The hallway connects to 4 rooms (2 north, 2 south) and the Director's Office at the far end.

### 3. Reception & Manager Offices (3:00–5:00)

Both rooms are unlocked. Player explores for supplies and finds the Admin Key:

**Reception (eastReception):**
| Item | Quantity | Location |
|------|----------|----------|
| Regular ammo | 18 | (10, 0.3, 6) |
| Healing A | 1 | (11, 0.3, 7) |
| **Admin Key** | 1 | (9, 0.3, 5.5) |

**Manager's Office (eastManager):**
| Item | Quantity | Location |
|------|----------|----------|
| Regular ammo | 9 | (10, 0.3, -1.5) |
| Healing A | 1 | (11, 0.3, -2) |

### 4. Admin Office (5:00–6:30)

Player uses Admin Key to unlock `doorHallAdmin` (key consumed on use).

**Trigger D2** — `doorOpen: doorHallAdmin`
- 6 spiders spawn in the east hallway behind the player
- 2 of these are marked for death-cascade (D5)
- Escalation — player is now fighting in a corridor with enemies on both sides

**Admin Office (eastAdmin):**
| Item | Quantity | Location |
|------|----------|----------|
| Regular ammo | 18 | (16, 0.3, 6) |
| Healing B | 1 | (17, 0.3, 7) |
| **Director's Key** | 1 | (15, 0.3, 5.5) |

**Kitchen (eastKitchen) — accessible anytime:**
| Item | Quantity | Location |
|------|----------|----------|
| Healing B | 1 | (16, 0.3, -1.5) |
| Healing A | 1 | (17, 0.3, -2) |

### 5. Director's Office (6:30–7:30)

Player uses Director's Key to unlock `doorHallDirector` (key consumed).

**Trigger D3** — `playerZone: eastDirector`
- 8 spiders spawn in the hallway behind the player (blocking retreat)
- 2 marked for death-cascade (D5)
- **Enables the finale trigger (D4)** via `onFire` → `_finaleTag`

**Director's Office (eastDirector) — the heavy ammo cache:**
| Item | Quantity | Location |
|------|----------|----------|
| **Heavy ammo** | 27 | (22, 0.3, 2) |
| **Heavy ammo** | 27 | (23, 0.3, 3) |
| Healing C | 1 | (21, 0.3, 4) |
| **Escape Key** | 1 | (22.5, 0.3, 1) |

Player now has the Escape Key and 54 heavy ammo — preparing for the finale.

### 6. Death-Cascade Encounters (Throughout 5:00–7:30)

**Trigger D5** — `enemyDeath` (4 marked enemies from D2 + D3)
- Each marked spider's death spawns 3 more spiders in the east wing
- Up to 12 additional spiders total
- Spawns distributed across hallway floors and walls
- Creates unpredictable secondary encounters during the mid-game

### 7. The Finale — Return to Lobby (7:30–9:30)

Player fights back through the east wing and re-enters the lobby.

**Trigger D4** — `playerZone: lobby` (was disabled, enabled by D3)
- **100 spiders** spawn across the entire lobby
- **Staggered:** batches of 15 every 0.5 seconds (~3.5 seconds to fully spawn)
- Spawn distribution:
  - ~30 on left wall (X ≈ -6.6), wallNormal pointing right
  - ~30 on right wall (X ≈ 6.6), wallNormal pointing left
  - ~20 on ceiling (Y = 5.2), wallNormal pointing down
  - ~20 on floor between player and escape door
- Player must fight from the east wing entrance (X ≈ 7) to the escape door at the back wall (Z = -14)
- Heavy ammo's 3× radius and 2× force is essential here

### 8. Escape (9:30–10:00)

Player uses the Escape Key to unlock the escape door at the back wall (key consumed). Opening the door past 0.3 radians triggers victory.

- **"YOU ESCAPED"** overlay appears
- Pointer lock released
- Click to restart (page reload)

---

## Optional: West Wing Detour

If the player finds and uses the West Wing Key in the lobby:

**Trigger D6** — `playerZone: sideRoomEast`
- 3 spiders across the three offshoot rooms
- Small bonus encounter

**West Wing Supplies:**
| Item | Quantity | Location |
|------|----------|----------|
| Regular ammo | 18 | (-17.2, 0.3, 2.5) |
| Healing B | 1 | (-17.2, 0.3, 1.5) |

---

## Ammo Economy

| Source | Regular | Heavy |
|--------|---------|-------|
| Lobby | 27 | 0 |
| Reception | 18 | 0 |
| Manager | 9 | 0 |
| Admin | 18 | 0 |
| Director | 0 | 54 |
| **Critical path total** | **72** | **54** |
| West Wing (optional) | 18 | 0 |

## Healing Economy

| Item | HP Restored | Count (critical path) |
|------|-------------|----------------------|
| Healing A | 2 | 4 |
| Healing B | 5 | 3 |
| Healing C | 8 | 1 |
| **Total HP available** | | **31 HP** |

## Enemy Count Summary

| Trigger | Spiders | Condition |
|---------|---------|-----------|
| D1 — East Hallway Entry | 4 | Enter east hallway |
| D2 — Admin Ambush | 6 | Open admin door |
| D3 — Director's Trap | 8 | Enter director's office |
| D4 — Lobby Finale | 100 | Return to lobby (after D3) |
| D5 — Death Cascades | up to 12 | Kill marked enemies from D2/D3 |
| D6 — West Wing (optional) | 3 | Enter south offshoot room |
| **Total** | **up to 133** | |

---

## Key Chain

```
Lobby (find West Wing Key)
  └─ optional: South Offshoot Rooms

East Hallway (unlocked)
  ├─ Reception (unlocked) → find Admin Key
  ├─ Manager (unlocked)
  ├─ Admin (locked: Admin Key) → find Director's Key
  ├─ Kitchen (unlocked)
  └─ Director (locked: Director's Key) → find Escape Key + heavy ammo

Lobby → Escape Door (locked: Escape Key) → VICTORY
```

## Technical Notes

- All triggers defined in `src/main.js` after `spawnTriggers` creation (~lines 788–935).
- Finale uses `_finaleTag` custom field for cross-trigger enable/disable (not a named ID).
- Stagger system in `src/systems/spawnTriggers.js` uses `pendingBatches` queue with per-frame delta drain.
- Death and victory both reset via `location.reload()` — no partial state reset needed.
- Keys consumed on use via `consumeKey: true` in `createDoorLock()` options.
- Bridge floor planes at all 9 doorways enable spider room-to-room traversal.
