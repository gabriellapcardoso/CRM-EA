# DESAFIOS — fricções operacionais e de ambiente (registradas pra não redescobrir)

## `fixed inset-0` + `w-screen h-screen` juntos cortam painel fora da tela dentro de ancestral com `transform` (2026-08-06)

`features/inbox/components/FocusContextPanel.tsx` (painel de detalhe do
Inbox, 3 colunas) usava `fixed inset-0 w-screen h-screen` no container raiz.
Parece redundante mas não é: quando `width`/`height` são especificados
explicitamente (`w-screen`=100vw, `h-screen`=100vh), o navegador recalcula a
posição do elemento `fixed` a partir de `left`+`width` em vez de resolver
`right:0`/`bottom:0` do `inset-0` — e um ancestral qualquer com `transform`
ativo (aqui, o `motion.div` do framer-motion durante a animação de abertura)
vira o *containing block* de todo `position: fixed` descendente, no lugar do
viewport real. Resultado: o painel nasce deslocado pelo `left` herdado (a
largura da sidebar, 236px) e o `w-screen` soma 100vw a partir desse ponto —
sobra exatamente uma faixa do tamanho da sidebar cortada na borda direita,
sem overflow visível, sem erro de console. Sintoma reportado pelo usuário:
"não vejo o painel de Chat IA/Notas, não dá pra fechar" (o botão de fechar
também ficava na faixa cortada).

**Como isso não repete**: `fixed inset-0` sozinho já ocupa o containing
block inteiro — nunca empilhar `w-screen`/`h-screen` (ou qualquer
`width`/`height` explícito) em cima de `inset-0` num elemento `fixed`. Se o
elemento precisa mesmo de dimensão explícita por algum motivo, usar `w-full
h-full` (relativo ao containing block, não ao viewport) em vez de `w-screen
h-screen`. Vale auditar outros overlays do projeto que combinem
`fixed`/`absolute` com `w-screen`/`h-screen` dentro de qualquer ancestral
animado por framer-motion (`motion.div` com `scale`/`transform`) — o mesmo
padrão pode se repetir em qualquer modal full-screen novo.

## Modal de detalhe do board (`DealDetailModal`) ficou de pé mas parou de ser o caminho real de uso (2026-08-06)

QA revelou que o board (`/boards`) nunca navegava pra `/deals/[id]/
cockpit-v2` (página cheia, redesenhada e testada desde a 5ª rodada de QA) —
o clique no card sempre abriu `DealDetailModal` (modal condensado antigo,
título/estágios/botões sobrepostos em telas normais). Corrigido religando o
clique (`features/boards/components/PipelineView.tsx`) pra `router.push`
até o cockpit-v2 em vez de `setSelectedDealId` abrir o modal.

**Pegadinha pra quem for mexer aqui de novo**: `DealDetailModal.tsx`
continua existindo no repo (~1400 linhas) e continua coberto por
`DealDetailModal.test.tsx` e `test/stories/US-001-abrir-deal-no-boards.
test.tsx` (que o renderizam isolado, fora do fluxo real do board) — não é
dead code no sentido de "sem teste", mas é dead code no sentido de "nenhum
caminho de clique real do usuário chega nele mais". Antes de investir tempo
consertando um bug visual *dentro* do `DealDetailModal`, confirmar primeiro
se o board realmente ainda abre ele (pode não abrir mais, dependendo de
mudanças futuras) — e considerar deletar o componente + os 2 testes numa
limpeza futura, já que o cockpit-v2 cobre o mesmo caso de uso.

## Plugin oficial do Supabase para Claude Code usa OAuth hospedado que estava fora do ar ("Unrecognized client_id") — solução: token de acesso pessoal via `.mcp.json` (2026-08-04)

O plugin `supabase` instalado (`~/.claude/plugins/cache/claude-plugins-official/
supabase/`) registra o MCP server sempre como `https://mcp.supabase.com/mcp`
(OAuth hospedado, `.claude-plugin/plugin.json` → `agents/claude/.mcp.json`) —
não tem opção de token embutida. Nesta sessão esse endpoint respondia
`{"message":"Unrecognized client_id"}` pra qualquer tentativa de
`mcp__plugin_supabase_supabase__authenticate`, de forma consistente — bug
externo (do lado da Supabase/registro do app OAuth), não algo configurável
daqui.

**Solução que funcionou**: ignorar o plugin OAuth e apontar um MCP server
próprio, self-hosted, direto no `.mcp.json` do projeto (já no `.gitignore`,
linha 45), usando o pacote oficial `@supabase/mcp-server-supabase` com
Personal Access Token via `SUPABASE_ACCESS_TOKEN`:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--project-ref=zuuqcwxletrfmpcqagxc"],
      "env": { "SUPABASE_ACCESS_TOKEN": "sbp_..." }
    }
  }
}
```
Token gerado em https://supabase.com/dashboard/account/tokens. **Só carrega
numa sessão nova** — servidores adicionados ao `.mcp.json` de um projeto não
são hot-reloaded no meio de uma sessão já aberta.

## `AuthContext.tsx` loga erro de console em toda carga de página — provavelmente RPC `is_instance_initialized` não aplicada no Supabase remoto (achado 2026-08-04, não corrigido — pré-existente, fora do escopo do redesign)

QA em browser real (Chrome, conta admin) do redesign achou um `console.error`
real em toda tela: `Error checking initialization: {}`, origem
`context/AuthContext.tsx:136`, dentro de `checkInitialization` (chama
`sb.rpc('is_instance_initialized')`, cai no `catch` com um objeto de erro
vazio). A função existe em `supabase/migrations/20251201000000_schema_init.sql`
e `20260221200002_fix_function_search_path.sql`, então é candidata forte ao
padrão já documentado acima ("Migrations locais podem não estar aplicadas no
Supabase remoto") — mas não foi investigado a fundo, só confirmado que **não
é do redesign** (arquivo não tocado por nenhum dos 6 blocos) e **não trava
nada** (o `catch` já faz `setIsInitialized(true)`, então o app segue
funcionando normal, só com ruído no console). Comparar
`mcp__plugin_supabase_supabase__list_migrations` (agora disponível via token,
ver acima) contra `ls supabase/migrations/` antes de investigar mais a fundo.

## Trocar o *default* de uma preferência persistida em localStorage não afeta usuários que já têm o valor antigo salvo (2026-08-04)

Ao tornar o redesign do CRM light-only, mudei `usePersistedState('crm_dark_mode',
true)` pra `usePersistedState(..., false)` em `context/ThemeContext.tsx` — óbvio
demais, parecia resolvido. Só que `usePersistedState` só usa o default quando a
chave **não existe ainda** no `localStorage`. Qualquer usuária que já tinha
usado o app antes (quando `true` era o default) já tinha a chave salva com
`true` — trocar o default no código não muda o que já está gravado no
navegador dela. Como o redesign também removeu o botão de toggle da topbar
(não fazia sentido manter, já que o handoff não previa tema escuro), essas
usuárias ficaram **presas** no escuro, sem nenhum controle de UI pra sair —
pior do que antes de qualquer mudança.

**Como isso não repete**: trocar o *default* de uma preferência persistida
(`localStorage`/cookie/flag no banco) não é o mesmo que migrar usuários
existentes pra esse novo default — só afeta quem nunca tinha a chave salva.
Se a intenção é "todo mundo usa o novo comportamento a partir de agora", tem
que **ativamente limpar/sobrescrever** o valor antigo (ex: `localStorage.
removeItem()` no mount, ou uma migration/versionamento da chave), não só
mudar o argumento default da função que lê. Vale sobretudo quando, junto com
a mudança de default, algum controle de UI que permitia reverter a preferência
também foi removido — nesse caso, sem a limpeza ativa, não existe mais
NENHUM caminho pra sair do estado antigo.

## `tsc`/`eslint`/`vitest`/`next build` verdes não pegam bug de CSS puro — só QA em browser real acha (2026-08-04)

No redesign do CRM (ver `CHANGELOG.md`/`REDESIGN-CRM.md`), toda a bateria
automática passou limpa (0 erros/warnings/falhas) mas 2 bugs visuais reais só
apareceram ao abrir o app de verdade no Chrome (via `/qa` + claude-in-chrome
CDP, não o Chromium headless isolado do gstack browse — embora headless
também pegaria, já que é CSS puro renderizado, não algo específico do browser
real):

1. Classe com `flex: 1; min-width: 0` mas **sem** `display: flex;
   flex-direction: column` — se os filhos são `<span>` (inline) em vez de
   `<div>`/`<p>` (block), eles renderizam lado a lado na mesma linha em vez de
   empilhados, e texto de dois campos diferentes aparece colado sem espaço
   (`"Propostateste ww — ..."`). **Como checar rápido**: ao portar um trecho
   do handoff que usa `<span>` pra várias linhas de texto dentro de um mesmo
   container, sempre perguntar "esse container empilha os filhos visualmente,
   ou só confia no navegador quebrar linha por falta de espaço?" — se a
   resposta for a 2ª, falta `display:flex;flex-direction:column` explícito no
   container (não basta ele ser item de um flex pai, isso só blockifica ELE,
   não afeta como OS FILHOS DELE se organizam).
2. Escopar uma regra CSS genérica (`a`, `button`, `input`) com uma classe
   ancestral (`.minha-classe a { color: ... }`) pra não vazar pro app inteiro
   **aumenta a especificidade** de (0,0,1) pra (0,1,1) — maior que qualquer
   classe de componente de 1 nível (`.nav-item`, `.btn`, `.tab`, especificidade
   0,1,0), o que **inverte a cascata**: a regra "genérica" escopada passa a
   vencer a regra "específica" do componente, silenciosamente trocando cor/
   fonte de qualquer link/botão/input dentro do escopo. **Fix**: usar
   `:where(.minha-classe) a { ... }` — `:where()` sempre conta como
   especificidade zero, então o seletor todo fica com a especificidade só do
   `a`/`button`/`input` interno (0,0,1), igual ao original sem escopo, e o
   escopo continua funcionando estruturalmente sem competir com nada.

3. Container flex sem `flex-wrap: wrap` que assume um número fixo de filhos
   (o mock estático só mostrava 2-3 botões numa fileira) — quando a tela real
   tem mais conteúdo do que o mock previu (ex: mais tipos de ação disponíveis
   num card), os itens que não cabem na largura ficam **cortados pela borda
   do container e escondidos**, sem scroll nem indicação visual de que existe
   mais conteúdo (achado em `.card-hitl__actions`, cockpit de negócio, 6
   botões reais vs. 2-3 no mock). **Como checar rápido**: qualquer `display:
   flex` sem `flex-wrap` que renderiza uma lista de tamanho variável (botões
   de ação, tags, chips) — se o dado real pode ter mais itens que o mock
   estático mostrava, ou falta `flex-wrap: wrap` ou o container precisa de
   `overflow-x: auto` deliberado.

**Lição geral**: `tsc`/`eslint`/`vitest`/`build` verificam tipo, padrão de
código, comportamento e que o bundle compila — nenhum deles renderiza CSS.
Qualquer redesign/porting de CSS de handoff estático precisa de pelo menos uma
passada de olho em browser real antes de considerar "pronto", mesmo com os 4
comandos 100% verdes — e quanto mais perto do dado real de produção (não só
o primeiro estado vazio/mock), mais chance de achar containers que o mock
estático nunca testou com volume de conteúdo variável.

## Múltiplos agentes em paralelo na mesma árvore de trabalho: `git stash`/checkout de um pode reverter o progresso de outro (2026-08-04)

Redesign completo da UI (ver `CHANGELOG.md` e `REDESIGN-CRM.md`) rodou com 6
agentes em background trabalhando em paralelo, cada um num conjunto de
arquivos diferente, mas todos no **mesmo working tree** (não em worktrees
isoladas). No meio da execução, algo externo à sessão (provavelmente
ferramenta de QA de outra sessão rodando ao mesmo tempo na mesma máquina) deu
um `git stash`/`checkout` que reverteu temporariamente `app/globals.css` (a
camada de CSS compartilhada por todos os 6 blocos) e deixou `features/**`
aparentando estar limpo por alguns instantes. Um dos agentes detectou a
inconsistência, viu que outro processo já tinha restaurado o stash antes dele,
e confirmou depois via `git status`/diff que nada foi perdido — mas foi sorte
de timing, não proteção real.

**Como isso não repete**: ao orquestrar múltiplos agentes em paralelo que vão
editar arquivos no mesmo repositório, ou (a) usar `isolation: "worktree"` por
agente quando a ferramenta de orquestração suportar (evita colisão de
verdade), ou (b) instruir explicitamente cada agente a **nunca** rodar
`git checkout .`, `git stash`/`git stash pop`, `git reset --hard` ou qualquer
comando destrutivo/de reversão enquanto outros agentes podem estar com
mudanças não commitadas no mesmo working tree — só operações aditivas (Read/
Edit/Write) até o orquestrador confirmar que é seguro. Vale sobretudo pra
`app/globals.css`/arquivos de configuração compartilhados que vários blocos de
trabalho tocam ao mesmo tempo.

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

## `rtk`/pnpm wrapper quebra `npx eslint` (2026-07-24, reconfirmado 2026-08-04)

O hook que intercepta comandos (`rtk`) reescreve `npx eslint ...` numa checagem de supply-chain do pnpm que falha com `[ERR_PNPM_IGNORED_BUILDS]` (builds nativos ignorados: `esbuild`, `sharp`, etc — não relacionado ao lint em si). **Bypass**: chamar o binário direto, `./node_modules/.bin/eslint --max-warnings 0 <arquivos>` — não passa pelo wrapper, funciona normal.

**Atualização (2026-08-04, sessão de redesign com 6 agentes em paralelo)**: o mesmo problema aparece em **qualquer** `npx <bin>` nesse ambiente, não só `eslint` — `npx tsc`, `npx vitest`, `npx next build` também disparam o wrapper e falham do mesmo jeito. Bypass idêntico pros três: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/next build`. Um dos agentes, tentando resolver o erro do wrapper, criou um `pnpm-workspace.yaml` na raiz do projeto com placeholders (`allowBuilds: {core-js: "set this to true or false", ...}`) — isso não é config real do projeto, é lixo gerado pela tentativa de responder ao prompt interativo do pnpm; **apagar se aparecer de novo**, nunca preencher os placeholders.

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

## Regra genérica `*.png` no `.gitignore` deixou a logo fora do git por vários commits (2026-08-06)

Dois "fixes" anteriores de QA (#4/#5, logo corrompida) mexeram só no CSS/proporção do `<Image>` que renderiza `public/brand/logo-aaagencia-white.png` (`Layout.tsx`, `NavigationRail.tsx`) — o problema visual persistiu porque o binário **nunca tinha sido commitado**. O `.gitignore` tinha uma regra específica pra screenshot de debug (`debug_navigation_failed_*.png`) seguida, na linha de baixo, de uma regra genérica solta `*.png` — provavelmente copiada/generalizada sem querer a partir da regra específica. Isso bloqueava qualquer PNG do projeto, incluindo assets de produção em `public/`. `git status`/`git diff` nunca acusavam nada errado porque o arquivo simplesmente não existia pro git — parecia que o fix "não pegou" no deploy, mas o código estava certo o tempo todo.

**Como isso não repete**: quando um asset estático (`public/**`) "não aparece" em produção mesmo com o código correto e sem erro de build, checar `git check-ignore -v <caminho>` antes de qualquer outra investigação — é mais rápido que revisar CSS/proporção de novo. E ao adicionar uma regra de `.gitignore` pra um artefato específico de debug/teste, nunca generalizar pra extensão inteira (`*.ext`) sem checar primeiro se essa extensão já é usada por asset de produção (`find public -iname "*.<ext>"`).

## Investigação concluiu "padrão de design intencional" sem confirmar com o usuário — 30 arquivos alterados por engano (2026-08-06)

Uma sessão anterior investigou um caso de texto de UI em minúsculas (ex: saudação do dashboard, labels de filtro de período) e concluiu, com alta confiança, que era uma "decisão de design intencional do redesign de agosto/2026" — sem checar com o usuário. Essa conclusão errada virou premissa de trabalho na sessão seguinte: um agente mapeou ~30 arquivos com títulos/botões/labels em Iniciais Maiúsculas e outro aplicou a conversão pra minúsculas em todos eles (confirmada por `npm run typecheck` limpo). O usuário corrigiu com firmeza assim que viu o resultado: a interface usa Iniciais Maiúsculas, sempre foi esse o padrão. Todas as 30 alterações foram revertidas via `git checkout` no mesmo dia — trabalho de duas rodadas de agentes (mapeamento + aplicação) jogado fora.

**Causa raiz**: uma observação exploratória ("o texto está em minúsculas em vários lugares") foi tratada como fato confirmado ("isso é intencional") sem nunca perguntar ao usuário — e essa suposição não verificada foi reusada como premissa numa sessão futura sem revalidação, ganhando peso de "decisão já tomada" só por estar registrada em memória/observações anteriores.

**Como isso não repete**: quando uma investigação conclui que uma inconsistência visual/textual é "decisão de design intencional" (em vez de bug), essa é uma inferência, não um fato — sinalizar como hipótese e confirmar com o usuário antes de usá-la como base para qualquer mudança em lote. Padrões vagos e abrangentes ("todo texto de UI em minúsculas") merecem ainda mais ceticismo que bugs pontuais, porque justificam mudanças de escopo grande. Ver [[feedback_ui_text_capitalization]] (memória do assistente) para o registro da correção — botões/títulos/labels usam Iniciais Maiúsculas, não minúsculas.
