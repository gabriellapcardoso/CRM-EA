# TODOS

## Datas e fuso

### "Hoje" no servidor usa UTC, não o fuso da organização — P2

**What:** `lib/mcp/tools/ai.ts:159` e as rotas da API pública de contatos derivam
a data com `toISOString()`. A Vercel roda em UTC, então "hoje" ali é o dia UTC.
Para a org em GMT-3, das 21:00 à meia-noite isso é o dia seguinte.

**Why:** no cliente isso foi corrigido em 2026-09-03 usando o fuso do navegador.
No servidor não existe "fuso do navegador" — o correto é `organization_settings.
timezone`, que já está preenchido (`America/Sao_Paulo`) e já é lido pelo agente
de IA.

**Cuidado:** a API pública devolve datas num contrato já publicado. Mudar o fuso
da resposta é mudança de contrato, não correção silenciosa — precisa de decisão
antes.

**Effort:** M (a ferramenta de IA é S; a API pública exige decidir o contrato).

## AI

### Agente varia o próprio gênero entre mensagens — P2

**What:** nas três primeiras respostas reais (2026-09-03), o agente escreveu
"Obrig**ada**" para uma pessoa e "Obrig**ado**" para outra. Isso é o gênero de
quem fala, não de quem recebe — o agente se apresenta ora como mulher, ora como
homem, na mesma conversa comercial e no mesmo número.

**Why:** é voz de marca, e some no meio de respostas que no resto estão boas —
por isso passa fácil. Quem recebe duas mensagens do mesmo número em dias
diferentes percebe.

**Causa:** `organization_settings.ai_base_system_prompt` está **vazio**, então o
agente cai no prompt-base embutido, que não fixa identidade. O template de
estágio (`BANT_STAGE_PROMPTS`) também não diz nada sobre isso — trata técnica de
venda, não persona.

**Como:** preencher `ai_base_system_prompt` com a identidade e o tom da
aaagência, incluindo gênero e forma de tratamento. É o lugar certo: vale para
todos os estágios e não some quando alguém trocar o template de um deles.
Decisão de marca, não de código — a fundadora escreve, o agente aplica.

**Effort:** S (o campo já é lido; falta o texto).

### `provision-stages` sobrescreve prompt customizado sem avisar — P2

**What:** a rota atualiza `stage_ai_config` de estágios que já têm configuração,
substituindo `system_prompt`, `stage_goal` e `advancement_criteria` pelo template.
O comentário no código diz "only if not customized (check if prompt is still
default-ish)", mas nenhuma checagem desse tipo existe.

**Why:** quem ajustou o prompt à mão perde o trabalho ao clicar num botão que
promete "provisionar", e nada avisa. Em 2026-09-03 a IA do estágio "Novo" foi
configurada manualmente — um clique nessa rota a desfaz.

**Como:** ou implementar a checagem que o comentário promete (comparar com o
template e só atualizar se for igual), ou pedir confirmação listando o que será
sobrescrito. Enquanto não for feito, remover o comentário que descreve um
comportamento inexistente.

**Effort:** S.

## Messaging

### Remover a instância Evolution morta `aaagência` — P2

**What:** instância criada em 2026-08-15 com `integration: EVOLUTION` (canal
genérico, sem WhatsApp atrás). Substituída por `aaagencia-whatsapp`
(`WHATSAPP-BAILEYS`) em 2026-09-03. Ficou no servidor de propósito, pra permitir
voltar atrás.

**Why:** deletar antes de confirmar o novo funcionando seria irreversível sem
ganho. Depois do pareamento confirmado e de mensagem real entrando, ela só
confunde: o painel lista duas instâncias parecidas e a errada responde `open`.

**Quando:** condição satisfeita em 2026-09-03 — mensagens reais entraram,
respostas saíram e recibo de entrega voltou pelo canal novo. Liberado pra
remover: `DELETE /instance/delete/aaag%C3%AAncia`. **Effort:** S.

**Antes de apagar, conferir que é a certa:** as duas têm nome parecido e a morta
responde `open`. A boa é `aaagencia-whatsapp`, `integration: WHATSAPP-BAILEYS`,
com `ownerJid` preenchido. A morta é `aaagência` (com acento),
`integration: EVOLUTION`, `ownerJid` nulo, contadores zerados.

### ~~Kill switch de WhatsApp está LIGADO~~ — RESOLVIDO (2026-09-03)

**Status:** `whatsapp_kill_switch_active = false` desde 2026-09-03, depois de a
fundadora ler as três respostas que a IA gerou e que a trava barrou. A IA
responde lead novo automaticamente no estágio "Novo".

**O que a sequência comprou:** ligar a captação com o envio travado, deixar
tráfego real chegar, ler o texto gerado, e só então soltar. Isso provou a trava
com três mensagens de verdade (`failed`, `sent_at` nulo, motivo explícito) e
achou dois defeitos que só aparecem com tráfego — `CRM_EA_INTERNAL_WEBHOOK_SECRET`
ausente e o botão de reenvio inexistente — sem nenhum cliente receber mensagem
errada. Vale repetir esse padrão pra qualquer automação que fale com cliente.

**Pra parar tudo:** `whatsapp_kill_switch_active = true` bloqueia todo envio de
WhatsApp na hora, envio manual pelo inbox incluso
(`lib/messaging/whatsapp-send-guard.ts` é o choke point único).

### Sem botão na UI pra rearmar/diagnosticar webhook de canal

**What:** `POST/GET /api/messaging/channels/[id]/webhook` existe e funciona,
mas nenhuma tela chama. Hoje só dá pra usar por requisição direta.

**Why:** o incidente de 2026-09-03 (canal `connected` com webhook morto) não
tinha nenhum caminho de conserto dentro do app. A rota fechou isso pro código;
a UI ainda não. Um selo "webhook: entregando / não entrega" no card do canal em
`ChannelsSection`, com botão de rearmar, transforma um diagnóstico de meia hora
em um olhar.

**Effort:** S.

### URL de webhook ainda montada em três lugares

**What:** `lib/messaging/webhook-url.ts` é a fonte única criada em 2026-09-03 e
usada pelo servidor. `ChannelsSection.tsx:194` e `ChannelSetupWizard.tsx:886`
seguem montando a mesma URL por conta própria — e já divergem entre si (uma
monta por project ref, a outra pela env inteira).

**Why:** divergir na tela é confuso; divergir entre tela e servidor faz o admin
conferir uma URL e o CRM armar outra. Trocar as duas pelo helper é mecânico.

**Effort:** S. **Modelo:** Haiku.

### ~~getQrCode() usava endpoint errado + rota marcava canal conectado como erro~~ — RESOLVIDO

**Status:** RESOLVIDO 2026-08-31, achado por `/qa` ao vivo (não em teste isolado — contra o WhatsApp real da aaagência em produção) enquanto verificava o fix do botão "Desconectar".

**What:** dois bugs em cadeia no fluxo de reconexão:
1. `EvolutionWhatsAppProvider.getQrCode()` chamava `GET /instance/connect?instanceName=X` — endpoint que nunca existiu (404). Correto: `GET /instance/connect/{instance}?number=...` (path param + query obrigatória, confirmado na doc oficial).
2. Com o endpoint certo mas sem `number`: Evolution devolvia `200 {}` (corpo vazio) sem nunca sair de `close`, mesmo com sessão salva válida. Com `number`: reconecta na hora sem QR — e a rota `qr-code/route.ts`, que não esperava esse caminho, gravava `status='error'` num canal que na verdade tinha acabado de conectar.

**Fix:** endpoint + `number` corrigidos; rota agora confere `provider.getStatus()` de verdade antes de marcar erro — se confirma `connected`, grava `connected` e retorna `{alreadyConnected:true}`; `QrConnectModal` ganhou estado `reconnected` que aproveita o polling já existente pra fechar sozinho.

**Por que importa:** é a continuação direta do fix de "Desconectar" (que agora faz logout real) — reconectar logo em seguida é o caminho mais comum, não uma borda rara. Sem este fix, todo ciclo desconectar→reconectar quebraria a UI mostrando "erro" num canal são.

**Context:** Testes em `test/whatsappQrCodeRoute.test.ts`. Reproduzido e corrigido ao vivo contra `evolutionapi.gabriellapcardoso.com.br` — status do banco ficou temporariamente dessincronizado (`error` vs `open` real) e foi reconciliado manualmente via SQL antes do fix da rota estar testado em produção.

### ~~Botão "Conectar" do canal WhatsApp não conecta nada~~ — RESOLVIDO

**Status:** RESOLVIDO 2026-08-17. Código corrigido ([PR #4](https://github.com/gabriellapcardoso/CRM-EA/pull/4), [PR #5](https://github.com/gabriellapcardoso/CRM-EA/pull/5) — fechou [issue #3](https://github.com/gabriellapcardoso/CRM-EA/issues/3)) + causa raiz real identificada e corrigida (ver item abaixo, "instanceName com acento errado"). Canal `evolution` da aaagência confirmado `Conectado` na UI em produção.

**What:** botão "Conectar" agora chama a Evolution/Z-API de verdade e mostra QR code num modal.

**Context:** Achado por `/qa`, 2026-08-15. Spec revisado via `/plan-eng-review`. Testado em produção 2026-08-17, achado e corrigido um bug novo no mesmo dia (modal travava em erro, PR #5) e a causa raiz real do canal específico (mismatch de nome de instância, item abaixo).

### ~~Instância Evolution "aaagencia" não existe no servidor~~ — RESOLVIDO (era typo de configuração)

**Status:** RESOLVIDO 2026-08-17. Causa raiz: `credentials.instanceName` salvo no canal era `"aaagencia"` (sem acento), mas a instância real no servidor Evolution se chama `"aaagência"` (com acento — confirmado no painel `/manager`). O WhatsApp já estava conectado do lado da Evolution o tempo todo; o CRM só nunca conseguia falar com o endpoint certo por causa do nome errado. Corrigido com `UPDATE messaging_channels SET credentials = jsonb_set(credentials, '{instanceName}', '"aaagência"')`. **Não era bug de código nem do servidor** — nunca foi infra quebrada, era erro de digitação de quando o canal foi cadastrado no CRM.

**Context:** Achado testando o PR #4 ao vivo, 2026-08-17, confirmado acessando o painel `/manager` da Evolution diretamente.

### ~~`EvolutionWhatsAppProvider.disconnect()` não desconecta de verdade (só loga)~~ — RESOLVIDO

**Status:** RESOLVIDO 2026-08-31. Escopo maior que o descrito no item original: o botão "Desconectar" **nunca chegava no provider** — `handleToggleChannel` chamava `useToggleChannelStatusMutation`, que só faz `UPDATE messaging_channels SET status='disconnected'` direto do browser; `ChannelRouterService.disconnectChannel()` era código morto (nenhum caller no projeto). Espelho exato do bug do botão "Conectar" (issue #3).

**Fix:** `disconnect()` real nos dois providers (Evolution: `DELETE /instance/logout/{instance}`; Z-API: `POST /instance/disconnect` — endpoints confirmados na documentação oficial via Context7) + nova rota `POST /api/messaging/channels/[id]/disconnect` (auth + admin + isolamento por org, espelhando a rota de QR code) + `useDisconnectChannelMutation` + `ChannelsSection`/`ChannelSetupModal` roteando o "Desconectar" pra ela. Falha no provider não impede marcar o canal como desconectado no CRM (senão canal com credencial quebrada ficaria "conectado" pra sempre), mas a resposta traz `providerDisconnected: false` + `warning` e a UI mostra toast de aviso em vez de "Canal desconectado". Campo `persisted` na resposta cobre o caso inverso: provider desconectou mas o `UPDATE` no banco falhou — toast avisa que o status pode estar desatualizado em vez de afirmar sucesso. Testes: `test/whatsappProviderDisconnect.test.ts`, `test/whatsappDisconnectRoute.test.ts`, `lib/query/hooks/useChannelsQuery.test.ts`.

**Context:** Achado durante `/plan-eng-review` do issue #3 (fix do botão Conectar), 2026-08-15 — fora de escopo daquele fix. Resolvido 2026-08-31.

### Duplicação: bloco de auth+busca de canal repetido entre `qr-code/route.ts` e `disconnect/route.ts`

**What:** As duas rotas repetem quase literal: `isAllowedOrigin` → `auth.getUser()` → lookup de `profiles` com checagem de `role==='admin'` → lookup de `messaging_channels` filtrado por `organization_id`. Extrair um helper compartilhado (ex: `lib/messaging/routeAuth.ts: resolveAdminChannelContext(req, channelId)`) que devolve `{channel, profile}` ou um `Response` de erro.

**Why:** Achado pelo specialist de maintainability do `/ship`, 2026-08-31. Toda vez que uma das duas rotas mudar essa lógica (ex: novo campo no select, nova checagem de permissão), a outra precisa ser lembrada e atualizada manualmente — risco de drift silencioso.

**Pros:** Menos código duplicado, um único lugar pra corrigir bug de auth nas duas rotas.
**Cons:** Refactor cross-cutting mexendo nas duas rotas de conexão do WhatsApp — risco desnecessário pra fazer junto com um bugfix já testado em produção. Melhor isolado, com seu próprio teste de regressão.
**Context:** `app/api/messaging/channels/[id]/disconnect/route.ts` e `app/api/messaging/channels/[id]/qr-code/route.ts`.
**Effort:** S
**Priority:** P3
**Depends on:** None

### Duplicação: mesmo esqueleto fetch+erro entre `useConnectChannelMutation` e `useDisconnectChannelMutation`

**What:** As duas mutations em `lib/query/hooks/useChannelsQuery.ts` fazem `fetch(POST) → if (!res.ok) parse error body → throw`. Extrair um helper genérico tipo `postChannelAction<T>(channelId, path)`.

**Why:** Achado pelo specialist de maintainability do `/ship`, 2026-08-31. Mesma lógica copiada, sem mudança de comportamento — puro DRY.
**Pros:** Menos código pra manter sincronizado se o formato de erro da API mudar.
**Cons:** Não é urgente, não muda comportamento nenhum, só reduz duplicação.
**Context:** `lib/query/hooks/useChannelsQuery.ts`.
**Effort:** S
**Priority:** P4
**Depends on:** None

### Sem teste de componente pros toasts de "Desconectar" em `ChannelsSection`/`ChannelSetupModal`

**What:** `ChannelsSection.tsx` e `ChannelSetupModal.tsx` não têm NENHUM teste de componente no repo hoje (nem antes do fix de disconnect). A lógica nova de 3 toasts (sucesso / aviso de provider / aviso de persistência) ficou coberta só a nível de hook (`useChannelsQuery.test.ts`), não a nível de componente.

**Why:** Achado pelo specialist de testing do `/ship`, 2026-08-31. Cobrir isso direito exige criar a convenção de teste de componente pra essas telas do zero — não é só adicionar um teste isolado.
**Pros:** Fecharia o único buraco de cobertura real que sobrou no fix de disconnect.
**Cons:** Escopo maior que "adicionar 1 teste" — decisão de qual framework/convenção usar (Testing Library + qual setup de providers) fica pra quando isso for priorizado.
**Context:** `features/settings/components/ChannelsSection.tsx`, `features/messaging/components/Modals/ChannelSetupModal.tsx`.
**Effort:** M
**Priority:** P3
**Depends on:** None

### Mensagem crua do provider persistida em `status_message` e devolvida ao client

**What:** Em `disconnect/route.ts`, `error.message` (que inclui `responseText` bruto da Evolution/Z-API — pode ser HTML de página de erro ou detalhe de infraestrutura self-hosted) é gravado em `messaging_channels.status_message` e devolvido em `warning` na resposta JSON.

**Why:** Achado pelo adversarial review (subagent Claude) do `/ship`, 2026-08-31. Hoje só o admin da própria org vê isso (auth + role + `organization_id` corretos), risco baixo — mas se `status_message` aparecer em algum export, tela de suporte ou log agregado, pode vazar detalhe interno do servidor.
**Pros:** Fecha uma superfície pequena de vazamento de infra.
**Cons:** Sanitizar trunca informação útil pra debugar de verdade quando o provider falha — precisa de decisão sobre onde cortar.
**Context:** `app/api/messaging/channels/[id]/disconnect/route.ts`.
**Effort:** S
**Priority:** P4
**Depends on:** None

### Dois cliques rápidos em "Desconectar" podem gerar warning confuso (sem lock)

**What:** A rota lê o canal, chama `provider.disconnect()`, e só depois faz `UPDATE` — sem checar status antigo nem lock. Duas requisições concorrentes (duas abas, dois cliques rápidos) podem fazer o segundo `disconnect()` bater num "instance not found" da Evolution, mesmo o primeiro já tendo funcionado.

**Why:** Achado pelo adversarial review (subagent Claude) do `/ship`, 2026-08-31. Mitigado parcialmente por `isPending` desabilitando o botão na mesma aba, mas não entre abas/dispositivos.
**Pros:** Fecharia de vez uma janela de UX ruim (não é exploração, é confusão).
**Cons:** Baixa frequência real (exige duas abas/dispositivos no mesmo canal ao mesmo tempo); idempotência de verdade exigiria lock ou checagem de status antes de chamar o provider.
**Context:** `app/api/messaging/channels/[id]/disconnect/route.ts`.
**Effort:** S
**Priority:** P4
**Depends on:** None

## Observabilidade

### Guarda de segredo em migration não checa formato do valor — P1

**What:** as migrations que injetam `CRON_SECRET`/`HEALTHCHECKS_PING_URL` têm
guarda pra impedir que o placeholder seja aplicado sem substituição. Nenhuma
checa se o valor substituído faz sentido. Em 2026-09-02 um valor de 11
caracteres passou pela guarda e derrubou os dois health checks por 20h.

**Why:** substituição manual erra de duas formas — não substituir (a guarda pega)
e substituir errado (não pega). A segunda é pior, porque produz um sistema que
parece configurado.

**Como:** na guarda, além de comparar com o canário concatenado, checar tamanho
mínimo plausível; e quando o mesmo segredo já existir em outro job do banco,
comparar `md5()` contra ele e abortar se divergir. Ambas as checagens são
possíveis sem imprimir o valor. Ver `DESAFIOS.md`, "Guarda de placeholder não é
guarda de valor".

**Effort:** S. **Modelo:** Sonnet.

## Observabilidade — achados do review retroativo de 2026-09-01

Os 10 PRs de 2026-09-01 (#10 a #19) foram para produção **sem passar por `/review`**.
O review retroativo rodou depois, com dois revisores independentes (concorrência/
segurança e adversarial) mais uma varredura de PII.

**Os 6 P0 foram corrigidos e verificados em produção** (issue #20, PR #22). Os
P1/P2 restantes vivem na issue #23. Esta seção fica como registro do que foi
achado e do que sobrou.

### ~~O health check de IA não detecta o incidente que motivou sua construção~~ — RESOLVIDO (PR #22)

**What:** `app/api/cron/ai-health/route.ts` chama a IA pelo mesmo `getModel()` da
aplicação, que injeta `extraBody: { models: AI_FALLBACK_MODELS }` (PR #14). A
OpenRouter cai para a reserva **dentro da mesma requisição** e devolve 200. O check
vê 200 e reporta saudável.

**Provado em produção em 2026-09-01**, forçando `ai_model` para
`google/gemini-2.0-flash-001` (o modelo removido que causou o incidente):

```
{"checked":1,"degraded":0,"alerted":0}
```

**Why:** o cenário exato que motivou a issue #16 hoje passa como "IA saudável". A
org segue rodando num modelo que ninguém escolheu, com custo e comportamento
diferentes, e nada avisa. O failover virou anestesia: o detector foi construído em
cima da coisa que esconde o sintoma que ele deveria detectar.

**Pros:** a OpenRouter devolve o modelo que efetivamente respondeu. Comparar com
`config.model` e gravar `info` + e-mail de baixa urgência quando divergirem fecha
a lacuna com poucas linhas.
**Cons:** exige decidir o contrato — "rodar na reserva" é degradação (alerta) ou
operação normal (só log)? Alerta demais volta ao problema do falso positivo.
**Context:** `app/api/cron/ai-health/route.ts:60-77`, `lib/ai/config.ts:68-83`.
**Effort:** S · **Priority:** P0

### ~~O monitor falha em silêncio de três formas~~ — RESOLVIDO (PR #22), com uma ressalva

**What:** três caminhos em que o cron para de funcionar sendo indistinguível de
"tudo saudável":

1. **Sem heartbeat.** Sucesso não grava nada (`route.ts:144`) e `net.http_get` na
   migration descarta a resposta. Cron desagendado, 401 por rotação de segredo,
   deploy fora do ar: zero linhas, zero e-mails — igualzinho a IA saudável.
2. **Insert não verificado** (`route.ts:188`). Se gravar falhar, a consulta da
   janela nunca acha falha anterior, toda execução vira "1ª falha" e o e-mail
   **nunca** sai. `Promise.allSettled` engole a exceção.
3. **Cooldown auto-alimentado** (`route.ts:175-202`). Cada execução grava um
   `critical`, e a consulta de cooldown procura exatamente `critical` nas últimas
   4h — a janela nunca expira. Um e-mail por incidente e nunca mais, inclusive
   para um incidente novo que comece 30 min depois.

**Observado em produção** às 22:45 de 2026-09-01: `{"degraded":1,"alerted":0}` —
detectou, era 2ª falha, e não avisou.

**Why:** é a mesma classe do `alert_email` NULL que ficou 30 dias mudo, reintroduzida
no arquivo escrito para consertá-la. O `evolution-health` faz certo: `if (recentAlert)
return` vem **antes** do insert (`evolution-health/route.ts:94`).

**Resolvido em PR #22:** heartbeat gravado em toda execução (`cron_heartbeats`),
vigiado por `check_cron_heartbeats()` num job pg_cron que roda DENTRO do banco —
sobrevive à Vercel inteira cair. Erros de banco agora são lidos, contados em
`errosBanco` e devolvidos na resposta. Cooldown passou a medir
`details.email_enviado` em vez de linha gravada.

**Ressalva RESOLVIDA (2026-09-01, item 1 da issue #23):** o watchdog *gravava* o
alerta, não *enviava*. SQL não manda e-mail, e depender da aplicação pra avisar que
a aplicação morreu seria circular. `supabase/migrations/20260903000000_healthchecks_dead_mans_switch.sql`
faz `check_cron_heartbeats()` pingar um dead-man's switch externo (healthchecks.io) toda
vez que roda e encontra ZERO heartbeats atrasados. Se o Supabase inteiro cair, ou o
pg_cron for desativado, o ping para de chegar e o healthchecks.io alerta por fora — sem
depender de nada nosso pra funcionar. Se só `ai-health`/`evolution-health` pararem, o
watchdog já detecta isso hoje (não pinga, porque não está tudo são) e o alerta segue
saindo por `security_alerts`/e-mail, como já funcionava. Guarda:
`test/healthchecksDeadMansSwitch.test.ts` — trava que o ping é condicional (não sai se
algo estiver atrasado) e que a URL não foi commitada em texto plano. Verificado
injetando as duas regressões (ping incondicional, guarda removida) — vermelho, depois
verde. **Pendência:** aplicar a migration em produção com a Ping URL real substituída
(placeholder no arquivo) e confirmar o primeiro ping chegando no painel do healthchecks.io.
**Context:** `app/api/cron/ai-health/route.ts:140-230`.
**Effort:** M · **Priority:** P0 — RESOLVIDO NO CÓDIGO, PENDENTE DE APLICAR EM PRODUÇÃO

### ~~Migration de pg_cron quebra a produção se aplicada pelo fluxo normal~~ — RESOLVIDO (PR #22)

**What:** `supabase/migrations/20260901180000_pg_cron_health_checks.sql:33,53` gravam
o literal `'__CRON_SECRET__'`. `cron.schedule` com nome existente **substitui** o job.
Um `supabase db push`/`db reset`, ou qualquer agente seguindo o fluxo de migrations,
reagenda os dois health checks com token inválido → 401 a cada 15 min, para sempre,
sem sinal nenhum (ver item do heartbeat acima).

Mesmo defeito em `20260715173000_pg_cron_stage_evaluations.sql`, onde o estrago é
maior: a fila de avaliação de estágios para de drenar.

**Why:** a migration está no repositório **público** e parece aplicável. Quem aplicar
quebra três crons e não descobre.
**Pros:** `RAISE EXCEPTION` quando o placeholder não foi substituído falha alto em vez
de agendar lixo. Melhor ainda: ler do Supabase Vault (`vault.decrypted_secrets`).
**Cons:** Vault muda o padrão das migrations existentes; exige decidir se as antigas
migram junto.
**Effort:** S · **Priority:** P0

### Testes novos com falsa sensação de segurança — P1

**What:** 54 asserções verdes que não protegem o que o cabeçalho promete:

- ~~`test/cockpitLayout.test.ts:79-88` — 4 vagas de folga no
  `toBeGreaterThanOrEqual`~~ — **RESOLVIDO (PR #22)**: agora conta os blocos SEM
  classe e exige zero. Verificado injetando um bloco sem classe: o teste falha e
  nomeia o culpado.
- ~~`test/cockpitAiErrorText.test.ts:49-55` — "os dois textos são diferentes" não
  compara string nenhuma~~ — **RESOLVIDO (item 2 da #23)**: reescrito pra chamar
  `describeAIError` de verdade em vez de grep de texto. A checagem antiga também
  tinha um segundo defeito descoberto ao mexer: `toContain('IA fora do ar')`
  batia em **comentário**, não em código — passava mesmo com o texto fora do
  branch funcional. A versão nova remove comentários antes de procurar string.
- ~~`lib/ai/failover.test.ts:42-53` — dois testes com a mesma asserção. E
  `createOpenRouter` está mockado, então a forma do contrato nunca é validada~~
  — **RESOLVIDO (item 4 da #23)**: os dois testes idênticos viraram um. No lugar
  do segundo, um teste novo lê o `.d.ts` **instalado de verdade** do
  `@openrouter/ai-sdk-provider` (não o mock) e confirma que `extraBody` ainda
  existe em `OpenRouterProviderSettings`. Verificado renomeando o campo no
  `.d.ts` instalado: o teste novo quebra, os 7 que usam o mock continuam verdes
  — prova de que eles não fechavam esse buraco.
- ~~`test/aiHealthCron.test.ts` — o cabeçalho promete guardar "org sem ai_enabled
  não entra na consulta" e "janela de 20min"; não há asserção sobre nenhum dos
  dois~~ — **RESOLVIDO (item 4 da #23)**: os outros dois itens desta linha (insert
  falhando, `checked: 0`... falha do Resend) já tinham sido cobertos em algum PR
  anterior sem a issue ser atualizada — só `ai_enabled`/chave e a janela de 20min
  seguiam sem asserção real. Agora: `orgFilterCalls` captura os filtros de
  `.eq()`/`.not()` da consulta a `organization_settings` (o mock antes aceitava
  qualquer chamada sem registrar nada); `alertQueries` guarda o corte de cada
  consulta a `security_alerts` na ordem em que rodam, e um teste novo mede que o
  corte da janela é ~20min e o do cooldown é 4h — valores diferentes, não só
  "já houve falha" simulado. `checked: 0` ganhou teste próprio (org array
  vazio → loga alto). Verificado injetando as 3 regressões (filtro removido,
  janela virando 30min, log do `checked: 0` apagado) — 3 vermelhos, depois verde.
- ~~`rule()` helper em `cockpitLayout.test.ts:28-33` só enxerga a primeira regra
  com o seletor no início da linha~~ — **RESOLVIDO (item 4 da #23)**: virou
  `todasAsRegras()`, com flag global e aceitando indentação (pega regra dentro de
  `@media`, que `globals.css` indenta com 2 espaços). A checagem de "sem
  min-width" agora varre todas as ocorrências. Verificado injetando um
  `.cockpit__body { min-width: 1180px }` dentro de um `@media` no fim do
  arquivo — exatamente o cenário que passava batido — e o teste quebrou.

**Why:** teste que não pode falhar é pior que teste ausente — dá licença pra não olhar.
**Effort:** M · **Priority:** P1 — RESOLVIDO (2026-09-01)

### ~~Cockpit exibe dados inventados durante queda da IA~~ — RESOLVIDO (2026-09-01)

**What:** `features/inbox/hooks/useAIDealAnalysis.ts:53` devolvia
`probabilityScore: deal.probability || 50` no catch, e o cockpit derivava a saúde disso
(`DealCockpitClient.tsx:758`). Com a IA 100% fora do ar, o bloco "risco do deal"
mostrava **"médio · saúde 50%"** como se fosse análise. O PR #17 corrigiu só o texto do
`reason`; o número, que é o que se olha primeiro, continuava fabricado. O `|| 50` também
transformava probabilidade real de 0 em 50.

Relacionado: `DealCockpitClient.tsx:781` mostrava "IA fora do ar" para **qualquer**
rejeição, incluindo 403 `AI_FEATURE_DISABLED` (org desligou de propósito) e 401 de
sessão expirada — reportava queda inexistente e queimava a credibilidade do aviso.

**Resolvido:** `useAIDealAnalysis.ts` nunca mais fabrica `probabilityScore` — no erro
ele vem `undefined`, e o cockpit cai pro `probability` real do deal (dado do CRM, não
análise fingida). `lib/ai/tasksClient.ts` ganhou `AITaskClientError`, que preserva
`status` e `code` da resposta HTTP em vez de virar `Error` genérica. `DealCockpitClient`
usa `describeAIError(errorCode)` pra diferenciar: `AI_DISABLED`/`AI_FEATURE_DISABLED`
(org desligou), `AI_KEY_NOT_CONFIGURED` (falta configurar) e `UNAUTHORIZED` (sessão
expirada) ganham texto próprio; só erro de verdade continua dizendo "IA fora do ar".
Guarda: `features/inbox/hooks/useAIDealAnalysis.test.ts` (novo) e
`test/cockpitAiErrorText.test.ts` (reescrito). Verificado injetando as regressões —
vermelho, depois verde.

**Effort:** S · **Priority:** P1

### ~~Contradição documental entre CLAUDE.md e AGENTS.md sobre cadência de cron~~ — RESOLVIDO (2026-09-01)

**What:** `CLAUDE.md` afirmava *"Cadência de cron vive **só** no `vercel.json`"*.
`AGENTS.md` e `20260901180000_pg_cron_health_checks.sql` diziam o oposto: cadência vive
no pg_cron, e mexer no `vercel.json` faz a Vercel **rejeitar o deployment inteiro sem
criar build**. Ambas as frases foram escritas no mesmo dia, por mim.

**Why:** `CLAUDE.md` tem precedência de projeto. O próximo agente lê, edita o
`vercel.json` e congela a produção — a falha exata que este mesmo lote documentou.

**Resolvido:** a frase falsa saiu, e o `CLAUDE.md` ganhou o bloco que explica o limite
do plano Hobby e manda ler as migrations de pg_cron antes de tocar no `vercel.json`.
Como prosa já falhou em impedir isso duas vezes, a regra virou teste:
`test/vercelCronLimit.test.ts` quebra num 3º cron, em qualquer agendamento sub-diário
e no retorno da frase falsa. Verificado injetando as três regressões — 3 testes
vermelhos, depois verde de novo.

### Demais achados do review — P2 (migrados para a issue #23)

Seis itens desta lista caíram junto com os P0 no PR #22 e estão marcados abaixo.
Os demais seguem abertos na **issue #23**:

| # | Achado | Onde |
|---|---|---|
| ~~1~~ | ~~`pg_net` sem `timeout_milliseconds` (padrão 5s) chamando rota que leva até 20s~~ — RESOLVIDO (2026-09-01, código): `supabase/migrations/20260904000000_pg_net_timeout_health_checks.sql` reagenda os dois jobs com `timeout_milliseconds := 45000`. Guarda corrigida desta vez (canário quebrado, não `position()` contra dollar-quote — o bug do dead-man's switch). Testes: `test/pgNetTimeoutHealthChecks.test.ts`, 7 testes, verificado injetando as 2 regressões (timeout baixo, guarda antiga). **Pendente aplicar em produção** — ver PR | migration nova |
| ~~2~~ | ~~Janela de 20min acoplada à cadência de 15min sem garantia~~ — RESOLVIDO (2026-09-01): `test/aiHealthWindowCadence.test.ts` lê os dois números dos arquivos reais e exige janela > cadência. Verificado esticando a cadência simulada pra 30min: quebra | — |
| ~~3~~ | ~~`alerted++` antes do envio~~ — RESOLVIDO (PR #22): só incrementa em envio confirmado | — |
| ~~4~~ | ~~Org com `deleted_at` continua sendo checada~~ — RESOLVIDO (2026-09-01): filtra contra `organizations.deleted_at` antes de checar; erro na consulta auxiliar falha aberto (continua checando), não fechado. Guarda: 4 testes novos em `aiHealthCron.test.ts` | — |
| ~~5~~ | ~~Check usa texto puro~~ — RESOLVIDO (PR #22): usa `Output.object` | — |
| ~~6~~ | ~~`ai_conversation_log.model_used` grava o modelo pedido, não o que respondeu~~ — RESOLVIDO (2026-09-01): usa `result.response?.modelId`, mesmo padrão já usado em `ai-health/route.ts`. Guarda: `route.test.ts` (novo) | — |
| ~~7~~ | ~~Stepper sem `scrollIntoView` no estágio atual~~ — RESOLVIDO (2026-09-01): `useEffect` rola `.stepper__step--current` pra dentro da área visível ao trocar de estágio/deal. Guarda: `cockpitLayout.test.ts` | — |
| ~~8~~ | ~~Sem índice em `security_alerts`~~ — RESOLVIDO (PR #22) | — |
| ~~9~~ | ~~`security_alerts` não tem nenhum consumidor de leitura no produto~~ — DECIDIDO ADIAR (2026-09-02, issue #34 item 1): não é defeito, é feature que falta. A detecção chega em quem precisa por e-mail (verificado hoje), e o dead-man's switch externo cobre a falha do próprio monitor — a tabela é histórico pra auditoria pós-incidente, não o canal de alerta. Uma tela exige decisão de produto (onde na navegação, quem vê, e o que fazer com as linhas de `organization_id = null`, que são de instância e não de org) | — |
| ~~10~~ | ~~`checked: 0` como sucesso silencioso~~ — RESOLVIDO (PR #22) | — |
| ~~11~~ | ~~`usage === undefined` tratado como zero~~ — RESOLVIDO (PR #22) | — |
| ~~12~~ | ~~Race TOCTOU entre execuções sobrepostas~~ — DECIDIDO NÃO CORRIGIR (2026-09-02, issue #34 item 2): duas execuções só se sobrepõem por invocação manual durante teste (a cadência é 15min e a rota tem teto de 60s), e o pior desfecho é um e-mail de alerta duplicado — incômodo, não perda. O conserto real exige lock no banco (`pg_advisory_lock`), ou seja mais uma migration e mais um ciclo de aplicação manual em produção. Custo maior que o dano | `route.ts:151-199` |
| ~~13~~ | ~~`as never` desligava a checagem de tipo~~ — RESOLVIDO (PR #22) | — |
| ~~14~~ | ~~`CRON_SECRET` em texto puro dentro de `cron.job`, legível por quem tem service role~~ — DECIDIDO NÃO CORRIGIR (2026-09-02, issue #34 item 3): quem lê `cron.job` já precisa de `service_role`/superuser, nível que ignora RLS e lê qualquer tabela sem filtro — o segredo não abre porta nova pra esse ator. Migrar pra Vault reescreveria o padrão de todas as migrations de cron pra fechar um caminho que não é caminho de ataque real | banco |
| ~~15~~ | ~~Check gasta crédito da org 96x/dia sem opt-out, cap ou contabilização~~ — DECIDIDO ACEITAR (2026-09-02, issue #34 item 4): a conta é ~100 tokens por execução (prompt de 10 + teto de 64 na saída), 96x/dia = ~290k tokens/mês por org. Em modelo flash isso são **centavos por mês**. Construir opt-out, cap e contabilização custa mais do que o gasto que evitaria, e opt-out ainda cria o pior modo de falha possível: org que desliga o monitor e descobre a queda do jeito antigo. Revisar se o número de orgs chegar às centenas ou se o modelo padrão mudar pra um de outra ordem de preço | — |
| ~~16~~ | ~~Título e select truncados sem `title=`~~ — RESOLVIDO (2026-09-01): `title=` no `<h2>` e no `<select>` do cockpit | — |
| ~~17~~ | ~~Caminho de RAG (`ai_google_key`, API nativa do Google) não é coberto pelo check~~ — RESOLVIDO (2026-09-02, issue #34 item 5): `verificarCaminhoRAG()` em `lib/ai/messaging/file-search.ts` faz chamada mínima na API nativa do Google com a `ai_google_key` da org, e o `ai-health` chama isso depois do check de chat passar, só pra org que configurou a chave. Reusa toda a máquina de janela/cooldown/e-mail existente — zero mudança nela. Limitação conhecida e deliberada: sem File Search Store (é por board, nem toda org tem), então pega chave revogada/cota/modelo fora do catálogo, não pega store apagado. Guarda: 4 testes em `aiHealthCron.test.ts`, incluindo a ordem (chat quebrado não chega a checar RAG) | `defaults.ts:58` |
| ~~18~~ | ~~Lista de reserva tem 2 fabricantes mas só 1 alternativa real fora da DeepSeek~~ — DECIDIDO ACEITAR (2026-09-02, issue #34 item 6): a cadeia é `deepseek-v4-flash-0731` → `deepseek-v4-flash` → `google/gemini-3.5-flash-lite`. O objetivo declarado da lista é **sobreviver a um fornecedor inteiro cair**, e ela já cumpre: DeepSeek fora, Google atende; Google fora, DeepSeek atende. Um 3º fabricante só cobre queda simultânea de dois fornecedores — classe muito mais rara — e custa escolher, validar `tools` + `structured_outputs` e pagar por mais um modelo. Revisar se algum dos dois sair do catálogo | `defaults.ts:51` |
| ~~19~~ | ~~`Promise.allSettled` sem limite de concorrência contra `maxDuration=60`~~ — RESOLVIDO (2026-09-01): `lib/utils/concurrency.ts` (`comLimiteDeConcorrencia`, pool de trabalhadores, sem dependência nova) limita a 10 orgs simultâneas. Guarda: teste do utilitário mede o pico real de concorrência + teste de integração no `ai-health` com 15 orgs simuladas | — |
| ~~20~~ | ~~Comparação do `CRON_SECRET` não é constant-time~~ — RESOLVIDO (2026-09-01): `lib/security/cronAuth.ts`, `timingSafeEqual`, compartilhado pelas 4 rotas de cron (`ai-health`, `evolution-health`, `template-sync`, `stage-evaluations`). Guarda: `cronAuth.test.ts` | — |
| ~~21~~ | ~~Texto de erro do provider vai pro banco e e-mail sem redação~~ — RESOLVIDO (2026-09-01): `lib/security/redactSecrets.ts` redige `sk-`, `re_`, `eyJ...` e `Bearer <token>` na origem (dentro de `checarIA`), antes do texto virar `motivo`. Guarda: testes unitários + teste de integração em `aiHealthCron.test.ts` simulando o provider ecoando uma chave no erro | — |
| 22 | Guarda de placeholder de `20260901180000_pg_cron_health_checks.sql` compara `__CRON_SECRET__` contra uma cópia dele mesmo em dollar-quote — o mesmo formato que, na migration do dead-man's switch (item 1 da #23), disparava sempre, substituído ou não (ver DESAFIOS.md, 2026-09-01). Migration histórica já aplicada, não editar; risco só se precisar ser reaplicada do zero num ambiente novo | `20260901180000_pg_cron_health_checks.sql:31,59` |

**Varredura de PII:** limpa. Todos os matches no diff são fixtures de teste
(`sk-or-v1-fake-para-teste`, `destino@exemplo.test`, uuid falso) ou o remetente
institucional `alertas@aaagencia.com.br`. Nenhum segredo real vazou.

## Segurança

### ~~Rotacionar a chave da API Resend exposta em texto puro (2026-09-01)~~ — RESOLVIDO (2026-09-03)

**Rotacionada pela fundadora em 2026-09-03.** A chave exposta não vale mais. Registro
mantido abaixo porque o episódio é a fonte da regra de fixture em `AGENTS.md`
(Testing Rules) e da lição em `DESAFIOS.md` — apagar o item apagaria o porquê.

**What:** a chave `RESEND_API_KEY` de produção foi colada em texto puro numa conversa
com agente de código, em 2026-09-01, pra ser configurada na Vercel. Precisa ser
rotacionada no painel do Resend e atualizada na env var da Vercel.

**Why:** chave que passou por canal não criptografado é chave comprometida, mesmo que
nada indique uso indevido. Ela autentica o envio de **todo** alerta operacional do CRM
(`ai-health`, `evolution-health`) — se for revogada por terceiro, o CRM perde a via de
alerta inteira e só descobre pelo dead-man's switch externo.

Agravante do mesmo dia: ao implementar `redactSecrets()`, um rascunho de teste
reutilizou essa chave como fixture. Foi pego pela varredura de PII antes do commit e
nunca chegou ao git — mas o episódio confirma que o valor circula em contexto e reforça
a rotação. Ver `DESAFIOS.md`, "Escrevi a chave real que o usuário colou no chat".

**Como verificar que foi feito:** a chave nova tem prefixo `re_` diferente do valor
antigo; depois de trocar na Vercel, forçar uma falha de health check e confirmar que o
e-mail ainda chega.
**Effort:** S · **Priority:** P1 — ação manual, fora do alcance de agente

## Layout

### Painel do discador não fecha com Escape e não é anunciado como diálogo

**What:** o painel de registro de ligação (botão "ligar" no cockpit) é `fixed inset-0 ... z-[9999]`, cobre a tela inteira, e **não tem `role="dialog"`, `aria-modal` nem `aria-label`**. `Escape` não fecha — a única saída é o botão "Descartar". Achado pelo `/qa` em 2026-09-01 testando os 4 botões de canal em produção.

**Why:** leitor de tela não anuncia como diálogo e não confina o foco, então a pessoa continua tabulando pelo conteúdo atrás do overlay sem perceber que está num modal. E `Escape` é o gesto universal de fechar: quando não funciona num painel fullscreen, a sensação é de travamento. Os modais de WhatsApp e e-mail no mesmo bloco fecham com `Escape` normalmente, então é inconsistente dentro da própria tela.

**Pros:** conserto pequeno e isolado — adicionar os atributos ARIA e um handler de `keydown`. Alinha o discador com os outros dois modais do mesmo bloco.
**Cons:** fechar por `Escape` num painel que registra uma ligação em andamento pode descartar dados que a pessoa digitou (duração, resultado). O conserto precisa decidir se `Escape` descarta ou pede confirmação — não é só adicionar o listener.
**Context:** o painel tem os botões Atendeu / Não atendeu / Caixa postal / Ocupado / Descartar / Copiar número / Abrir no discador / Salvar Log. Buscar por `md:left-[var(--app-sidebar-width` em `features/deals/`.
**Effort:** S
**Priority:** P2

### Botão "e-mail" abre o compositor mesmo sem e-mail cadastrado

**What:** no cockpit, clicar em "e-mail" para um contato sem endereço abre o modal "Preparar email" com o texto "Sem email cadastrado" no lugar do destinatário. O compositor abre inteiro para algo que não tem como ser enviado. Achado pelo `/qa` em 2026-09-01.

**Why:** custa um clique e uma leitura para descobrir que não dá. O caminho útil seria levar direto a cadastrar o e-mail do contato, que é o que a pessoa precisa fazer de qualquer forma.

**Pros:** ou desabilitar o botão com um `title` explicando, ou trocar o destino para o cadastro do contato. Ambos são pequenos.
**Cons:** desabilitar esconde a funcionalidade de quem ia cadastrar o e-mail em seguida; e pode haver fluxo em que o e-mail é preenchido dentro do próprio compositor (verificar antes de mexer). Escolher entre as duas saídas é decisão de produto.
**Context:** bloco "contato principal" do cockpit, `features/deals/cockpit/DealCockpitClient.tsx` (botões `.channel-actions__btn`).
**Effort:** S
**Priority:** P3

### `.inbox` ainda tem o `min-width: 1180px` que saiu do cockpit

**What:** `app/globals.css:1073` mantém `min-width: 1180px` no Inbox. O cockpit perdeu o dele em 2026-08-31 e virou coluna única; o Inbox ficou sozinho com o número. Continua rolando pro lado em qualquer notebook de 1280px com a barra lateral aberta (1044px úteis) — é literalmente o bug que `DESAFIOS.md` registrou em 14/08 com o card "aprovações IA" 102px fora da tela.

**Why:** A justificativa antiga ("decisão de design pra telas densas") caiu: 1180 não bate com a soma das colunas do Inbox (322 + 440 + 340 + bordas = 1104px) nem com a do cockpit (1028px). É largura de trabalho do handoff HTML, copiada literal pras duas classes.

**Pros:** Fecha de vez o item de 14/08 e tira o último scroll horizontal do app. O caminho já está trilhado e medido no cockpit.
**Cons:** O Inbox tem 3 painéis com papéis diferentes do cockpit (lista de conversas / thread / contexto) — a solução de coluna única provavelmente NÃO se aplica ali, uma conversa quer painéis lado a lado. Precisa de desenho próprio, não é copiar o diff do cockpit.
**Context:** `app/globals.css:1073` (`.inbox`), `:1090` (`.thread`, `min-width: 440px`). `DESAFIOS.md`, item de 2026-08-14 e o item de `min-width` de handoff de 31/08.
**Effort:** M
**Priority:** P2

### As sombras de scroll de `.screen` provavelmente nunca apareceram no Inbox

**What:** `app/globals.css:684-697` pinta gradientes de sombra no `<main>` como afordância de scroll horizontal, e o `CHANGELOG` trata isso como a correção do problema de descoberta do Inbox. Só que as camadas usam `background-attachment: scroll` e todo o conteúdo daquelas telas é opaco de ponta a ponta (`.conv-pane`, `.thread`, `.detail-pane` com `--surface-card`/`--surface-subtle`): a sombra fica **atrás** desses fundos. Ela só rende em telas com `.screen__inner` transparente (Contatos, Atividades).

**Why:** Achado por leitura de CSS durante a revisão do cockpit, não por teste. Se confirmado, o Inbox continua cortando conteúdo sem nenhum aviso visual, e a documentação diz o contrário — o que faz a próxima pessoa não procurar.

**Pros:** Barato de verificar (rolar `.screen` pra direita em 1280×800 e olhar). Se der negativo, corrige uma afirmação errada em dois documentos.
**Cons:** Se a sombra realmente não funciona, o conserto (mover a afordância pra dentro dos painéis, ou barra sempre visível) é maior que o próprio diagnóstico.
**Context:** `app/globals.css:684`. Depende do item acima — se o `.inbox` deixar de precisar de scroll horizontal, a afordância vira desnecessária ali.
**Effort:** S (verificar) / M (corrigir)
**Priority:** P2

### `display: contents` nos `<li>` do stepper tira a semântica de lista

**What:** `DealCockpitClient.tsx:1583` põe `style={{ display: 'contents' }}` em cada `<li>` do `<ol className="stepper">`, pra que o `<button>` interno seja o item flex direto. Isso funciona pro layout, mas `display: contents` em `<li>` historicamente remove o role `listitem` da árvore de acessibilidade (ainda vale no WebKit) — o `<ol>` é anunciado como lista vazia e o `aria-current="step"` fica pendurado num botão que não pertence a lista nenhuma.

**Why:** Pré-existente, não introduzido pelo redesign de 31/08 (o wrap do stepper conviveu com isso sem piorar). Mas numa tela de governança o stepper é justamente o mapa do processo: pra quem usa leitor de tela, "passo 5 de 15" é a informação principal e hoje ela não chega.

**Pros:** Conserto é CSS + uma linha de JSX: tirar o `style` inline, `.stepper li { display: flex; flex: 0 0 auto; }` e mover o `flex: 0 0 auto` de `.stepper__step` pro `li`.
**Cons:** Move a propriedade que rege a quebra de linha de um elemento pro outro — mexe exatamente no que acabou de ser estabilizado. Fazer sozinho, com medição, não junto de outra mudança.
**Context:** `features/deals/cockpit/DealCockpitClient.tsx:1583`, `app/globals.css` (`.stepper`, `.stepper__step`).
**Effort:** S
**Priority:** P2

### `sidebarCollapsed` do `UIStore` é escrito pelo Inbox mas ninguém lê

**What:** `InboxFocusView.tsx:298` chama `setSidebarCollapsed(showContext)` ao abrir/fechar o painel de contexto, mas **nenhum componente lê `sidebarCollapsed`** — o `Layout` nunca consumiu esse estado. É código morto: o Inbox acha que colapsa a barra lateral e não colapsa nada.

**Why:** Achado ao implementar a barra ocultável (2026-08-31). Mesmo padrão do bug do botão "Desconectar" (método com assinatura correta, zero callers — ver `DESAFIOS.md`). Ou o Inbox deveria mesmo colapsar a barra ao abrir contexto (e a intenção original se perdeu), ou a chamada é resíduo e deve sair.

**Pros:** Ou entrega um comportamento que alguém quis (mais espaço no Inbox ao abrir contexto), ou remove código que engana quem lê.
**Cons:** Ligar o `sidebarCollapsed` ao layout muda comportamento do Inbox que ninguém pediu — some a barra ao abrir contexto, o que pode surpreender. Precisa de decisão de produto antes, não é só apagar ou ligar.
**Context:** `features/inbox/components/InboxFocusView.tsx:298`, `lib/stores/index.ts`. O estado novo `sidebarHidden` (preferência do usuário) foi deixado separado de propósito e não resolve esse item.
**Effort:** S
**Priority:** P3
**Depends on:** Decisão de produto (o Inbox deve colapsar a barra ou não?)

## Data & Soft-delete

### ~~Auditar `deleted_at` nas outras tabelas com soft-delete~~ — RESOLVIDO (camada de dados do app)

**Status:** RESOLVIDO 2026-08-31 para a camada `lib/supabase/*` (a que alimenta as telas). Auditadas as 221 queries das 7 tabelas com `deleted_at`. Achados e corrigidos 6 pontos, 2 deles com impacto visível na hora (3 atividades e 3 empresas excluídas aparecendo nas telas de Atividades e Empresas). `contactsService`, `messaging_channels` e `business_units` já estavam corretos. Guarda: `test/softDeleteFilters.test.ts` (8 testes). Ver CHANGELOG para a lista completa.

### Camada de IA/MCP e Edge Functions ignoram `deleted_at` em contacts/activities

**What:** A auditoria de 2026-08-31 cobriu `lib/supabase/*` (o que alimenta as telas) mas deixou de fora ~30 queries em `lib/ai/tools.ts`, `lib/mcp/tools/*`, `lib/ai/agent/*` e `supabase/functions/*` que leem `contacts`/`activities` sem `.is('deleted_at', null)`.

**Why:** Amostragem confirmou pelo menos um caso real: `lib/ai/tools.ts:773` procura contato por nome (`ilike`) sem excluir deletados — a IA reusaria um contato excluído em vez de criar um novo, efetivamente ressuscitando o registro. `lib/ai/agent/context-builder.ts:76` monta o contexto do agente a partir de contato que pode estar excluído.

**Pros:** Fecha o mesmo bug na superfície que o agente de IA enxerga — hoje a IA pode agir sobre dado que o usuário considera apagado.
**Cons:** Diferente da camada de telas, aqui **nem toda ocorrência é bug**: webhook que faz lookup por `external_id` pra garantir idempotência talvez precise enxergar o registro excluído; log de auditoria idem. Exige entender fluxo por fluxo antes de sair adicionando filtro — corrigir errado quebra idempotência de webhook, que é pior que o bug original.
**Context:** Lista completa reproduzível com o grep descrito no CHANGELOG (entrada "auditoria de `deleted_at`"). Padrão de referência: `lib/supabase/contacts.ts`.
**Effort:** M (a análise é o custo, não a edição)
**Priority:** P2
**Depends on:** None

## Infrastructure

### Revisar `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true` no Evolution

**What:** O serviço Evolution está com `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true`, o que faz `GET /instance/fetchInstances` devolver o token de cada instância no corpo da resposta. Avaliar se algum consumidor depende disso; se não, virar `false`.

**Why:** Achado durante a rotação da API key (2026-08-31). Com a chave de admin rotacionada o risco caiu bastante (só quem tem a chave nova chama o endpoint), mas é superfície extra de exposição de credencial sem necessidade comprovada.

**Pros:** Menos credencial trafegando em resposta de API.
**Cons:** Se algum fluxo do CRM lê o token da instância a partir desse endpoint, desligar quebra — precisa conferir antes de mudar.
**Context:** Env var no painel Easypanel (projeto `evolution`, serviço `evolution-api`). Lembrar que salvar exige "Implantar" e que todo deploy pelo painel reverte o `endpoint-mode` pra `vip` (ver `DESAFIOS.md`).
**Effort:** S
**Priority:** P2
**Depends on:** None

### `dnsrr` é contorno; IPVS do Swarm segue quebrado na VPS

**What:** Todo redeploy de serviço pelo Easypanel (e todo reboot da VPS) reverte `endpoint-mode` pra `vip` e derruba os domínios com 502, exigindo reaplicar `docker service update --force --endpoint-mode dnsrr <serviço>` manualmente. A correção de raiz é `systemctl restart docker`, que reconstrói o IPVS.

**Why:** Já aconteceu 2x em 2026-08-31 (reboot pós-pagamento da VPS e redeploy da rotação de chave). Enquanto não for corrigido na raiz, qualquer deploy futuro pelo painel derruba Evolution/n8n/gerador até alguém perceber e reaplicar.

**Pros:** Elimina uma pegadinha recorrente que derruba produção silenciosamente.
**Cons:** `systemctl restart docker` reinicia TODOS os containers da VPS (n8n, bancos, grafana, Evolution) — precisa de janela combinada. Foi bloqueado por permissão quando tentei; exige execução manual com a fundadora ciente.
**Context:** `DESAFIOS.md`, seção "VPS suspensa e religada". Diagnóstico rápido: `docker service inspect <serviço> --format '{{.Spec.EndpointSpec.Mode}}'`.
**Effort:** S (o comando) — o custo é a janela de indisponibilidade
**Priority:** P2
**Depends on:** Janela combinada, fora de horário de atendimento

### Telefone real ainda visível no histórico do git

**What:** `+55…` (número pessoal da fundadora) foi redigido do `CHANGELOG.md` atual em `e66aca4`, mas continua visível em commits anteriores via `git log`/GitHub, em repositório público. Remover exige reescrever histórico (`git filter-repo`/BFG) + force-push.

**Why:** Decisão consciente de 2026-08-31: a fundadora optou por só limpar o arquivo atual, sem reescrever histórico. Registrado aqui pra não parecer esquecimento.

**Pros:** Removeria PII de repo público de vez.
**Cons:** Reescrever histórico quebra clones e qualquer PR aberto baseado nos commits antigos; exige avisar colaboradores. Só fazer com decisão explícita.
**Context:** Mesmo padrão do commit `0b7f80d` (que removeu o número do `TODOS.md`).
**Effort:** M (com cuidado)
**Priority:** P3
**Depends on:** Decisão explícita da fundadora

### `lib/supabase.ts` sombreia `lib/supabase/index.ts` — barrel morto, nunca alcançado por nenhum import

**What:** `@/lib/supabase` resolve pro arquivo solto `lib/supabase.ts`, não pra pasta `lib/supabase/index.ts` (confirmado: os dois arquivos existem lado a lado; resolução de módulo prioriza arquivo sobre `index` de pasta com mesmo nome). O barrel dentro de `lib/supabase/` está morto — nenhum import no projeto o alcança.

**Why:** Qualquer export adicionado só no barrel (`lib/supabase/index.ts`), por qualquer PR futuro, silenciosamente não existe em lugar nenhum do app real — sem erro de build, sem warning, só um `undefined` em runtime ou um import que "funciona" mas não é o código que o autor pensa que está editando.

**Context:** Achado durante T6 (`contact_product_interests`, 2026-08-06). Não corrigido de propósito — fora de escopo do T6. `CLAUDE.md` deste projeto instrui "importar sempre de `@/lib/supabase` (barrel export)", o que reforça a expectativa errada de que o barrel É o que está em uso. Precisa de decisão: (a) consolidar tudo em `lib/supabase.ts` e apagar o barrel morto em `lib/supabase/`, ou (b) migrar `lib/supabase.ts` pro conteúdo do barrel e apagar o arquivo solto, atualizando o `tsconfig`/imports se necessário. Baixo risco de execução, mas precisa de auditoria de todos os ~99 imports de `@/lib/supabase*` antes de escolher qual lado descartar — ver tentativa relacionada e frustrada em `DESAFIOS.md` (migração de imports diretos pro barrel quebrou `npm run build` por `server-only` vazando pro client bundle; qualquer fix aqui precisa considerar essa mesma armadilha).

**Effort:** S (a decisão) + S (a migração, depois de auditar)
**Priority:** P2
**Depends on:** None

## AI Provider

### ~~Configurar fallback nativo de modelo da OpenRouter (`models: [...]`)~~ — RESOLVIDO

**Status:** RESOLVIDO 2026-09-01 ([PR #14](https://github.com/gabriellapcardoso/CRM-EA/pull/14)), depois de a classe de falha que este item previa acontecer de verdade: a OpenRouter removeu `google/gemini-2.0-flash-001` do catálogo e derrubou os 17 arquivos da camada de IA, agente do WhatsApp incluso. Estava como P3.

**Lista escolhida** (era o "Cons" em aberto deste item): primário `deepseek/deepseek-v4-flash-0731`, reservas `deepseek/deepseek-v4-flash` e `google/gemini-3.5-flash-lite`. Duas famílias de fabricante de propósito — dois modelos do mesmo fornecedor cairiam juntos e a lista não serviria pra nada. Todos com `tools` e `structured_outputs`, senão o agente e as tarefas quebrariam justamente durante o incidente em que o fallback deveria salvar.

**Provado em produção**, não só em teste: `ai_model` foi forçado para o modelo removido, e `POST /api/ai/tasks/deals/analyze` respondeu **200** com JSON válido, zero erros nos logs da Vercel no período. Antes do fix, o mesmo cenário dava 500. Banco restaurado logo em seguida. Guarda em `lib/ai/failover.test.ts`.

**O que ficou de fora:** `lib/ai/agent/provider-failover.ts` continua intocado — faz failover entre *providers*, não entre modelos, e resolve outro problema.

<details><summary>Descrição original</summary>

**What:** Ao criar o client OpenRouter em `lib/ai/config.ts`, configurar o parâmetro nativo `models: [fallback-list]` (feature da própria API da OpenRouter, não do Vercel AI SDK) — se o modelo primário falhar, a OpenRouter tenta o próximo da lista automaticamente, sem passar pelo `provider-failover.ts` do projeto.

**Why:** Dá resiliência a falha de modelo específico (rate limit, outage pontual) sem exigir a generalização multi-provider (Opção B, descartada em `/plan-eng-review` de 2026-08-14 por não ter um segundo provider real esperando pra usar).

**Pros:** Configuração de ~1 linha, resolve um caso real (modelo específico fora do ar) sem tocar `provider-failover.ts`.
**Cons:** Nenhuma lista de fallback foi escolhida ainda — decisão de quais modelos entram na lista fica pra quando for implementado.
**Context:** Achado durante `/plan-eng-review` da troca Google Gemini → OpenRouter (2026-08-14). Confirmado via docs oficiais do AI SDK (`ai-sdk.dev/providers/community-providers/openrouter`) que o pacote `@openrouter/ai-sdk-provider` é o caminho oficial pro AI SDK v6, sem adapter customizado.
**Effort:** S
**Priority:** P3
**Depends on:** Migração pra OpenRouter (troca de provider) já concluída.

</details>

### Remover colunas mortas `ai_openai_key`/`ai_anthropic_key` de `organization_settings`

**What:** Migration `DROP COLUMN ai_openai_key, ai_anthropic_key` (schema, não código de app — `getOrgAIConfig` já não seleciona essas colunas).

**Why:** Sobra da consolidação pro Google Gemini (documentada no CHANGELOG, "Provider Consolidation" — remoção de referências a OpenAI/Anthropic). As colunas existem no banco desde `20251201000000_schema_init.sql` mas nenhum código lê ou escreve nelas hoje — dívida de schema que pode confundir quem olhar a tabela achando que esses providers ainda são suportados.

**Pros:** Schema mais limpo, remove superfície de dúvida futura sobre "esses providers ainda funcionam?".
**Cons:** Não é urgente — coluna órfã não causa bug, só ruído. Migration destrutiva (`DROP COLUMN`) precisa rodar separada da migration aditiva que cria `ai_openrouter_key`, nunca junto (mistura aditivo com destrutivo é anti-padrão).
**Context:** Achado durante `/plan-eng-review` da troca Google Gemini → OpenRouter (2026-08-14), ao mapear o schema de `organization_settings` pra decidir onde a chave da OpenRouter deveria morar.
**Effort:** S
**Priority:** P3
**Depends on:** Nenhuma tecnicamente, mas faz sentido rodar depois que `ai_openrouter_key` estiver estável em produção (evita fazer duas migrations "ai_*" seguidas por nada).

### Backfill `organization_settings.ai_provider` pra `'openrouter'`

**What:** Migration `UPDATE organization_settings SET ai_provider = 'openrouter' WHERE ai_provider = 'google'` + `ALTER COLUMN ai_provider SET DEFAULT 'openrouter'`.

**Why:** Coluna ainda tem `DEFAULT 'google'` e orgs criadas antes da migration OpenRouter (2026-08-15) carregam esse valor stale no banco. O crash em runtime já foi neutralizado (`AI_DEFAULT_MODELS.openrouter` indexado direto, não pelo valor do banco — ver `DESAFIOS.md`), mas o campo `provider` que flui por `buildProviderList`/`generateWithFailover` ainda pode aparecer como `'google'` em logs/metadata (`providerUsed`) pra essas orgs.

**Pros:** Elimina resíduo cosmético, schema fica coerente com o provider real em uso.
**Cons:** Sem impacto funcional — não é urgente. `UPDATE` em massa precisa rodar fora de horário de pico se a tabela crescer (hoje baixo volume, risco mínimo).
**Context:** Achado por `/review` no diff da migração OpenRouter (2026-08-15), classificado como informational (não bloqueou o ship). Detalhes em `CHANGELOG.md`/`DESAFIOS.md` (entrada "Indexar Record<Provider, Model>...").
**Effort:** S
**Priority:** P3
**Depends on:** Nenhuma.

### Sinal na UI quando WhatsApp automático falha por falta de canal configurado

**What:** Quando `auto_send_proposal_whatsapp=true` mas a org não tem canal WhatsApp conectado (`get-active-channel.ts` retorna null), `enviarPropostaWhatsapp` retorna `motivo:'sem_canal'` e a rota interna só loga (`console.error`) — sem nenhum sinal visível no CRM. Adicionar um indicador na UI (badge no deal, notificação, ou relatório periódico) quando isso acontecer.

**Why:** Achado do adversarial review (`/review`, 2026-08-15) do disparo automático de proposta (T4). Diferente de falha transitória de rede (que já é best-effort por decisão explícita), "org ligou o flag mas nunca conectou canal" é erro de configuração permanente — todo deal que passa por "Proposta pronta" falha o WhatsApp silenciosamente, pra sempre, sem ninguém do time perceber. Vendedor vê e-mail saindo e deal avançando, assume que WhatsApp também saiu — risco de "cliente nunca recebeu a proposta" sem causa raiz óbvia.

**Pros:** Fecha um buraco real de observabilidade num fluxo que já é 100% automático (ninguém está "olhando" pra confirmar que funcionou).
**Cons:** Precisa decidir onde mora o sinal (badge no deal? alerta pro admin? relatório semanal?) — não é só código, é decisão de produto. Fora de escopo da entrega T4 original.
**Context:** Ver `lib/messaging/send-proposta-whatsapp.ts` (retorna `motivo`) e `app/api/internal/auto-whatsapp-proposta/route.ts` (só loga). Plano completo em `plano-disparo-automatico-proposta.md`.
**Effort:** M (decisão de produto + implementação)
**Priority:** P2
**Depends on:** T4 em produção há tempo suficiente pra confirmar que o caso acontece de verdade (não é hipotético).

### Settings de admin renderizam mesmo pra não-admin (falha só no POST)

**What:** `SettingsPage.tsx` só usa `isAdmin` pra filtrar quais abas aparecem na navegação (`tabs`), mas `renderContent()` não checa `isAdmin` — um não-admin que navega direto pra `/settings/integracoes#whatsapp-safety` (ou `/settings/products`) vê a tela renderizada por completo, inclusive o toggle interativo "Enviar proposta automaticamente por WhatsApp" com confirm dialog. Só falha (403) quando tenta de fato salvar.

**Why:** Achado do adversarial review (`/review`/`/ship`, 2026-08-15) do toggle de disparo automático de proposta. Não é bypass real (POST valida `role==='admin'` no servidor, sempre validou), mas é UX ruim: não-admin percorre um fluxo de confirmação inteiro ("o CRM vai enviar... sem revisão humana") pra só então descobrir que não tinha permissão — pior ainda numa ação que promete disparo automático de mensagem real pra cliente. Padrão idêntico provavelmente existe nas outras abas admin-only (ex: Produtos & Catálogo).

**Pros:** Fecha um gap de UX/confiança em toda superfície de settings admin-only, não só WhatsApp.
**Cons:** Toca `SettingsPage.tsx` como um todo — fora do escopo do diff que achou o problema. Precisa decidir o comportamento (redirect? mensagem de acesso negado? esconder a sub-aba?).
**Context:** `features/settings/SettingsPage.tsx` — `isAdmin` gate só em `tabs`, não em `renderContent()`.
**Effort:** S-M
**Priority:** P2
**Depends on:** None

### Status do canal WhatsApp na tela de settings não considera múltiplos canais nem revalida antes do confirm

**What:** O aviso de "canal desconectado" em `WhatsAppSafetySection.tsx` (1) pega só o primeiro canal com `channel_type==='whatsapp'` via `.find()` — se a org tiver mais de um número WhatsApp configurado, o status mostrado pode não refletir o canal real usado pra enviar propostas; (2) busca o status uma vez no mount e nunca revalida — se o canal cair depois que a tela carregou, o admin pode confirmar o toggle achando que está tudo certo.

**Why:** Achado do adversarial review (`/review`/`/ship`, 2026-08-15). Hoje a aaagência só tem 1 canal WhatsApp (`status='disconnected'`), então o `.find()` não causa problema na prática — mas é uma armadilha silenciosa se a org configurar um segundo número. A falta de revalidação é uma janela pequena mas real: confirm dialog promete "envia automaticamente" sem garantir que isso ainda é verdade no momento do clique.
**Pros:** Deixa o aviso confiável em vez de "quase sempre certo".
**Cons:** Multi-canal-por-tipo não é um caso confirmado hoje (baixa prioridade prática); revalidar antes do confirm exige mais um fetch síncrono no clique.
**Context:** `features/settings/components/WhatsAppSafetySection.tsx`, useEffect de `/api/messaging/channels`.
**Effort:** S
**Priority:** P3
**Depends on:** Confirmar se multi-canal-por-tipo é um caso real de produto antes de investir no fix.

## Completed
