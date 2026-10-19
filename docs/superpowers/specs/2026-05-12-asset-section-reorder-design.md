# Asset Class Section Reorder & Hide — Design Spec

**Date:** 2026-05-12  
**Status:** Approved  

---

## Overview

Users can reorder and show/hide individual asset class items in the sidebar's "Asset Classes" group. Order and visibility are saved per-user on the server. UI uses an iPhone-style edit mode: click "Edit" to enter, drag to reorder, tap eye to toggle visibility, click "Done" to save.

---

## Scope

- **In scope:** The 17 asset class nav items under the "Asset Classes" group in `Sidebar.tsx`
- **Out of scope:** Other sidebar groups (Dashboard, Portfolios, Analytics, etc.)

---

## Data Model

### Schema change

Add `preferences Json?` column to the `User` model in `schema.prisma`:

```prisma
model User {
  // ...existing fields...
  preferences Json?
}
```

### Preferences shape

```ts
interface UserPreferences {
  assetSections: AssetSectionPref[];
}

interface AssetSectionPref {
  key: string;   // matches NAV_SECTIONS item key, e.g. "stocks", "mutual-funds"
  visible: boolean;
  order: number; // 0-based
}
```

New sections not yet in the user's saved preferences default to `visible: true`, appended at end of list. This handles future asset class additions without a migration.

---

## Backend

### Migration
`prisma migrate dev` — additive, adds nullable `preferences` column to `User`.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user/preferences` | Returns `{ assetSections: [...] }`. Merges saved prefs with current `NAV_SECTIONS` defaults. |
| `PATCH` | `/api/user/preferences` | Body: `{ assetSections: [...] }`. Replaces stored prefs. Returns updated prefs. |

### Service method

`UserService.getPreferences(userId)` — reads `User.preferences`, merges with `NAV_SECTIONS` master list (adds any missing keys as visible+last), returns merged array sorted by `order`.

`UserService.updatePreferences(userId, prefs)` — validates input, writes to `User.preferences`.

---

## Frontend

### Zustand store — `assetSections.store.ts`

```ts
interface AssetSectionsStore {
  sections: AssetSectionPref[];       // current order + visibility
  editingSections: AssetSectionPref[]; // working copy during edit mode
  isEditing: boolean;

  fetchPreferences: () => Promise<void>;
  enterEdit: () => void;
  cancelEdit: () => void;
  reorder: (oldIndex: number, newIndex: number) => void;
  toggleVisibility: (key: string) => void;
  saveEdit: () => Promise<void>;      // PATCH + exit edit mode
}
```

- `fetchPreferences` called on app mount (once, in `App.tsx` or auth hook after login).
- `editingSections` is a copy of `sections` created on `enterEdit`. Changes made to `editingSections` only.
- `saveEdit` PATCHes `editingSections` to server, then sets `sections = editingSections`.
- `cancelEdit` discards `editingSections`, exits edit mode.

### Components

#### `AssetClassSectionList.tsx` (new)

Wraps the asset class items in the sidebar. Renders either:
- **Normal mode:** filtered list (`visible === true`), in order, as existing nav links. Footer "**+ N hidden**" link shown if any items are hidden — clicking it enters edit mode.
- **Edit mode:** all 17 items in `editingSections` order, wrapped in `DndContext` + `SortableContext` from `@dnd-kit/sortable`. Handles `onDragEnd` → calls `reorder`.

#### `SortableAssetClassItem.tsx` (new)

Single item wrapper using `useSortable` from `@dnd-kit/sortable`.

- Normal mode: renders existing nav link unchanged (no extra DOM).
- Edit mode: renders existing nav link + drag handle (left) + eye/slash icon (right). Hidden items rendered muted with strikethrough text.
- Drag handle uses `listeners` + `attributes` from `useSortable` — only the handle activates drag, not the whole row.

#### `Sidebar.tsx` (modified)

- Replace current static asset class list with `<AssetClassSectionList />`.
- Add "Edit" / "Done" buttons to the Asset Classes section header.
  - "Edit" → `enterEdit()`
  - "Done" → `saveEdit()`
  - "Cancel" (Escape key) → `cancelEdit()`

---

## Behaviour Details

| Scenario | Behaviour |
|----------|-----------|
| First-time user (no prefs saved) | Default order = `NAV_SECTIONS` order, all visible |
| Hidden item in normal mode | Not rendered in sidebar, not accessible via nav |
| "+ N hidden" clicked | Enters edit mode directly |
| Drag in edit mode | Reorders `editingSections` array, UI updates live |
| Eye toggled | `visible` flips in `editingSections`, item mutes/unmutes instantly |
| "Done" clicked | PATCH to server, exit edit mode, sidebar updates |
| "Done" fails (network) | Toast error, stay in edit mode, changes preserved |
| New asset class added to app | Appears at bottom of user's list as visible on next fetch |
| All items hidden | "+ N hidden" still shows so user can re-enter edit mode |

---

## Dependencies

- `@dnd-kit/core` + `@dnd-kit/sortable` — install in `apps/web`
- No new backend packages needed

---

## Files to Create / Modify

| Action | Path |
|--------|------|
| Modify | `packages/api/prisma/schema.prisma` |
| Create | `packages/api/src/routes/user.preferences.routes.ts` |
| Modify | `packages/api/src/services/user.service.ts` |
| Create | `apps/web/src/stores/assetSections.store.ts` |
| Create | `apps/web/src/components/layout/AssetClassSectionList.tsx` |
| Create | `apps/web/src/components/layout/SortableAssetClassItem.tsx` |
| Modify | `apps/web/src/components/layout/Sidebar.tsx` |

---

## Out of Scope (explicit)

- Reordering other sidebar groups
- Per-device preferences (single preference set per user, all devices)
- Animated "jiggle" (drag handles appear, no animation required)
- Touch/mobile drag (dnd-kit supports it natively, no extra work needed)
