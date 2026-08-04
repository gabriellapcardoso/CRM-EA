# Redesign CRM — progresso e decisões

Fonte: `/Users/gabriellacardoso/Downloads/Redesign CRM/` (handoff HTML/CSS estático,
sem framework, ver `README.md` de lá). Objetivo: reimplementar todas as telas do
handoff no app real (Next.js 16 App Router, React 19, Tailwind v4, Supabase),
com dados reais — nunca mock.

## Decisões de arquitetura (não re-perguntar)

1. **CSS do handoff foi colado inteiro em `app/globals.css`**, ao final do arquivo,
   como uma camada de componentes (`.card-deal`, `.board`, `.sidebar`, `.btn`, etc.),
   em vez de traduzir tudo pra utilitário Tailwind. Motivo: fidelidade pixel-a-pixel
   com o handoff e reuso 1:1 da nomenclatura documentada em `decisoes-design-system.html`.
   Os arquivos-fonte (`css/tokens.css`, `base.css`, `shell.css`, `components.css`,
   `card-deal.css`, `board.css`, `table-list.css`, `inbox.css`, `timeline.css`,
   `approval.css`, `cockpit.css`, `report.css`, `auth.css`) estão todos mesclados lá.
   `design-system.css` (só da tela de referência interna do handoff) não foi trazido —
   não há rota para ela no app.
2. **Redesign é light-only, por decisão deliberada.** O handoff não tem variante dark
   e a nova topbar (`shell.css`) não tem toggle de tema. Por isso:
   - `context/ThemeContext.tsx`: default de `crm_dark_mode` mudou de `true` → `false`.
   - `app/layout.tsx`: `<html>` deixou de nascer com `className="dark"`.
   - O mecanismo de dark mode **não foi removido**, só parou de ser oferecido na UI
     nova — widgets legados que ainda não migraram (tooltip, dropdown, toast, chat IA)
     continuam com classes `dark:` do Tailwind, mas como o html não nasce mais `dark`,
     eles vão renderizar no visual claro por padrão (consistente com o resto).
   - As classes novas (`.card-deal`, `.btn`, etc.) usam valores fixos e **nunca**
     reagem a `.dark` — é assim que o handoff foi entregue.
3. **Paleta de marca já existia e já casava.** `--purple-*`/`--lime-*` em
   `app/globals.css` (tema Tailwind `@theme`) já tinham os mesmos hex do handoff.
   Não houve necessidade de reconciliar cores de marca.
4. **Colisão intencional**: `--channel-whatsapp/-email/-instagram` já existiam
   (oklch) para as bolhas de mensagem antigas. O handoff redefine essas 3 variáveis
   com valores literais (`--success`, `--purple-500`, `--pink-500`) — a redefinição
   posterior no arquivo vence de propósito, porque o objetivo é usar a mesma cor de
   canal em toda a UI nova (badge-channel) e antiga (o pouco que sobrar). As variantes
   `-bg` (oklch, não usadas pelo handoff) não foram tocadas.
5. **Logo**: copiado para `public/brand/logo-aaagencia-white.png`.
6. **Cockpit de negócio tinha 3 implementações vivas** antes do redesign:
   `features/boards/components/Modals/DealDetailModal.tsx` (modal no board),
   `features/deals/cockpit/DealCockpitClient.tsx` (rota `/deals/[id]/cockpit-v2`)
   e `DealCockpitFocusClient.tsx` (rota `/deals/[id]/cockpit`), + 2 mocks em `labs/`.
   O handoff só tem **uma** tela (`cockpit-deal.html`, 3 colunas). Decisão: aplicar
   `cockpit.css`/`card-deal.css` na v2 (`DealCockpitClient`) como implementação
   canônica (mais completa) e no modal do board (`DealDetailModal`) como versão
   condensada do mesmo vocabulário visual — não se cria uma 4ª implementação.
7a. **Nav da sidebar**: o handoff lista "Boards" (grade de vários boards, sem
   equivalente real — o app só tem 1 kanban) e "Negociação" (kanban de fato) como
   itens separados. Como não existe feature de "múltiplos boards" no app real,
   o item de nav ficou só **"Negociação" → `/boards`** (o kanban único existente).
   "Decisões de DS" (referência interna do designer) e o grupo "acesso" (login/
   onboarding, que só faz sentido deslogado) não entraram na sidebar autenticada.
8. **Configurações**: as 4 rotas (`/settings`, `/settings/ai`, `/settings/integracoes`,
   `/settings/products`) apontam pro mesmo componente `SettingsPage.tsx` com navegação
   interna — o handoff trata como 4 telas separadas (`configuracoes-geral/ia/
   integracoes/produtos.html`) mas compartilham vocabulário (`setting-row`, `toggle`,
   `status-chip`). Mantém-se 1 componente com tabs, replicando o conteúdo de cada
   tela do handoff dentro da tab correspondente.

## Mapa tela do handoff → rota/componente real

| Handoff | Rota | Componente principal |
|---|---|---|
| login.html | `/login` | `app/login/page.tsx` ✅ |
| onboarding-join.html | `/join` | `app/join/page.tsx` |
| onboarding-install-start/wizard.html | `/install`, `/install/start`, `/install/wizard` | `app/install/**` |
| decisoes-design-system.html | — | referência apenas, sem rota própria |
| dashboard(+estados).html | `/dashboard` | `features/dashboard/DashboardPage` |
| boards(+vazio).html, pipeline(+estados).html | `/boards` (`/pipeline` redireciona) | `features/boards/BoardsPage` |
| cockpit-deal.html | `/deals/[id]/cockpit-v2` | `features/deals/cockpit/DealCockpitClient` (+ subcomponentes) |
| contatos(+estados).html | `/contacts` | `features/contacts/ContactsPage` |
| atividades(+carregando).html | `/activities` | `features/activities/ActivitiesPage` |
| inbox(+estados).html | `/inbox` | `features/inbox/InboxPage` + componentes |
| — (mensagens 1:1, sem tela própria no handoff, reusa inbox.css) | `/messaging` | `features/messaging/MessagingPage` + componentes |
| ia(+estados).html ("IA · decisões", fila de aprovação HITL) | `/decisions` | `features/decisions/DecisionQueuePage` (usa `useDecisionQueue`: approveDecision/rejectDecision/snoozeDecision ≈ aprovar/recusar/adiar do mock) |
| — (sem tela própria no handoff; feature real de chat/config do agente) | `/ai` | `features/ai-hub/AIHubPage` — sem mock dedicado, só herda tokens/`.btn`/`.panel` base. Acesso continua pelo botão "assistente IA" (✦) da topbar, não ganhou item de nav próprio (handoff também não tinha). |
| relatorios(+carregando).html | `/reports` | `features/reports/ReportsPage` |
| configuracoes-geral/ia/integracoes/produtos.html | `/settings*` | `features/settings/SettingsPage` (tabs) |
| perfil.html | `/profile` | `features/profile/ProfilePage` |
| shell (sidebar/topbar, presente em toda tela interna) | — | `components/Layout.tsx` |

## Convenção de wrapper de página (IMPORTANTE pra quem for redesenhar uma tela)

`components/Layout.tsx` (shell) só renderiza `<main class="screen">{children}</main>` —
**cada página escolhe seu próprio wrapper de conteúdo**, exatamente como no handoff:

- **Padded** (a maioria): a própria página deve renderizar
  `<div class="screen__inner screen__inner--wide">...</div>` (ou `--narrow` pra
  telas estreitas como perfil/login-adjacent) como elemento raiz.
  Ex.: dashboard, contatos, atividades, relatórios, decisões (`/decisions`),
  configurações, perfil.
- **Full-bleed** (sem `screen__inner`, o próprio componente controla 100% da
  altura de `.screen`): a página renderiza direto `.inbox` (inbox), `.board-toolbar`
  + `.board` (negociação/boards), `.cockpit` (cockpit de deal), ou a estrutura de
  `.thread`/`.conv-pane` de mensagens.

Não adicionar padding/wrapper extra em `Layout.tsx` — isso já foi tentado e revertido
porque quebra os full-bleed (inbox/board/cockpit ficam com scroll duplicado e largura
errada se ganharem o padding de `screen__inner` por fora).

## Exclusão de escopo deliberada: `/install/start` e `/install/wizard`

`onboarding-install-start.html`/`-wizard.html` do handoff são só 2 telas simples
(escolha criar-org-vs-entrar-org, e 1 passo de conectar canais). Os arquivos reais
(`app/install/start/page.tsx` ~930 linhas, `app/install/wizard/page.tsx` ~2140
linhas) são um instalador operacional completo — provisiona projeto Supabase,
configura envs na Vercel, roda migrations, faz deploy via SSE streaming, tem
polling de status, resume de instalação interrompida — com uma identidade visual
própria ("cinematográfica"/espacial) que não tem nenhuma relação com o design
system do CRM. Não existe mockup equivalente a essa complexidade no handoff.
**Decisão**: não reescrever essas duas telas. Risco de quebrar um fluxo crítico
de setup (que só roda 1x por instância, sem teste automatizado cobrindo o SSE)
supera o ganho visual, e não há especificação de design pra seguir com fidelidade.
`app/install/page.tsx` (redirect intermediário) também ficou como estava — é só
um loading que decide para onde redirecionar.

## Status final (2026-08-04): redesign completo

Todos os 11 blocos de trabalho concluídos. Sessão teve várias quedas transitórias
de conexão/watchdog nos agentes em background (só a 1ª rodada foi limite de
sessão real) — cada uma foi retomada via `SendMessage` a partir do próprio
transcript do agente, sem perder progresso.

**Verificação final rodada no repo inteiro depois de integrar os 6 blocos:**
- `tsc --noEmit` — 0 erros.
- `eslint . --max-warnings=0` — 0 problemas.
- `vitest run` — 445 passando, 5 skipped (nenhuma falha).
- `next build` — 110 rotas geradas sem erro.
- Smoke test manual (`next dev` + curl): `/login` e `/join` renderizam 200 com
  as classes novas (`auth__title`, `auth__claim`); `/dashboard` sem sessão
  redireciona 307 pro login (esperado).

**Incidente durante a execução**: um `git stash`/checkout externo (fora do
controle desta sessão) reverteu temporariamente o working tree no meio do
trabalho paralelo dos 6 agentes. Foi detectado e revertido por um dos agentes
antes de causar perda — confirmado depois por `git status` que todo o trabalho
dos 6 blocos estava intacto. Stash remanescente `qa-session-stash: mudanças
pré-existentes não relacionadas` — não tocado (não é desta sessão).

## QA em browser real (2026-08-04, `/qa` + claude-in-chrome via CDP no Chrome real)

Login real (`gcardosomktdigital`), dev server real (`next dev`, não build).
Telas abertas de fato e inspecionadas: `/login`, `/join` (smoke), `/inbox`
(visão geral), `/boards` (kanban), `/contacts` (lista + painel de detalhe,
clique num contato real), `/decisions` (estado vazio). Sem erro de console em
nenhuma.

**2 bugs de CSS reais achados e corrigidos** (detalhe completo em
`CHANGELOG.md`/`DESAFIOS.md`, commit `dd8e3eb`):
1. Texto de campos diferentes colado sem espaço em `.card-conv__body`/
   `.feed__body` (inbox) — faltava `display:flex;flex-direction:column`.
2. Sidebar com texto rosa/roxo em vez de branco — `.app a`/`.app button`/
   `.app input` tinham especificidade CSS maior que `.nav__item`/`.btn`/`.tab`,
   invertendo a cascata. Trocado por `:where(.app)`.

Reverificado depois do fix: `tsc`/`eslint`/`vitest`/`next build` continuam
verdes (445/450 testes, 5 skipped, 110 rotas).

**2ª rodada de QA** (mesmo dia, `/messaging`, `/boards` → modal de detalhe do
negócio, `/reports`, `/decisions` de novo): achado o bug mais sério da sessão
— **modo escuro persistido travando usuárias sem forma de sair** (commit
`a7516b1`, detalhe em `CHANGELOG.md`/`DESAFIOS.md`). O Chrome real do QA tinha
`crm_dark_mode: true` salvo de antes do redesign; trocar o *default* pra
`false` no código não migra quem já tinha o valor antigo, e como o toggle da
topbar foi removido, não havia mais controle de UI pra sair do escuro —
`DealDetailModal.tsx` (conteúdo ainda não restilizado) renderizava com texto
quase invisível sobre fundo azul-marinho. `ThemeProvider` corrigido pra forçar
light sempre e limpar a chave antiga do localStorage. `/messaging` foi aberto
mas sem conversas reais no banco de teste pra validar a thread de mensagens de
fato; `/reports` e `/decisions` (vazio) sem problema visual novo achado. A
extensão do Chrome caiu no meio da 2ª rodada (desconexão transitória, não
reconectou em 2 tentativas) — parado aí conforme a diretriz de não insistir
além de 2-3 tentativas em falha de ferramenta.

**3ª rodada** (mesmo dia, reconectando após a queda da extensão): cobriu
`/settings` completo (geral, configuração de IA, e `/settings/integracoes` —
esta última mostrou corretamente o gate "disponível apenas para
administradores" pro usuário de teste, que não é admin) e `/messaging` de
novo. **Nenhum bug novo achado** — zero erro de console, zero texto
sobreposto nas telas abertas. Nota cosmética não corrigida (fora do critério
de parada): o toggle "IA ativa na organização" em `/settings/ai` usa verde
em vez do roxo do `.toggle--on` do design system — parece um componente
`Switch` legado ainda não migrado, não uma classe do redesign com bug.

**4ª rodada** (mesmo dia — a conta de teste virou admin de verdade,
`role='admin'` setado pela fundadora direto no Supabase, e o MCP oficial do
Supabase passou a funcionar via token pessoal em vez do OAuth quebrado, ver
`DESAFIOS.md`): cobriu as 5 sub-abas de `/settings/integracoes` (Canais,
Webhooks, API, MCP, Segurança WhatsApp — todas reais, com dado de verdade:
canal WhatsApp real "desconectado", webhook real de entrada de leads da
Prospecção ativo, chave de API n8n) e `/settings/products`, todas como admin
de fato. **Zero bug novo.** `/messaging` reaberto com conta admin mostrou
conversas reais (WhatsApp, "Vitório Junior" com 212 mensagens, "Janela
expirada", bolhas de saída/entrada) — thread, composer e painel de contexto
renderizam corretamente com dado real, sem overlap, sem erro de console.
(A percepção de "lista vazia" na 3ª rodada foi falso alarme — timing de
carregamento logo após reiniciar o dev server, não um bug real; confirmado
recarregando a mesma tela sem nenhum filtro.)

**Achado fora do escopo do redesign, não corrigido**: `console.error`
("Error checking initialization: {}") em toda carga de página, origem
`context/AuthContext.tsx:136` (RPC `is_instance_initialized`) — não é do
redesign (arquivo não tocado por nenhum dos 6 blocos) e não trava nada
(fallback já trata), mas é ruído de console real. Detalhe em `DESAFIOS.md`.

**5ª rodada** (mesmo dia): `/deals/[id]/cockpit-v2` finalmente aberto com um
deal real — não há caminho de navegação exposto na UI até essa rota (só
`ver` numa decisão "decidida recentemente", que o banco de teste não tinha);
o ID do deal foi extraído direto do DOM do modal condensado (2 UUIDs visíveis
no HTML renderizado) e a URL montada à mão. **1 bug real achado e corrigido**
(commit `ffbdb14`): `.card-hitl__actions` (fileira de botões do card "próxima
ação") sem `flex-wrap` — com o número real de ações da tela (6, mais do que
o mock previa), os últimos botões ficavam cortados pela borda do card,
escondidos e inacessíveis. Corrigido com `flex-wrap: wrap`. Resto da tela
(contato principal, dados do deal, risco do deal, próximos passos, painel de
IA) sem outro problema. Achado fora de escopo, não corrigido: `console.error`
"API key não configurada para Google Gemini" (análise automática de IA sem
tratamento silencioso de erro quando a chave da org não está configurada —
`lib/ai/tasksClient.ts`, comportamento de produto pré-existente).

**Pendências que ainda exigem revisão visual humana**:
- `/ai`, `/profile` (nunca abertas em nenhuma rodada).
- `features/messaging/components/FocusContextPanel.tsx` (~1900 linhas,
  compartilhado com o cockpit) **não foi restilizado** — ainda no visual
  antigo, mas funcional (renderiza dentro do `.thread__body` novo).
- `TemplateSelector.tsx`/`TemplateManager.tsx` (messaging) e o conteúdo interno
  de alguns modais herdam só os tokens base, sem reescrita completa de layout.
- Cor azul (`#3b82f6`) fora da paleta no gráfico "de onde vieram os deals"
  (`/reports`) — pré-existente (`useDashboardMetrics.ts`, hardcoded antes do
  redesign), não corrigido por estar fora do critério de parada desta rodada
  (não é erro de console nem texto sobreposto) e por ser código não tocado
  pelo redesign.

## Progresso

- [x] Tokens + camada de componentes CSS integrados em `app/globals.css`.
- [x] Decisão light-only aplicada (`ThemeContext`, `app/layout.tsx`).
- [x] `app/login/page.tsx` redesenhado (auth.css), lógica Supabase preservada.
- [x] `app/join/JoinClient.tsx` redesenhado (auth.css + org-card), lógica de convite preservada.
- [x] `app/install/*` — exclusão de escopo deliberada (ver seção acima), não tocado.
- [x] `components/Layout.tsx` (shell sidebar/topbar)
- [x] Dashboard + Relatórios
- [x] Boards/Pipeline + Deal Cockpit — ver "Negociação + cockpit" abaixo
- [x] Contatos + Atividades
- [x] Inbox + Mensagens
- [x] IA hub + Decisões — `/decisions` redesenhado (`.card-approval`/`.auto-log`); `/ai` (`AIHubPage`) herdando `.btn`/`.panel`/`.chip`/tipografia, sem reestruturar. Ver nota de adaptação de dados abaixo.
- [x] Configurações (4 abas) + Perfil
- [x] QA final (`tsc`/`eslint`/`vitest`/`next build` no repo inteiro — ver "Status final" acima; revisão visual em browser real ainda pendente, ver pendências)

## Negociação (`/boards`) + cockpit — decisões de adaptação (2026-08-04)

**Mapa de cor dos estágios**: o handoff só tem 5 grupos (`--stage-frio/-proposta/
-contrato/-ganho/-perdido`) e o board real tem 14 estágios. `features/boards/
stageGroups.ts` faz a ponte, nesta ordem: `wonStageId`/`lostStageId` do board →
label normalizado (sem acento) → posição relativa (fallback pra boards
customizados). Coberto por `stageGroups.test.ts` contra os 14 labels reais da
migration T1b. `stage.color` (hex/classe Tailwind persistida) **não** é mais
usado pra colorir card/coluna — vira ruído com a paleta do handoff.

**Pendência HITL no card (`.badge-pending`)**: ligada ao dado real de
`ai_pending_stage_advances` via `usePendingAdvancesQuery({ status: 'pending' })`
no `KanbanBoard` (1 query pro board inteiro, indexada por `deal_id`). Quando
existe pendência, a borda do card vira lime (`.card-deal--pending`), a origem
vira "agente IA" e o `col-head` ganha `tag-pending` com a contagem da coluna.
`PipelineView` usa `usePendingAdvanceCountQuery()` só pro contador da toolbar.

**Origem do card (`.badge-origin`)**: derivada de dado real — pendência da IA →
`--ia`; dono humano ≠ "Sem Dono" → `--humano` (primeiro nome); senão →
`--auto` ("automação"). Não existe campo de origem no schema de `deals`.

**Canal do card (`.badge-channel`)**: `DealView` não tem canal. Só é renderizado
o badge de e-mail quando há `contactEmail`; sem dado, nenhum badge (preferimos
omitir a inventar WhatsApp/Instagram).

**Toolbar**: o mockup tem 3 filtros ("todos os deals" / "meus" / "aguardando
você"). O app só tem filtro de dono, então "aguardando você" virou **link** pra
`/decisions` com a contagem real — criar um filtro HITL mudaria comportamento do
controller. Os controles que o mockup não previa (seletor de board, kanban↔lista,
filtro de status, busca, config do board, export, automações) foram mantidos no
vocabulário `.filter-group`/`.input`/`.btn--ghost`.

**Drag-and-drop**: é HTML5 nativo (`draggable` + `dataTransfer`), **não** dnd-kit.
Nenhum handler (`handleDragStart`/`handleDragOver`/`handleDrop`) foi tocado — só
o DOM interno. O realce de drop virou `outline` lime na `ul.board__cards` (o
handoff não tem estado de drop).

**Cockpit (`/deals/[id]/cockpit-v2`)**: era dark (`bg-slate-950`, `h-dvh`
próprio). Virou full-bleed `.cockpit` dentro de `.screen`, com
`.cockpit__head` + `.stepper` (14 estágios reais, `--done`/`--current`,
clicável = `handleStageChange`) + `.cockpit__body` de 3 colunas. Remapeamentos:
- "Próxima ação" (IA) → `.card-hitl` no centro, com as ações de execução.
- "o que a IA já fez sozinha" (mockup) não tem equivalente real → o lugar ficou
  com as abas reais do agente (chat/notas/scripts/arquivos).
- Checklist persistido em `customFields` → "próximos passos" (`.checklist`) na
  aside direita, igual ao mockup.
- "risco do deal" (`.risk`) derivado do `health` real (IA + probabilidade).
- Barra de progresso de saúde → `.card-hitl__conf-track` com `confidence__marker`.
`DealCockpitFocusClient.tsx` (`/cockpit`) e os mocks de `labs/` **não** foram
tocados, conforme decisão 6.

**Modal do board (`DealDetailModal`)**: versão condensada do mesmo vocabulário —
shell/`header`/valor/badges/sidebar em `.btn`/`.badge-stage`/`.label`/
`.data-list`/`.avatar`; valor passou a ser BRL (`formatCurrencyBRL`) em vez de
`$`. O conteúdo profundo das abas seguiu como estava: já era light-first (as
classes `dark:` ficaram inertes desde a decisão 2).

**Teste ajustado**: `test/stories/US-AI-005` tinha assertion em
`closest('[class*="green"]')` pra confiança alta — a escala verde/âmbar não
existe mais; passou a checar `.badge-confidence--executada`. Nenhum outro teste
mudou; textos visíveis (percentuais, "Não identificado", "Atualizado em") foram
preservados de propósito.

## Riscos conhecidos / pendências

- Testes que tocam UI podem quebrar com a troca de markup/classes (lista em
  `DESAFIOS.md` se algum for de fato afetado): `components/ConfirmModal.test.tsx`,
  `components/ui/FormField.test.tsx`, `components/ui/Modal.test.tsx`,
  `features/boards/components/Modals/DealDetailModal.test.tsx`,
  `features/inbox/components/CallModal.test.tsx`,
  `features/settings/components/DealStageEventsSection.test.tsx`,
  `features/settings/components/WhatsAppSafetySection.test.tsx`,
  `features/settings/SettingsPage.rbac.test.tsx`,
  `test/stories/US-001-abrir-deal-no-boards.test.tsx` e outros `test/stories/US-AI-*`.
- Dois sistemas de modal coexistem (`Modal.tsx` custom vs Radix `dialog.tsx`/
  `alert-dialog.tsx`/`Sheet.tsx`/`ActionSheet.tsx`/`FullscreenSheet.tsx`) — o
  redesign não unifica isso, só restiliza o conteúdo interno de cada um usando as
  classes novas quando aplicável.
- Larguras mínimas de trabalho do handoff (`.inbox { min-width: 1180px }`,
  `.cockpit__body { min-width: 1180px }`, `.table-list { min-width: 840px }`) foram
  preservadas — essas telas rolam horizontalmente em vez de espremer em telas
  estreitas, exatamente como especificado.
- **`/decisions` não é o sistema de confiança 0.70/0.85 do mock `ia.html`.**
  `useDecisionQueue`/`decisionQueueService` (localStorage, analisadores
  `stagnantDealsAnalyzer`/`overdueActivitiesAnalyzer`) usam prioridade
  (`critical`/`high`/`medium`/`low`), não uma confiança numérica 0.00-1.00 — esse
  modelo de confiança/threshold vive em `lib/ai/agent/hitl-stage-advance.ts`
  (avanço automático de estágio), feature separada sem tela própria no handoff.
  Adaptações feitas em `DecisionCard.tsx`/`DecisionQueuePage.tsx` pra não inventar
  dado que não existe: painel lateral `.confidence` mostra prioridade + categoria
  reais em vez de um float fabricado; canal (`.badge-channel`) só aparece quando a
  ação é `send_message` com `payload.channel` de fato preenchido (a maioria das
  decisões daqui é agendar atividade, não mensagem); seção "feito automaticamente"
  do mock virou "decidido recentemente" e lista histórico real (`status ===
  'approved' | 'rejected'` via `decisionQueueService.getQueue()`) — nada aqui é
  executado sem aprovação humana, então não existe um log de "auto-executado" de
  verdade nesta feature. Stat "94% aprovadas sem edição" do mock foi removida (não
  há rastreio de edição por decisão); substituída por "última análise". "Editar
  antes" foi mapeado pra alternar a exibição das `alternativeActions` já existentes
  (seleção de ação alternativa antes de aprovar) — não existe edição de texto livre
  da ação, então não foi inventada.
