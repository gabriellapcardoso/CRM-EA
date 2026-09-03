# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server (porta 3000; se ocupada: fuser -k 3000/tcp)
npm run build        # Build de produção
npm run lint         # ESLint com zero warnings
npm run typecheck    # TypeScript (tsc --noEmit)
npm run test         # Vitest em watch mode
npm run test:run     # Vitest single run
npm run precheck     # lint + typecheck + test:run + build (pré-PR)
npm run precheck:fast # lint + typecheck + test:run (sem build)
npm run stories      # Rodar test/stories/ (testes de comportamento)
```

Teste específico:
```bash
npx vitest run path/to/file.test.ts
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + Auth + Edge Functions) · TanStack Query v5 · Zustand v5 · Tailwind CSS v4 · Radix UI · Zod v4 · AI SDK v6 (OpenRouter — provider único, roteador multi-modelo)

## Arquitetura

### Estrutura de Diretórios

```
app/               # Next.js App Router
  (app)/           # Rotas autenticadas (layout principal)
  (protected)/     # Rotas protegidas por auth
  api/             # API Routes (ai/, messaging/, contacts/, settings/, etc.)
features/          # Módulos por domínio de negócio
  activities/ boards/ contacts/ dashboard/ deals/ inbox/
  messaging/ settings/ ai-hub/ decisions/ reports/
components/        # Componentes React compartilhados (não feature-specific)
  ui/              # Primitivos UI (button, modal, badge, etc.)
  ai/              # UIChat, chat-related
lib/               # Utilitários e serviços compartilhados
  ai/              # AI agent, briefing, few-shot, HITL, tools
  messaging/       # Providers (Meta, Evolution, Resend, Zapi)
  query/           # Query keys factory + hooks TanStack Query
  supabase/        # Clients e helpers Supabase (ver seção abaixo)
  stores/          # Zustand stores (somente UI state efêmero)
context/           # React context providers — fachadas sobre TanStack Query
  AuthContext.tsx  # Fornece user, profile, organizationId, signOut
supabase/
  functions/       # Edge Functions (webhooks de mensageria)
  migrations/      # Migrations SQL
proxy.ts           # Auth proxy Next.js 16+ (NÃO é middleware.ts)
```

### Auth e Routing (Next.js 16+)

**`proxy.ts` (não `middleware.ts`)**: No Next.js 16+, o arquivo de proxy chama-se `proxy.ts` (raiz do projeto). Ele apenas faz refresh de sessão Supabase SSR e redirect para `/login`. **Não intercepta `/api/*`** — Route Handlers respondem 401/403 diretamente (redirect 307 quebraria `fetch`).

```typescript
// proxy.ts usa:
import { updateSession } from '@/lib/supabase/middleware'
```

### Clientes Supabase

Há três clientes com propósitos distintos:

| Cliente | Arquivo | Uso |
|---------|---------|-----|
| Browser SSR | `lib/supabase/client.ts` | Componentes client-side; pode retornar `null` sem `.env` |
| Server SSR | `lib/supabase/server.ts` | Route Handlers e Server Components (usa `server-only`) |
| Service Role | `lib/supabase/staticAdminClient.ts` | IA/ferramentas sem cookies — ignora RLS, sempre filtrar por `organization_id` |

**Importar sempre de `@/lib/supabase`** (barrel export) — nunca de subcaminhos diretamente.

### Variáveis de Ambiente

Supabase introduziu novo formato de chaves (Nov 2025) com fallback de compatibilidade:

```
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  → fallback: NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY                   → fallback: SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SECRET_KEY` é server-only — nunca expor no client.

### Padrões Críticos

**cn utility**: importar de `@/lib/utils` (não `@/lib/utils/cn`)

**Auth**: `useAuth()` de `@/context/AuthContext` retorna `{ user, profile, organizationId, signOut }`

**Query Keys**: todas as queries usam o factory em `lib/query/queryKeys.ts`. **Nunca usar `.all`** em `invalidateQueries`/`cancelQueries` — invalida/cancela o cache inteiro da entidade (todo `detail(id)` aberto incluso), causando refetch/race desnecessários. Usar `.lists()` (entidades simples) ou, pra entidades com sub-caches além de `lists()`/`detail()` (ex: `contacts.paginated()`, `activities.byDeal()`, `messagingConversations.byChannel()`), o predicate `entityCachesExceptDetail(entity)`:
```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() })
queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('contacts') })
queryClient.invalidateQueries({ queryKey: queryKeys.deals.list({ boardId }) })
```

**Cuidado ao cancelar/invalidar com key estreita**: se o `onMutate` também escreve otimisticamente em `entity.detail(id)` via `setQueryData`, `.lists()`/`entityCachesExceptDetail()` **não cobrem esse cache** (ao contrário de `.all`, que cobria por prefix-match). Sem um `cancelQueries({ queryKey: entity.detail(id) })` adicional, um fetch de detail em andamento pode sobrescrever a escrita otimista depois — race condition real, já achada e corrigida em `useUpdateDeal`/`useMoveDeal`/`useUpdateConversation` (ver `DESAFIOS.md`).

**Deals — source of truth única**:
```typescript
// DEALS_VIEW_KEY = [...queryKeys.deals.lists(), 'view']
// Usar esta key em TODOS os pontos de escrita (mutations, Realtime, otimismo)
queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, updater)  // preferível a invalidate
```
Nunca usar `queryKeys.deals.list({ filter })` para optimistic updates — são caches separados.

**AI SDK v6**: usar `generateText + Output.object({ schema })`, resultado em `result.output`
```typescript
// CORRETO
const result = await generateText({ ...options, output: Output.object({ schema: MySchema }) })
result.output // typed result

// ERRADO — API antiga
await generateObject({ ... })
```

**Chaves de API do AI**: ficam em `organization_settings` (banco), não em env vars.
`ai_openrouter_key` é a chave primária (chat/agente). `ai_google_key` é separada,
usada só pro RAG (Google File Search Store) — nunca pro chat.
```typescript
const config = await getOrgAIConfig(orgId) // config.apiKey = ai_openrouter_key; config.ragApiKey = ai_google_key
const model = getModel(config.provider, config.apiKey, config.model)
```

**`ai_model` precisa do formato `provider/model` da OpenRouter** (`deepseek/deepseek-v4-flash`), não do id nativo do provider (`gemini-2.5-flash`). Id sem barra é **descartado** por `getModel` e cai no default — a org rodou meses no default enquanto a tela de settings mostrava outro modelo, e isso só apareceu quando a OpenRouter removeu o modelo default do catálogo e a IA inteira deu 404 (17 arquivos: agente, tarefas, briefing, cron). `getModel` hoje loga alto quando descarta; não remover esse aviso. Guarda: `lib/ai/config.test.ts`.

**Fallback de config tem que ser barulhento.** Descartar valor que alguém escolheu numa tela é evento, não default. Fallback mudo só vale pra config *ausente* (campo vazio, org nova), nunca pra config presente e inválida.

**Alerta que não entrega tem que gritar**: `evolution-health` pulava o e-mail em silêncio quando `organization_settings.alert_email` estava vazio — 4 quedas de canal WhatsApp detectadas, gravadas e nunca reportadas, em 30 dias. Falta de destino configurado agora loga `console.error` no ponto em que o alerta sairia (`app/api/cron/ai-health/route.ts`). Cadência de cron vive **só no agendamento**, nunca em comentário: o antigo dizia "a cada 30min" sobre um `0 9 * * *`. Apontar pro arquivo, não repetir o número.

**Onde cron mora: `vercel.json` só aguenta 2 jobs diários (plano Hobby).** Qualquer coisa além disso faz a Vercel **rejeitar o deployment inteiro sem criar build** — sem falha, sem e-mail, produção congelada no commit anterior até alguém perceber (aconteceu, ~40min). Por isso tudo que roda abaixo de 1x/dia vive em pg_cron + pg_net: `supabase/migrations/*_pg_cron_*.sql` e `*_cron_*.sql`. Hoje o `vercel.json` tem **um** cron (`template-sync`, diário); `stage-evaluations`, `deal-stage-dispatcher`, os dois health checks e o watchdog estão no banco. Antes de mexer no `vercel.json`, ler essas migrations: se existem, o limite já foi batido e já foi resolvido. Ver `AGENTS.md`.

**Health check passa pelo caminho da própria aplicação** (`getOrgAIConfig` + `getModel`), nunca um ping ao fornecedor: em 2026-09-01 o fornecedor estava de pé e a config da org é que estava quebrada — um ping teria reportado tudo saudável. Duas janelas distintas em `ai-health`: 20min decide se é a 2ª falha consecutiva, 4h decide se manda e-mail. Grava sempre, e-mail limitado. A janela precisa ser **maior que a cadência do cron** — se a cadência esticar sem a janela acompanhar, a 2ª falha nunca é reconhecida como consecutiva e o e-mail **nunca sai**, com os registros continuando a ser gravados normalmente. Guarda: `test/aiHealthWindowCadence.test.ts` lê os dois números dos arquivos reais.

**RAG é um segundo caminho de IA, com chave e fornecedor separados** (`ai_google_key` + API nativa do Google, não passa pela OpenRouter). O `ai-health` cobre esse caminho via `verificarCaminhoRAG()` (`lib/ai/messaging/file-search.ts`), chamado **depois** do check de chat passar — se o chat caiu, esse é o problema maior e o motivo do alerta tem que falar dele — e **só** pra org que configurou a chave. Limitação deliberada: a chamada não usa File Search Store (o store é por board, nem toda org tem), então pega chave revogada/cota/modelo fora do catálogo, não pega store apagado.

**Concorrência do health check**: `comLimiteDeConcorrencia()` (`lib/utils/concurrency.ts`, pool de trabalhadores, sem dependência nova) limita a 10 orgs simultâneas. `Promise.allSettled` cru dispara todas de uma vez — o número de chamadas simultâneas à OpenRouter e ao pool do Supabase cresceria junto com o número de orgs, e rate limit vira backoff que estoura o `maxDuration=60` cortando o lote no meio sem registro.

**Failover de modelo** (`AI_FALLBACK_MODELS` em `lib/ai/defaults.ts`): vai no `extraBody` do factory dentro de `getModel`, usando o parâmetro nativo `models` da OpenRouter — assim as 17 chamadas ganham rede de uma vez, em vez de `providerOptions` repetido em cada uma. A lista cobre dois fabricantes de propósito (dois modelos do mesmo fornecedor caem juntos), e todo item precisa de `tools` + `structured_outputs`. Guarda: `lib/ai/failover.test.ts`. Não confundir com `lib/ai/agent/provider-failover.ts`, que faz failover entre *providers* e nunca rodou (só existe a OpenRouter).

**Trocar o formato de um valor que vive no banco é migration também** — a migração pra OpenRouter trocou o formato no código e não migrou as linhas, então o código novo passou a ler dado velho em silêncio.

**Quando o alerta dispara — o que olhar, em ordem.** São três mecanismos com significados diferentes, e confundi-los faz procurar no lugar errado:

| Chegou | Significa | Primeiro lugar pra olhar |
|---|---|---|
| E-mail "IA fora do ar (2 falhas seguidas)" | 2 execuções seguidas do `ai-health` falharam a chamada real de IA | `organization_settings.ai_model` e `ai_openrouter_key` da org citada — o motivo vem no corpo do e-mail, já redigido |
| E-mail "IA rodando no modelo de reserva" | A app está **de pé**, mas o modelo configurado não atendeu e o failover resgatou | Trocar `ai_model` pro id que respondeu (vem nomeado no e-mail); o configurado provavelmente saiu do catálogo |
| E-mail "Cron X parou de reportar" | `check_cron_heartbeats()` viu heartbeat velho — o cron parou, não a IA | `select * from cron.job` (o job existe?), depois se o `CRON_SECRET` do pg_cron bate com o da Vercel |
| **healthchecks.io ficou vermelho** | O ping parou de chegar: pg_cron, Supabase ou o watchdog inteiro pararam | Supabase está no ar? `select * from cron.job_run_details order by start_time desc limit 5` |

O healthchecks.io é o único que **não** depende de nada nosso — se ele alertou e os e-mails não, o problema é maior que a IA. Check `crm-ea-ai-watchdog`, ping a cada 10min pelo `check_cron_heartbeats()`, só quando **nenhum** heartbeat está atrasado (ping incondicional mentiria durante incidente).

**Autenticação das rotas de cron**: `autenticaCron(req)` de `lib/security/cronAuth.ts` — `timingSafeEqual`, compartilhado pelas 4 rotas (`ai-health`, `evolution-health`, `stage-evaluations`, `template-sync`), que antes duplicavam a mesma comparação `!==` cada uma. Rota de cron nova usa essa função, não reimplementa.

**Texto de erro de provider é redigido antes de sair da aplicação**: `redactSecrets()` de `lib/security/redactSecrets.ts` cobre `sk-`, `re_`, `eyJ...` e `Bearer <token>`. Aplicado na **origem** (dentro do catch de `checarIA`), não em cada consumidor — o motivo vai pro banco e pro corpo do e-mail sem mais nenhum filtro depois dali, e provedores às vezes ecoam parte da chave recebida na mensagem de erro.

**Migration com placeholder de segredo: a guarda não pode comparar o valor contra uma cópia dele mesmo.** `IF position('__X__' in $g$__X__$g$) > 0` parece checar "o placeholder ainda está aqui?", mas o find-and-replace da hora de aplicar troca **os dois lados** igualmente — depois de substituído, `'valor' in 'valor'` continua verdadeiro e a guarda dispara sempre, pra qualquer valor. Aconteceu em produção: SQL colado já correto, erro assim mesmo. O canário tem que ser escrito **quebrado**, concatenado em runtime, pra o `sed` não alcançá-lo:
```sql
valor_no_arquivo TEXT := '__CRON_SECRET__';
canario_do_placeholder TEXT := '__CRON' || '_SECRET__';
IF valor_no_arquivo = canario_do_placeholder THEN RAISE EXCEPTION ...
```
Modelo correto em `20260904000000_pg_net_timeout_health_checks.sql`; o formato quebrado ainda existe em `20260901180000_pg_cron_health_checks.sql` (histórica, já aplicada, não editar — ver `TODOS.md`).

**Realtime**: invalidação targeted em `lib/realtime/useRealtimeSync.ts` — nunca invalidar globalmente. UPDATE/DELETE usam debounce; INSERT não.

**Sanitize**: usar `sanitizePostgrestValue()` e `sanitizeUrl()` de `lib/utils/sanitize.ts`

**RLS defense-in-depth**: todas as queries filtram por `organization_id` além do RLS — especialmente crítico com service role (IA/tools).

**maybeSingle() vs single()**: usar `.maybeSingle()` para lookups que podem retornar 0 rows; `.single()` lança erro se não encontrar.

**Soft-delete**: 8 tabelas usam `deleted_at` — `deals`, `contacts`, `crm_companies`, `activities`, `boards`, `business_units`, `messaging_channels`, `organizations`. Exclusão no app é UPDATE, não DELETE. **Toda query de leitura precisa de `.is('deleted_at', null)`**, incluindo contadores (`count: 'exact'`), lookups por nome e updates em massa — não só listagens. Sem isso o registro "excluído" continua aparecendo na tela e somando valor (bug real: board somava R$5.600 de deals já excluídos; auditoria seguinte achou o mesmo em Atividades e Empresas). Guarda: `test/softDeleteFilters.test.ts`. **Exceção a avaliar caso a caso:** webhooks/idempotência podem precisar enxergar o registro excluído — ver `TODOS.md`, item da camada de IA/MCP.

**Schema Supabase**: tabela `board_stages` (não `stages`), coluna `"order"` (não `position`)

**Sidebar e `--app-sidebar-width`**: a largura da barra lateral vive na CSS var `--app-sidebar-width`, setada só pelo `Layout` via `getSidebarWidth(mode, sidebarHidden)` (função pura exportada, testada em `test/sidebarWidth.test.ts`). **~30 modais posicionam o overlay com `md:left-[var(--app-sidebar-width)]`** — mexer nessa var sem manter a função como fonte única desloca todos eles de uma vez. Estados: `sidebarHidden` é a preferência explícita do usuário (persistida em `localStorage` como `crm_sidebar_hidden`, lida só após o mount pra não dar mismatch de hidratação); `sidebarCollapsed` é automático/efêmero e hoje **não é lido por ninguém** (ver `TODOS.md`). Não juntar os dois: o automático desfaria a escolha da pessoa.

**Cockpit do deal — coluna única (2026-08-31)**: a tela era um grid de 3 painéis com 3 rolagens e `min-width: 1180px`. Virou uma coluna com uma rolagem só. Os painéis (`.cockpit__aside`, `.cockpit__center`) são `display: contents` — **regra de layout, não de DOM**: eles continuam sendo os filhos diretos de `.cockpit__body` na árvore, então seletor `>` alcança os painéis (sem caixa), não os blocos. Usar descendente. A ordem das seções vive nas classes `.cockpit__sec--deal|contato|decidir|historico|assistente|ref` (`order: 1..6`); bloco sem classe cai em `order: 0` e vai pro topo da tela sem avisar. `deal` e `contato` são separados porque blocos com o mesmo `order` caem na ordem do DOM, e ali o contato vem antes — o inverso do que a tela pede. Guarda: `test/cockpitLayout.test.ts`.

**Layout não é testável em happy-dom** (sem engine de layout: `getBoundingClientRect()` devolve zero, `scrollWidth === clientWidth` sempre). Teste de "não estoura" renderizando componente é falso-positivo. Afirmar invariantes do CSS como texto e medir no browser.

**Largura interna é caso de container query, não media query**: a sidebar (236px) e o painel de IA (`w-96`, `Layout.tsx:366`) encolhem a área útil sem mexer no viewport, então `@media` não dispara.

### AI — Fluxo de Dados

Dois caminhos distintos:

1. **Chat interativo (streaming)**: `UIChat` → `POST /api/ai/chat` → `lib/ai/crmAgent.ts` → ferramentas em `lib/ai/tools.ts`
2. **Tasks / structured output**: `lib/ai/tasksClient.ts` → `app/api/ai/tasks/**/route.ts`

**HITL (Human-in-the-Loop)**:
- `confidence >= hitlThreshold` (default 0.85) → avança automaticamente
- `0.70 <= confidence < hitlThreshold` → cria `ai_pending_stage_advances` (aprovação humana)
- `confidence < 0.70` → não sugere avanço

**Segurança de prompt**: todo conteúdo de mensagem do usuário vai dentro de `<lead_message>` tags — nunca interpolar diretamente no system prompt.

### Supabase Edge Functions

Webhooks de mensageria são Edge Functions (não API Routes):
- `messaging-webhook-evolution` — Evolution API (WhatsApp)
- `messaging-webhook-meta` — Meta Cloud API (WhatsApp + Instagram)
- `messaging-webhook-resend` — Email via Resend
- `messaging-webhook-zapi` — Z-API (WhatsApp)

Webhooks retornam HTTP 200 mesmo em erros de processamento (evita retry storms).

### Credenciais de Canal

Credenciais nunca retornam ao client em list queries — só no detail query para edição, mascaradas.

### Feature Flags

Controladas por `instanceFlags` (operador) via `queryKeys.instanceFlags.byOrg(orgId)`.

### Testes

- Testes unitários: arquivos `.test.ts(x)` ao lado do código-fonte (features/components)
- Testes de comportamento (user stories): `test/stories/`
- Testes de integração/agent: diretamente em `test/`
- Setup: `test/setup.ts` (carrega `.env.local`, mock `server-only`) + `test/setup.dom.ts` (jest-dom, polyfills)
- Ambiente padrão: `happy-dom` (todos os testes rodam com DOM)

### Migrations

Migrations em `supabase/migrations/` com timestamp `YYYYMMDDHHMMSS`. Sempre idempotentes (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Não deletar migrations históricas — tabelas legadas (`voice_calls`, `whatsapp_calls`) existem no banco sem código correspondente.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
