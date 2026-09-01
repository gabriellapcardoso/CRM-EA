# TODOS

## Messaging

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

## Layout

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

### Configurar fallback nativo de modelo da OpenRouter (`models: [...]`)

**What:** Ao criar o client OpenRouter em `lib/ai/config.ts`, configurar o parâmetro nativo `models: [fallback-list]` (feature da própria API da OpenRouter, não do Vercel AI SDK) — se o modelo primário falhar, a OpenRouter tenta o próximo da lista automaticamente, sem passar pelo `provider-failover.ts` do projeto.

**Why:** Dá resiliência a falha de modelo específico (rate limit, outage pontual) sem exigir a generalização multi-provider (Opção B, descartada em `/plan-eng-review` de 2026-08-14 por não ter um segundo provider real esperando pra usar).

**Pros:** Configuração de ~1 linha, resolve um caso real (modelo específico fora do ar) sem tocar `provider-failover.ts`.
**Cons:** Nenhuma lista de fallback foi escolhida ainda — decisão de quais modelos entram na lista fica pra quando for implementado.
**Context:** Achado durante `/plan-eng-review` da troca Google Gemini → OpenRouter (2026-08-14). Confirmado via docs oficiais do AI SDK (`ai-sdk.dev/providers/community-providers/openrouter`) que o pacote `@openrouter/ai-sdk-provider` é o caminho oficial pro AI SDK v6, sem adapter customizado.
**Effort:** S
**Priority:** P3
**Depends on:** Migração pra OpenRouter (troca de provider) já concluída.

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
