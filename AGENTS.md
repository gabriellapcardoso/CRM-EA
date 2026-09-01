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

## AI Config Rules
- **`ai_model` must be OpenRouter's `provider/model` format.** A bare id (`gemini-2.5-flash`) is silently discarded by `getModel` and falls back to the default — the org ran for months on the default while settings said otherwise. `getModel` now warns loudly on that path; never remove that warning. Guard: `lib/ai/config.test.ts`
- **Config fallbacks must be noisy.** Dropping a value someone deliberately chose in a settings screen is an event, not a default. Silent fallback is only acceptable for *absent* config (empty field, new org), never for config that is present and invalid
- **Model ids are third-party resources that vanish.** `google/gemini-2.0-flash-001` was removed from OpenRouter's catalog with no visible deprecation; the 404 is `isRetryable: false`. Always use dated ids, never moving aliases
- **Model failover lives in `getModel`'s `extraBody`, not per call site.** `AI_FALLBACK_MODELS` rides OpenRouter's native `models` param, so all 17 AI call sites get it at once — adding `providerOptions` per call would leave whichever one someone forgets without a net. The list spans two vendors on purpose: two models from one vendor go down together. Every entry needs `tools` + `structured_outputs`. Guard: `lib/ai/failover.test.ts`
- **Changing the format of a value that lives in the DB is a data migration too.** The OpenRouter migration swapped provider and id format in code but never migrated the rows — new code silently read old data

## Cockpit / CSS Layout Rules
- **`display: contents` is a LAYOUT rule, not a DOM rule**: the cockpit's 3 panels use it so their 12 blocks become flex items of `.cockpit__body`. The panels are still the direct DOM children — a `>` selector reaches the panels (which have no box), not the blocks. Use descendant selectors there. Guard: `test/cockpitLayout.test.ts`
- **Section order lives in CSS, not JSX**: `.cockpit__sec--deal|contato|decidir|historico|assistente|ref` set `order: 1..6`. A block without one of those classes falls to `order: 0` and silently jumps to the top of the screen. `deal` and `contato` are separate orders on purpose — blocks sharing an `order` fall back to DOM order, which has contact first, the reverse of what the screen needs
- **Never trust a fixed `min-width`/`max-width` inherited from the HTML handoff**: check it against the sum of the children. `min-width: 1180px` sat on `.cockpit__body` and `.inbox` for four months as "design decision" — the real floors were 1028px and 1104px. It was the handoff file's working width, copied verbatim. `.inbox` still carries it (see `TODOS.md`)
- **A flex item with `flex: 1` that overflows its parent is `min-width: auto`**, the implicit floor at the content's `min-content`. Add `min-width: 0`. And for a stable N-column grid, use `display: grid`, never `flex-wrap` — wrap decides breaks from each label's min-content, so the grid regroups on its own when a label changes at runtime
- **Container query, not media query, for inner width**: the sidebar (236px) and the AI panel (`w-96`, 384px, `Layout.tsx:366`) shrink the content area without touching the viewport, so `@media` never fires. Measured: 256px vs 520px for the same column
- **Layout can't be tested in happy-dom** (no layout engine: `getBoundingClientRect()` returns zeros, `scrollWidth === clientWidth` always). Assert CSS-as-text invariants instead, and verify the real thing by measuring in the browser

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
