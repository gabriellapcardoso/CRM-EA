# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### fix(ui): 6ª rodada de QA — modal de deal trocado por cockpit-v2, painel do Inbox parava de cortar coluna direita — 2026-08-06

QA completo dos 10 itens reportados (ver `qa-report` da sessão) revelou que o
item mais grave — "tela de detalhe de negócio bugada" — não era um bug de
CSS pontual: o board (`/boards`) nunca navegava para `/deals/[id]/cockpit-v2`
(a página cheia já redesenhada e testada na 5ª rodada). O clique no card
continuava abrindo `DealDetailModal` (modal condensado antigo, `max-w-4xl`
centralizado) — título longo quebrava em 4 linhas dividindo espaço com os
botões ganho/perdido/preparar no mesmo `flex` do header, e a barra de
estágios cortava à direita sem scroll visível. Corrigido em
`features/boards/components/PipelineView.tsx`: um `useEffect` que observa
`selectedDealId` agora navega (`router.push`) para `/deals/${id}/cockpit-v2`
em vez de abrir o modal — `<DealDetailModal>` parou de ser renderizado ali
(o componente continua existindo, ainda coberto pelo teste
`US-001-abrir-deal-no-boards.test.tsx`, que renderiza ele isolado).

Segundo bug real, no Inbox: o painel de detalhe (`FocusContextPanel.tsx`,
aberto via "ver detalhes" num item do foco) cortava a coluna direita (tabs
Chat IA/Notas/Scripts/Arquivos) fora da viewport, sem botão de fechar
visível. Causa: `fixed inset-0 w-screen h-screen` no container raiz —
`w-screen`/`h-screen` fixam largura/altura em 100vw/100vh explícitos, o que
faz o navegador recalcular a posição a partir de `left`+`width` em vez de
respeitar `right:0`/`bottom:0` do `inset-0`. Como o overlay pai (`motion.div`
do `InboxFocusView`, animado por framer-motion) vira *containing block* de
`position: fixed` por ter `transform`, o painel nascia deslocado pela largura
da sidebar (236px) e sobrava exatamente essa faixa cortada à direita.
Corrigido removendo `w-screen h-screen` (o `fixed inset-0` sozinho já ocupa
o containing block inteiro) e adicionando um botão "X" visível no header
(antes só existia fechar via tecla Esc, sem controle de UI).

Demais achados corrigidos na mesma rodada: estágio/jornada do contato agora
editável em `ContactFormModal.tsx` (backend já aceitava `stage` no update,
só faltava o campo); nome do canal na lista de mensagens (`.card-conv__org`)
ganhou `text-overflow: ellipsis` — sem isso, nomes longos quebravam linha e
empurravam o selo do canal por cima do texto; texto "CRM" ao lado da logo +
correção de ~7% de distorção (largura/altura da `<Image>` não batia com a
proporção real do PNG) na sidebar desktop; `NavigationRail.tsx` (tablet)
trocou o selo roxo "N" pela logo real dentro de um chip escuro (a logo é
branca, precisa de fundo escuro pra não sumir); 4 implementações duplicadas
de "pegar inicial do nome" (minúsculas em `/contacts`) unificadas em
`getInitials()` (`features/boards/cardFormat.ts`); selo "agente ativo" no
topo passou a consultar `ai_enabled` real da organização via
`useAIConfigQuery()` em vez de ficar fixo verde no código; nav mobile/tablet
renomeado de "Boards" para "Negociação" (`navConfig.ts`), alinhando com o
que a sidebar desktop já usava; texto do botão de submit do formulário de
contato corrigido para distinguir "Salvando..." (edição) de "Criando..."
(contato novo) — antes sempre mostrava "Criando..." mesmo editando.

Verificado em navegador real (dev server local, sessão autenticada real,
`claude-in-chrome`): estágio do contato editado e revertido com sucesso
(RIRÁS Odontologia, Lead→Prospect→Lead, tag e contadores de aba atualizando
em tempo real); truncate confirmado por CSS computado e injeção visual de
nome longo; logo/CRM sem distorção visível; NavigationRail com logo legível
em 900px; iniciais maiúsculas confirmadas em 5 telas (lista, detalhe, aba
empresas, modal de mesclagem de duplicados); selo IA confirmado dinâmico
(desligado durante carregamento → ativo com dado real); "Negociação"
confirmado no bottom nav em 390px; clique num card do board navegando de
fato para `/deals/[id]/cockpit-v2` (full-page, sem sobreposição, botão
"← negociação"); painel do Inbox reaberto após hard reload mostrando as 4
tabs completas e fechando com o novo botão X. `tsc --noEmit`, `eslint
--max-warnings 0` e `vitest run` (448/453, 5 skipped) verdes depois de cada
lote de mudanças.

### fix(t2): registro visível de envios rejeitados pelo webhook da prospecção — 2026-08-06

Item #1 do QA (`leads da prospecção não estão chegando ao CRM`) revelou, ao
consultar produção, que a causa original suspeitada (URL do webhook nunca
exposta na tela de Configurações) não batia com os dados reais — a fonte
`Prospecção → CRM (T2)` já processou 7 leads com sucesso entre 23/07 e 03/08
(confirmado em `webhook_events_in`). O gap real, confirmado por leitura de
código e por ambas as vozes de revisão (Claude + Codex) do `/autoplan`: um
envio rejeitado por formato incompatível (JSON inválido, payload fora do
contrato T2, telefone/campo obrigatório errado) não deixava nenhum rastro
consultável — só aparecia (se aparecesse) no log da própria edge function.

Nova tabela `webhook_ingest_rejections` (migration
`20260806000000_t2_webhook_ingest_rejections.sql`, RLS admin-only, mesmo
padrão de `webhook_events_in`) recebe uma linha toda vez que
`supabase/functions/ingest-prospeccao/index.ts` rejeita um envio com 400
(JSON inválido) ou 422 (contrato/telefone/payload). Tela de Configurações
(`WebhooksSection.tsx`) ganhou um card "Envios rejeitados" que só aparece
quando há alguma rejeição registrada, listando data, código HTTP, motivo e
`external_event_id`.

**Testado de ponta a ponta em produção**: `curl` real contra o endpoint
`ingest-prospeccao` com telefone fora do formato E.164 BR — recusado com
422 e a rejeição apareceu registrada e consultável em
`webhook_ingest_rejections` (linha de teste removida depois de confirmar).
Exposição da URL na UI e atualização de `docs/webhooks.md` ficaram fora
desta correção (preventivas de baixa prioridade, causa raiz real era outra)
— decisão registrada via `AskUserQuestion` durante a sessão.

### T2b — orçamento sugerido da prospecção vira o valor do negócio novo — 2026-08-05

Fase B do plano "Orçamento sugerido" (o outro lado é
`prospeccao-aaagencia`, que calcula e persiste o valor). Antes, todo
negócio criado pela ingestão T2 nascia com `value = 0` fixo —
financeiramente opaco, sem nenhuma referência de preço no board.

`ingest_lead_prospeccao` (RPC, migration `20260805190000_t2b_
orcamento_sugerido_deal_value.sql`, `CREATE OR REPLACE FUNCTION` sobre a
função do T2 — não editada a migration original já aplicada em
produção) passa a ler `lead.orcamento_sugerido` do payload e usar
`COALESCE(orcamento_sugerido, 0)` como `value` — **só no `INSERT`** (deal
novo). O branch de `UPDATE` (deal já aberto reaproveitado, reentrada de
reaquecimento) continua sem tocar em `value`, de propósito: pode ter
sido editado manualmente por alguém no CRM, e um reenvio da prospecção
não deve sobrescrever esse ajuste humano.

`supabase/functions/ingest-prospeccao/contract.ts` (`validarPayload
Prospeccao`) passa a exigir o campo como obrigatório (`number | null`,
nunca ausente) — rejeita string/NaN/campo ausente com 422 antes de
chegar na RPC, porque alimenta um valor monetário direto.

**Verificado em produção, sem sujar dado real**: migration aplicada
(`supabase db push`) e Edge Function redeployada; RPC chamada dentro de
uma transação com `rollback` no final, com um payload de teste
(`orcamento_sugerido: 4321`) — confirmou `deal.value = 4321`, sem gravar
nenhuma linha. 3 casos novos no teste pgTAP da RPC (`supabase/tests/
t2_ingest.test.sql`: value do payload, fallback `0` quando nulo, não
sobrescrita em reentrada) e 3 no teste de contrato (`test/
prospeccaoContract.test.ts`). Fixture compartilhada (`test/fixtures/
t2-payload.json`) e a cópia irmã em `prospeccao-aaagencia` atualizadas
juntas. Detalhe completo (incluindo as 6 decisões de negócio e os 9
achados da revisão cruzada com o Codex) em `gerador de propostas
comerciai/HANDOFF.md`, seção do contrato T2, e no `CHANGELOG.md`/
`README.md` de `prospeccao-aaagencia`.

### Redesign em produção — deploy verificado em crm.aaagencia.com.br — 2026-08-04

10 commits (`d924a86`..`201f5d5`) enviados pra `main` e implantados via
integração git da Vercel (projeto `crm-ea-v2`, sem fluxo de PR neste repo —
push direto na `main` sempre disparou o deploy, confirmado pelo histórico).
Deploy `dpl_HrgESb2GNxCyDiCyogu6nBZPUZdS`, `READY` em ~95s, alias pros 4
domínios (incluindo `crm.aaagencia.com.br`) sem erro.

**Canary check contra produção real** (não preview): `/login` responde 200
com as classes do redesign no HTML servido; `/dashboard` (sessão real já
autenticada no Chrome) renderiza a barra lateral e os cards do redesign
corretamente com **dados reais de produção** (2 negócios reais, R$ 5.600 em
pipeline, feed "acontecendo agora" com atividade real) — sem texto
sobreposto, sem erro de console.

Verificação local antes do push (repetida, mesmos 4 comandos de todas as
rodadas de QA): `tsc --noEmit`, `eslint --max-warnings=0`, `vitest run`
(445/450), `next build` (110 rotas) — todos limpos.

### fix(ui): 5ª rodada de QA — cockpit de negócio completo testado com deal real, 1 bug achado e corrigido — 2026-08-04

`/deals/[id]/cockpit-v2` (página cheia, 3 colunas) nunca tinha sido aberta com
dado real em nenhuma rodada anterior — não havia caminho de navegação exposto
na UI até uma decisão "decidida recentemente" (que o banco de teste não
tinha). Aberta direto por URL com um ID de deal real extraído do DOM do modal
condensado. Achado: **`.card-hitl__actions`** (fileira de botões do card
"próxima ação" — executar agora/gerar WhatsApp/gerar e-mail/template WA/
template e-mail/agendar) não tinha `flex-wrap` — com o número real de ações
que essa tela oferece (mais do que o mock previa), os últimos botões ficavam
cortados pela borda do card, escondidos, sem scroll nem indicação de que
havia mais conteúdo. Corrigido com `flex-wrap: wrap` — os botões extras
quebram pra 2ª linha em vez de desaparecer (pequeno efeito colateral
cosmético de alinhamento, aceitável frente a esconder botões de verdade).

Resto da tela (contato principal, dados do deal, risco do deal, próximos
passos, painel de IA) renderizou correto, sem outro bug. Achado fora de
escopo (não corrigido, pré-existente): `console.error` "API key não
configurada para Google Gemini" — a análise automática de IA que dispara ao
abrir o cockpit não trata esse erro de forma silenciosa quando a chave da
organização não está configurada (`lib/ai/tasksClient.ts`); comportamento de
produto/tratamento de erro, não redesign.

Reverificado: `tsc`/`eslint`/`vitest`/`next build` continuam verdes.

### QA final do redesign (3ª e 4ª rodadas) — admin real, mensagens com dado real, zero bug novo — 2026-08-04

Depois dos 2 fixes de CSS acima (commits `dd8e3eb`/`a7516b1`), mais 2 rodadas
de `/qa` em browser real fecharam a cobertura do redesign:

**3ª rodada** — `/settings` completo (geral, configuração de IA,
integrações — testado como usuário não-admin, confirmando que o gate
"disponível apenas para administradores" bloqueia corretamente) e
`/messaging` de novo. Zero bug novo.

**4ª rodada** — a conta de teste virou admin de fato (`role='admin'` setado
manualmente no Supabase pela fundadora, depois de eu confundir "usuária
logada" com "usuária admin" e pedir pra rodar SQL à mão — ver nota de
processo abaixo). Com admin real, testadas as 5 sub-abas de
`/settings/integracoes` (Canais — canal WhatsApp real, "desconectado";
Webhooks — webhook real de entrada de leads da Prospecção, ativo; API; MCP;
Segurança WhatsApp) e `/settings/products`, todas com dado de produção real.
`/messaging` reaberto como admin mostrou conversas reais de WhatsApp (ex.:
212 mensagens numa conversa, "janela expirada") — thread, bolhas, composer e
painel de contexto renderizando corretamente. **Zero bug novo em nenhuma das
2 rodadas.**

**Achado fora do escopo do redesign, não corrigido**: `console.error`
("Error checking initialization: {}") em toda carga de página, origem
`context/AuthContext.tsx:136` (RPC `is_instance_initialized`) — não é do
redesign (arquivo não tocado por nenhum dos 6 blocos), não trava nada, mas é
ruído de console real; provável migration não aplicada no Supabase remoto
(mesmo padrão já documentado em `DESAFIOS.md`). Detalhe em `DESAFIOS.md`.

**Nota de processo/tooling**: o plugin oficial do Supabase (MCP via OAuth
hospedado) estava fora do ar (`"Unrecognized client_id"`, bug externo,
confirmado não ser configuração local). Resolvido conectando via Personal
Access Token direto no `.mcp.json` do projeto (`@supabase/mcp-server-supabase`,
arquivo já no `.gitignore`) — conexão persistente pra sessões futuras, sem
depender do OAuth quebrado. Detalhe completo em `DESAFIOS.md`.

**Ainda sem cobertura visual real**: `/deals/[id]/cockpit-v2` (página cheia
de 3 colunas — só o modal condensado foi visto), `/ai`, `/profile`. Ver
`REDESIGN-CRM.md` para detalhe completo de todas as 4 rodadas de QA.

### fix(ui): modo escuro persistido travava usuárias existentes num visual quebrado, sem forma de desligar — 2026-08-04

Segunda rodada de `/qa` em browser real (Chrome via CDP), cobrindo negociação/
cockpit, decisões e relatórios. Achado mais sério da sessão: `context/
ThemeContext.tsx` mudou o *default* de `crm_dark_mode` pra `false` (ver
entrada "Redesign visual completo" abaixo), mas continuava **lendo** o valor
já salvo no localStorage de sessões anteriores ao redesign — qualquer usuária
que já tinha escolhido "escuro" antes (era o default antigo, `true`) ficava
com `<html class="dark">` de novo, ativando as classes `dark:` de componentes
ainda não migrados (ex: corpo do modal de detalhe do negócio,
`DealDetailModal.tsx`, que ficava com fundo azul-marinho e texto de dado
("Sem empresa", "Média", "10%") quase invisível por cima do fundo escuro).
Como o toggle de tema foi removido da topbar no mesmo redesign, essas
usuárias **não tinham mais nenhuma forma de voltar pro claro** — pior que
antes do redesign, não igual.

Confirmado ao vivo: o Chrome real usado pro QA tinha `crm_dark_mode: true` no
localStorage (sessão de uso normal, antes desta feature). `ThemeProvider`
reescrito pra forçar `light` sempre e limpar a chave antiga do localStorage no
mount, em vez de honrar o valor salvo — `toggleDarkMode` virou no-op
documentado (nada no código chama, confirmado por grep). Reverificado:
`tsc`/`eslint`/`vitest`/`next build` continuam verdes.

### fix(ui): 2 bugs de CSS reais achados por QA em browser real no redesign — 2026-08-04

`/qa` contra o dev server real (Chrome da fundadora via CDP, não o Chromium
headless isolado) achou 2 classes de bug que `tsc`/`eslint`/`vitest`/`build`
não pegam por não renderizarem CSS de verdade:

1. **Texto colado sem quebra de linha** em `.card-conv__body` (inbox/mensagens)
   e `.feed__body` (painel "risco"/"oportunidades" do inbox, visão geral):
   essas classes só tinham `flex: 1; min-width: 0` — sem `display: flex;
   flex-direction: column`, os `<span>` filhos (`.card-conv__org`/`__preview`,
   `.feed__text`/`__meta`) ficavam lado a lado na mesma linha em vez de
   empilhados, e a truncagem com ellipsis não funcionava (span inline não tem
   largura definida). Resultado visual real: "Propostateste ww — Proposta -
   R\$ 1.100 · 10% prob" (dois campos colados sem espaço) e botões "aplicar"/
   "abrir" sobrepondo texto que devia truncar. Corrigido adicionando
   `display: flex; flex-direction: column` nas 4 classes do mesmo padrão
   (`.card-conv__body`, `.feed__body`, `.timeline__body`, `.auto-log__body` —
   as duas últimas não tinham bug confirmado, mas o mesmo risco estrutural,
   corrigidas preventivamente).
2. **Guerra de especificidade CSS revertendo cor/fonte de componentes**: a
   integração do CSS do handoff (ver entrada acima) escopou as regras globais
   de link/botão/input do `base.css` como `.app a`/`.app button`/`.app input,
   .app textarea` pra não vazar pro resto do app — mas isso elevou a
   especificidade de (0,0,1) pra (0,1,1), **maior** que `.nav__item`/
   `.pill-hitl`/`.btn`/`.tab`/`.chip` (0,1,0), invertendo a cascata: o texto da
   sidebar aparecia rosa/roxo em vez de branco (cor de link vencendo a cor do
   nav item), e `.app button { font: inherit }` tinha o mesmo risco de resetar
   `font-weight`/`font-size` de qualquer botão estilizado. Corrigido trocando
   pra `:where(.app) a`/`:where(.app) button`/`:where(.app) input,
   :where(.app) textarea` — `:where()` tem especificidade zero, então o
   escopo por `.app` continua funcionando mas sem competir com nenhuma classe
   de componente (restaura o comportamento de cascata do handoff original,
   que usava `a`/`button`/`input` sem classe nenhuma).

Achados batendo o handoff no Chrome real (CDP), não no Chromium headless
isolado — ambos os bugs são de CSS puro, invisíveis pra `tsc`/`eslint`/
`vitest`/`next build`. Reverificado depois do fix: `tsc --noEmit` (0 erros),
`eslint --max-warnings=0` (0 problemas), `vitest run` (445/450, 5 skipped),
`next build` (110 rotas ok).

### Redesign visual completo do CRM a partir do handoff HTML/CSS "Redesign CRM" — 2026-08-04

Reimplementação de toda a UI autenticada a partir de um pacote de handoff
estático (HTML/CSS sem framework, fornecido pela fundadora) — shell (sidebar/
topbar), login, convite de organização, dashboard, negociação/boards + cockpit
de negócio, contatos, atividades, inbox, mensagens, fila de decisões da IA,
relatórios, configurações (4 abas) e perfil. Todo o conteúdo dinâmico liga a
dado real (Supabase/TanStack Query) — nenhuma tela ficou com número ou nome
mockado. Decisões de arquitetura, mapeamento tela→rota e adaptações registradas
em detalhe em `REDESIGN-CRM.md`.

**Principais decisões:**
1. CSS do handoff (tokens, `components.css`, `card-deal.css`, `board.css`,
   `table-list.css`, `inbox.css`, `timeline.css`, `approval.css`,
   `cockpit.css`, `report.css`, `auth.css`) colado inteiro em `app/globals.css`
   como camada de componentes — fidelidade pixel-a-pixel com o handoff em vez
   de tradução pra utilitário Tailwind.
2. Redesign é **light-only** por decisão deliberada (handoff não tem variante
   dark, nova topbar não tem toggle de tema): `context/ThemeContext.tsx`
   default de `crm_dark_mode` mudou pra `false`, `app/layout.tsx` deixou de
   nascer com `className="dark"`. Mecanismo de dark mode não foi removido, só
   parou de ser oferecido na UI nova.
3. Cockpit de negócio tinha 3 implementações vivas (`DealDetailModal`,
   `DealCockpitClient`/`cockpit-v2`, `DealCockpitFocusClient`/`cockpit`, + 2
   mocks em `labs/`) — `DealCockpitClient` (`cockpit-v2`) ficou como canônica,
   `DealDetailModal` ganhou versão condensada do mesmo vocabulário; as outras
   duas não foram tocadas.
4. `/settings`, `/settings/ai`, `/settings/integracoes`, `/settings/products`
   continuam sendo o mesmo componente `SettingsPage.tsx`, agora com navegação
   por `.tabs` real (cada aba é uma rota, não só estado local).
5. **Exclusão de escopo deliberada**: `/install/start` e `/install/wizard`
   (instalador operacional de ~3000 linhas, sem mockup equivalente na
   complexidade) não foram tocados — risco de quebrar um fluxo crítico de
   setup superava o ganho visual.
6. `ia.html` do handoff ("IA · decisões", fila de aprovação por confiança
   0.70/0.85) mapeia pra `/decisions` (fila de decisões por prioridade), não
   pra `/ai` (hub de chat/config do agente, sem mockup próprio) — os dois
   modelos de dado são diferentes (confiança numérica vs. prioridade
   categórica); adaptações de UI documentadas em `REDESIGN-CRM.md`.

**Verificação**: `tsc --noEmit` (0 erros), `eslint . --max-warnings=0` (0
problemas), `vitest run` (445 passando, 5 skipped, 0 falhas), `next build`
(110 rotas geradas sem erro). Smoke test manual (`next dev` + curl) confirmou
`/login` e `/join` renderizando com o visual novo.

**Pendente**: revisão visual em navegador real ainda não feita pra `/inbox`/
`/messaging` (risco de scroll duplo/`min-width` em telas estreitas) nem pras
demais telas — recomendado antes de produção. `FocusContextPanel.tsx`
(messaging/cockpit, ~1900 linhas) não foi restilizado por ser compartilhado
entre dois blocos de trabalho em paralelo.

### Fechamento das violações médias/baixas do audit-report.md (2026-04) — 2026-08-04

Sessão dedicada a fechar os achados da auditoria de segurança de abril/2026
(`docs/audit-report.md`) que ainda estavam abertos, verificados via `/review`
com passe adversarial (Claude + Codex). 7 commits, `npm run precheck` limpo
em todas as etapas.

**Fechado:**
1. **Zod v3→v4** (violação média #2): `z.string().uuid()/.email()/.url()`
   → `z.uuid()/z.email()/z.url()` em 18 arquivos. Mecânico, sem risco.
2. **Store de UI duplicado** (violação crítica #7): `store/uiState.ts`
   duplicava `useUIStore` (`lib/stores/index.ts`) com nomes de campo
   diferentes — os campos de `store/uiState.ts` (`isGlobalAIOpen`,
   `sidebarCollapsed`, `activeBoardId`) eram os que de fato dirigiam a UI
   real (Layout, Inbox, Cockpit, modais); os do `useUIStore`
   (`aiAssistantOpen`, `sidebarOpen`) nunca eram usados em lugar nenhum.
   Migrados os campos reais pro store oficial, arquivo duplicado apagado.
3. **Invalidação de cache com `.all`** (violação média #1): ~90 ocorrências
   reais (mais que as 77 estimadas em abril) de `invalidateQueries`/
   `cancelQueries` usando a key genérica `.all` — invalidava o cache
   inteiro da entidade a cada mutation. Deals passam a usar `.lists()`;
   entidades com sub-caches além de `lists()`/`detail()` (contacts,
   activities, businessUnits, messagingChannels, messagingConversations)
   ganharam um predicate novo, `entityCachesExceptDetail()`
   (`lib/query/queryKeys.ts`), que invalida tudo da entidade exceto
   `detail(id)` — preserva a invalidação real desses sub-caches sem tocar
   em detalhes abertos não relacionados.
4. **`.single()` em lookups que podem não achar linha** (violação média #3):
   ~150 ocorrências revisadas nas camadas de maior risco (`lib/supabase`,
   `lib/mcp`, `lib/ai`, `lib/messaging`, `lib/query/hooks`), 48 trocadas
   por `.maybeSingle()` — eram bugs reais: lookup por ID vindo de chamada
   de ferramenta de IA, input de usuário ou config opcional, onde "não
   achou" é resultado normal, mas `.single()` lançava um erro Postgrest
   não tratado em vez de cair no `if (!data)` já escrito no código.
   Dois bugs concretos achados assim: `channel-router.service.ts` e
   `useChannelsQuery.ts` lançavam erro em vez de retornar `null` (o tipo
   de retorno já declarado) quando um canal era excluído/não existia.
   **Pendente**: `app/api/**` (114 ocorrências) e o resto de `features/**`
   ficaram fora do escopo desta sessão — mesmo padrão de risco, revisar
   numa sessão futura começando por `app/api/messaging/**` e
   `app/api/ai/**`.
5. **`'use client'` em 6 páginas** (violação média #4): revisado — são
   telas 100% interativas por natureza (wizard de instalação, login,
   setup, harness de teste), sem conteúdo estático que ganhe com o split
   em componente filho. Sem mudança de código.

**Revertido conscientemente (não é mais recomendação válida):**
- **Barrel `@/lib/supabase` reexportando `createClient`/
  `createStaticAdminClient`** (violação média #6): tentativa real de
  migrar os ~99 imports diretos de subcaminho pro barrel, seguindo a
  própria orientação deste `CLAUDE.md`, passou limpo em typecheck/lint/
  testes mas **quebrou o build de produção** — o Next.js analisa
  `lib/supabase.ts` como módulo único, então qualquer import do barrel
  (mesmo só o client de browser) arrasta `server-only` pro bundle de
  client components. Revertido; detalhe completo em `DESAFIOS.md`.
  Achado de brinde (mantido, correto de qualquer jeito): arquivo
  `lib/supabase/index.ts` morto (sombreado, nunca importado) removido, e
  duas implementações divergentes de `createStaticAdminClient`
  consolidadas numa só (a versão com cache, em
  `lib/supabase/staticAdminClient.ts`).

**Bug real achado pela revisão adversarial (`/review`), não pela
auditoria original:** ao estreitar `cancelQueries` de `.all` (que cobre
tudo, inclusive `detail(id)`) pra `.lists()`/`entityCachesExceptDetail()`
(que exclui `detail(id)` de propósito), 3 mutations —
`useUpdateDeal`, `useMoveDeal` (drag-and-drop do Kanban, a interação mais
comum do app) e `useUpdateConversation` — continuaram escrevendo
otimisticamente no cache `detail(id)` sem mais cancelar o fetch em
andamento desse mesmo cache, reabrindo a race de sobrescrita que o
cancelamento amplo existia pra evitar. Achado de forma independente pelo
subagente adversarial do Claude e pelo Codex (que expirou em 5min antes
de terminar, mas confirmou o mesmo problema em texto parcial). Corrigido
cancelando o `detail(id)` específico junto com a key estreitada nos 3
pontos. Também adicionado teste direto pro `entityCachesExceptDetail()`
(lógica nova sem nenhuma cobertura própria, achado pelo especialista de
testes do `/review`).

**Verificação**: typecheck/lint/440 testes (7 novos)/build limpos em
todas as etapas. 7 commits, sem push ainda.

### T3c — reaquecimento automático na prospecção quando deal é marcado "Perdido" — 2026-08-03

Reusa o outbox/dispatcher do T3 (`deal_stage_events` + Edge Function
`deal-stage-dispatcher`, mesmo cron) em vez de infra nova. Trigger novo
`emit_deal_lost_event` (migration `20260803170000_t3c_deal_lost_reheat_
outbox.sql`) emite evento quando um deal do board `negociacao` entra em
"Perdido" — só se tiver origem rastreável (`contacts.
prospect_correlation_id` setado pelo T2). Dispatcher (`dispatcher-logic.ts`
`resolverDestino`) passa a rotear por `stage_slug`: `perdido` vai pra
`PROSPECCAO_REAQUECER_URL/SECRET` (endpoint novo no `prospeccao-aaagencia`),
resto (`topou-proposta` e o que vier depois) segue indo pro Gerador de
Propostas como antes — mesma tabela, mesmo cron, destinos diferentes por
linha.

**Verificado com deal real em produção**, não só teste unitário: deal
"Dra Paula Melo" (piloto T5) marcado Perdido via `UPDATE` direto (mesmo
caminho de um humano arrastando o card no cockpit) → trigger emitiu
evento → cron processou sozinho em menos de 1 minuto (`status: enviado`,
`response_status: 200`) → lead correspondente na prospecção virou
`encerrado` com reaquecimento imediato. Revertido os 2 lados depois do
teste (deal e lead voltaram ao estado original) — não é dado de piloto
perdido, foi sinal de teste.

Deploy: migration aplicada, Edge Function redeployada, secrets
configurados (`PROSPECCAO_REAQUECER_URL`/`_SECRET`, cofre Supabase deste
projeto). Detalhe completo (incluindo o bug de middleware achado do lado
prospecção) em `gerador de propostas comerciai/HANDOFF.md` seção "Estado
atual (2026-08-03)".

### T3 + T3b — CRM ↔ Gerador de Propostas conectados, board Negociação expandido pra 14 estágios — 2026-08-02

Decidido e implementado via `/plan-eng-review` + agentes em paralelo, depois
testado com `/qa` direto em produção (não mock). T3 (deal "topou receber
proposta" no CRM → cria proposta rascunho no Gerador) e T3b (proposta
"enviada"/"aprovada" no Gerador → move o deal de estágio no CRM) estão os
dois em produção, ponta a ponta, verificados contra dado real.

**Arquitetura decidida no `/plan-eng-review`:**
- T3 segue o padrão rigoroso do T2 (RPC transacional + contrato tipado
  testado nos 2 lados), não o `webhook-in` genérico — decisão travada antes
  de codar.
- Disparo via padrão outbox: trigger na tabela `deals` (não na RPC
  `move_deal_to_stage`, porque o cockpit de deals move estágio via `UPDATE`
  direto, não chama essa RPC) grava em `deal_stage_events` na mesma
  transação; dispatcher (Edge Function + `pg_cron` a cada 2min) envia de
  fato, fora da transação. Chave de idempotência com contador:
  `deal:{id}:topou:{n}`.
- T3b estende o `webhook-in` genérico já existente com campo opcional
  `target_stage_slug`, retrocompatível — decisão consciente de não
  reescrever esse endpoint (usado por outras integrações).
- Board `negociacao` expandido de 7 para 14 estágios (pedido direto da
  fundadora): Novo → Contato → Negociando → Topou receber proposta →
  Proposta enviada → Proposta aceita → Rodar contrato → Enviar contrato →
  Contrato aprovado → Contrato assinado → Pagamento recebido → Ganho →
  Onboarding (+ Perdido). Migration preserva os ids determinísticos dos
  estágios que já existiam (rename de label, ex: "Topou proposta"→"Topou
  receber proposta", sem quebrar referência).

**Deploy em produção:** migrations aplicadas nos 2 bancos Supabase (CRM
`zuuqcwxletrfmpcqagxc`, Propostas `qfcylvhfnmzbazdkwzgt`); secrets
configurados (`PROPOSTAS_INGEST_URL`/`PROPOSTAS_INGEST_SECRET` aqui,
`TOPOU_CRM_WEBHOOK_SECRET` no Gerador de Propostas — mesmo valor nos 2
lados); Edge Functions `deal-stage-dispatcher` e `webhook-in` publicadas;
deploy do código nos 2 Vercel (`crm-ea-v2`, `gerador-de-propostas-comerciais`)
com READY confirmado.

**Verificado ponta a ponta em produção real** (dados de teste criados e
depois limpos): deal criado no board Negociação → movido pro estágio "Topou
receber proposta" → outbox → dispatcher → proposta rascunho criada de
verdade no banco das Propostas com cliente vinculado → evento "enviada"
moveu o MESMO deal pro estágio "Proposta enviada" certo → evento "aceita"
moveu pro estágio "Proposta aceita" certo, sem duplicar contato. 437 testes
(429 pré-existentes + 8 de regressão novos), typecheck e lint limpos nos 2
repos.

### Added (T3/T3b — 2026-08-02)
- Outbox `deal_stage_events` (`supabase/migrations/20260802120000_t3_deal_stage_events_outbox.sql`) + trigger `emit_deal_stage_event` (dispara em `AFTER UPDATE` de `deals`, cobre tanto o agente IA quanto o humano arrastando o card) + RPC `retry_deal_stage_event` pra reenvio manual.
- Dispatcher (`supabase/functions/deal-stage-dispatcher/`) + `pg_cron` a cada 2min (`supabase/migrations/20260802121000_t3_deal_stage_dispatcher_cron.sql`) — timeout 5s, retry com teto, nunca rebaixa evento já `enviado`.
- Board `negociacao` expandido pra 14 estágios (`supabase/migrations/20260803100000_t1b_negociacao_board_fluxo_completo.sql`).
- RPC `resolve_negociacao_stage_id` (`supabase/migrations/20260803120000_t3b_resolve_negociacao_stage_id.sql`) — resolve `target_stage_slug` pro id real do estágio.
- `webhook-in` (`supabase/functions/webhook-in/index.ts`) estendido com campo opcional `target_stage_slug`, retrocompatível.
- UI de reenvio manual dos eventos T3 em Configurações (`features/settings/components/DealStageEventsSection.tsx`).

### Fixed (achados do `/qa` em produção real, T3/T3b, 2026-08-02)
- **Drift de migration history causou duplicata de estágios**: `supabase db push --dry-run` revelou que várias migrations (incluindo T1 board semantics e T2 inteiro) nunca tinham sido tracked pelo CLI — foram aplicadas direto via Management API meses atrás. Ao reconciliar (`migration repair` + `db push --include-all`), a migration original do T1 (não-RFC4122) foi reaplicada e criou duplicatas do board `negociacao` (21 linhas em vez de 14, id ligeiramente diferente da fórmula determinística da versão corrigida). Limpo direto via API em produção (checado antes: só 2 deals reais no board inteiro, nenhum nos ids duplicados removidos).
- **Secrets em cofre errado**: a Edge Function `deal-stage-dispatcher` lê `PROPOSTAS_INGEST_URL`/`SECRET` dos secrets do Supabase (`supabase secrets set`), não das env vars da Vercel — dois cofres separados. Configurar só a Vercel não bastava; a função rodava mas não processava nada (`"motivo":"PROPOSTAS_INGEST_URL/SECRET não configurados"`).
- **Telefone sem normalização E.164**: o trigger `emit_deal_stage_event` passava `contacts.phone` direto pro payload sem `+`. Contatos reais deste banco têm telefone salvo sem `+` — o receptor exige E.164 estrito, rejeitava com 422. Fix: normaliza no trigger (só dígitos, 10-15 chars → prefixa `+`).
- **Board errado no `webhook-in` pro T3b**: a fonte inbound usada pelo T3b é a mesma já usada pra `pagamento_recebido` (`entry_board_id` fixo, board pós-venda). O lookup de deal existente usava sempre esse board fixo — T3b nunca encontrava/movia o deal certo no board Negociação (respondia 200 "ok", mas não achava nada). Fix: usa o board DO ESTÁGIO resolvido via `target_stage_slug` (nova função pura `resolveEffectiveBoardId`), com fallback pro board de entrada quando não há `target_stage_slug` (retrocompat total).
- **Dedupe de contato quebrado por encoding**: `webhook-in` usava `.or("phone.eq.+5511...")` do PostgREST — `+` não é escapado antes de virar querystring HTTP, e `+` em querystring é espaço. O filtro chegava no banco como `"phone.eq. 5511999999999"` (com espaço) e nunca batia contra telefone E.164 real salvo com `+`. Cada webhook repetido criava um contato duplicado (reproduzido ao vivo: 3 contatos "Cliente Teste" duplicados em minutos de teste). Fix: troca `.or()` por duas buscas `.eq()` sequenciais (telefone primeiro, e-mail depois). Função `sanitizePostgrestValue` removida (só existia pra esse `.or()`, ficou sem uso).

### Deploy de produção — 2026-07-27

Deploy único que destravou o travamento silencioso desde 2026-07-22 (achado
na sessão anterior): último deploy READY na Vercel era anterior ao T4
inteiro — todo código pushado depois disso (rascunho no inbox, supressão,
kill switch, canal Evolution, rodapé de opt-out) nunca tinha chegado à
produção. Causa era o `evolution-health` cron a `*/30 * * * *` excedendo o
limite do plano Hobby (1x/dia), travando todo deploy silenciosamente —
`git push` "funcionar" não confirmava publicação.

- **Deploy confirmado em produção** (`crm.aaagencia.com.br`, commit
  `6a3fbf2`, deployment `dpl_AQ9F6hVZdQE9ZYbNuX87aR6GtTPT`, verificado via
  MCP Vercel com `readyState: READY`): fix do cron `evolution-health` (`0 9
  * * *`), `CRON_SECRET` rotacionado agora ativo nas rotas Next.js, T4
  completo (kill switch, supressão, rodapé de opt-out).
- **`INTERNAL_API_SECRET` (resposta automática da IA no WhatsApp):
  decidido NÃO configurar por ora** — fundadora optou por manter o fluxo
  100% humano até o piloto validar algo antes de deixar a IA responder
  sozinha. Decisão deliberada, não pendência técnica; não bloqueia nada do
  roadmap.
- **Política de retenção/exclusão LGPD**: decidida e documentada
  (`docs/lgpd-retencao-exclusao.md`) — 24 meses sem interação pra lead não
  convertido, 5 anos pós-contrato pra cliente fechado, exclusão sob pedido
  manual. Sem automação ainda (escala do piloto não justifica).

### Added
- T4: rodapé de opt-out LGPD (`lib/messaging/whatsapp-optout-footer.ts`) — anexado só na 1ª mensagem outbound entregue de cada conversa WhatsApp, centralizado em `ChannelRouterService.sendMessage()` (mesmo choke point do guard). Texto: "Se preferir não receber mais mensagens, responda SAIR a qualquer momento." Fechava a última pendência de copy/código do T4 (parser inbound de "SAIR" já existia desde `fe5c667`).
- T4: UI de rascunho no inbox (badge na lista de conversas, bubble diferenciado, ação "enviar rascunho" que move `draft→sent` e o deal pra "Contatado")
- T4: lista de supressão LGPD (`whatsapp_suppression_list`) + kill switch (`organization_settings.whatsapp_kill_switch_active`), enforcement centralizado em `ChannelRouterService.sendMessage()`
- T4: health-check da sessão Evolution API (`/api/cron/evolution-health`, 30min) — alerta em `security_alerts` + e-mail via Resend
- T2: pgTAP da RPC `ingest_lead_prospeccao` (`supabase/tests/t2_ingest.test.sql`) — escrito e **executado pela 1ª vez (2026-07-25), 11/11 verde** após corrigir 2 bugs no próprio arquivo de teste (ver Fixed)
- T4: **canal WhatsApp Evolution conectado em produção (2026-07-25)** — instância "Gabriella Cardoso" (já existente na Evolution self-hosted, `evolutionapi.gabriellapcardoso.com.br`), registrada em `messaging_channels` (business_unit `aaagencia` criada — org não tinha nenhuma até então). Webhook configurado e testado (evento `connection.update` simulado processou OK, canal foi pra `connected`, telefone `+553194822228` capturado). **Decisão da fundadora**: usar o número pessoal dela em vez do comercial da aaagência (indisponível no momento) — risco de mistura com outros usos do mesmo número aceito conscientemente. `INTERNAL_API_SECRET` intencionalmente não configurado ainda — mensagens inbound são registradas mas a IA não responde sozinha até a fundadora decidir ligar isso.

### Fixed (achado ao conectar o canal Evolution real pela 1ª vez, 2026-07-25)
- **`evolution.provider.ts::configureWebhook()`**: mandava o body chapado (`{enabled, url, byEvents, events}`) — o servidor Evolution real rejeita com `400 Bad Request` ("instance requires property webhook"), exige `{webhook: {...}}` aninhado. Nunca tinha sido exercitado contra um servidor real antes. Também faltava o campo `headers`: sem ele, a Evolution nunca manda o `apikey` nas chamadas de webhook que ela mesma faz, e o default-deny de auth do `messaging-webhook-evolution` rejeitaria (401) todo evento silenciosamente (a função sempre responde 200 pro Evolution não fazer retry storm). Fix: body aninhado + `headers: {'x-api-key': apiKey}`. Validado end-to-end com webhook real + evento simulado.

### Fixed (achados ao rodar `supabase start`/pgTAP pela 1ª vez, 2026-07-25)
- **Migration `20260223000002_fix_search_messages_rpc.sql`**: `CREATE OR REPLACE FUNCTION` renomeava coluna de retorno (`external_message_id`→`external_id`) sem `DROP FUNCTION` antes — Postgres rejeita mudança de tipo de retorno via replace. Quebrava `supabase start` do zero. Produção só funcionava porque foi aplicada por fora do controle de versão (drift). Fix: `DROP FUNCTION IF EXISTS` antes do `CREATE OR REPLACE`.
- **Migration `20260224000000_performance_indexes_and_rls_cache.sql`**: referenciava `ai_decisions.organization_id` e `messaging_webhook_events.organization_id` — nenhuma das duas colunas existe (ai_decisions é isolada por `user_id`; messaging_webhook_events por `channel_id`). Migration nunca tinha rodado com sucesso em produção — confirmado que os índices de `activities`/`contacts`/`deals`/`leads`/`messaging_conversations` sequer existiam lá. Aplicados agora via migration nova `20260725232335_drift_fix_missing_org_id_indexes.sql` (sem mexer na função `get_user_org_id()`, que produção já tem numa versão mais nova via `custom_access_token_hook`).
- **Migration `20260409120000_hitl_pending_alerts.sql`**: bloco `EXCEPTION WHEN undefined_object` não cobria o erro real (`undefined_schema`/`invalid_schema_name`, SQLSTATE 3F000) quando `pg_cron` não está instalado — handler nunca disparava. Fix: `WHEN undefined_object OR invalid_schema_name`.
- **Migration `20260715173000_pg_cron_stage_evaluations.sql`**: mesma classe de erro (schema `cron` ausente localmente), sem guarda nenhuma. Envolvido no mesmo padrão `DO $$ ... EXCEPTION` das demais — ainda não aplicada em produção (aguarda `CRON_SECRET` real).
- **`supabase/tests/t2_ingest.test.sql`** (nunca tinha rodado): 2 chamadas `format(..., %s, :payload)` usavam `%s` num valor jsonb já tipado pelo `psql` — `%s` imprime o JSON cru sem aspas, gerando erro de sintaxe SQL. Fix: `%L`. Também havia 1 dígito faltando no telefone E.164 esperado pelo teste 4 (`+553198887777`→`+5531988887777`, typo no teste, não na função).

### Changed
- `MessageStatus` ganha o valor `'draft'` (T2/T4)

### Fixed (achados do `/review` e `/qa` no T4, 2026-07-24)
- **CRÍTICO**: 5 pontos que leem histórico de mensagens pro agente IA (`context-builder.ts`, `agent.service.ts` stage-evaluator, `adaptive-context.ts` x2, `few-shot-learner.ts`) não filtravam `status='draft'` — agente via rascunho nunca enviado como se fosse mensagem real, podia "lembrar" de contato que nunca aconteceu. Fix: `.neq('status', 'draft')` nos 5 pontos.
- `send-draft`: trigger de preview/contador da conversa só dispara em `INSERT`, e o rascunho original (T2) é inserido com status `draft`, que ela ignora de propósito. Sem correção, depois de enviar o rascunho a lista de conversas continuava mostrando "Sem mensagens" pra sempre. Fix: update manual de `last_message_preview`/`message_count`/`last_message_at` no sucesso do envio.
- `evolution-health`: sem dedup, mandava e-mail de alerta a cada execução do cron (30/30min) enquanto o canal ficasse desconectado — spam engolindo o alerta real. Fix: cooldown de 4h por canal via `security_alerts`.
- `MessagingPage.tsx`: coluna de mensagens sem `min-w-0` deixava o painel de contato (sempre visível, 320px) empurrar conteúdo pra fora da tela em telas de 1440px (resolução real testada) — botão "Enviar rascunho" ficava fora da área clicável, sem scroll. Bug pré-existente (não introduzido pelo T4), achado testando o rascunho visualmente pela primeira vez no `/qa`.
- Parâmetro `businessUnitId` morto na query key `draftConversationIds` (nunca usado por nenhum caller) — removido.

### Fixed (achado do `/qa` retomado, 2026-07-25)
- **Infra, não código**: migration `20260724000000_t4_suppression_and_kill_switch.sql` nunca tinha sido aplicada no Supabase remoto do projeto (`zuuqcwxletrfmpcqagxc`) — `organization_settings` sem as colunas `whatsapp_kill_switch_active`/`alert_email`, causando 500 em `GET/POST /api/settings/whatsapp-safety`. Aplicada via MCP (`apply_migration`, idempotente). Ver `DESAFIOS.md` pra como checar isso de novo antes do T5.

### Fixed (auditoria de migrations vs remoto, 2026-07-25)
- **Infra, não código**: mais 2 migrations locais que também nunca tinham sido aplicadas no Supabase remoto — `20260715170000_fix_handle_new_user_org_lookup.sql` (trigger `handle_new_user()` quebrava todo signup desde `20260223000000_fix_security_anon_exposure.sql`, nunca detectado por falta de novo usuário criado) e `20260723235000_t4_draft_index.sql` (índice parcial de rascunhos, pré-requisito de performance do T4). Ambas aplicadas via MCP (`apply_migration`, idempotentes: `CREATE OR REPLACE`/`CREATE INDEX IF NOT EXISTS`), confirmadas em `list_migrations`.
- **Pendente**: `20260715173000_pg_cron_stage_evaluations.sql` NÃO aplicada — contém secret placeholder (`__CRON_SECRET__`) que precisa do valor real do `CRON_SECRET` (env Vercel) antes de rodar. Sem essa migration, o endpoint `/api/cron/stage-evaluations` fica sem drenagem automática via pg_cron (drena hoje só se chamado externamente). Aplicar manualmente com o secret real antes do T5.

### Verified (2026-07-24 e 2026-07-25)
- Fluxo completo testado ao vivo (dados de teste criados e removidos): badge "Rascunho" na lista → bubble tracejado com rótulo → clique em "Enviar rascunho" → claim atômico draft→queued → chamada real ao `ChannelRouterService.sendMessage()` → transição pra `sent`/`failed` conforme resultado do provider. Caminho de falha confirmado (`SUPABASE_SECRET_KEY` ausente no ambiente local de teste, não é bug). Caminho de sucesso (atualização de preview + mover deal pra "Contatado") validado por leitura de código, não por execução real (precisa da secret key real pra exercitar).
- Aba "Segurança WhatsApp" em Settings testada ao vivo (login de teste criado via MCP, removido depois): toggle do kill switch salva sozinho, botão "Salvar" persiste e-mail de alerta, reload reflete estado salvo. Estado de teste revertido no banco (kill switch `false`, e-mail `NULL`) — não afeta produção.

### Added
- **T2 do novo fluxo do ecossistema (2026-07-23)**: RPC transacional `ingest_lead_prospeccao` (migration `20260722230000`) — recebe lead da prospecção e, numa única transação, cria/acha contato (por `prospect_correlation_id` + telefone E.164, nunca sobrescrevendo campos já preenchidos), cria/reusa deal no board de entrada da fonte (merge de `custom_fields`, nunca sobrescrita total), e vincula `messaging_conversation` + mensagem `draft` quando existe canal WhatsApp `connected` (sem canal, o rascunho fica em `deals.custom_fields.prospeccao` até o T4). Idempotência por `(source_id, external_event_id)` com 409 em corrida de retry (`T2_DUPLICATE_IN_FLIGHT`) e rollback total em qualquer falha — sem estado parcial. RPC `reconcile_prospeccao` (por chave de ciclo, não por lead) para o job de reconciliação da prospecção. Edge function `ingest-prospeccao` (auth por `X-Webhook-Secret` em tempo constante, validação de contrato com limites de tamanho, subrota `/reconcile`). Falta o deploy — código pronto e revisado por `/review` (6 revisores). Contexto: `../PLANO-NOVO-FLUXO.md` (pasta mãe), contrato do payload no HANDOFF.md do gerador de propostas.

### Fixed
- **Segurança (T0 do novo fluxo do ecossistema, 2026-07-22)**: `sanitizeIncomingMessage()` + `SECURITY_PREAMBLE` aplicados em 15 entry points de IA — fecha as violações críticas 1 e 2 do `docs/audit-report.md` (4 dos 7 arquivos auditados ainda estavam abertos) mais 11 entry points adicionais descobertos fora da auditoria, incluindo `lib/ai/agent/stage-evaluator.ts` (vetor de injeção cross-sistema: lead malicioso poderia induzir avanço de estágio que dispara webhooks). Sanitização aplicada apenas a conteúdo inbound/de lead; mensagens do assistente intactas. Typecheck limpo, 339 testes passando. Commit `04705a3`. Contexto do fluxo: `../PLANO-NOVO-FLUXO.md` (pasta mãe).
- **Webhook-in — hardening (T2, 2026-07-23)**: comparação de secret em tempo constante (SHA-256 + XOR, era `!==` simples), merge de `custom_fields` em vez de sobrescrita total (o reenvio apagava dados do agente/fundadora gravados desde a última chamada), sem vazar `error.message` na resposta pré-auth, sanitização PostgREST no filtro `.or()` de email/telefone.

### Removed
- (Upcoming removals will appear here)

---

## [0.1.0] - 2026-04-09

### Added

#### Evolution API Integration
- End-to-end Evolution API WhatsApp provider support
- Display WhatsApp phone number from Evolution channel
- Support for Evolution API webhooks with multi-tenant authentication
- Evolution API option in channel setup wizard
- Capture outbound messages from WhatsApp app as sent messages

#### AI Agent Enhancements
- `agent_goal_stage_id` field — autonomous agent scope per funnel
- Visual feedback for out-of-scope stages in goal stage config
- MCP server tools for AI agent stress-testing (`crm.ai.simulate.*`)
- Log handoff actions in `ai_conversation_log`
- Await `processIncomingMessage()` in dev mode for proper execution

#### Settings & Configuration
- Dynamic AI model list from provider APIs
- Telegram integration with auto-detect chat_id via polling (zero-config UX)
- Test message button for Telegram validation

#### Testing & Monitoring
- Vitest coverage for `agent_goal_stage_id` scope validation

### Fixed

#### AI Configuration
- Fix 3 silent bugs in AI configuration by stage
- Await `processIncomingMessage` execution in dev mode

#### Evolution API
- Fix 3 Evolution code review issues
- Security improvements for Evolution webhook processing
- Content type handling and missing event handlers
- Fix 2 Evolution code review bugs

#### Simulation & Reliability
- Fix reliability of S2/S3/S6 simulation scenarios
- Improve AI logging in simulation mode

#### Webhook Processing
- Extract `channelId` by UUID regex to support `webhookByEvents` mode
- Remove non-existent columns from deals insert
- Fix 4 inbox bugs found by ultraplan audit

#### Messaging
- Show outbound messages sent from phone in inbox
- Fix email channel realtime updates

#### Telegram Integration
- Support groups in Telegram integration
- Fix Telegram disconnect handling
- Polish connected state display
- Fix Telegram notification sending on all handoff paths
- Fix CSPRNG usage in crypto operations

### Removed
- References to OpenAI and Anthropic providers (100% consolidation to Google Gemini)
- Voice feature (ElevenLabs Conversational AI + WhatsApp Business Calling API) — tables preserved in database

### Changed

#### Provider Consolidation
- Consolidated to 100% Google Gemini for AI operations
- Removed OpenAI and Anthropic provider code

### Refactored

- Remove remaining references to OpenAI/Anthropic
- Clean up provider abstraction layer

---

## Release Notes

**Version 0.1.0** is the first development release of NossoCRM with core messaging and AI agent capabilities.

### Status
- ✅ Messaging MVP complete (WhatsApp via Meta & Evolution, Email via Resend, Telegram, Instagram)
- ✅ AI Agent MVP complete (autonomous stage advancement with HITL, briefing generation)
- ⏳ Public API: Planned for v0.2.0 or v1.0.0

### Next Milestone (v0.2.0)
- Public API for message ingestion
- GraphQL API for CRM data
- Webhook signature verification hardening

### Path to v1.0.0
- Stabilize public APIs
- Security audit and penetration testing
- Performance optimization
- Comprehensive documentation
