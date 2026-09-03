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

## Alerting Rules
- **A silent `return` when an alert can't be delivered is a second bug, not a normal path.** `evolution-health` skipped the email whenever `organization_settings.alert_email` was empty, and did it quietly — 4 WhatsApp outages detected, logged, and never reported, over 30 days. Missing delivery config must `console.error` at the moment the alert would have been sent
- **Smoke-test the delivery channel the day it is configured.** Send one real alert and confirm it arrives. A monitoring system nobody has ever seen fire is indistinguishable from a broken one
- **Vercel plan is Hobby: max 2 cron jobs, daily cadence only.** Anything else in `vercel.json` is rejected and **no deployment is created at all** — no failed build, no error email, just production frozen on the previous commit. Sub-daily crons go through pg_cron + pg_net (`supabase/migrations/*_pg_cron_*.sql`), which is why `stage-evaluations` and the health checks live there
- **Before editing `vercel.json`, read the pg_cron migrations.** If they exist, the plan limit was already hit and already solved. Guard: `test/vercelCronLimit.test.ts` fails on a 3rd cron or any sub-daily schedule — prose alone did not stop this from happening twice
- **Cron cadence lives in the pg_cron migration, not in comments.** A comment claiming "runs every 30min" sat above a `0 9 * * *` schedule; nothing verifies prose. Point at the file, never restate the number
- **Two windows in `ai-health`, easy to conflate:** the 20min window decides whether this failure is the 2nd consecutive one; the 4h cooldown decides whether to send email. Record always, email rate-limited — an overnight outage would otherwise send 90+ emails and bury the real alert
- **Health checks go through the app's own code path** (`getOrgAIConfig` + `getModel`), never a bare ping to the vendor. On 2026-09-01 the vendor was up and the org's config was broken; a ping would have reported healthy
- **The consecutive-failure window must be wider than the cron cadence.** Stretch the schedule without widening the window and the 2nd failure is never recognized as consecutive — the email stops going out entirely while rows keep being written, so everything *looks* fine. Guard: `test/aiHealthWindowCadence.test.ts` reads both numbers from the real files
- **A migration whose placeholder guard compares the placeholder to a copy of itself always fires.** `IF position('__X__' in $g$__X__$g$) > 0` looks like "is the placeholder still here?", but find-and-replace substitutes **both sides** — after substitution `'value' in 'value'` is still true, so the guard rejects every value, including the correct one. It happened in production: correct SQL pasted, error anyway. Write the canary **split**, concatenated at runtime (`'__CRON' || '_SECRET__'`), so `sed` can't reach it. Correct model: `20260904000000_pg_net_timeout_health_checks.sql`

## Testing Rules
- **A guard test is worth nothing until it has failed on purpose.** Write it, watch it pass, then reintroduce the bug in the production code, confirm red, restore, confirm green. Three separate tests in this repo passed while the thing they claimed to protect was broken: a placeholder guard that always fired, a `toContain` matching a code *comment* instead of functional code, and a block count with `toBeGreaterThanOrEqual` that left four slots of slack. State the injected regression in the PR description
- **Text-based guard tests must strip comments before matching.** Reading source as text is a legitimate pattern here (mounting a 2600-line component to check one string costs more than it protects), but a `toContain` will happily match the explanatory comment you just wrote above the code. When the target becomes an exported pure function, stop grepping and call the function instead
- **Never write a secret that appeared in the conversation into any file**, not as an example, not as a test fixture, even if it is already marked compromised and about to be rotated. Fixtures must look obviously fake (`re_fake000_...`, `sk-aaaaaaaa...`). Run the PII scan on the staged diff before every commit — the repo is public

## Merge Authorization (this repo only)
- **Standing authorization, granted 2026-09-03 by the founder/owner of this repo:** an agent may **merge its own PRs here without asking each time**, once `npm run precheck:fast` is green (lint + typecheck + tests) and the PII scan on the staged diff is clean. This overrides the per-action rule in the global `~/AI/AGENTS.md` §19.1 for **merge, in this repository only** — the global file itself says a project rule wins on what is specific to that project
- **Why it was granted:** the 2026-09-01/02 session opened 13 PRs and asked the owner to type "merge" 14 times, including for a one-line doc change. The gate was costing attention without catching anything — every one was approved
- **Explicitly NOT covered, still needs asking every time:** `git push --force`, anything in global §19.2 (destructive git, `rm -rf`, resetting branches), applying migrations or any change to the **production database**, rotating or entering credentials, and anything touching auth/RLS/policies (global §19.4). Those stay per-action, no exceptions
- **Revocable:** the owner can withdraw this by deleting this section. An agent that finds it absent goes back to asking

## PR Granularity Rules
- **One PR per code fix, one PR for all the documentation.** A code fix earns its own PR: it can be reverted alone, and the PR body is where the bug's story lives. Documentation cannot be reverted in isolation and nobody bisects a `.md` — batching it costs nothing and saves the reviewer a round trip
- **Each PR spends someone else's attention, not just yours.** In the 2026-09-01/02 session this repo took 13 PRs, 4 of which were documentation-only — one changed a single line of `TODOS.md`. Every one made the maintainer stop, read, and type "merge". The right count was ~8. Before opening a PR that touches no code, ask whether it can wait and ride along with the next one
- **A fix for a bug introduced by the PR merged 20 minutes ago belongs with it, not after it** — unless the original already shipped to production, in which case the follow-up PR is the honest record

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
