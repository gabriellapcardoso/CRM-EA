# TODOS

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

## Completed
