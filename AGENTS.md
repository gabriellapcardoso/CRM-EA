# AGENTS.md — NossoCRM

## Commands
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint` (zero warnings enforced)
- **Typecheck**: `npm run typecheck`
- **Tests**: `npm test` (watch) | `npm run test:run` (single run) | `npx vitest path/to/file.test.ts` (single file)

## Architecture
- **Next.js 16 (App Router)**: routes in `app/`, protected routes under `app/(protected)/`
- **Supabase**: Auth + Postgres + RLS. Clients in `lib/supabase/` (client/server/service-role)
- **Proxy auth**: `proxy.ts` + `lib/supabase/middleware.ts` (not middleware.ts); excludes `/api/*`
- **State**: TanStack Query with facades in `context/`, queries in `lib/query/`
- **Cache**: Single Source of Truth pattern (see Cache Rules below)
- **AI**: SDK v6, chat via `/api/ai/chat`, tools in `lib/ai/tools.ts` (always filter by `organization_id`)

## Cache Rules (CRITICAL)
- **One cache per entity**: All operations (CRUD, Realtime, optimistic) use the SAME cache
- **Deals**: Always use `[...queryKeys.deals.lists(), 'view']` for all mutations
- **Other entities**: Use `queryKeys.{entity}.lists()` for mutations
- **Entities with extra sub-caches** (contacts, activities, businessUnits, messagingChannels, messagingConversations): use `entityCachesExceptDetail(entity)` predicate instead of `.lists()` alone
- **NEVER use** `queryKeys.*.all` — prefix-matches everything including open `detail(id)` views, causes unnecessary refetches
- **NEVER use** `queryKeys.*.list({ filter })` for optimistic updates - those are separate caches
- **If `onMutate` writes to `entity.detail(id)`**: also `cancelQueries({ queryKey: entity.detail(id) })` explicitly — `.lists()`/the predicate don't cover it, unlike `.all`, and an in-flight detail fetch can silently overwrite the optimistic write otherwise
- **Prefer** `setQueryData` over `invalidateQueries` for instant UI updates

## Soft-delete Rules (CRITICAL)
- **8 tables use `deleted_at`**: `deals`, `contacts`, `crm_companies`, `activities`, `boards`, `business_units`, `messaging_channels`, `organizations`. Deleting in the app is an UPDATE, never a DELETE
- **Every read query MUST filter** `.is('deleted_at', null)` — including `count: 'exact'` counters, `ilike` name lookups and bulk updates, not just list queries
- **Skipping the filter is invisible in tests but visible to the user**: a deleted record keeps showing on screen and keeps summing into totals (real bug: board summed R$5.600 of already-deleted deals; a later audit found the same in Activities and Companies)
- **Reference implementation**: `lib/supabase/contacts.ts` (correct in every read) and `app/api/public/v1/deals/*`
- **Guard**: `test/softDeleteFilters.test.ts`
- **Case-by-case exception**: webhook/idempotency lookups may legitimately need to see deleted rows — check the flow before adding the filter there (see `TODOS.md`, AI/MCP layer item)

## Layout / Sidebar Rules
- **`--app-sidebar-width` has ~30 consumers**: modals position their overlay with `md:left-[var(--app-sidebar-width)]`. Getting it wrong shifts every modal at once
- **Single source of truth**: only `Layout` writes that var, and only through `getSidebarWidth(mode, sidebarHidden)` — a pure exported function, covered by `test/sidebarWidth.test.ts`. Don't inline the width logic anywhere else
- **Two independent sidebar states, on purpose**: `sidebarHidden` is the user's explicit preference (persisted in `localStorage` as `crm_sidebar_hidden`); `sidebarCollapsed` is automatic/ephemeral. Never merge them — the automatic one would silently undo the user's choice
- **Read persisted UI prefs after mount**, never during first render — otherwise hydration mismatch (same pattern the pending-decisions counter already uses)
- **Hiding is desktop-only** (≥1280px): tablet has the icon rail, mobile has the bottom nav

## Code Style
- TypeScript 5.x strict, React 19, Tailwind CSS v4, Radix UI primitives
- Shared components in `components/`, feature modules in `features/`
- Imports: use `@/` alias (e.g., `@/lib/utils`, `@/components/ui`)
- Naming: camelCase for variables/functions, PascalCase for components/types
- Tests: Vitest + happy-dom + React Testing Library; place `.test.ts(x)` files alongside source
