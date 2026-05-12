# Asset Class Section Reorder & Hide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag-to-reorder and show/hide individual asset class items in the sidebar, with preferences saved per-user on the server.

**Architecture:** A `preferences Json?` column on the `User` model stores ordered visibility settings. A new `/api/user/preferences` endpoint exposes GET + PATCH. The sidebar enters an iPhone-style edit mode (drag handles + eye icons appear) driven by a Zustand store; saving calls PATCH then exits edit mode.

**Tech Stack:** `@dnd-kit/core`, `@dnd-kit/sortable`, Zustand, React Query, Axios, Prisma, Express, Zod

---

## File Map

| Action | Path |
|--------|------|
| Modify | `packages/api/prisma/schema.prisma` — add `preferences Json?` to `User` |
| Create | `packages/api/src/routes/userPreferences.routes.ts` |
| Create | `packages/api/src/controllers/userPreferences.controller.ts` |
| Create | `packages/api/src/services/userPreferences.service.ts` |
| Modify | `packages/api/src/routes/index.ts` — register preferences router |
| Modify | `packages/shared/src/types/index.ts` (or nearest types barrel) — add `AssetSectionPref` + `UserPreferences` |
| Create | `apps/web/src/api/userPreferences.api.ts` |
| Create | `apps/web/src/stores/assetSections.store.ts` |
| Create | `apps/web/src/components/layout/SortableAssetClassItem.tsx` |
| Create | `apps/web/src/components/layout/AssetClassSectionList.tsx` |
| Modify | `apps/web/src/components/layout/Sidebar.tsx` |

---

## Task 1: Install dnd-kit

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install packages**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos/apps/web"
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('./node_modules/@dnd-kit/core/dist/core.cjs')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore(deps): add @dnd-kit/core + sortable for sidebar reorder"
```

---

## Task 2: Add `preferences` column to User model + migrate

**Files:**
- Modify: `packages/api/prisma/schema.prisma`

- [ ] **Step 1: Add column**

In `packages/api/prisma/schema.prisma`, find the closing `}` of the `User` model (currently line 110) and add the field just before it:

```prisma
  // UI preferences — sidebar asset class order + visibility per user.
  preferences Json?
}
```

The block should end like:

```prisma
  portfolioInsights PortfolioInsight[]

  // UI preferences — sidebar asset class order + visibility per user.
  preferences Json?
}
```

- [ ] **Step 2: Run migration**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos/packages/api"
npx prisma migrate dev --name add_user_preferences
```

Expected: Migration created and applied. No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/
git commit -m "feat(db): add User.preferences Json column for sidebar prefs"
```

---

## Task 3: Add shared types for preferences

**Files:**
- Modify: `packages/shared/src/types/index.ts` (add at bottom; if that file is a barrel, add to `packages/shared/src/types/preferences.ts` and re-export from the barrel)

- [ ] **Step 1: Check where to add types**

```bash
grep -n "AssetClass\|AuthUser\|export" "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos/packages/shared/src/types/index.ts" | head -20
```

- [ ] **Step 2: Add types**

If `packages/shared/src/types/index.ts` exists and exports other types, add at the bottom:

```ts
export interface AssetSectionPref {
  key: string;    // matches NavItem.to path, e.g. "/stocks", "/mutual-funds"
  visible: boolean;
  order: number;  // 0-based
}

export interface UserPreferences {
  assetSections: AssetSectionPref[];
}
```

If the file is a barrel (`export * from './...'`), create `packages/shared/src/types/preferences.ts` with the above content, then add `export * from './preferences';` to the barrel.

- [ ] **Step 3: Rebuild shared package**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos/packages/shared"
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/
git commit -m "feat(shared): add AssetSectionPref + UserPreferences types"
```

---

## Task 4: Backend service — `userPreferences.service.ts`

**Files:**
- Create: `packages/api/src/services/userPreferences.service.ts`

The service merges saved preferences with the master list of sidebar items so new items added to the app appear as visible+last for users who haven't seen them before.

- [ ] **Step 1: Create the service**

```ts
// packages/api/src/services/userPreferences.service.ts
import { prisma } from '../lib/prisma.js';
import type { UserPreferences, AssetSectionPref } from '@portfolioos/shared';

// Master list of asset class nav keys — must match NAV_SECTIONS in Sidebar.tsx.
const ASSET_SECTION_KEYS: string[] = [
  '/stocks', '/fo', '/mutual-funds', '/bonds', '/fds', '/gold',
  '/crypto', '/forex', '/provident-fund', '/post-office',
  '/real-estate', '/rental', '/vehicles', '/insurance',
  '/loans', '/credit-cards', '/others',
];

function mergeWithDefaults(saved: AssetSectionPref[] | null): AssetSectionPref[] {
  const existing = new Map((saved ?? []).map((s) => [s.key, s]));
  const merged: AssetSectionPref[] = [];

  // Add saved items in their saved order.
  for (const item of saved ?? []) {
    if (ASSET_SECTION_KEYS.includes(item.key)) {
      merged.push(item);
    }
  }

  // Append any master keys not yet in saved prefs (new items).
  let nextOrder = merged.length;
  for (const key of ASSET_SECTION_KEYS) {
    if (!existing.has(key)) {
      merged.push({ key, visible: true, order: nextOrder++ });
    }
  }

  return merged;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferences: true },
  });

  const raw = user.preferences as { assetSections?: AssetSectionPref[] } | null;
  const assetSections = mergeWithDefaults(raw?.assetSections ?? null);
  return { assetSections };
}

export async function updateUserPreferences(
  userId: string,
  prefs: UserPreferences,
): Promise<UserPreferences> {
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: prefs as object },
  });
  return prefs;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/services/userPreferences.service.ts
git commit -m "feat(api): userPreferences service — get/update sidebar prefs"
```

---

## Task 5: Backend controller + route

**Files:**
- Create: `packages/api/src/controllers/userPreferences.controller.ts`
- Create: `packages/api/src/routes/userPreferences.routes.ts`
- Modify: `packages/api/src/routes/index.ts`

- [ ] **Step 1: Create controller**

```ts
// packages/api/src/controllers/userPreferences.controller.ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { getUserPreferences, updateUserPreferences } from '../services/userPreferences.service.js';

const assetSectionPrefSchema = z.object({
  key: z.string().min(1),
  visible: z.boolean(),
  order: z.number().int().min(0),
});

const updatePreferencesSchema = z.object({
  assetSections: z.array(assetSectionPrefSchema),
});

export async function getPreferencesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const prefs = await getUserPreferences(req.user.id);
  ok(res, prefs);
}

export async function updatePreferencesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updatePreferencesSchema.parse(req.body);
  const prefs = await updateUserPreferences(req.user.id, body);
  ok(res, prefs);
}
```

- [ ] **Step 2: Create route file**

```ts
// packages/api/src/routes/userPreferences.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { getPreferencesHandler, updatePreferencesHandler } from '../controllers/userPreferences.controller.js';

export const userPreferencesRouter = Router();
userPreferencesRouter.use(authenticate);

userPreferencesRouter.get('/', asyncHandler(getPreferencesHandler));
userPreferencesRouter.patch('/', asyncHandler(updatePreferencesHandler));
```

- [ ] **Step 3: Register in index.ts**

In `packages/api/src/routes/index.ts`, add the import after the last import line:

```ts
import { userPreferencesRouter } from './userPreferences.routes.js';
```

And inside `registerRoutes`, add after the last `app.use` line:

```ts
  app.use('/api/user/preferences', userPreferencesRouter);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos/packages/api"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/controllers/userPreferences.controller.ts \
        packages/api/src/routes/userPreferences.routes.ts \
        packages/api/src/routes/index.ts
git commit -m "feat(api): GET/PATCH /api/user/preferences endpoint"
```

---

## Task 6: Frontend API client

**Files:**
- Create: `apps/web/src/api/userPreferences.api.ts`

- [ ] **Step 1: Create the API file**

```ts
// apps/web/src/api/userPreferences.api.ts
import { api } from './client';
import type { UserPreferences, ApiResponse } from '@portfolioos/shared';

export const userPreferencesApi = {
  async get(): Promise<UserPreferences> {
    const { data } = await api.get<ApiResponse<UserPreferences>>('/api/user/preferences');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  async update(prefs: UserPreferences): Promise<UserPreferences> {
    const { data } = await api.patch<ApiResponse<UserPreferences>>('/api/user/preferences', prefs);
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/api/userPreferences.api.ts
git commit -m "feat(web): userPreferences API client"
```

---

## Task 7: Zustand store — `assetSections.store.ts`

**Files:**
- Create: `apps/web/src/stores/assetSections.store.ts`

- [ ] **Step 1: Create the store**

```ts
// apps/web/src/stores/assetSections.store.ts
import { create } from 'zustand';
import type { AssetSectionPref } from '@portfolioos/shared';
import { userPreferencesApi } from '@/api/userPreferences.api';

interface AssetSectionsState {
  sections: AssetSectionPref[];
  editingSections: AssetSectionPref[];
  isEditing: boolean;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;

  fetchPreferences: () => Promise<void>;
  enterEdit: () => void;
  cancelEdit: () => void;
  reorder: (activeKey: string, overKey: string) => void;
  toggleVisibility: (key: string) => void;
  saveEdit: () => Promise<void>;
}

export const useAssetSectionsStore = create<AssetSectionsState>()((set, get) => ({
  sections: [],
  editingSections: [],
  isEditing: false,
  isLoading: false,
  isSaving: false,
  saveError: null,

  fetchPreferences: async () => {
    set({ isLoading: true });
    try {
      const prefs = await userPreferencesApi.get();
      set({ sections: prefs.assetSections, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  enterEdit: () => {
    set({ isEditing: true, editingSections: [...get().sections], saveError: null });
  },

  cancelEdit: () => {
    set({ isEditing: false, editingSections: [], saveError: null });
  },

  reorder: (activeKey, overKey) => {
    const items = [...get().editingSections];
    const oldIndex = items.findIndex((s) => s.key === activeKey);
    const newIndex = items.findIndex((s) => s.key === overKey);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved!);
    const withOrder = reordered.map((s, i) => ({ ...s, order: i }));
    set({ editingSections: withOrder });
  },

  toggleVisibility: (key) => {
    set({
      editingSections: get().editingSections.map((s) =>
        s.key === key ? { ...s, visible: !s.visible } : s,
      ),
    });
  },

  saveEdit: async () => {
    set({ isSaving: true, saveError: null });
    try {
      const saved = await userPreferencesApi.update({ assetSections: get().editingSections });
      set({
        sections: saved.assetSections,
        isEditing: false,
        editingSections: [],
        isSaving: false,
      });
    } catch (err) {
      set({
        isSaving: false,
        saveError: err instanceof Error ? err.message : 'Failed to save',
      });
    }
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/stores/assetSections.store.ts
git commit -m "feat(web): assetSections Zustand store — reorder + hide + server sync"
```

---

## Task 8: `SortableAssetClassItem` component

**Files:**
- Create: `apps/web/src/components/layout/SortableAssetClassItem.tsx`

This wraps an existing nav item. In normal mode it renders nothing extra. In edit mode it adds a drag handle (left) and eye toggle (right), without changing the item's visual style.

- [ ] **Step 1: Create component**

```tsx
// apps/web/src/components/layout/SortableAssetClassItem.tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NavLink } from 'react-router-dom';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AssetSectionPref } from '@portfolioos/shared';

interface Props {
  item: {
    label: string;
    to: string;
    icon: React.ElementType;
  };
  pref: AssetSectionPref;
  isEditing: boolean;
  collapsed: boolean;
  onToggleVisibility: (key: string) => void;
}

export function SortableAssetClassItem({
  item,
  pref,
  isEditing,
  collapsed,
  onToggleVisibility,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.to,
    disabled: !isEditing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center">
      {/* Drag handle — only in edit mode, hidden when collapsed */}
      {isEditing && !collapsed && (
        <button
          type="button"
          className="flex-shrink-0 p-1 text-sidebar-foreground/30 hover:text-sidebar-foreground/60 cursor-grab active:cursor-grabbing focus:outline-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}

      {/* Nav link — visually identical to normal mode */}
      <NavLink
        to={item.to}
        className={({ isActive }) =>
          cn(
            'group/nav nav-rail relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-all flex-1 min-w-0',
            'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70',
            isActive && !isEditing && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
            // Hidden item in edit mode: muted
            isEditing && !pref.visible && 'opacity-40',
            collapsed && 'justify-center px-2',
          )
        }
        title={collapsed ? item.label : undefined}
        end={item.to === '/dashboard'}
        // Disable navigation while in edit mode
        onClick={isEditing ? (e) => e.preventDefault() : undefined}
      >
        {({ isActive }) => (
          <>
            {isActive && !collapsed && !isEditing && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
              />
            )}
            <item.icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-colors',
                isActive && !isEditing
                  ? 'text-accent'
                  : 'text-sidebar-foreground/60 group-hover/nav:text-sidebar-accent-foreground',
              )}
              strokeWidth={1.7}
            />
            {!collapsed && (
              <span className={cn('truncate', isEditing && !pref.visible && 'line-through')}>
                {item.label}
              </span>
            )}
          </>
        )}
      </NavLink>

      {/* Eye toggle — only in edit mode, hidden when collapsed */}
      {isEditing && !collapsed && (
        <button
          type="button"
          className="flex-shrink-0 p-1 text-sidebar-foreground/30 hover:text-sidebar-foreground/60 focus:outline-none"
          aria-label={pref.visible ? 'Hide section' : 'Show section'}
          onClick={() => onToggleVisibility(item.to)}
        >
          {pref.visible ? (
            <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
          ) : (
            <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/SortableAssetClassItem.tsx
git commit -m "feat(web): SortableAssetClassItem — drag handle + eye toggle"
```

---

## Task 9: `AssetClassSectionList` component

**Files:**
- Create: `apps/web/src/components/layout/AssetClassSectionList.tsx`

Wraps all asset class items in DndContext + SortableContext. Also handles the "Edit"/"Done" header button and the "+ N hidden" footer.

- [ ] **Step 1: Create component**

```tsx
// apps/web/src/components/layout/AssetClassSectionList.tsx
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useEffect, useCallback } from 'react';
import { useAssetSectionsStore } from '@/stores/assetSections.store';
import { SortableAssetClassItem } from './SortableAssetClassItem';
import { useAuthStore } from '@/stores/auth.store';

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

interface Props {
  items: NavItem[];
  collapsed: boolean;
}

export function AssetClassSectionList({ items, collapsed }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const {
    sections,
    editingSections,
    isEditing,
    isSaving,
    saveError,
    fetchPreferences,
    enterEdit,
    cancelEdit,
    reorder,
    toggleVisibility,
    saveEdit,
  } = useAssetSectionsStore();

  // Fetch on mount (after auth is ready)
  useEffect(() => {
    if (isAuthenticated) fetchPreferences();
  }, [isAuthenticated, fetchPreferences]);

  // Escape key cancels edit mode
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelEdit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditing, cancelEdit]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        reorder(String(active.id), String(over.id));
      }
    },
    [reorder],
  );

  // Build display list
  const activeSections = isEditing ? editingSections : sections;
  // Map pref key → NavItem
  const itemMap = new Map(items.map((i) => [i.to, i]));

  // In normal mode: only visible items, in saved order
  // In edit mode: all items (hidden ones shown muted), in editing order
  const displayPrefs = activeSections.filter((s) => isEditing || s.visible);
  const hiddenCount = sections.filter((s) => !s.visible).length;

  return (
    <div>
      {/* Section heading with Edit/Done button */}
      {!collapsed && (
        <div className="px-2 mb-2 flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-kerned text-sidebar-foreground/50 font-medium">
            Asset Classes
          </span>
          <span className="flex-1 h-px bg-sidebar-border/60" />
          {!isEditing ? (
            <button
              type="button"
              onClick={enterEdit}
              className="text-[10px] text-accent font-medium hover:text-accent/80 focus:outline-none"
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={saveEdit}
              disabled={isSaving}
              className="text-[10px] text-emerald-500 font-medium hover:text-emerald-400 focus:outline-none disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Done'}
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {saveError && !collapsed && (
        <p className="px-3 py-1 text-[11px] text-red-400">{saveError}</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={displayPrefs.map((s) => s.key)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            {displayPrefs.map((pref) => {
              const navItem = itemMap.get(pref.key);
              if (!navItem) return null;
              return (
                <SortableAssetClassItem
                  key={pref.key}
                  item={navItem}
                  pref={pref}
                  isEditing={isEditing}
                  collapsed={collapsed}
                  onToggleVisibility={toggleVisibility}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {/* "+ N hidden" footer — visible in normal mode when items are hidden */}
      {!isEditing && !collapsed && hiddenCount > 0 && (
        <button
          type="button"
          onClick={enterEdit}
          className="w-full text-left px-3 py-1.5 text-[12px] text-sidebar-foreground/40 hover:text-sidebar-foreground/60 focus:outline-none"
        >
          + {hiddenCount} hidden
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/AssetClassSectionList.tsx
git commit -m "feat(web): AssetClassSectionList — DndContext + edit mode header + hidden footer"
```

---

## Task 10: Modify Sidebar.tsx

**Files:**
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

Replace the static "Asset Classes" section rendering with `<AssetClassSectionList />`. All other sections remain unchanged.

- [ ] **Step 1: Add import**

At the top of `Sidebar.tsx`, after the existing imports, add:

```ts
import { AssetClassSectionList } from './AssetClassSectionList';
```

- [ ] **Step 2: Extract the Asset Classes items**

Above the `NAV_SECTIONS` definition, extract the Asset Classes items into a constant:

```ts
const ASSET_CLASS_ITEMS: NavItem[] = [
  { label: 'Stocks', to: '/stocks', icon: TrendingUp },
  { label: 'F & O', to: '/fo', icon: BarChart3 },
  { label: 'Mutual Funds', to: '/mutual-funds', icon: LineChart },
  { label: 'Bonds', to: '/bonds', icon: Landmark },
  { label: 'FDs & RDs', to: '/fds', icon: PiggyBank },
  { label: 'Gold & Silver', to: '/gold', icon: Coins },
  { label: 'Crypto', to: '/crypto', icon: Bitcoin },
  { label: 'Forex', to: '/forex', icon: Globe },
  { label: 'PPF & EPF', to: '/provident-fund', icon: Wallet },
  { label: 'Post Office', to: '/post-office', icon: MailOpen },
  { label: 'Real Estate', to: '/real-estate', icon: Home },
  { label: 'Rental', to: '/rental', icon: Building2 },
  { label: 'Vehicles', to: '/vehicles', icon: Car },
  { label: 'Insurance', to: '/insurance', icon: Shield },
  { label: 'Loans', to: '/loans', icon: HandCoins },
  { label: 'Credit Cards', to: '/credit-cards', icon: CreditCard },
  { label: 'Others', to: '/others', icon: Boxes },
];
```

Update `NAV_SECTIONS` to use an empty array (or remove the Asset Classes entry entirely and handle it separately in the render):

```ts
const NAV_SECTIONS: Array<{ heading?: string; items: NavItem[] }> = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', to: '/analytics', icon: BarChart3 },
      { label: 'Portfolios', to: '/portfolios', icon: Briefcase },
      { label: 'Transactions', to: '/transactions', icon: Receipt },
      { label: 'Cash Activity', to: '/cashflows', icon: ArrowLeftRight },
    ],
  },
  // 'Asset Classes' section removed — rendered separately by AssetClassSectionList
  {
    heading: 'Inbox',
    items: [
      { label: 'Connect your Gmail', to: '/ingestion', icon: Inbox },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { label: 'Reports', to: '/reports', icon: FileText },
      { label: 'Tax', to: '/tax', icon: Calculator },
      { label: 'Import', to: '/import', icon: Upload },
      { label: 'Connectors', to: '/connectors', icon: Plug },
      { label: 'CAS', to: '/cas', icon: FileDown },
      { label: 'Accounting', to: '/accounting', icon: BookOpenCheck },
      { label: 'Alerts', to: '/alerts', icon: BellRing },
      { label: 'Failures (DLQ)', to: '/import/failures', icon: Bug },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];
```

- [ ] **Step 3: Inject `AssetClassSectionList` in the render**

In the `<nav>` element, the existing render is:

```tsx
{NAV_SECTIONS.map((section, sectionIdx) => (
  <div key={sectionIdx}>
    ...
  </div>
))}
```

Replace with:

```tsx
{NAV_SECTIONS.map((section, sectionIdx) => (
  <div key={sectionIdx}>
    {!collapsed && section.heading && (
      <div className="px-2 mb-2 flex items-center gap-2">
        <span className="text-[10.5px] uppercase tracking-kerned text-sidebar-foreground/50 font-medium">
          {section.heading}
        </span>
        <span className="flex-1 h-px bg-sidebar-border/60" />
      </div>
    )}
    <ul className="space-y-0.5">
      {section.items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            className={({ isActive }) =>
              cn(
                'group/nav nav-rail relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-all',
                'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70',
                isActive &&
                  'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                collapsed && 'justify-center px-2',
              )
            }
            title={collapsed ? item.label : undefined}
            end={item.to === '/dashboard'}
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
                  />
                )}
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-accent' : 'text-sidebar-foreground/60 group-hover/nav:text-sidebar-accent-foreground',
                  )}
                  strokeWidth={1.7}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  </div>
))}

{/* Asset Classes — separately rendered with drag/hide support */}
<div>
  <AssetClassSectionList items={ASSET_CLASS_ITEMS} collapsed={collapsed} />
</div>
```

Insert this `<div>` block between the Overview section and the Inbox section by placing it at position 1 in the sections array render. Since `NAV_SECTIONS` no longer has an Asset Classes entry, add the `AssetClassSectionList` block between the first `map` item (Overview) and the second (Inbox) by rendering it after the `NAV_SECTIONS.map(...)` block but before Inbox. The simplest approach: render Overview + Asset Classes + remaining sections:

```tsx
<nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
  {/* Overview section */}
  {(() => {
    const overview = NAV_SECTIONS[0]!;
    return (
      <div key="overview">
        {!collapsed && overview.heading && (
          <div className="px-2 mb-2 flex items-center gap-2">
            <span className="text-[10.5px] uppercase tracking-kerned text-sidebar-foreground/50 font-medium">
              {overview.heading}
            </span>
            <span className="flex-1 h-px bg-sidebar-border/60" />
          </div>
        )}
        <ul className="space-y-0.5">
          {overview.items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'group/nav nav-rail relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-all',
                    'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70',
                    isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                    collapsed && 'justify-center px-2',
                  )
                }
                title={collapsed ? item.label : undefined}
                end={item.to === '/dashboard'}
              >
                {({ isActive }) => (
                  <>
                    {isActive && !collapsed && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
                      />
                    )}
                    <item.icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0 transition-colors',
                        isActive ? 'text-accent' : 'text-sidebar-foreground/60 group-hover/nav:text-sidebar-accent-foreground',
                      )}
                      strokeWidth={1.7}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    );
  })()}

  {/* Asset Classes — drag/hide */}
  <div>
    <AssetClassSectionList items={ASSET_CLASS_ITEMS} collapsed={collapsed} />
  </div>

  {/* Remaining sections (Inbox, Tools) */}
  {NAV_SECTIONS.slice(1).map((section, sectionIdx) => (
    <div key={sectionIdx + 1}>
      {!collapsed && section.heading && (
        <div className="px-2 mb-2 flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-kerned text-sidebar-foreground/50 font-medium">
            {section.heading}
          </span>
          <span className="flex-1 h-px bg-sidebar-border/60" />
        </div>
      )}
      <ul className="space-y-0.5">
        {section.items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group/nav nav-rail relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-all',
                  'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70',
                  isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                  collapsed && 'justify-center px-2',
                )
              }
              title={collapsed ? item.label : undefined}
              end={item.to === '/dashboard'}
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
                    />
                  )}
                  <item.icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors',
                      isActive ? 'text-accent' : 'text-sidebar-foreground/60 group-hover/nav:text-sidebar-accent-foreground',
                    )}
                    strokeWidth={1.7}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  ))}
</nav>
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos/apps/web"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/Sidebar.tsx
git commit -m "feat(web): inject AssetClassSectionList into sidebar"
```

---

## Task 11: Manual smoke test

- [ ] **Step 1: Start dev servers**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos"
npm run dev
```

- [ ] **Step 2: Verify normal mode**

Open the app. Sidebar shows Asset Classes in default order. Only visible items shown.

- [ ] **Step 3: Verify edit mode**

Click "Edit" next to Asset Classes heading. All 17 items appear. Drag handles visible on left, eye icons on right.

- [ ] **Step 4: Verify drag**

Drag "Crypto" above "Stocks". Items reorder live.

- [ ] **Step 5: Verify hide**

Click eye on "Bonds". It goes muted with strikethrough.

- [ ] **Step 6: Verify save**

Click "Done". Sidebar shows new order, Bonds hidden. "+ 1 hidden" footer visible.

- [ ] **Step 7: Verify persistence**

Refresh the page. New order and hidden state preserved.

- [ ] **Step 8: Verify cancel**

Enter edit mode, drag something, press Escape. Order reverts to saved state.

- [ ] **Step 9: Verify "+ N hidden" re-entry**

Click "+ 1 hidden" footer. Edit mode opens.

- [ ] **Step 10: Final commit**

```bash
git add .
git commit -m "feat(web): asset class section reorder + hide — complete"
```
