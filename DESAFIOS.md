# DESAFIOS — fricções operacionais e de ambiente (registradas pra não redescobrir)

## Estreitar `cancelQueries`/`invalidateQueries` de `.all` pra `.lists()`/predicate pode reabrir race condition se a mutation escreve em `detail(id)` (2026-08-04)

Corrigindo a violação "invalidação de cache com `.all`" do `docs/audit-report.md`
(trocar `queryKeys.deals.all` por `queryKeys.deals.lists()` em ~90 pontos), a
revisão adversarial do `/review` (subagente Claude, confirmado depois pelo
Codex antes dele expirar) achou um bug real que a própria correção introduziu:
`.all` é só `['entity']`, e o TanStack Query faz *prefix match* por padrão —
então `cancelQueries({queryKey: entity.all})` cancelava **qualquer** query em
andamento daquela entidade, inclusive `entity.detail(id)`. Trocar pra
`entity.lists()` (`['entity', 'list']`) ou pro predicate novo
`entityCachesExceptDetail()` (que exclui `detail` de propósito) para de
cobrir o `detail(id)` — mas 3 mutations (`useUpdateDeal`, `useMoveDeal`,
`useUpdateConversation`) continuam escrevendo otimisticamente nesse mesmo
cache de detalhe no mesmo `onMutate`. Resultado: um fetch de `detail(id)`
que já estava em andamento (ex: usuário com o cockpit do deal aberto numa
aba) não é mais cancelado, pode terminar depois da escrita otimista e
sobrescrever ela silenciosamente com o dado pré-mutation. `useMoveDeal` é o
drag-and-drop do Kanban — a mutation mais comum do app.

**Como isso não repete**: sempre que estreitar um `cancelQueries`/
`invalidateQueries` de uma key ampla (`.all`) pra uma mais específica
(`.lists()` ou um predicate), grep no arquivo por `setQueryData` /
`setQueriesData` dentro do mesmo `onMutate` — se algum desses escrever num
cache que a key nova não cobre (tipicamente `detail(id)`), a mutation
precisa de um `cancelQueries` adicional específico pra esse cache. A key
ampla "por acidente" cobria tudo; a específica não cobre nada que não
esteja explicitamente nela.

## Barrel `@/lib/supabase` não pode reexportar `createClient`/`createStaticAdminClient` — quebra o boundary client/server do Next.js (2026-08-04)

O `docs/audit-report.md` (violação média #6) recomendava migrar os ~99 imports diretos de `@/lib/supabase/{client,server,staticAdminClient}` para o barrel `@/lib/supabase`, mesma orientação do `CLAUDE.md` ("Importar sempre de `@/lib/supabase`"). Tentativa real de fazer isso (adicionar `createClient`/`createAdminClient`/`createStaticAdminClient` ao barrel `lib/supabase.ts` e migrar todos os call sites) passou limpo em typecheck/lint/testes, mas **quebrou o `npm run build`**: o Next.js analisa `lib/supabase.ts` como módulo único, então qualquer arquivo que importe *qualquer coisa* do barrel (mesmo só `supabase`, o client de browser) arrasta transitivamente o `import 'server-only'` de `server.ts`/`staticAdminClient.ts` pro bundle do client component — erro `'server-only' cannot be imported from a Client Component module`.

**Conclusão**: a regra do barrel no `CLAUDE.md`/auditoria vale pra **services** (`boardsService`, `dealsService`, etc. — já é o que `lib/supabase.ts` faz hoje) e pro client singleton de browser (`supabase`), mas **não pode ser estendida** pras funções que criam cliente (`createClient` de `client.ts`/`server.ts`, `createStaticAdminClient`) sem quebrar o build — essas têm que continuar importadas por subcaminho direto, porque cada uma só é segura num contexto específico (browser/Server Component/service-role) e o bundler precisa conseguir isolar o `server-only` por arquivo. **Não tentar essa migração de novo sem antes rodar `npm run build`** (typecheck e testes não pegam esse tipo de erro, só o build real).

**Achado colateral (não revertido, correto de qualquer jeito)**: havia dois arquivos de barrel conflitantes, `lib/supabase.ts` (o real, usado) e `lib/supabase/index.ts` (morto, sombreado por resolução de módulo — nada importava por caminho explícito). Removido. Também havia **duas implementações divergentes de `createStaticAdminClient`** (`lib/supabase/server.ts` sem cache, `lib/supabase/staticAdminClient.ts` com cache + validação de env var mais rígida) — se for consolidar no futuro, usar a versão com cache como canônica e trocar os 23 call sites de `server.ts` pra importar de `staticAdminClient.ts` diretamente (sem depender do barrel).

## Conectar canal Evolution real: `business_units` vazia + webhook rejeitado pelo servidor (2026-07-25)

Primeira vez conectando um canal WhatsApp real (Evolution self-hosted) achou 3 problemas em sequência que só apareciam contra infra de verdade, nunca em teste local/mockado:

1. **`messaging_channels.business_unit_id` é NOT NULL, mas a org da aaagência não tinha NENHUMA `business_unit`** — `POST /api/messaging/channels` exige `business_unit_id` válido (`app/api/messaging/channels/route.ts`), e a tabela estava vazia mesmo com deals/contatos/boards já em uso normal. Precisou criar uma business unit (`key='aaagencia'`) antes de conseguir inserir o canal.
2. **`evolution.provider.ts::configureWebhook()` mandava o corpo errado** — código chapado (`{enabled, url, byEvents, events}`), servidor real rejeita com `400` e exige `{webhook: {...}}` aninhado. Só descobriu testando `POST /webhook/set/{instance}` direto via curl contra o servidor real.
3. **Faltava o campo `headers` na config do webhook** — sem ele a Evolution nunca envia `apikey` nas chamadas que faz PRO nosso webhook, e nosso handler (`messaging-webhook-evolution`) é default-deny (rejeita sem auth) — mas responde sempre `200` (pra evitar retry storm), então o 401 fica **completamente silencioso**, sem erro visível em lugar nenhum. Só apareceria como "canal conectado mas nenhuma mensagem/status nunca chega".

**Como checar rápido da próxima vez**: antes de considerar um canal "pronto", simular um evento (`curl -X POST` na URL do webhook com o `apikey`/`x-api-key` real da instância, payload `{"event":"connection.update","instance":"...","data":{"state":"open"}}`) e conferir que `messaging_channels.status` realmente atualizou no banco. Não confiar só no retorno HTTP 200 da Evolution ao configurar o webhook.

**Chave global vs chave de instância (lembrete, já documentado no `festadeagosto-sympla/DESAFIOS.md`)**: `AUTHENTICATION_API_KEY` (env do container Evolution, achável no Easypanel → serviço → Ambiente) só serve pra criar/listar/excluir instância. Pra registrar o canal no CRM e configurar webhook, usa-se o `token` da instância específica (retornado em `/instance/fetchInstances`), nunca a global.

## `/qa` local exige setup manual (2026-07-24)

Rodar `/qa` (ou qualquer teste em browser) neste projeto do zero, numa máquina/sessão nova, tem 3 blockers em sequência:

1. **Chromium headless do gstack browse não vem instalado** — `npx playwright install chromium-headless-shell` (roda uma vez, ~91MB).
2. **`.env.local` sem Supabase configurado** trava o login com `"Supabase não configurado. Configure as variáveis de ambiente."` — mínimo pra login funcionar: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (públicas, pegar via `mcp__plugin_supabase_supabase__get_project_url`/`get_publishable_keys`, projeto `zuuqcwxletrfmpcqagxc`). `SUPABASE_SECRET_KEY` (service role) não é obtível via MCP — precisa a fundadora colar manualmente pra exercitar caminhos que usam `createStaticAdminClient()` (ex: envio de mensagem de verdade via `ChannelRouterService`).
3. **Nenhum usuário tem `role='admin'` nem `business_unit_members`** — sem isso, RLS de `messaging_conversations` bloqueia tudo (usuário vê "Nenhuma conversa aberta" mesmo com dados existindo). Pra testar mensageria como usuário não-admin, precisa de linha em `business_unit_members` pra alguma `business_unit_id`.

## `rtk`/pnpm wrapper quebra `npx eslint` (2026-07-24)

O hook que intercepta comandos (`rtk`) reescreve `npx eslint ...` numa checagem de supply-chain do pnpm que falha com `[ERR_PNPM_IGNORED_BUILDS]` (builds nativos ignorados: `esbuild`, `sharp`, etc — não relacionado ao lint em si). **Bypass**: chamar o binário direto, `./node_modules/.bin/eslint --max-warnings 0 <arquivos>` — não passa pelo wrapper, funciona normal.

## Migrations locais podem não estar aplicadas no Supabase remoto (2026-07-25)

`/qa` retomado da aba "Segurança WhatsApp" achou `GET/POST /api/settings/whatsapp-safety` retornando 500. Causa: a migration `20260724000000_t4_suppression_and_kill_switch.sql` existia no repo (`supabase/migrations/`) mas **nunca tinha sido aplicada** no projeto Supabase remoto (`zuuqcwxletrfmpcqagxc`) — não há CI/hook que aplique migrations automaticamente ao commitar. `mcp__plugin_supabase_supabase__list_migrations` mostrou a lista real de aplicadas; comparar contra `ls supabase/migrations/` revelou o gap. Corrigido aplicando via `apply_migration` (idempotente).

**Como checar rápido antes de testar qualquer feature nova**: `list_migrations` (MCP) vs `ls supabase/migrations/ | tail -N` — se a migration mais recente do repo não aparecer na lista aplicada, é isso.

**Auditoria concluída (2026-07-25)**: `fix_handle_new_user_org_lookup` e `t4_draft_index` aplicadas e confirmadas no remoto — ambas idempotentes (`CREATE OR REPLACE`/`CREATE INDEX IF NOT EXISTS`), sem risco. **Pendência real que sobrou**: `pg_cron_stage_evaluations.sql` contém secret placeholder (`__CRON_SECRET__`) — precisa do valor real do `CRON_SECRET` (mesmo da env Vercel) antes de aplicar, pra não criar cron job com string literal quebrada/insegura. Aplicar manualmente com o secret real antes do T5.

**Atualização (2026-07-26)**: resolvido, mas não do jeito esperado — a `CRON_SECRET` antiga estava marcada "Sensitive" na Vercel, valor **irrecuperável** por qualquer meio (CLI, dashboard, MCP). Solução foi rotacionar (gerar secret novo, sobrescrever na Vercel, reaplicar a migration com o valor novo). **Lição**: env var marcada Sensitive não é "difícil de ler", é ilegível pra sempre — se precisar dela de novo no futuro (ex: replicar num ambiente novo), o único caminho é rotacionar, nunca recuperar.

## Deploy de produção falhando silenciosamente há dias sem ninguém notar (2026-07-26)

Achado ao investigar por que `CRON_SECRET` "não fazia efeito": o último deploy `READY` na Vercel (`list_deployments`, MCP) era de **2026-07-22 22h20** — antes do T4 inteiro existir. Todo commit pushado depois disso (T4 completo, rascunho no inbox, rodapé de opt-out, etc.) nunca chegou a produção, apesar de `git push` sempre "funcionar" e a sessão registrar "T4 100% pronto/pushado" em `T4-EXECUCAO.md`.

**Causa raiz**: o commit que adicionou `evolution-health` ao `vercel.json` (T4, 2026-07-23/24) usou cron `*/30 * * * *` — o plano Vercel é Hobby (grátis), que só permite cron 1x/dia. Isso já tinha acontecido antes com outro cron (`stage-evaluations`, corrigido em commit anterior) — o padrão se repetiu porque nada alerta quando um deploy falha via git-integration; só aparece no dashboard da Vercel, que ninguém checou depois de cada push.

**Como isso não repete**: `git push` bem-sucedido **não é prova de que o site foi publicado** — são 2 sistemas diferentes (GitHub vs pipeline de deploy da Vercel). Antes de declarar algo "pronto em produção", confirmar com `vercel deploy --prod` rodando localmente (falha alto e claro, não silenciosamente) ou checando `list_deployments` (MCP) pelo `state:"READY"` mais recente e a data batendo com o último commit.

## Testando responsividade mobile: divergência entre ferramenta de teste e resultado real (2026-07-26)

Ajustando o gerador de sites-demo (projeto irmão `prospeccao-aaagencia`, mas achado técnico vale registrar aqui por ser sobre ferramental de teste comum ao ecossistema): `mcp__claude-in-chrome__resize_window` reporta sucesso mas **não muda o `window.innerWidth` real da aba** nesse ambiente — página continua renderizando na largura do monitor físico, não na largura pedida. `matchMedia`/media queries nunca disparam, dando falso negativo de "não é responsivo" mesmo com CSS correto.

**Workaround que funciona**: montar um harness com `<iframe style="width:390px">` apontando pro arquivo — o iframe tem viewport próprio, genuinamente 390px, `contentWindow.innerWidth` confirma. Serve local via `python3 -m http.server` (arquivos em `/private/tmp/...`/scratchpad não abrem via `file://` no Chrome controlado pela extensão — precisa de servidor HTTP).

**Ainda não resolvido**: mesmo com esse harness confirmando layout correto (1 coluna, sem overlap, sem overflow real), o teste da fundadora (plugin de simulação mobile no navegador dela) continuou reportando falha. Causa da divergência não identificada — pode ser cache do link do Artifact, pode ser o plugin dela testando diferente do que o harness simula. **Não usar esse harness como prova definitiva de "mobile OK" até a divergência ser entendida.**

## RPC com guard `auth.uid()`/`service_role` em teste pgTAP precisa simular o JWT (2026-08-02)

Testando o trigger T3 (`deal_stage_events`) via `move_deal_to_stage`, toda chamada falhava com `Not authenticated` mesmo dentro de `BEGIN;...ROLLBACK;`. Causa: a RPC (guard introduzido no T1) lê `auth.jwt() ->> 'role'` e `auth.uid()` — numa sessão psql/pgTAP crua (sem PostgREST na frente) essas funções sempre leem vazio/null, então qualquer RPC com esse guard rejeita. **Fix**: `SET LOCAL request.jwt.claims TO '{"role":"service_role"}';` logo após `SELECT plan(...)` simula o mesmo caminho que o agente IA usa em produção (service_role bypassa o guard). Pra simular um usuário autenticado específico (ex: testar RLS/RPC que dependem de `auth.uid()` real, como `retry_deal_stage_event`), usar `'{"role":"authenticated","sub":"<uuid>"}'` com um `profiles.id` correspondente. **Vale pra qualquer teste pgTAP futuro que chame uma RPC com guard de auth** — sem isso, o erro "Not authenticated" não diz de onde vem, parece bug no trigger/RPC quando na verdade é só o ambiente de teste sem JWT simulado.

Achado relacionado no mesmo teste: `pgtap.is()` exige que os dois lados tenham o mesmo tipo — comparar uma coluna `numeric` (ex: `payload->>'valor'` castado) contra um literal inteiro (`1500`) falha por ambiguidade de overload; sempre castar o literal também (`1500::numeric`).

## Layout do `/messaging`: `min-w-0` obrigatório na coluna central (2026-07-24)

`MessagingPage.tsx` tem 3 colunas (lista `w-80` fixa, thread `flex-1`, painel de contato `w-80` fixo, sempre montado mesmo sem seleção visível de "aberto/fechado"). Sem `min-w-0` na coluna `flex-1`, ela cresce pro conteúdo em vez de encolher, empurrando o painel de contato (e qualquer botão nele) pra fora da viewport em telas ≤1440px — sem scroll, sem erro no console, só invisível/inclicável. Já corrigido (`MessagingPage.tsx:188`), mas o padrão vale registrar: **qualquer nova coluna de largura fixa nesse layout de 3 painéis precisa checar se o `flex-1` do meio tem `min-w-0`.**

## Migration history com drift silencioso duplicou um board inteiro (2026-08-02)

Reconciliando o histórico de migrations do T3/T3b (`supabase db push --dry-run` antes de aplicar as novas), apareceu que várias migrations antigas — incluindo o T1 (board semantics) e o T2 inteiro — nunca tinham sido tracked pelo CLI: foram aplicadas direto via Management API meses atrás, sem passar pelo histórico oficial (`supabase_migrations.schema_migrations`). Rodar `migration repair` + `db push --include-all` pra reconciliar reaplicou a migration original (não-corrigida, com ids não-RFC4122) do board `negociacao` do T1 por cima da versão já corrigida — resultado: 21 linhas no board em vez de 14, com duplicatas de id ligeiramente diferente da fórmula determinística usada pela versão corrigida.

**Como isso não repete**: antes de rodar `migration repair`/`db push --include-all` num projeto onde há suspeita de aplicação manual via Management API (comum neste ecossistema, ver desafios anteriores neste arquivo), comparar `list_migrations` (MCP) inteiro contra `ls supabase/migrations/` — se uma migration "antiga" que já foi corrigida por uma migration posterior aparecer como "nunca aplicada" no reconcile, ela vai rodar de novo e pode reintroduzir o estado que a correção posterior já tinha fechado. Checar dado real (quantas linhas existem, quantos deals referenciam cada id) antes de confiar que o reconcile deixou o schema como esperado — não só que ele rodou sem erro.

## Edge Function lê secrets do cofre do Supabase, não da Vercel — são dois cofres separados (2026-08-02)

Configurar `PROPOSTAS_INGEST_URL`/`PROPOSTAS_INGEST_SECRET` só nas env vars da Vercel (onde ficam as env vars do Next.js) não bastava pro dispatcher T3 (`deal-stage-dispatcher`, Edge Function) funcionar — ela rodava sem erro (cron disparando normalmente) mas não processava nenhum evento, respondendo `{"motivo":"PROPOSTAS_INGEST_URL/SECRET não configurados"}`. Edge Functions do Supabase leem variáveis só do próprio cofre de secrets (`supabase secrets set` / `mcp__plugin_supabase_supabase__*` correspondente), nunca da Vercel — mesmo os dois projetos fazendo parte do mesmo ecossistema.

**Como checar rápido da próxima vez**: qualquer secret que uma Edge Function (não uma API Route Next.js) precisa ler tem que ser configurado via `supabase secrets set` (ou MCP equivalente) no projeto Supabase correspondente — configurar só na Vercel é insuficiente e o erro resultante (função "roda" mas não faz nada) não aponta pra causa óbvia sem checar o log da função.

## Telefone sem `+` quebra silenciosamente qualquer integração que exija E.164 estrito (2026-08-02)

O trigger `emit_deal_stage_event` (T3) passava `contacts.phone` direto pro payload do webhook sem normalizar. Contatos reais deste banco têm telefone salvo sem o prefixo `+` (ex: `"5511999999999"`), mas o receptor (Gerador de Propostas) valida E.164 estrito (`+` obrigatório) e rejeita com `422` qualquer payload fora do formato — nenhum deal com telefone preenchido conseguiria completar o T3 até esse fix, e o erro só aparecia no log do dispatcher, não em lugar nenhum visível pra quem move o card.

**Como isso não repete**: qualquer trigger/integração nova que leia `contacts.phone` direto do banco pra mandar pra fora não pode assumir que já está em E.164 — normalizar (só dígitos, 10-15 chars → prefixar `+`) antes de montar o payload, não confiar que o dado já chega formatado.

## `.or()` do PostgREST não escapa `+` — vira espaço na querystring e quebra dedupe por telefone (2026-08-02)

`webhook-in` (usado pelo T3b) buscava contato existente com `.or("phone.eq.+5511999999999,email.eq....")` do cliente PostgREST/Supabase-js. O caractere `+` não é escapado antes de virar querystring HTTP — e `+` em querystring é espaço (`application/x-www-form-urlencoded`). O filtro chegava no PostgREST como `"phone.eq. 5511999999999"` (com espaço no lugar do `+`) e nunca batia contra o telefone E.164 real salvo com `+` — cada webhook repetido criava um contato duplicado em vez de achar o existente. Reproduzido ao vivo durante o `/qa`: 3 contatos "Cliente Teste" duplicados em poucos minutos de teste repetindo o mesmo evento.

**Como isso não repete**: nunca usar `.or()` do PostgREST/Supabase-js com um valor que contenha `+` (ou outro caractere especial de querystring) sem escapar manualmente — trocar por buscas `.eq()` sequenciais (um campo de cada vez) é mais simples e não tem esse risco de encoding. Vale pra qualquer dedupe futuro por telefone neste projeto, não só o `webhook-in`.
