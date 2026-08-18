# TODOS

## Messaging

### ~~Botão "Conectar" do canal WhatsApp não conecta nada~~ — RESOLVIDO

**Status:** RESOLVIDO 2026-08-17. Código corrigido ([PR #4](https://github.com/gabriellapcardoso/CRM-EA/pull/4), [PR #5](https://github.com/gabriellapcardoso/CRM-EA/pull/5) — fechou [issue #3](https://github.com/gabriellapcardoso/CRM-EA/issues/3)) + causa raiz real identificada e corrigida (ver item abaixo, "instanceName com acento errado"). Canal `evolution` da aaagência confirmado `Conectado` na UI em produção.

**What:** botão "Conectar" agora chama a Evolution/Z-API de verdade e mostra QR code num modal.

**Context:** Achado por `/qa`, 2026-08-15. Spec revisado via `/plan-eng-review`. Testado em produção 2026-08-17, achado e corrigido um bug novo no mesmo dia (modal travava em erro, PR #5) e a causa raiz real do canal específico (mismatch de nome de instância, item abaixo).

### ~~Instância Evolution "aaagencia" não existe no servidor~~ — RESOLVIDO (era typo de configuração)

**Status:** RESOLVIDO 2026-08-17. Causa raiz: `credentials.instanceName` salvo no canal era `"aaagencia"` (sem acento), mas a instância real no servidor Evolution se chama `"aaagência"` (com acento — confirmado no painel `/manager`). O WhatsApp já estava conectado do lado da Evolution o tempo todo; o CRM só nunca conseguia falar com o endpoint certo por causa do nome errado. Corrigido com `UPDATE messaging_channels SET credentials = jsonb_set(credentials, '{instanceName}', '"aaagência"')`. **Não era bug de código nem do servidor** — nunca foi infra quebrada, era erro de digitação de quando o canal foi cadastrado no CRM.

**Context:** Achado testando o PR #4 ao vivo, 2026-08-17, confirmado acessando o painel `/manager` da Evolution diretamente.

### `EvolutionWhatsAppProvider.disconnect()` não desconecta de verdade (só loga)

**What:** `lib/messaging/providers/whatsapp/evolution.provider.ts:203-207` — `disconnect()` apenas escreve um log, nunca chama a Evolution API pra encerrar a sessão. A sessão continua ativa no servidor Evolution mesmo depois do admin clicar "Desconectar" no CRM.

**Why:** Botão "Desconectar" no CRM mente sobre o que faz — usuário acha que desconectou o WhatsApp, mas a sessão continua viva do lado da Evolution. Se alguém reconectar outro número na mesma instância sem saber disso, pode causar comportamento inesperado (mensagens indo pro número errado, sessão duplicada).

**Context:** Achado durante `/plan-eng-review` do issue #3 (fix do botão Conectar), 2026-08-15 — fora de escopo daquele fix, documentado ali como limitação conhecida.
**Effort:** S — precisa investigar se a Evolution API tem endpoint de logout/disconnect de instância (`/instance/logout/{instanceName}` é comum nesse tipo de API, não confirmado ainda)
**Priority:** P2
**Depends on:** None

## Infrastructure

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
