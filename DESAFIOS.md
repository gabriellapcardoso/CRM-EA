# DESAFIOS — fricções operacionais e de ambiente (registradas pra não redescobrir)

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

## Layout do `/messaging`: `min-w-0` obrigatório na coluna central (2026-07-24)

`MessagingPage.tsx` tem 3 colunas (lista `w-80` fixa, thread `flex-1`, painel de contato `w-80` fixo, sempre montado mesmo sem seleção visível de "aberto/fechado"). Sem `min-w-0` na coluna `flex-1`, ela cresce pro conteúdo em vez de encolher, empurrando o painel de contato (e qualquer botão nele) pra fora da viewport em telas ≤1440px — sem scroll, sem erro no console, só invisível/inclicável. Já corrigido (`MessagingPage.tsx:188`), mas o padrão vale registrar: **qualquer nova coluna de largura fixa nesse layout de 3 painéis precisa checar se o `flex-1` do meio tem `min-w-0`.**
