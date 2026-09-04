# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### chore(ai): `agent_mode` do board Negociação em `respond` — agente atendendo — 2026-09-03

Terceira e última chave que segurava a resposta. `board_ai_config.agent_mode`
estava em `observe`: o agente gerava o texto, gravava em `ai_conversation_log`
com `[DRY-RUN]`, e não enviava. O log dizia
`[AIAgent] DRY-RUN — would have sent: …` com uma resposta perfeitamente boa.

Trocado para `respond` no board Negociação pela fundadora. Pós-venda ficou em
`observe` de propósito: não tem estágio com IA habilitada, então não muda nada
hoje, e mantém a trava para quando tiver.

**Verificado ponta a ponta às 23:15 (São Paulo):** mensagem entrou 23:15:50,
resposta saiu 23:16:15 — `status: sent`, `sent_by_ai: true`, sem erro. 25
segundos porta a porta, dos quais 5 são o `response_delay_seconds` configurado.

Texto que saiu: *"Oi, Gabriella! Que bom que você chamou a gente. 🙂 Como podemos
te ajudar hoje?"* — plural, sem marca de gênero, duas frases, uma pergunta
aberta, um emoji. O `ai_base_system_prompt` escrito hoje está sendo aplicado.

**Ciclo completo, sem intervenção humana:** lead escreve → contato e negócio
criados → IA acionada → resposta gerada → guard de envio → entregue.

### chore(ai): `ai_enabled` e `ai_takeover_enabled` ligados — 2026-09-03

Duas mensagens de teste entraram e ninguém respondeu. O webhook estava são, o
contato e a conversa foram criados, a IA foi acionada — e o log da aplicação
dizia `[AIAgent] AI is disabled for organization`. `ai_enabled` estava `false`,
desligado em algum momento entre 18:03 e 22:44 (horário de São Paulo). Não dá
pra dizer por quem: `updated_at` marca o último toque em qualquer coluna, e
houve edição de prompt na mesma janela.

`ai_takeover_enabled` também estava `false`. Com ela desligada, atribuir uma
conversa a uma pessoa não cala o agente — os dois respondem por cima um do
outro. Ligada, o `MessageInput` atribui a conversa a quem responde e o agente
fica quieto enquanto o operador estiver ativo, voltando sozinho após
`ai_takeover_minutes` (15) sem resposta humana. É o mecanismo de "assumir o
chat" que já existia pronto e desligado.

As duas mensagens de teste não recebem resposta retroativa: o agente só roda no
webhook de entrada.

`CLAUDE.md` ganha o mapa das quatro chaves que calam a IA, com o sintoma de log
de cada uma — três delas não deixam sinal nenhum no canal, e distinguir "qual
das quatro" foi o que custou tempo hoje.

### fix(ai): handoff avisava o time e não calava o agente — 2026-09-03

Escopo do agente definido pela fundadora: receber o lead, fazer o primeiro
atendimento, qualificar, e então passar para o atendimento humano **sem deixar
explícito para o lead**. Ao implementar isso, o handoff mostrou um defeito.

`handleHandoff` marcava `ai_handoff_pending: true`, registrava atividade no deal
e avisava o time por Realtime. E `ai_handoff_pending` era lido em **nenhum lugar
do repositório** — quarta capacidade sem call site achada no mesmo dia. Efeito:
o lead pedia para falar com uma pessoa, o time era notificado, e na mensagem
seguinte o agente respondia de novo, por cima de quem tinha acabado de assumir.

O handoff passa a gravar `ai_paused: true`, que é o campo que o guard de entrada
realmente consulta. Reusar em vez de criar um segundo caminho de pausa: dois
flags com o mesmo significado divergem na primeira vez que alguém mexer em um só.

**A transferência já era silenciosa do lado do lead** — `handleHandoff` não envia
mensagem nenhuma, só marca metadata, registra atividade e avisa a equipe. O que
faltava era o prompt: o texto anterior dizia "chame o time", o que convidava o
modelo a verbalizar a passagem. Agora diz que o escopo termina na qualificação,
que a passagem não é anunciada (não menciona time, atendente, setor ou sistema),
e o que fazer quando o assunto sai do alcance dele — nunca chutar preço, prazo
ou condição para preencher o vazio.

Guarda: `test/agentHandoffPausa.test.ts`, validada por injeção de regressão.
Cobre também que o handoff **não** manda mensagem pro lead: se algum dia mandar,
é mudança de comportamento com cliente, não refactor.

### chore(ai): identidade da aaagência escrita em `ai_base_system_prompt` — 2026-09-03

O campo estava vazio, então o agente caía no prompt-base embutido, que não fixa
identidade — daí ele escrever "Obrigada" para uma pessoa e "Obrigado" para outra
no mesmo número.

**A voz é no plural, em nome da equipe.** Resolve o gênero sem precisar escolher
um: o agente diz "a gente"/"nós", nunca inventa nome próprio, e evita
construções que marquem gênero de quem fala ("valeu por escrever" no lugar de
"obrigado/obrigada"). Se a fundadora quiser uma persona nomeada depois, é só
acrescentar.

O que ficou no prompt: tom (frases curtas, sem jargão de marketing, no máximo um
emoji e nenhum em mensagem sobre problema), o que nunca fazer (inventar preço,
prazo ou caso de cliente; insistir depois de um "não"; pedir dado sensível;
falar mal de concorrente) e quando passar para uma pessoa.

**Conduta sobre revelar que é IA — decidido pela fundadora.** O template do
estágio diz **"NUNCA revele que você é uma IA"**, e esse texto vale. Houve uma
alteração intermediária no mesmo dia que suavizava a regra ("se perguntarem
direto, não negue"); foi revertida a pedido dela, e a linha do prompt-base que a
acompanhava saiu junto, para os dois textos não se contradizerem dentro do mesmo
prompt final.

Registro de quem decidiu, porque é conduta com cliente e não escolha técnica: a
regra é da fundadora, dona da relação com o cliente e da exposição que vem dela.
Quem for mexer nesse texto no futuro está mexendo numa decisão de negócio, não
num detalhe de prompt — e o `handoff_keywords` do canal ("falar com humano",
"atendente", "pessoa real") continua roteando para uma pessoa quem pedir
explicitamente por uma.

Fundamentado no que existe: nome da organização e a assinatura "publicidade ·
marketing · coworking" da skill de marca. A tabela `products` está vazia, então o
agente não descreve serviço — ver `TODOS.md`.

Verificado que o campo é realmente lido: `organization_settings` → `aiConfig.
baseSystemPrompt` (`agent.service.ts:170`) → `buildSystemPrompt` (734) →
`basePrompt` (832) → prompt final (880). `board_ai_config.persona_prompt` tem
precedência e está nulo nos dois boards; se algum dia for preenchido, silencia
este texto.

### chore(auth): segunda conta da organização promovida a admin — 2026-09-03

Pedido explícito da fundadora, para que essa conta conseguisse escanear o QR do
WhatsApp: `POST /api/messaging/channels/[id]/qr-code` exige `profile.role ===
'admin'`, e a conta estava como `user`. Alteração feita direto no banco, com a
condição amarrada a id, e-mail e `organization_id` ao mesmo tempo, para não
haver chance de atingir outra linha.

Fica registrado porque é mudança de privilégio em produção, e mudança de
privilégio que só existe no histórico de uma conversa não existe. A organização
passa a ter duas contas admin; a outra é a da fundadora.

Nota: não era isso que bloqueava o QR naquele momento — a conta que clicou já
era admin, e o erro real foi o `?number=` suprimindo o QR (ver entrada de #45).
A promoção seguiu válida por si.

### fix(activities): data derivada de UTC adiantava um dia das 21h à meia-noite — 2026-09-03

`new Date().toISOString().split('T')[0]`, presente em 13 pontos, converte pra
**UTC antes** de cortar a data. Em São Paulo (GMT-3), toda hora local a partir
das 21:00 já é o dia seguinte em UTC. Três horas por noite, todas as noites, em
silêncio.

O que isso causava no cliente:

- **Editar corrompia o dado.** Abrir uma atividade das 22:00 para editar
  mostrava o dia seguinte no formulário; salvar movia a atividade um dia à
  frente. Não era exibição errada, era escrita errada.
- **"Atividades de hoje" esvaziava** depois das 21:00, porque
  `useTodayActivities` filtrava por `startsWith(hoje)` com o dia de amanhã.
- **Botões "Hoje"/"Amanhã"** do agendamento gravavam um dia a mais.
- **Agrupamento por dia** na lista usava chave um dia à frente.

`lib/utils/dataLocal.ts` formata pelos componentes locais
(`getFullYear/getMonth/getDate`) — o mesmo padrão que
`lib/utils/activitySort.ts` já usava certo. Um módulo tinha acertado e os outros
divergiram, igual à lição dos health checks.

Servidor fica de fora de propósito: a Vercel roda em UTC e ali `toISOString()`
é o comportamento pretendido. Os pontos de servidor que mereceriam o fuso da org
(`lib/mcp/tools/ai.ts`, API pública de contatos) estão no `TODOS.md`.

Guardas: `lib/utils/dataLocal.test.ts` prova a divergência às 22:00 em vez de
afirmá-la, e `test/dataLocalNoCliente.test.ts` impede o idioma de voltar em
`features/`, `lib/query/` e `components/`. As duas validadas por injeção de
regressão.

**O que NÃO era problema:** a exibição. Banco em UTC, `organization_settings.
timezone` em `America/Sao_Paulo` e a UI formatando com `date-fns`/`toLocaleString`
no fuso do navegador já estavam corretos — mensagem gravada 18:08 UTC aparece
15:08 na tela. A confusão veio dos meus relatórios, que citavam valor cru do
banco sem converter nem dizer o fuso.

### feat(messaging): botão "Reenviar" em mensagem que falhou — 2026-09-03

`useRetryMessage` e `POST /api/messaging/messages/[messageId]/retry` existiam há
tempos, corretos, e **nenhum componente os chamava**. Mensagem falha aparecia na
tela com o motivo do erro e nenhuma saída: só restava redigitar o texto à mão.

O custo apareceu hoje. Três respostas da IA para leads reais foram barradas pelo
kill switch — comportamento correto, e exatamente o que a trava existe pra fazer.
Ficaram em `failed`. Depois de destravar o envio, a causa da falha tinha sumido e
o texto continuava preso, sem nenhum caminho de entrega no produto.

Terceira vez nesta base que capacidade implementada sem call site se comporta
como capacidade ausente, depois de `configureWebhook()` (5 semanas de canal mudo)
e da própria rota de retry. O padrão está registrado no `DESAFIOS.md`.

Botão espelha o "enviar rascunho" que já existia ao lado, no mesmo bloco.
Aparece em qualquer mensagem `failed`, com ou sem `errorMessage` — falha sem
motivo declarado também precisa de saída. Guarda:
`features/messaging/components/MessageBubble.retry.test.tsx`, validada por
injeção de regressão.

### chore(ops): kill switch de WhatsApp desligado — 2026-09-03

Desligado a pedido da fundadora, depois de ela ler as três respostas que a IA
gerou e que a trava barrou. `whatsapp_kill_switch_active = false`.

A trava cumpriu o papel para o qual foi construída: a IA foi acionada, gerou
resposta para três leads reais, e nada saiu até uma pessoa ler o texto e decidir.
Era a única das camadas de segurança que nunca tinha sido exercitada.

### fix(ai): template de estágio escolhido pela posição, não pelo valor de `order` — 2026-09-03

Achado ao ligar a IA no estágio "Novo". `provision-stages` fazia
`Math.min(stage.order, 3)`, usando o VALOR de `order`. Os dois boards desta org
começam em `order: 1`, então cada estágio recebia o template do estágio
seguinte — e o `BANT_STAGE_PROMPTS[0]`, o único que diz "este é o PRIMEIRO
contato com o lead", era inalcançável.

Efeito prático: o primeiro estágio de um board ganhava o prompt que assume que o
lead já falou com a empresa antes. O agente abriria a conversa se referindo a um
contato que nunca existiu.

Agrava porque a rota faz `update` em config existente: clicar em provisionar
sobrescreveria uma configuração ajustada à mão com o template errado.

Passa a indexar pela posição na lista ordenada, que é 0-based por definição e não
depende da convenção de numeração de quem criou o board. Guarda:
`test/stageTemplateIndex.test.ts`, validado por injeção de regressão.

### chore(ai): IA habilitada no estágio "Novo" do board Negociação — 2026-09-03

Configuração de produção pedida pela fundadora, com o `BANT_STAGE_PROMPTS[0]` do
próprio projeto (objetivo: criar conexão inicial e descobrir motivação; critérios
de avanço: lead respondeu, demonstrou interesse, conversa iniciada). Defaults de
segurança do schema mantidos: handoff em "falar com humano"/"atendente"/"pessoa
real", máximo de 10 mensagens por conversa, 5s de delay.

`whatsapp_kill_switch_active` segue `true` — a IA passa a gerar resposta, e o
envio continua barrado até alguém desligar a trava conscientemente.

### fix(messaging): o agente de IA nunca foi acionado por mensagem recebida — 2026-09-03

Achado na primeira mensagem real que entrou no WhatsApp depois do pareamento.
Contato criado, negócio criado automaticamente, e a IA nunca chamada. O log da
Edge Function dizia, uma vez por mensagem:

```
[Evolution] INTERNAL_API_SECRET not set, skipping AI processing
```

`triggerAIProcessing` lia `INTERNAL_API_SECRET` e `APP_URL`. **Nenhum dos dois
existe em ambiente nenhum** — confirmado nos secrets do Supabase
(`supabase secrets list` não os lista) e na Vercel (a rota `/api/messaging/ai/process`
respondia `500 {"error":"Server misconfigured"}`, que é o ramo de env ausente).

O que existe, configurado desde o T4 e em uso pelo `webhook-in`, é
`CRM_EA_INTERNAL_WEBHOOK_SECRET` + `CRM_EA_APP_URL`. Dois nomes para o mesmo
conceito, e o código lia justamente o que ninguém setava. Um nome que só o
código conhece é indistinguível de uma feature desligada.

**Correções:**

- Edge Function e rota de validação passam a ler `CRM_EA_INTERNAL_WEBHOOK_SECRET`
  e `CRM_EA_APP_URL`, com os nomes antigos como fallback. Zero segredo novo a
  criar, e o passo manual de colar credencial em dois painéis — que já quebrou o
  `CRON_SECRET` nesta mesma data — deixa de existir aqui.
- Segredo ausente vira `console.error` com texto explícito, não `console.warn`.
  Sem isso a IA fica muda e nada mais no sistema reclama: mensagem de lead entra,
  ninguém responde, e a única pista é uma linha de log que ninguém procura.
- `test/internalSecretNameMatch.test.ts` amarra os dois lados: quem chama (Deno,
  `Deno.env`) e quem valida (Node, `process.env`) têm que procurar o mesmo nome.
  Validado por injeção de regressão.

**Correção do que foi dito antes:** durante o teste de mensagem eu afirmei que a
IA não responderia por causa do kill switch. Nada saiu, que era o que importava,
mas o kill switch nunca chegou a ser exercitado — a IA parou antes, no segredo
ausente. Desligar o kill switch sozinho não teria feito a IA responder.

### fix(messaging): connection.update não gravava last_connected_at — 2026-09-03

Achado logo depois do pareamento do WhatsApp funcionar: canal `connected` às
17:05, `last_connected_at` parado em 31/08.

`handleConnectionUpdate` (Edge Function) gravava `status` e às vezes
`settings.displayPhone`, nunca os timestamps. E o scan do QR não passa pela rota
do app — quem marca o canal como conectado é o `connection.update` que chega no
webhook, então este é o único caminho normal em que um canal vira `connected`.

Importa porque `getActiveChannelForOrg()` escolhe por qual canal a proposta
automática sai com `order by last_connected_at desc`. Um canal recém-pareado
mantinha o timestamp antigo (ou nulo) e podia perder a escolha pra um canal
velho que já não funciona — exatamente o caso de migração de instância que a
docstring daquela função diz cobrir. Com um canal só, inofensivo; com dois, sai
mensagem pelo canal errado.

Passa a gravar `last_connected_at` no ramo de `connected` e `updated_at` em toda
transição. Edge Function redeployada e testada em produção.

Guarda: `test/webhookConnectionUpdateTimestamps.test.ts`, que amarra a Edge
Function ao consumidor do campo. A primeira versão do teste passava com a
regressão injetada — casava a string no comentário ao lado do conserto. Corrigido
pra remover comentários antes de casar, e o próprio teste agora tem um caso que
verifica isso. Ver `DESAFIOS.md`.

### fix(messaging): `?number=` na chamada de QR fazia a Evolution devolver código de pareamento — 2026-09-03

Achado quando a fundadora clicou Conectar de verdade, minutos depois do deploy
anterior. O canal foi pra `error` com a mensagem nova de #44:
`"QR code ausente na resposta da Evolution (campos recebidos: pairingCode,
count)"` — que é exatamente o que aquela mensagem existia pra dizer.

**Causa:** `getQrCode()` mandava `?number=<external_identifier>`. Com número, a
Evolution v2 escolhe o fluxo "vincular com número de telefone" e responde
`{ pairingCode, count }` — código de 8 caracteres pra digitar no app, sem imagem
nenhuma. Sem número, responde `{ code, count, base64, pairingCode: null }` com o
QR pronto. Medido nas duas direções contra a mesma instância real, no mesmo
minuto.

O comentário no código afirmava o contrário: que `number` era obrigatório e que
sem ele a Evolution devolvia corpo vazio. Aquilo foi observado em 2026-08-31
contra a instância `integration: EVOLUTION`, que não tem WhatsApp atrás e
devolve corpo vazio pra qualquer coisa. Conclusão tirada de um caso quebrado e
aplicada ao caso são — enquanto valeu, a tela de QR não podia funcionar.

**Segunda correção, de ordem:** o arme do webhook estava depois do
`getQrCode()`. Quando o QR falhou, o arme não rodou: canal em `error` com
webhook nulo, dois problemas onde havia um. O arme subiu pra antes de qualquer
coisa com o provider, fora do `try`, e agora serve os três caminhos de saída
(QR gerado, já conectado, erro) sem armar duas vezes. Não depende do QR: é
idempotente e o canal precisa dele de todo jeito.

Testes: `test/whatsappProviderQrCode.test.ts` cobre a URL sem `number` e a
resposta só com `pairingCode`; `test/whatsappQrCodeRoute.test.ts` garante arme
único.

### fix(messaging): a instância do WhatsApp era do tipo errado e o QR nunca era lido — 2026-09-03

Achado por `/qa` depois de a fundadora mandar uma mensagem de teste que não
chegou. Dois defeitos independentes, e o primeiro invalida um diagnóstico que
eu mesmo dei no dia anterior.

**1. A instância nunca teve WhatsApp atrás.** A instância `aaagência`, criada em
2026-08-15, tinha `integration: "EVOLUTION"` — o canal genérico interno da
Evolution, não `WHATSAPP-BAILEYS`. Um canal desse tipo reporta
`connectionStatus: "open"` para sempre, porque não há sessão de WhatsApp pra
abrir ou fechar. Daí `ownerJid`, `profileName` e `profilePicUrl` todos `null`,
`_count` zerado em Chat/Contact/Message, e `/chat/whatsappNumbers` respondendo
`"Method not available on Evolution Channel"`.

O webhook desarmado, corrigido em #41, era um defeito real e separado. Mas era a
segunda tranca numa porta que nunca teve sala do outro lado: mesmo perfeito, não
haveria mensagem pra entregar.

**Correção em produção:** nova instância `aaagencia-whatsapp` com
`integration: WHATSAPP-BAILEYS`, reusando o token que já estava no canal (lido
por subselect, sem o valor sair do banco). Nome sem acento de propósito — o
acento em `aaagência` já custou uma sessão de debug em agosto. A instância antiga
ficou parada, sem dados, pra ser removida depois da confirmação. Canal repontado
e marcado como `disconnected`, que é a verdade: falta parear.

**2. `getQrCode()` lançava sempre, mesmo com o QR na resposta.** O tipo declarava
`{ qrcode: { base64 } }` e o método lia `response.qrcode?.base64`. A Evolution v2
devolve o QR **plano**: `{ code, count, base64, pairingCode }`, com `base64` já
trazendo o prefixo `data:image/png;base64,`. Verificado ao vivo com e sem
`?number=`: as duas formas devolvem o mesmo objeto plano. Ou seja, a leitura era
sempre `undefined` e o fluxo de QR nunca exibiu um QR.

O custo maior não foi o QR faltando. Foi a mensagem de erro: `"QR code not
available. Instance may already be connected."` afirmava uma causa que o código
não tinha checado. Em 2026-08-31 essa frase foi lida como diagnóstico e virou a
justificativa do branch `alreadyConnected` da rota — que remarca o canal como
conectado. Erro que chuta causa vira causa raiz falsa na sessão seguinte; o texto
novo nomeia os campos que vieram e não afirma nada.

Testes: `test/whatsappProviderQrCode.test.ts`, validado por injeção de regressão.

### fix(ops): os dois health checks estavam mortos há 20h e o watchdog só viu um — 2026-09-03

Achado por `/qa`. Os jobs `ai-health-check` e `evolution-health-check` do pg_cron
respondiam **401 a cada 15 minutos** desde 2026-09-02 15:30 UTC: 48 respostas 401
em 24h, exatamente duas por ciclo. O `CRON_SECRET` embutido nos dois jobs tinha
**11 caracteres**; o job `stage-evaluations-drain`, que responde 200, tem 64.

Origem: a migration `20260904000000_pg_net_timeout_health_checks.sql` reagendou os
dois jobs, e a substituição manual do segredo entrou errada. A guarda daquele
arquivo checava se o placeholder ainda estava lá — e estava substituído, só que
por um valor curto que não é o segredo. Guarda de placeholder não é guarda de
valor.

Consequência: todo o monitoramento construído nas últimas sessões ficou inerte,
incluindo a checagem de webhook adicionada em #41, que **nunca executou em
produção** — a rota devolvia 401 antes de chegar nela.

**O ponto cego, que é o achado mais importante.** `check_cron_heartbeats()`
percorre as LINHAS de `cron_heartbeats`. O `evolution-health` nunca escreveu
heartbeat nenhum: não tinha linha, não entrava no laço, e era invisível pro
watchdog desde sempre. O `ai-health` foi pego em 50 minutos porque tinha linha.
O único cron que o watchdog não conseguia notar era justamente o único sem
heartbeat. "Parou de reportar" era detectado; "nunca reportou", não.

**Correções:**

- **Produção**: os dois jobs foram reagendados com o token do job que funciona,
  copiado por subselect dentro do próprio Postgres (o valor nunca saiu do banco).
  Verificado com chamada real: `evolution-health` devolveu `{"checked":1,
  "alerted":0}` e `ai-health` `{"checked":1,"degraded":0,"alerted":0}`. Essa foi
  também a primeira execução de verdade da checagem de webhook de #41, que
  passou sem falso positivo contra o servidor Evolution real.
- **`evolution-health` passa a gravar heartbeat** em toda execução, inclusive
  quando não há canal pra checar.
- **Migration semeia `cron_heartbeats`** com os crons que devem reportar, com
  `on conflict do nothing` pra não empurrar `last_run_at` e mascarar atraso real.
  Semear transforma "nunca reportou" em "parou de reportar", que o laço existente
  já trata. Nenhuma lógica nova no watchdog.
- **`test/cronHeartbeatCoverage.test.ts`** amarra as três peças que moram em
  arquivos diferentes: a rota escreve, o `job_name` bate, e a semeadura existe.
  Validado por injeção de regressão nos dois modos de falha.

### fix(messaging): WhatsApp conectado e mudo — webhook armado e causa raiz fechada — 2026-09-03

O WhatsApp comercial da aaagência estava `connected` no CRM e `open` na
Evolution, e não entregava uma mensagem sequer desde 2026-07-29. Cinco semanas.
Nenhum alerta disparou porque nada estava "caído".

**Causa raiz.** O webhook da instância tinha a URL exatamente certa, apontando
pro canal certo, e mais nada: `enabled: false`, `events: []`, `headers: null`.
Três bloqueios independentes, cada um sozinho suficiente. Como a Edge Function
é default-deny, mesmo habilitado o webhook sem `x-api-key` levaria 401 — e a
Evolution engole 401 sem reclamar em lugar nenhum.

Por que nasceu assim: **`configureWebhook()` estava implementado nos providers
Evolution e Z-API desde julho, correto, com header de auth e tudo — e nenhum
caminho do app chamava**. Configurar webhook era copiar a URL da tela de
settings e colar no painel do provider, à mão, marcando três campos que
ninguém tinha como saber que precisavam ser marcados. Código certo que ninguém
chama é código que não existe.

Por que ficou escondido: `evolution-health` roda a cada execução perguntando
"a sessão está conectada?". Estava. O cron reportou verde o incidente inteiro,
porque media a metade do cano que não tinha quebrado — a mesma lição que o
`ai-health` já carregava desde 2026-09-01 e que não tinha sido aplicada aqui.

**Correções:**

- **Produção destravada**: webhook da instância armado com os quatro campos
  certos (verificado ao vivo: `enabled`, 3 eventos, `x-api-key` presente, URL
  batendo com a esperada).
- **`configureWebhook()` passa a ser chamado**: `armarWebhookDoCanal()`
  (`lib/messaging/arm-channel-webhook.ts`) é acionado nos dois caminhos em que
  o admin conecta um canal — ao gerar o QR e no branch de reconexão pela sessão
  salva. Ao gerar QR isso roda **antes** do scan de propósito: quem confirma
  que o QR foi lido é o `connection.update` que chega pelo webhook; armar
  depois perde justamente esse evento.
- **`POST/GET /api/messaging/channels/[id]/webhook`**: (re)armar e
  diagnosticar sem desconectar o canal. Não existia caminho nenhum no app pra
  consertar um canal já `connected` — que era exatamente o estado deste.
- **`evolution-health` passa a checar os dois lados**: sessão conectada E
  webhook entregando, com alerta próprio (`evolution_webhook_inactive`) que
  nomeia qual campo está errado, em vez de "webhook com problema".
- **URL do webhook vira fonte única** (`lib/messaging/webhook-url.ts`), que
  devolve `null` em vez de string quebrada — armar
  `undefined/functions/v1/...` deixaria o painel mostrando webhook
  "configurado" que não entrega, reproduzindo o próprio bug.

**Sobre a IA**: o envio automático foi mantido desligado (kill switch de
WhatsApp ligado) enquanto a sincronização é validada com tráfego real. Toda
mensagem recebida dispara o agente, que **envia sozinho** pelo
`ChannelRouter` — o HITL governa avanço de estágio, não o envio da resposta.
Religar é desligar `organization_settings.whatsapp_kill_switch_active`.

Testes: `lib/messaging/webhook-url.test.ts`,
`lib/messaging/arm-channel-webhook.test.ts`,
`test/whatsappProviderWebhookConfig.test.ts`, mais os casos novos em
`test/evolutionHealthCron.test.ts` e `test/whatsappQrCodeRoute.test.ts`. O
teste do ponto cego do cron foi verificado por injeção de regressão: some o
check do webhook, ele fica vermelho.

**Nota sobre as 0 conversas**: `messaging_conversations` e
`messaging_messages` estarem zeradas não é efeito deste bug — é a limpeza de
dados de teste de 2026-08-31, que apagou 42 conversas e 1282 mensagens de
propósito. As duas coisas juntas escondiam uma à outra.

### feat(ops): health check passa a cobrir o caminho de RAG — 2026-09-02

Item 5 da issue #34, e o último gap real da leva. `ai_google_key` e a API
nativa do Google (File Search Store) são um **segundo caminho de IA**, com
chave e fornecedor separados do chat — nada no health check exercitava isso.
Chave revogada ou cota estourada ali é a mesma classe do incidente de
2026-09-01, num caminho que ninguém vigiava.

`verificarCaminhoRAG()` (`lib/ai/messaging/file-search.ts`) faz uma chamada
mínima na API nativa do Google com a chave da org. O `ai-health` chama isso
**depois** do check de chat passar e **só** pra org que configurou a chave:

- depois, porque se o chat caiu esse é o problema maior e o motivo do alerta
  tem que falar dele — reportar RAG no lugar mandaria a operadora consertar a
  coisa errada durante um incidente;
- só pra quem configurou, porque org sem RAG não é falha, é ausência de
  configuração — mesma regra do filtro de orgs elegíveis.

Reusa a máquina de janela/cooldown/e-mail inteira, sem tocar nela: uma falha
de RAG entra pelo mesmo fluxo de 2ª falha consecutiva que já existe, com o
motivo dizendo claramente que foi o RAG.

**Limitação conhecida e deliberada:** a chamada não usa File Search Store. O
store é por board (`board_ai_config.knowledge_store_id`) e nem toda org que
configurou a chave tem um — exigir store deixaria o check sem cobrir quem
ainda não subiu documento. Pega chave revogada, cota estourada e modelo fora
do catálogo; não pega store apagado numa org específica. Registrado como
limitação, não como esquecimento.

Guarda: 4 testes em `aiHealthCron.test.ts`, incluindo a ordem (chat quebrado
não chega a checar RAG). Verificado removendo a chamada do route: 2 testes
vermelhos, restaurado, verde.

### docs: decisões dos 4 P2 restantes da #34 — 2026-09-02

Fechados por decisão, não por código. Racional completo em `TODOS.md` e nos
comentários da issue:

- **`security_alerts` sem tela** — adiado: não é defeito, é feature. A
  detecção chega por e-mail (verificado) e o dead-man's switch externo cobre a
  falha do próprio monitor. A tabela é histórico pra auditoria, não canal de
  alerta.
- **Race TOCTOU** — não corrigir: só se sobrepõe em invocação manual de teste,
  e o pior desfecho é e-mail duplicado. O conserto exige lock no banco, ou
  seja mais uma migration e mais um ciclo de aplicação manual.
- **Crédito de IA sem cap** — aceitar: ~290k tokens/mês por org em modelo
  flash, centavos. Opt-out ainda criaria o pior modo de falha possível — org
  que desliga o monitor e descobre a queda do jeito antigo.
- **Lista de reserva com 1 alternativa fora da DeepSeek** — aceitar: o
  objetivo é sobreviver a um fornecedor inteiro cair, e ela já cumpre nos dois
  sentidos. Um 3º fabricante só cobre queda simultânea de dois.

### fix(ops): pg_net com timeout real nas rotas de health check — 2026-09-01

Item 5 da issue #23. `net.http_get` chamava `ai-health`/`evolution-health`
com o `timeout_milliseconds` padrão de 5s — a checagem interna de IA sozinha
pode levar até 20s (`CHECK_TIMEOUT_MS`), fora o resto do trabalho da rota
(banco, e-mail, heartbeat). Não quebrava nada até agora porque `net.http_get`
é fire-and-forget do lado do pg_cron e a rota HTTP continua rodando até
completar mesmo que o pg_net já tenha desistido de esperar — mas era sorte
de latência, não garantia.

`supabase/migrations/20260904000000_pg_net_timeout_health_checks.sql`
reagenda os dois jobs (`ai-health-check`, `evolution-health-check`) com
`timeout_milliseconds := 45000` — folga real acima dos 20s internos, ainda
abaixo do `maxDuration=60` da rota.

A guarda do placeholder desta vez usa canário quebrado desde o início — não
o `position()` contra cópia em dollar-quote que travou a aplicação do
dead-man's switch mais cedo hoje (ver DESAFIOS.md). Guarda testada:
`test/pgNetTimeoutHealthChecks.test.ts`, verificado injetando as duas
regressões (timeout baixo demais, guarda no formato antigo) — vermelho,
depois verde.

**Pendente aplicar em produção** — precisa de outro ciclo de SQL Editor com
o `CRON_SECRET` real substituído no lugar do placeholder, mesmo fluxo já
usado nas migrations anteriores.

### fix(ops): limita quantas orgs o ai-health checa ao mesmo tempo — 2026-09-01

Item 17 da issue #23. `Promise.allSettled(orgsElegiveis.map(...))` disparava
TODAS as checagens de uma vez, sem limite. O número de chamadas simultâneas
à OpenRouter e ao pool de conexão do Supabase crescia junto com o número de
orgs — rate limit e contenção no pool viram backoff que acumula tempo, e
numa rota com `maxDuration=60` fixo o lote podia ser cortado no meio sem
nenhum registro do que ficou pra trás.

`lib/utils/concurrency.ts` (`comLimiteDeConcorrencia`) implementa um pool de
trabalhadores simples — sem dependência nova — que processa no máximo 10
orgs por vez (`CONCORRENCIA_MAXIMA`, `ai-health/route.ts`). Preserva a
ordem dos resultados como `Promise.allSettled` faria.

Guarda: teste do utilitário mede o PICO real de concorrência (não só que as
tarefas terminam, que aconteceria mesmo sem limite nenhum) + teste de
integração no `ai-health` com 15 orgs simuladas confirmando que o pico real
da rota nunca passa de 10. Verificado revertendo pra `Promise.allSettled`
puro: o teste de integração quebra, os outros 35 continuam verdes.

### fix(ops): redige chave de API no texto de erro do provider antes de gravar — 2026-09-01

Item 19 da issue #23. `checarIA` (`ai-health/route.ts`) capturava
`err.message` cru e gravava direto em `security_alerts.details.motivo` e no
corpo do e-mail de alerta. Provedores às vezes ecoam parte da chave recebida
na própria mensagem de erro pra ajudar a debugar ("Invalid API key:
sk-or-v1-abc...") — e essa mensagem é exatamente o que se quer ver quando a
IA cai, então não dava pra simplesmente esconder o motivo inteiro.

`lib/security/redactSecrets.ts` cobre os formatos de chave já tratados nas
varreduras de PII deste projeto: OpenRouter/OpenAI (`sk-...`), Resend
(`re_...`), JWT/Supabase (`eyJ...`) e `Bearer <token>` genérico. Aplicado na
ORIGEM — dentro do catch de `checarIA`, antes do texto virar `motivo` — pra
todo consumidor downstream (banco, e-mail) receber a versão já redigida sem
precisar redigir de novo em cada lugar.

Guarda: testes unitários do redator + um teste de integração em
`aiHealthCron.test.ts` simulando o provider ecoando uma chave real no erro,
confirmando que o `motivo` gravado no banco já sai sem ela. Verificado
revertendo a chamada de redação: o teste de integração quebra, os outros 34
continuam verdes.

### fix: 6 P2 da issue #23 — pega por oportunidade — 2026-09-01

Com os 4 P1 fechados, atacando os P2 mais baratos e mais bem definidos.

- **Cadência x janela de 2ª falha**: `CONSECUTIVE_WINDOW_MS` (20min) e a
  cadência do cron (15min) viviam em arquivos diferentes sem nada ligando os
  dois. Esticar a cadência (ex.: pra economizar crédito de IA) sem revisar a
  janela faria o e-mail de alerta nunca mais sair — sem erro, sem log, só
  silêncio. `test/aiHealthWindowCadence.test.ts` lê os dois números dos
  arquivos reais e exige janela > cadência.
- **Org excluída continua sendo checada**: `organization_settings` não tem
  `deleted_at` próprio (é 1:1 com `organizations`, que tem). Uma org excluída
  continuava com IA ligada e chave configurada, entrando na consulta do
  `ai-health` — gastando crédito de IA paga e recebendo e-mail por uma org
  que não existe mais pro produto. Filtra contra `organizations.deleted_at`
  agora; erro na consulta auxiliar falha aberto (continua checando todas),
  não fechado.
- **`model_used` gravava o modelo pedido, não o que respondeu**: se o
  failover nativo da OpenRouter resgatasse a chamada com outro modelo — o
  mesmo mecanismo que salvou a aplicação em 2026-09-01 —, o log de
  `tasks/deals/analyze` continuava afirmando o modelo configurado. Dado falso
  exatamente no período em que auditar qual modelo respondeu de verdade
  importa mais. Usa `result.response?.modelId` agora, mesmo padrão já
  usado em `ai-health/route.ts`.
- **Stepper sem indicar onde o deal está**: a quantidade de estágios é
  dinâmica por board/org; um deal no estágio 18 de 20 abria com o passo atual
  fora da área visível do `.stepper` (`max-height` + `overflow-y: auto`), sem
  rolar até lá. `useEffect` novo rola `.stepper__step--current` pra dentro da
  vista ao trocar de estágio ou de deal.
- **Título e select truncados sem `title=`**: o nome do deal no cabeçalho do
  cockpit e no seletor de deals cortavam com `text-overflow: ellipsis` sem
  nenhuma forma de ver o texto completo sem abrir o dropdown. `title=` nos
  dois agora mostra o texto inteiro no hover.
- **Comparação do `CRON_SECRET` não era constant-time**: `!==` numa string
  normal vaza quanto do prefixo bate através do tempo de resposta. Risco
  prático baixo (tudo atrás de HTTPS), custo de corrigir baixo também.
  `lib/security/cronAuth.ts` centraliza a autenticação com `timingSafeEqual`,
  compartilhada pelas 4 rotas de cron (`ai-health`, `evolution-health`,
  `template-sync`, `stage-evaluations`) — que antes duplicavam a mesma
  checagem `!==` cada uma.

Todos os seis verificados injetando a regressão que cada guarda deveria
pegar — vermelho, depois verde. `lint ok · typecheck ok · 627 passed`
(610 + 17 novos).

### fix(ops): guarda do dead-man's switch disparava sempre, substituído ou não — 2026-09-01

Achado ao aplicar em produção: colei o SQL da migration anterior (#28) já com
a Ping URL certa no lugar do placeholder e recebi `HEALTHCHECKS_PING_URL não
substituído` mesmo assim.

Causa: a guarda comparava `'__X__' in $g$__X__$g$)` — os dois lados são o
MESMO texto-fonte, e o find-and-replace que troca o placeholder na hora de
aplicar troca os dois igualmente. Antes de substituir: `'__X__' == '__X__'`
→ dispara, correto. Depois: os dois viram o mesmo valor real →
`'valor-real' == 'valor-real'` → **também** dispara. A guarda nunca tinha
como distinguir os dois estados, porque as duas metades da comparação
mudavam juntas, sempre.

Conserto: canário escrito quebrado — `'__HEALTHCHECKS' || '_PING_URL__'` em
vez do literal contíguo. `sed` procura o texto INTEIRO do placeholder; a
string partida pelo `||` nunca contém esse contíguo, então nunca é tocada —
continua valendo o placeholder de verdade mesmo depois do resto do arquivo
já ter sido substituído. Uma metade da comparação fica fixa; a outra, o
`sed` alcança. Guarda: `test/healthchecksDeadMansSwitch.test.ts` ganhou dois
testes que montam a comparação a partir do texto real do arquivo — um para
o estado "antes" (deve disparar) e outro simulando um `sed` de verdade
(não deve disparar). O teste anterior só checava que a palavra `RAISE
EXCEPTION` existia em algum lugar — não pegava isto.

O `CRON_SECRET` original (`20260901180000_pg_cron_health_checks.sql`, já
aplicado em produção) tem o mesmo formato de guarda — provavelmente o mesmo
defeito, adormecido. Não editado (migration histórica); registrado em
`TODOS.md` como P2 pro caso de precisar ser reaplicado do zero.

### feat(ops): dead-man's switch externo pro watchdog de cron — 2026-09-01

Item 1 da issue #23. `check_cron_heartbeats()` (PR #22) já detectava cron
parado e gravava em `security_alerts` — mas SQL não manda e-mail, e depender
da aplicação (que pode ser exatamente a coisa fora do ar) pra avisar que ela
caiu é circular. Era a única parte do P0 da issue #20 que ficou pela metade.

**O que entrou:** `check_cron_heartbeats()` agora pinga um check externo no
healthchecks.io toda vez que roda e encontra ZERO heartbeats atrasados. Um
dead-man's switch inverte o modelo normal de monitoramento: em vez de algo
checar se estamos de pé, somos nós que avisamos que estamos vivos — e se o
ping parar de chegar, o serviço externo alerta por fora, sem depender de nada
da nossa infraestrutura pra funcionar. Cobre o cenário que o watchdog interno
não cobre: Supabase inteiro fora do ar, ou pg_cron desativado. Se só
`ai-health`/`evolution-health` pararem, o watchdog já detecta isso hoje (não
pinga, porque não está tudo são) e o alerta segue saindo pelo caminho de
sempre.

Guarda: `test/healthchecksDeadMansSwitch.test.ts` — o ping tem que ficar
condicional a "nada atrasado" (senão o dead-man's switch mentiria durante um
incidente de verdade) e a URL real não pode ser commitada. Verificado
injetando as duas regressões — vermelho, depois verde.

**Pendente:** aplicar `supabase/migrations/20260903000000_healthchecks_dead_mans_switch.sql`
em produção com a Ping URL real (placeholder no arquivo, mesmo padrão do
`CRON_SECRET`) e confirmar o primeiro ping chegando no painel do
healthchecks.io.

### test: 3 testes que não podiam falhar agora podem — 2026-09-01

Item 4 da issue #23. Review retroativo tinha flagrado 54 asserções verdes que
não protegiam o que o cabeçalho do arquivo prometia — "teste que não pode
falhar é pior que teste ausente". Um sub-item (`cockpitAiErrorText.test.ts`) já
foi resolvido junto com o item 2. Este fecha os outros três:

**`lib/ai/failover.test.ts`** — dois testes faziam a mesma asserção sob nomes
diferentes; viraram um. No lugar do segundo, um teste novo lê o `.d.ts`
**instalado de verdade** do `@openrouter/ai-sdk-provider` — não o mock — e
confirma que `extraBody` ainda existe em `OpenRouterProviderSettings`. Os
outros 7 testes do arquivo mockam o SDK inteiro pra não bater em rede, o que
tem um preço: se o pacote renomear o campo, eles continuam verdes porque
verificam o que o código manda pro mock, não o que o pacote de verdade aceita.

**`test/aiHealthCron.test.ts`** — dois dos quatro gaps listados na issue
(insert falhando, falha do Resend) já estavam cobertos por um PR anterior sem
a issue ser atualizada. Os outros dois não: a consulta a `organization_settings`
tinha filtro (`ai_enabled=true`, chave configurada) mas o mock aceitava
qualquer `.eq()`/`.not()` sem registrar nada — agora `orgFilterCalls` captura
e um teste confirma os dois filtros. A janela de 20min só era simulada
("já houve falha"), nunca medida — agora `alertQueries` guarda o corte de
cada consulta na ordem em que roda, e um teste mede que a janela é ~20min e o
cooldown é 4h, valores diferentes de verdade. `checked: 0` (nenhuma org
elegível) não tinha teste nenhum — ganhou um: array vazio → loga alto.

**`test/cockpitLayout.test.ts`** — o helper `rule()` usava `.match()` sem a
flag `g` e exigia o seletor sem espaço antes da chave, então só achava a
PRIMEIRA ocorrência não indentada. Uma segunda declaração do mesmo seletor —
mais abaixo no arquivo, ou dentro de `@media` (que `globals.css` indenta) —
nunca era vista. Virou `todasAsRegras()`, com `g` e aceitando indentação; a
checagem de "sem min-width" agora varre todas as ocorrências.

Verificado nos três: injetei a regressão que cada teste deveria pegar
(campo renomeado no `.d.ts` real, filtro removido, janela virando 30min, log
do `checked: 0` apagado, `min-width` escondido num `@media`) — vermelho em
cada caso, depois verde.

### fix(cockpit): parar de inventar "saúde 50%" quando a IA falha — 2026-09-01

Item 2 da issue #23. `useAIDealAnalysis.ts:53` devolvia
`probabilityScore: deal.probability || 50` quando a análise de IA falhava, e o
cockpit usava esse número direto no bloco "risco do deal" — o primeiro número
que a operadora olha. Durante a queda de IA de 2026-09-01 (issue #16), a tela
mostrava **"médio · saúde 50%"** como se fosse análise de verdade. O `|| 50`
também convertia probabilidade real de 0 em 50.

Segundo achado, no mesmo bloco: qualquer erro — inclusive 403
`AI_FEATURE_DISABLED` (org desligou a função de propósito) e 401
`UNAUTHORIZED` (sessão expirada) — virava o texto "IA fora do ar", reportando
uma queda que não existia.

**O que entrou:**

- `lib/ai/tasksClient.ts`: `AITaskClientError` preserva `status` e `code` da
  resposta HTTP em vez de descartar tudo numa `Error` genérica
- `useAIDealAnalysis.ts`: `probabilityScore` nunca mais fabricado — vem
  `undefined` no erro, e quem consome cai pro `probability` real do deal
- `useAIDealAnalysis.ts`: `describeAIError(errorCode)` diferencia estado de
  config (desativado, sem chave, sessão expirada) de queda de verdade
- `DealCockpitClient.tsx`: usa `describeAIError` em vez do texto fixo
- `test/cockpitAiErrorText.test.ts`: reescrito pra chamar `describeAIError`
  de verdade — a versão anterior tinha uma asserção que batia em **comentário
  de código**, não em texto funcional, e passava mesmo com o bug presente
- `useAIDealAnalysis.test.ts` (novo): guarda o fallback de erro isolado, sem
  precisar montar `useQuery`

Verificado injetando as duas regressões (score fabricado, texto sem
diferenciação) — vermelho, depois verde.

### fix(docs): CLAUDE.md mandava editar o `vercel.json`, que é o que congela a produção — 2026-09-01

Item 3 da issue #23. O `CLAUDE.md` afirmava *"Cadência de cron vive **só** no
`vercel.json`"*. O `AGENTS.md`, a migration de pg_cron e o próprio `DESAFIOS.md`
diziam o oposto: cadência sub-diária vive no pg_cron, e um 3º cron no
`vercel.json` faz a Vercel **rejeitar o deployment inteiro sem criar build** —
sem falha, sem e-mail, produção congelada no commit anterior.

Como o `CLAUDE.md` tem precedência de projeto, quem conferisse as duas fontes
seguiria a errada, e a ação que ela induz é justamente a que derruba o deploy.
A frase falsa tinha 3 cópias no repositório.

**O que entrou:**

- `CLAUDE.md`: frase falsa removida; bloco novo explicando o limite do plano
  Hobby (2 crons, só diário), o que está hoje em cada lugar, e a ordem de ler
  as migrations de pg_cron antes de tocar no `vercel.json`
- `DESAFIOS.md`: terceira cópia da frase corrigida + lição sobre documentar o
  estado final de um incidente, e não o estado em que ele começou
- `AGENTS.md`: aponta a guarda nova
- `test/vercelCronLimit.test.ts`: prosa já falhou duas vezes, então a regra
  virou teste — quebra num 3º cron, em qualquer agendamento sub-diário, e no
  retorno da frase falsa ao `CLAUDE.md`. Verificado injetando as 3 regressões

### feat(ops): health check da IA a cada 15 min, com alerta que realmente chega — 2026-09-01

Fecha a issue #16. Depois de #13 (modelo restaurado) e #14 (failover nativo), o
que continuava aberto era a detecção: o failover cobre "um modelo sumiu", mas
não cobre chave revogada, crédito zerado, nem os três modelos da lista falharem
juntos. Nesses casos o CRM voltaria a ficar mudo até alguém olhar.

**O achado que veio junto e vale mais que o pedido.**
`organization_settings.alert_email` estava **NULL**. O canal WhatsApp caiu 4
vezes nos últimos 30 dias, o `evolution-health` detectou e gravou as 4, e
**nenhum e-mail saiu** — `route.ts:100` faz `if (settings?.alert_email && ...)`
e segue calado quando está vazio. O mecanismo de alerta existia, funcionava, e
não avisava ninguém. O comentário do próprio arquivo já dizia que isso não podia
acontecer: *"não basta logar em tabela que ninguém olha às 2h da sexta"*.

Segundo achado: o comentário dizia "roda a cada 30min" enquanto o `vercel.json`
agendava `0 9 * * *`, uma vez por dia. Um canal caindo às 10h ficava ~23h sem
alerta, e o cooldown de 4h contra spam não fazia sentido nessa cadência.

**O que entrou:**

- `alert_email` preenchido (no banco, fora do repo — é público)
- `app/api/cron/ai-health/route.ts`, a cada 15 min. Faz uma chamada sintética
  curta pela mesma `getOrgAIConfig` + `getModel` da aplicação, então exercita
  chave, modelo, formato do id e o failover de ponta a ponta. Um ping ao
  endpoint da OpenRouter teria passado no incidente, porque o serviço externo
  estava de pé e quem estava quebrado era a config da org
- Alerta só na **segunda falha consecutiva**: a 1ª grava `severity='info'` sem
  e-mail (falha isolada é soluço de rede), a 2ª grava `critical` e envia.
  Estado no banco, porque cada execução do cron é um processo novo. Sucesso não
  grava nada — 96 execuções diárias saudáveis custam zero linhas
- Cockpit distingue "Sem sugestão da IA no momento" de "IA fora do ar — sugestão
  indisponível". O erro já chegava em `aiAnalysis.error` e era descartado; foi
  esse texto ambíguo que escondeu o incidente da operadora
- `evolution-health` alinhado a 15 min, e o comentário passou a descrever a
  realidade

**Duas janelas distintas, deliberadamente:** a de 20 min decide se esta falha é
a 2ª consecutiva (20 e não 15 pra tolerar atraso de agendamento); o cooldown de
4h decide se manda e-mail. Sem o cooldown, uma IA fora do ar durante a noite
renderia 90+ e-mails e o alerta real se perderia no ruído. O registro sempre
acontece; só o e-mail é limitado.

Custo: ~2.880 checagens/mês com prompt curto ≈ US$ 0,06/mês.

Guardas: `test/aiHealthCron.test.ts` (14) e `test/cockpitAiErrorText.test.ts`
(5).

### feat(ai): failover nativo de modelo da OpenRouter — 2026-09-01

Fecha a classe de falha que derrubou a IA hoje, não só o caso.

O parâmetro `models` da OpenRouter passa a ser enviado: uma lista de reserva que
ela percorre **dentro da mesma requisição** quando o modelo primário falha. O
app não vê erro nenhum.

```
primário:  deepseek/deepseek-v4-flash-0731   (datado, não alias móvel)
reserva 1: deepseek/deepseek-v4-flash        (mesma família — a datada sair do catálogo)
reserva 2: google/gemini-3.5-flash-lite      (outro fabricante — a DeepSeek cair inteira)
```

Duas famílias de propósito: dois modelos do mesmo fornecedor cairiam juntos e a
lista não teria servido pra nada. Todos suportam `tools` e `structured_outputs`,
senão o agente e as tarefas com `Output.object({ schema })` quebrariam
justamente durante o incidente em que o fallback deveria estar salvando.

Plugado no `extraBody` do factory dentro de `getModel`, que é o ponto único por
onde as 17 chamadas passam. A alternativa seria repetir `providerOptions` em
cada uma, e bastaria esquecer uma pra ela ficar sem rede.

O primário também passou de alias móvel para id datado (`-0731`). Alias aponta
sempre pra versão corrente e pode mudar ou sumir sem aviso — foi exatamente isso
que quebrou. De quebra é mais barato (US$ 0,065/M contra 0,079/M de entrada).

**Provado em produção, não só em teste.** `organization_settings.ai_model` foi
forçado de volta para `google/gemini-2.0-flash-001` (o modelo removido que
causou o incidente) e `POST /api/ai/tasks/deals/analyze` respondeu **200** com
JSON válido em 6,5s, com zero erros nos logs da Vercel no período — o app nem
viu a falha. Antes do fix o mesmo cenário dava 500. Banco restaurado em seguida
e regressão confirmada com o primário válido.

`lib/ai/agent/provider-failover.ts` ficou intocado: faz failover entre
*providers*, não entre modelos, e o próprio comentário registra que
`buildProviderList` sempre devolve no máximo 1 item porque só existe a
OpenRouter. É infraestrutura que nunca rodou e resolve outro problema.

Guarda: `lib/ai/failover.test.ts` (8 asserções). Fecha o item de `TODOS.md`
"Configurar fallback nativo de modelo da OpenRouter", aberto desde 2026-08-14
como P3 — a classe de falha que ele previa aconteceu antes de ser priorizada.

### fix(ai): toda a camada de IA estava fora do ar — modelo removido do catálogo — 2026-09-01

Achado pelo `/qa` na tela do cockpit: o console mostrava `Erro ao executar
tarefa de IA` e a saúde do deal travada em 10%. O log da Vercel deu a causa:

```
AI_APICallError: No endpoints found for google/gemini-2.0-flash-001 (404)
```

A OpenRouter removeu esse modelo do catálogo. Ele era o default do código
(`lib/ai/defaults.ts`), e **17 arquivos** dependiam dele: agente do WhatsApp,
análise de deal, briefing diário, script de vendas, respostas a objeções,
rascunho de e-mail, estratégia de board, extração e o cron de avaliação de
estágios. Tudo respondendo 500.

**Eram dois problemas empilhados, e o segundo é o que interessa.**

A org tinha `ai_model = 'gemini-2.5-flash'` e `ai_provider = 'google'` no banco
— formato nativo do Google, sobra da migração pra OpenRouter que nunca foi
aplicada aos dados. `getModel` valida o id contra `provider/model` e, quando
não bate, cai no default. Em silêncio. Então o CRM rodou **meses** ignorando a
configuração escolhida na tela de settings, e ninguém tinha como saber: a IA
respondia normalmente, só que sempre com o default.

O modelo quebrado foi só o que finalmente tornou isso visível.

Correções:
- Default do código → `deepseek/deepseek-v4-flash` (existe no catálogo, suporta
  `tools` e `structured_outputs`, que o agente e as tarefas exigem)
- `organization_settings` da org → mesmo modelo, `ai_provider = 'openrouter'`
- **`getModel` agora avisa alto quando descarta um `ai_model`**, nomeando o
  valor rejeitado. Config ignorada tem que doer na hora, não na hora em que o
  default morre.

Verificado ao vivo em produção: `POST /api/ai/tasks/deals/analyze` voltou a
200, a tela voltou a sugerir próxima ação ("Agendar reunião de qualificação") e
a saúde do deal saiu de 10% para 30%.

Guarda: `lib/ai/config.test.ts` (8 asserções, incluindo o `'gemini-2.5-flash'`
literal que causou o problema e a checagem de que o default nunca volta a ser o
modelo removido).

### refactor(cockpit): tela de governança vira coluna única com uma rolagem — 2026-08-31

A tela do cockpit do deal era um grid de 3 painéis (`288px 1fr 320px`) com
`min-width: 1180px` e uma barra de rolagem própria em cada painel. Em uso real
(1440×609, sidebar aberta) isso significava rolar pro lado pra ver metade da
informação, botões cortados na borda e conteúdo espremido em 405px de altura.

Medido em produção antes de mexer, não suposto:

| | antes | depois |
|---|---|---|
| `.cockpit__aside` | 287px de caixa, 327px de conteúdo (cortava) | não corta |
| `.stepper` (15 estágios) | 1155px de caixa, 1636px de conteúdo | cabe em 2 linhas |
| `.cockpit__head` | 148px | 114px |
| altura útil do corpo | 405px | 439px |
| rolagens verticais | 3 independentes | 1 |
| rolagem horizontal | sim | não |

**O que mudou**

- Os 3 painéis viram `display: contents` e os 12 blocos sobem para filhos
  diretos de um flex column. A sequência passa a viver em classes de CSS
  (`.cockpit__sec--*`), na ordem da governança: identificar (dados do deal,
  contato + canais) → decidir (próxima ação, risco, próximos passos) → entender
  (linha do tempo, notas) → assistente (agente IA) → consultar (sinais,
  etiquetas, contexto).
  Nenhum bloco foi movido no JSX; a ordem inteira é `order`.
- `min-width: 1180px` removido. Era herança literal do handoff HTML do redesign
  (`d924a86`), não cálculo — o piso real das colunas era 1028px.
- Os 4 botões de canal viram grid `auto-fit`: 4 em linha quando há espaço, 2×2
  quando não há. Nenhum botão saiu, nenhum rótulo virou ícone.
- O stepper quebra linha em vez de rolar pro lado, com teto de altura (a
  quantidade de estágios é dinâmica por board — sem teto, um board de 20
  estágios comeria ~110px do corpo).
- Cabeçalho recuperou 34px: a linha do topo quebrava em duas porque os filhos
  somavam 1194px + 96px de gaps em 1155px disponíveis.
- O chat da IA tinha `height: 420` fixo numa coluna de ~461px de altura útil —
  scroll dentro de scroll. Virou `clamp(220px, 38vh, 420px)`.

**Nada de função mudou.** Nenhum handler, mutation, query, rota ou token do
design system foi tocado. `.cockpit__value` e `.cockpit__block`, que o
`DealDetailModal` e o `BriefingCard` também usam, ficaram intactas — os ajustes
de altura foram escopados ao cabeçalho do cockpit.

Guarda: `test/cockpitLayout.test.ts` (17 asserções). É teste de CSS-como-texto
de propósito: happy-dom não tem engine de layout, então um teste de "não
estoura" renderizando o componente passaria por falso-positivo. A verificação de
que cabe de verdade foi medição no browser contra produção.

Fecha o item de `DESAFIOS.md` de 2026-08-14, que tinha registrado esse mesmo
`min-width: 1180px` e deixado sem corrigir por falta de confirmação de que
telas de 1280px eram caso real de uso.

### feat(layout): barra lateral pode ser ocultada (desktop) — 2026-08-31

Botão no topbar (`PanelLeftClose`/`PanelLeftOpen`) e atalho **⌘B / Ctrl+B**
escondem e trazem de volta o menu lateral. A preferência persiste em
`localStorage` (`crm_sidebar_hidden`), lida só depois do mount pra não dar
mismatch de hidratação — mesmo padrão que a contagem de decisões já usava.

Ganho principal é no kanban e no cockpit, que passam a usar os 236px da
barra quando ela está oculta.

Detalhe que era o maior risco da mudança: ~30 modais posicionam o overlay com
`md:left-[var(--app-sidebar-width)]`. Se a var não zerasse junto com a barra,
todos ficariam deslocados 236px pra direita. A regra virou função pura
exportada (`getSidebarWidth`) justamente pra ficar testável — ver
`test/sidebarWidth.test.ts` (9 testes).

Escopo: **só desktop** (≥1280px). Tablet tem o rail de ícones e mobile tem a
bottom nav, então o botão nem aparece nesses modos.

O estado novo `sidebarHidden` é intencionalmente separado do `sidebarCollapsed`
que já existia no `UIStore`: aquele é automático/efêmero (o Inbox mexe nele ao
abrir o painel de contexto), este é preferência explícita do usuário. Misturar
os dois faria o Inbox desfazer a escolha da pessoa sem ela pedir.

Verificado ao vivo antes do commit: ocultar/mostrar pelo botão, atalho ⌘B,
persistência entre reloads, board ocupando a largura toda e a CSS var indo a
`0px` quando oculta.

### fix(data): auditoria de `deleted_at` — mais 3 serviços mostravam registros excluídos — 2026-08-31

Auditoria pedida depois do fix do board (entrada abaixo), pra checar se a
mesma classe de bug existia nas outras tabelas com soft-delete. Existia.

Método: `grep` de todas as 221 queries `.from('<tabela>')` nas 7 tabelas com
coluna `deleted_at` (`activities`, `boards`, `business_units`, `contacts`,
`crm_companies`, `messaging_channels`, `organizations`), triagem automática
de quais não filtravam, e leitura manual de cada candidata pra separar bug
real de falso positivo (INSERT, UPDATE por id, retry de migration).

**Com impacto visível na hora:**
- `activitiesService.getAll()` (`lib/supabase/activities.ts`) — 3 atividades
  excluídas apareciam na tela de Atividades
- `companiesService.getAll()` (`lib/supabase/contacts.ts`) — 3 empresas
  excluídas apareciam na tela de Empresas

**Latentes** (mesmo defeito, sem registro excluído no banco ainda):
- `boardsService.getAll()` — board excluído apareceria na lista de funis
- `companiesService.getByIds()` — empresa excluída apareceria vinculada a
  um contato
- `boardsService.create()` — cálculo da próxima `position` contava board
  excluído
- `dealsService.create()` — validação "board existe?" aceitava board excluído

**Sem defeito, confirmado:** `contactsService` já filtrava corretamente em
todas as leituras (`getAll`, paginado, count) — por isso a tela de Contatos
não mostrou nenhum dos 49 contatos excluídos na limpeza do mesmo dia. As
listagens de `messaging_channels` e `business_units` também já filtravam.

Teste renomeado de `dealsServiceDeletedFilter.test.ts` para
`softDeleteFilters.test.ts` e estendido: 8 guardas cobrindo os 4 pontos do
fix anterior + os 4 novos.

Verificado ao vivo em produção após o deploy, contando contra o banco em vez
de confiar na tela: Atividades passou a mostrar 2 registros "Moveu para
Ganho" (banco tem 2 ativas + 1 excluída) e a aba de Empresas passou a marcar
`empresas · 7` (10 no banco − 3 excluídas). Contatos seguiu em `pessoas · 12`
(61 − 49 excluídos), como já estava antes do fix.
PR: [#8](https://github.com/gabriellapcardoso/CRM-EA/pull/8).

**Fora do escopo desta rodada** (registrado em `TODOS.md`, P2): a camada de
IA/MCP (`lib/ai/tools.ts`, `lib/mcp/tools/*`, `lib/ai/agent/*`) e as Edge
Functions de webhook têm ~30 queries de `contacts`/`activities` sem o
filtro. Amostragem confirmou pelo menos um caso real —
`lib/ai/tools.ts:773` procura contato por nome sem excluir os deletados, o
que faria a IA reusar (ressuscitar) um contato excluído em vez de criar um
novo. Não corrigido aqui porque cada fluxo precisa ser entendido antes: em
alguns casos ver o registro excluído pode ser intencional (auditoria,
idempotência de webhook).

### chore(data): limpeza de dados de teste em produção — 2026-08-31

Limpeza pedida pela fundadora ("tudo que for teste pode excluir"), executada
direto no banco de produção após levantamento e confirmação item a item.
Corte: registros anteriores a 2026-07-30.

**Soft-delete** (reversível, `deleted_at`, mesmo mecanismo que o app usa):
47 contatos, 3 negócios, 3 empresas, 2 atividades (+ cascata automática de
atividades por contato via trigger `cascade_contact_delete`).

**Delete real** (irreversível, tabelas sem coluna `deleted_at` no schema):
42 conversas + 1282 mensagens de WhatsApp — 100% do histórico de mensageria,
que era integralmente de teste (26-29/07, nenhuma conversa depois disso).
Nenhum export foi feito antes; decisão explícita da fundadora.

Verificações feitas ANTES de executar, e que valem repetir numa próxima:
- confirmado que só existe 1 organização no banco (sem risco cross-tenant)
- mapeado o `delete_rule` de cada FK que aponta pras 4 tabelas, pra saber o
  que cascatearia (`deals.contact_id` e `contacts.client_company_id` são
  `NO ACTION` — soft-delete não quebra nada porque é UPDATE, não DELETE)
- cruzamento explícito de contatos ANTIGOS com negócios/empresas NOVOS: 3
  casos encontrados e levados à fundadora um a um, não decididos sozinho.
  Um deles ("Clarisse", nome de pessoa real + negócio e empresa de 05/08)
  foi excluído do corte por decisão dela.

### fix(boards): board e dashboard mostravam/contavam deals já excluídos — 2026-08-31

Consequência direta da limpeza acima, e o motivo dela parecer não ter
funcionado: dois deals de teste soft-deletados continuaram aparecendo no
board Pós-venda somando R$ 5.600 na coluna "Cliente Ativo", mesmo após
refresh forçado — confirmado por screenshot da fundadora, não suposição.

`dealsService.getAll()` (`lib/supabase/deals.ts`) — a fonte ÚNICA de deals
usada por `useDealsByBoard`/`dealsViewQueryFn`, ou seja, board de Negociação,
board de Pós-venda, dashboard e qualquer lista de deals do frontend — nunca
filtrou `deleted_at`. O `select` client-side (`makeSelectByBoard`) só filtra
por `boardId`. Resultado: deal excluído continuava visível e somando valor em
todo o app. Bug antigo, latente desde sempre; só ficou óbvio quando alguém
excluiu algo e foi conferir.

Mesmo padrão faltava em `boardsService` (`lib/supabase/boards.ts`):
- `canDelete()` — contava deal já excluído como bloqueio pra apagar um board
- `deleteStage()` — mesma coisa pra apagar um estágio
- `moveDealsToBoard()` — moveria (ressuscitaria) deal excluído pro board novo

Fix: `.is('deleted_at', null)` nos 4 pontos. O padrão correto já existia em
toda a API pública (`app/api/public/v1/deals/*`,
`lib/public-api/dealsMoveStage.ts`) — só a camada consumida pelo frontend
estava sem, o que explica o bug ter passado despercebido.

Testes: `test/softDeleteFilters.test.ts` (4 guardas, uma por ponto
corrigido). Verificado ao vivo em produção após deploy: coluna "Cliente
Ativo" passou de R$ 5.600 / 2 cards para R$ 0 / "nenhum deal aqui".
PR: [#7](https://github.com/gabriellapcardoso/CRM-EA/pull/7).

### fix(messaging): reconectar após "Desconectar" quebrava com 404 ou marcava canal são como erro — 2026-08-31

Achado por `/qa` ao vivo (não simulado) enquanto verificava o fix do botão
"Desconectar" logo abaixo — testado contra o WhatsApp real da aaagência em
produção, com autorização, sabendo que derrubaria a sessão de verdade.

Dois bugs em cadeia no fluxo de reconexão:

1. `EvolutionWhatsAppProvider.getQrCode()` chamava
   `GET /instance/connect?instanceName=X` — rota que nunca existiu no
   servidor (404 "Cannot GET..."). Endpoint correto, confirmado na doc
   oficial: `GET /instance/connect/{instance}` (path param), com `number`
   como query **obrigatória**.
2. Mesmo com o endpoint certo, sem `number` a Evolution respondia `200 {}`
   (corpo vazio) e a instância nunca saía de `close` — apesar de ter sessão
   Baileys válida salva do logout anterior. Com `number`, ela reconecta na
   hora, sem QR nenhum. `qr-code/route.ts` não esperava esse caminho e
   gravava `status='error'` num canal que tinha acabado de reconectar de
   verdade — reproduzido ao vivo: banco disse `error`, Evolution disse
   `open`, dessincronia real em produção, reconciliada manualmente via SQL
   antes do fix da rota estar pronto.

Fix: endpoint + `number` corrigidos em `getQrCode()`; `qr-code/route.ts`
agora confere `provider.getStatus()` de verdade (genérico, qualquer
provider) antes de marcar erro — confirma `connected` → grava `connected` e
retorna `{alreadyConnected:true}` em vez de 500. `QrConnectModal` ganhou um
estado `reconnected` que só mostra uma mensagem tranquila e deixa o polling
que já existia (`useChannelConnectionStatus`, a cada 3s) fechar o modal
sozinho — sem duplicar a lógica de detecção de "conectado".

Isso não é uma borda rara: como o fix de "Desconectar" agora faz logout
real, reconectar em seguida É o caminho mais comum, não exceção.

Testes: `test/whatsappQrCodeRoute.test.ts`.

### fix(messaging): botão "Desconectar" encerra a sessão no provider de verdade — 2026-08-31

Espelho do bug do "Conectar" ([PR #4](https://github.com/gabriellapcardoso/CRM-EA/pull/4)):
"Desconectar" só fazia `UPDATE messaging_channels SET status='disconnected'`
direto do browser (`useToggleChannelStatusMutation`) e nunca tocava no
provider. `EvolutionWhatsAppProvider.disconnect()` e
`ZApiWhatsAppProvider.disconnect()` apenas escreviam um log ("session persists
on their servers"), e `ChannelRouterService.disconnectChannel()` — o único
caminho que chamaria o provider — era código morto, sem nenhum caller no
projeto. Resultado: sessão continuava viva na Evolution/Z-API depois do admin
"desconectar", com risco de mensagem indo pro número errado se outro número
fosse conectado na mesma instância.

`disconnect()` agora chama os endpoints reais (Evolution:
`DELETE /instance/logout/{instance}`, que encerra a sessão sem apagar a
instância; Z-API: `POST /instance/disconnect` — ambos confirmados na
documentação oficial via Context7) e propaga erro em vez de engolir. Nova rota
`POST /api/messaging/channels/[id]/disconnect` espelha a de QR code (origem
permitida, sessão, `role='admin'`, canal filtrado por `organization_id`),
chama o provider e só então grava o status.

Falha no provider **não** impede marcar o canal como desconectado no CRM —
senão canal com credencial quebrada ficaria "conectado" pra sempre. Em vez
disso a resposta traz `providerDisconnected: false` + `warning`, e a UI mostra
toast de aviso ("a sessão no provedor pode continuar ativa: …") em vez de
afirmar "Canal desconectado". `ChannelsSection` e `ChannelSetupModal` roteiam
o "Desconectar" pra nova mutation; "Conectar" segue no toggle antigo.

Simetricamente, se o provider desconecta mas o `UPDATE` no banco falha, a
resposta traz `persisted: false` — o toast avisa que a sessão foi encerrada
mas o status no CRM pode estar desatualizado, em vez de afirmar "Canal
desconectado" com o banco ainda mostrando o status antigo.

Achado no adversarial review (subagent Claude, `/ship`): o `request()`
privado dos dois providers sempre tentava `JSON.parse` no corpo da resposta,
mesmo em sucesso — um `204 No Content` (comum em `DELETE`/disconnect) faria
um logout que funcionou de verdade virar `providerDisconnected: false` por
"erro de parse", o oposto do que este fix existe pra resolver. Corrigido nos
dois `request()` (tratando corpo vazio como sucesso, sem tentar parsear) com
teste de regressão. Bug pré-existente na infra compartilhada, não introduzido
por este fix, mas exercitado pela primeira vez de forma realista pelo
`disconnect()` (endpoints de status/envio de mensagem sempre retornaram JSON).

Testes: `test/whatsappProviderDisconnect.test.ts` (endpoint/método/apikey de
cada provider + propagação de erro + regressão do corpo vazio),
`test/whatsappDisconnectRoute.test.ts` (todas as ramificações de auth/erro da
rota, incluindo `persisted: false`), `lib/query/hooks/useChannelsQuery.test.ts`
(hook `useDisconnectChannelMutation`).

### fix(messaging): botão "Conectar" do canal WhatsApp gera e exibe QR code de verdade — 2026-08-17

Botão "Conectar" (canais Evolution/Z-API) só fazia `UPDATE status='connecting'`
direto no Supabase, sem nunca chamar a Evolution/Z-API nem mostrar QR code —
canal ficava preso em `connecting` pra sempre, sem jeito de reconectar pela
UI. Achado por `/qa` dirigido ao fluxo de conexão (2026-08-15), spec revisado
via `/plan-eng-review` — outside voice (codex) achou 3 bloqueios reais antes
de qualquer código ser escrito: `qr-code/route.ts` instanciava sempre o
provider `z-api` hardcoded (mesmo pra canal Evolution), o webhook
`messaging-webhook-evolution` só aceitava canal com `status IN
('connected','active')` no lookup — descartando o próprio `connection.update`
que confirmaria o scan do QR — e o botão já vinha `disabled` no estado real
do canal (`connecting`). Os três corrigidos antes da implementação (issue #3,
[PR #4](https://github.com/gabriellapcardoso/CRM-EA/pull/4)).

Novo `QrConnectModal` controla seu próprio fetch/retry e faz polling (via
`refetchInterval` nativo do TanStack Query, não `setInterval` manual)
enquanto aberto, fechando sozinho quando o canal vira `connected`. Nova query
`useChannelConnectionStatus` dedicada ao polling — `useChannelQuery`
existente faz `select('*')` e vazaria `credentials` (API keys) pro browser a
cada poll se reusada aqui. Gate por `channelType`/`provider` garante que só
canais WhatsApp Evolution/Z-API entram nesse fluxo novo — outros tipos de
canal mantêm o `onToggle` antigo, sem regressão.

Testado ao vivo em produção no mesmo dia do merge: achado um segundo bug
(modal travava em "Gerando QR code..." pra sempre quando o endpoint
retornava erro — `connectMutation.isPending`/`isError` não refletiam de
forma confiável no render) e corrigido no mesmo dia
([PR #5](https://github.com/gabriellapcardoso/CRM-EA/pull/5)): `QrConnectModal`
reescrito pra estado local explícito (`idle`/`loading`/`success`/`error`)
setado direto nos callbacks `onSuccess`/`onError` do `mutate()`, em vez de
derivar do estado da mutation; `retry: 0` explícito (retry automático
silencioso só atrasava a mensagem de erro chegando na tela).

Causa raiz final do canal real (`+55...`, aaagência) não era código nem
infra quebrada: `credentials.instanceName` salvo no banco tinha typo
(`"aaagencia"`, sem acento) contra o nome real da instância no servidor
Evolution (`"aaagência"`, com acento, confirmado no painel `/manager`). O
WhatsApp já estava conectado do lado da Evolution o tempo todo — corrigido
com um `UPDATE` direto no `instanceName`, canal confirmado `Conectado` na UI.

### feat(settings): toggle de admin para o envio automático de proposta por WhatsApp — 2026-08-15

`organization_settings.auto_send_proposal_whatsapp` (flag do disparo
automático de proposta, T4) agora tem UI própria — antes só existia no
banco, sem forma de ligar/desligar sem acesso direto ao Supabase. Aba
Configurações → Integrações → "Segurança WhatsApp", ao lado do kill
switch já existente, mesmo padrão de `Switch` do design system.

Ligar o toggle abre um `ConfirmDialog` (`variant="danger"`) explicando
que o CRM vai enviar WhatsApp automaticamente sem revisão humana —
desligar não precisa de confirmação (direção segura é "desligado").
Mostra aviso inline se o canal WhatsApp (Evolution) não estiver
`connected`, sem bloquear o toggle (aviso é só informativo — o e-mail
automático não depende do canal WhatsApp).

Encontrado durante investigação de por que o WhatsApp automático não
disparava: dois motivos esperados (flag `false` por padrão, nenhuma org
ligou; canal Evolution nunca conectado em produção), nenhum bug. `/review`
+ `/ship` rodaram 3 rounds de revisão adversarial (testing/maintainability/
security especialistas + adversarial Claude) — achados reais corrigidos:
tipo `ChannelStatus` duplicado (agora reusa `lib/messaging/types/channel.types`),
guard de `setState` pós-unmount, cobertura de teste pro banner de canal
desconectado (confirma que não bloqueia o toggle) e pro cancelamento do
confirm dialog. Dois achados adiados pra `TODOS.md` (P2/P3): abas de
settings admin-only renderizam pra não-admin antes de falhar no servidor
(padrão pré-existente, não introduzido aqui); status de canal não
considera múltiplos canais do mesmo tipo nem revalida antes do confirm.

### feat(deals): disparo automático de proposta comercial (e-mail + WhatsApp) — 2026-08-15

Novo estágio "Proposta pronta" no board negociação — quando um deal entra
nele, a proposta comercial já revisada (rascunho criado antes, no estágio
"Topou receber proposta") é enviada automaticamente por e-mail e,
opcionalmente, por WhatsApp. Decidido em `/plan-eng-review` (2026-08-15):
gate de revisão humana explícito antes de qualquer disparo automático — o
e-mail nunca sai de um rascunho não revisado.

Reusa o outbox `deal_stage_events` + `deal-stage-dispatcher` já testado em
produção (T3/T3b/T3c) — só um `stage_slug` novo (`proposta-pronta`) roteado
pro Gerador de Propostas. WhatsApp automático é opt-in por organização
(`organization_settings.auto_send_proposal_whatsapp`, default `false`,
mesmo padrão de `whatsapp_kill_switch_active`) e só dispara se o deal
realmente passou pelo gate "Proposta pronta" — não em qualquer e-mail
manual enviado direto no Gerador de Propostas.

Botão manual "enviar proposta" no deal cockpit complementa o automático —
WhatsApp sempre disponível como fallback humano, nunca substituído pela
automação. `deals.proposal_link` persiste o link público da proposta
(recebido via extensão do payload do webhook T3b), alimentando os dois
caminhos sem round-trip pro Gerador de Propostas no momento do envio.

Achados de segurança endereçados no `/review` adversarial: dedupe de envio
(mesmo link não sai duas vezes pro mesmo contato), validação de URL antes
de enviar (fronteira entre sistemas — link vem de um Supabase diferente),
e resolução de contato via `deal_id` pra evitar conversas órfãs no inbox.

### feat(ai): migra provider primário de Google Gemini pra OpenRouter — 2026-08-15

Troca do provider de IA do CRM (chat/agente) de Google Gemini (hardcoded,
`type AIProvider = 'google'`) pra OpenRouter (roteador multi-modelo), decidida
em `/plan-eng-review` (2026-08-14) após avaliar duas abordagens: OpenRouter
como único provider ativo vs. generalização completa multi-provider. Optamos
pelo primeiro — sem um segundo provider real esperando entrar em produção,
generalizar a lista de failover (`provider-failover.ts`) seria abstração
especulativa. `AIProvider` virou union type extensível (hoje 1 literal real,
`'openrouter'`) pra manter esse caminho barato se/quando surgir um segundo
provider de verdade.

`lib/ai/config.ts` troca `createGoogleGenerativeAI` por `createOpenRouter`
(`@openrouter/ai-sdk-provider`, provider oficial do AI SDK v6). A allowlist
fixa de modelos Gemini (`ALLOWED_GOOGLE_MODELS`, ~7 entradas mantidas à mão)
virou validação de formato (`provider/model`, regex) — o catálogo da
OpenRouter tem centenas de modelos e mudaria toda semana, uma lista fixa não
escalava; modelo inexistente é rejeitado pela própria API deles com erro
claro. `app/api/ai/models/route.ts` (`fetchGoogleModels`) virou
`fetchOpenRouterModels`, contra o catálogo público `openrouter.ai/api/v1/models`
(não exige chave pra listar).

Nova coluna aditiva `organization_settings.ai_openrouter_key` (migration
`20260815144155_ai_openrouter_key`, aplicada em produção). `ai_google_key`
foi **preservada** — não é dívida esquecida, é decisão: o RAG (Google File
Search Store, `lib/ai/messaging/file-search.ts`) usa o SDK `@google/genai`
direto e não tem equivalente na OpenRouter (que só roteia chamadas de chat,
não é serviço de RAG gerenciado). `getOrgAIConfig` (`agent.service.ts`) agora
retorna `apiKey` (OpenRouter, pro chat) e `ragApiKey` (Google, só pro RAG)
como campos separados; se `knowledge_store_id` está configurado num board mas
`ai_google_key` está ausente, o agente loga aviso e segue pro chat normal em
vez de quebrar.

Revisão independente (subagente, Codex deu timeout de 5min) corrigiu o escopo
inicial: `ai_google_key` não era "só RAG" como o plano original assumia — era
lida como chave principal em ~15 pontos (chat, settings UI, admin tool,
health check, listagem de modelos). Todos esses pontos foram migrados pra
`ai_openrouter_key`, incluindo a UI de configurações
(`AIConfigSection.tsx`/`useOrgSettingsQuery.ts`/`app/api/settings/ai/route.ts`)
que originalmente não estava no escopo dos achados mas fazia parte da mesma
cadeia de chave — deixar destravado quebraria o settings UI silenciosamente.
Validação de chave na UI trocou de uma chamada de teste ao Gemini pra
`openrouter.ai/api/v1/auth/key`; textos de LGPD/consentimento atualizados pra
não citar mais "Google Gemini" como destino dos dados.

`/review` no diff final achou e corrigiu 2 bugs críticos antes do commit:
`AI_DEFAULT_MODELS[provider]` (em `config.ts` e `agent.service.ts`) indexava
pelo valor de `ai_provider` lido do banco — orgs criadas antes dessa migration
têm essa coluna com o valor antigo `'google'` (o `DEFAULT` da coluna nunca foi
atualizado), e `AI_DEFAULT_MODELS` só tem a chave `openrouter`; a indexação
stale retornava `undefined` e quebraria `openrouter.chat(undefined)` em
runtime pra qualquer org antiga sem `ai_model` setado. Trocado pra indexar a
constante `AI_DEFAULT_MODELS.openrouter` direto, independente do que estiver
no banco.

**Fora de escopo, registrado em TODOS.md:** limpar colunas mortas
`ai_openai_key`/`ai_anthropic_key` (sobra de uma consolidação anterior);
configurar fallback nativo de modelo da OpenRouter (`models: [...]`, feature
deles, resiliência sem tocar `provider-failover.ts`). **Dívida pré-existente
não tocada** (fora do escopo desse diff, zero importador fora do próprio
arquivo): `lib/validations/schemas.ts` (`aiConfigSchema`),
`lib/ai/actionsClient.ts` (`AIConfigLegacy`), `lib/ai/agent/types.ts`
(`DEFAULT_AGENT_CONFIG`) — ainda com literal `'google'`, código morto, não
afeta runtime. Coluna `organization_settings.ai_provider` ainda tem
`DEFAULT 'google'` pro schema — inofensivo pra resolução de modelo após o fix
acima, mas cosmético em logs/metadata pra orgs antigas; backfill fica pra uma
migration futura se necessário.

### fix(ui): pista visual de scroll horizontal em telas densas (Inbox/Mensagens/cockpit) — 2026-08-14

QA em viewport 1280×800 (notebook comum) achou que o card "aprovações IA"
na visão geral do Inbox ficava cortado na borda direita da tela, sem
nenhuma indicação de que dava pra rolar — `.inbox`/`.thread`/`.cockpit__body`
forçam `min-width: 1180px`, maior que a área útil disponível depois da
sidebar em telas de 1280px. O dado nunca esteve inacessível de fato (o
`<main>`/`.screen` já tinha `overflow-x: auto`), só faltava uma pista
visual — ninguém descobre scroll horizontal escondido sozinho. Adicionada
sombra em CSS puro (sem JS, técnica de scroll-shadow com múltiplos
`background` e `background-attachment: local`/`scroll`) nas bordas do
`.screen`, que aparece só quando há mais conteúdo pra rolar naquele lado e
some sozinha no fim — cobre Inbox, Mensagens e cockpit de uma vez, já que
os três compartilham o mesmo container `<main class="screen">`. Achado e
fix registrados em detalhe no DESAFIOS.md.

### fix(qa): registra responsável real nas atividades — 2026-08-06 (commit `ada057c`, não documentado até agora)

`activities.owner_id` já existia na coluna do banco, mas nunca era
populado na criação — `getAll()`/`create()` passam a fazer join com
`profiles` e exibir o nome real de quem criou a atividade (apelido →
nome completo → e-mail → "Usuário", nunca em branco), substituindo o
"Eu"/"Você" fixo que aparecia pra qualquer atividade de qualquer
usuário. Como a RLS de `activities` já era escopada por
`organization_id` (não por owner), admin já enxergava atividades de
todos — só faltava exibir o nome certo. Atividades automáticas (tipo
`STATUS_CHANGE`, geradas por webhook/gatilho) continuam sem atribuição
de pessoa — mostram ícone de raio (⚡) em vez de iniciais, corretamente,
já que não têm responsável humano.

### fix(qa): corrige service worker cacheando GETs da API + interesses não atualizando na UI — 2026-08-06

QA da seção "Interesses de Produto" (contact_product_interests, ver entrega
anterior) achou 2 bugs reais. `public/sw.js` aplicava cache
stale-while-revalidate em qualquer GET sem checar origem — incluindo
chamadas cross-origin ao Supabase, servindo dados apagados/desatualizados
mesmo depois de uma mutation confirmada no banco (achado sistêmico, afeta
o app inteiro, não só essa feature). Corrigido restringindo a estratégia
de cache a requisições de mesma origem.

Separadamente, `useCreateContactProductInterest`/`useDeleteContactProductInterest`
usavam `invalidateQueries`, que podia coincidir com o refetch de mount
ainda em voo (dedupe do TanStack Query reaproveitando a fetch em
andamento) e sobrescrever o cache com dados de antes da mutation. Trocado
por `setQueryData` direto a partir da resposta da mutation — mesmo padrão
já usado no `DEALS_VIEW_KEY` deste projeto. Adicionado toast de sucesso
(antes só havia feedback em erro).

Ver `DESAFIOS.md` para o registro completo da investigação de causa raiz.

### fix(qa): ISSUE-003 — catálogo de produtos não atualizava lista após criar/editar/excluir — 2026-08-07

Follow-up do fix acima. `ProductsCatalogManager.tsx` (Configurações →
produtos & catálogo) tinha a mesma classe de fragilidade: cada mutation
chamava `load()` (um segundo GET) em vez de atualizar o estado local a
partir da própria resposta. Corrigido — criar/ativar-desativar/editar/
excluir agora atualizam `products` local direto, sem round-trip extra.
Verificado em browser: os 4 fluxos refletem na lista instantaneamente.

### fix(dashboard): não força mais minúsculas no primeiro nome da saudação — 2026-08-06

`DashboardPage.tsx` aplicava `.toLowerCase()` no `first_name` do perfil antes
de exibir na saudação ("Bom dia, gabriella" em vez de "Bom dia, Gabriella").
Nome próprio não deve ter capitalização alterada pelo sistema — removida a
chamada, `firstName` agora usa `profile?.first_name` direto.

### revert(ui): reverte tentativa de padronizar textos de UI em minúsculas — 2026-08-06

Uma investigação da sessão anterior concluiu erroneamente que textos de
interface (títulos de modal, botões, labels de filtro) deveriam seguir um
"padrão de design lowercase intencional do redesign de agosto/2026". Uma
leva de 30 arquivos foi alterada para minúsculas com base nessa conclusão.
O usuário corrigiu diretamente: a interface usa Iniciais Maiúsculas em
botões/títulos/labels, não minúsculas. Todas as 30 alterações foram
revertidas via `git checkout` no mesmo dia — nenhuma mudança líquida na
base de código além do fix de `firstName` acima (mantido por ser correção
não relacionada). Ver `DESAFIOS.md` para o registro completo do erro.

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
- T4: **canal WhatsApp Evolution conectado em produção (2026-07-25)** — instância "Gabriella Cardoso" (já existente na Evolution self-hosted, `evolutionapi.gabriellapcardoso.com.br`), registrada em `messaging_channels` (business_unit `aaagencia` criada — org não tinha nenhuma até então). Webhook configurado e testado (evento `connection.update` simulado processou OK, canal foi pra `connected`, telefone `[REDIGIDO — PII, ver DESAFIOS.md]` capturado). **Decisão da fundadora**: usar o número pessoal dela em vez do comercial da aaagência (indisponível no momento) — risco de mistura com outros usos do mesmo número aceito conscientemente. `INTERNAL_API_SECRET` intencionalmente não configurado ainda — mensagens inbound são registradas mas a IA não responde sozinha até a fundadora decidir ligar isso.

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
