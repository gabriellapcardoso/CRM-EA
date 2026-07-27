# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
