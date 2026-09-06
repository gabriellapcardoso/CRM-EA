<!-- /autoplan restore point: ~/.gstack/projects/gabriellapcardoso-CRM-EA/main-autoplan-restore-20260905-213008.md -->

# Plano — Módulo Clientes (governança de carteira pós-venda)

**Status:** F1 entregue em 2026-09-05 · F2 a F6 em aberto · **Branch alvo:** `feat/modulo-clientes` · **Data:** 2026-09-05

## 1. O problema

O CRM cobre bem o caminho até a venda: prospecção entra por webhook, o lead vira deal,
o agente de IA negocia, a proposta é enviada e paga. No instante em que o pagamento é
recebido o deal cai no board `pos-venda` e **acaba a instrumentação**. Não existe lugar
no sistema que responda:

- quanto a carteira fatura por mês (MRR);
- quais contratos vencem nos próximos 90 dias;
- em que ponto do onboarding cada cliente está;
- o que a agência sabe sobre a marca daquele cliente (tom de voz, paleta, concorrentes),
  hoje espalhado em conversas de WhatsApp e pastas do Drive.

O agente de IA sofre do mesmo buraco: `board_ai_config.business_context` é texto livre por
board, então a IA sabe do negócio da **agência**, não do negócio **daquele cliente**.

## 2. O que já existe (reuso obrigatório antes de escrever coisa nova)

| Capacidade | Onde | Como o módulo usa |
|---|---|---|
| Board `pos-venda` (quando existe) | `webhook-in/stage-target-logic.ts:45` | Fonte de entrada: `pagamento_recebido` cai lá. **Nenhuma migration cria esse board** — elas só atribuem a key a um board de mesmo nome, se já houver (`20260722210000:299`). Ausência é aceita em silêncio |
| `crm_companies` (id, name, industry, website) | `schema_init.sql:116` | Identidade da empresa. **Não duplicar** |
| `deals.client_company_id` / `contacts.client_company_id` | `schema_init.sql` | Liga carteira a deals e contatos existentes |
| Upload pra Storage + registro em tabela | `lib/supabase/dealFiles.ts` | Fluxo copiado pro dossiê. **Policy de Storage, não** — ver §7.1 |
| RAG por Google File Search Store | `lib/ai/messaging/file-search.ts` | **Não está pronto pra reuso** — `uploadToFileSearchStore` não tem nenhum call site fora da própria definição e devolve `void`, sem id do documento. Ver F4 |
| CSS do kanban: `.col-head`, `.col-empty`, `.card-deal` | `app/globals.css:981-1023` | Visão kanban do ciclo de vida. Os **componentes** não servem — ver abaixo |
| `StatCard` | `features/dashboard/components/StatCard.tsx` | Os 4 indicadores do topo |
| `ContactsFilters` + `PaginationControls` | `features/contacts/components/` | Barra de filtros e paginação |
| `.table-list` / `.section-card` / `.field-grid` / `.back-link` | `app/globals.css` | Toda a camada visual. **Nenhum token novo** |
| `sanitizeUrl()` / `sanitizePostgrestValue()` | `lib/utils/sanitize.ts` | Links de presença digital e de plataformas |
| `resolverOrigem()` | `lib/navigation/origem.ts` | Botão voltar contextual da ficha |
| `dataLocalISO()` / `hojeLocalISO()` | `lib/utils/dataLocal.ts` | Toda data no cliente (renovação, contrato) |

**Nada de dependência nova.** Upload, drag-and-drop (HTML5 nativo, sem biblioteca) e datas
já têm solução no repositório.

**Onde o reuso para:** `KanbanBoard`, `KanbanList` e `DealCard` são tipados em `DealView`
(`KanbanBoard.tsx:2,13`, `KanbanList.tsx:12,123`), não em algo genérico. Generificar os três
para servir dois domínios é refatoração ampla numa tela que ninguém pediu pra mexer, e o
kanban de deals é o coração do produto. O módulo escreve o seu próprio kanban de clientes,
curto, reusando as **classes CSS** e o mesmo padrão de `onDragStart`/`onDrop`. Duplicação
de ~120 linhas de JSX, contra o risco de quebrar o pipeline. Se um terceiro domínio aparecer,
aí a extração se paga.

## 3. Modelo de dados

> Reescrito depois da revisão adversarial. A v1 propunha uma tabela `clients` separada;
> a revisão mostrou o custo — duas identidades, cinco campos sincronizados pra sempre, e
> toda consulta de contato ou deal traduzindo `client_company_id → clients.company_id →
> clients.id`. **A empresa já é o cliente.** O que faltava nela era governança, não identidade.

### 3.1 `crm_companies` ganha as colunas de governança

Sete colunas, não quarenta. Tudo que é volumoso fica em satélite.

| Coluna | Tipo | Nota |
|---|---|---|
| `is_client` | bool default false | separa carteira de lead/prospect |
| `client_since` | date | entrada na carteira |
| `niche` | text | `local`\|`ecommerce`\|`infoproduto`\|`servicos_digitais`\|`politico_mandato`\|`politico_eleitoral` |
| `lifecycle_stage` | text | `lead`\|`contrato_assinado`\|`kickoff`\|`setup_concluido`\|`em_operacao`\|`churn` |
| `category` | text | `ouro`\|`prata`\|`bronze` |
| `health_score` | int 0..100 | faixas em §4.2 |
| `health_source` | text | `manual`\|`nps` — hoje só `manual`, ver §7.2 |

`crm_companies` já tem `name`, `industry`, `website`, `owner_id`, `organization_id` e
`deleted_at`. Arquivar = `is_client=false`; excluir = `deleted_at`. Nenhum campo duplicado,
nenhuma sincronização, e `deals.client_company_id` / `contacts.client_company_id` passam a
apontar pro cliente sem nenhuma tradução (`schema_init.sql:240,299,357`).

**Sobre `lifecycle_stage` ser um terceiro estado.** O repositório já tem `contacts.stage`
(pessoa) e estágios de board (negócio). Este é o terceiro, e é deliberado: ele descreve a
**relação com a conta**, que sobrevive a qualquer deal. Um cliente em `em_operacao` pode ter
zero deals abertos. A regra que impede a divergência virar bug: o estágio do cliente **nunca**
é escrito por automação de deal, e nenhuma tela mostra os dois lado a lado como se fossem
o mesmo. Registrado em `CLAUDE.md` na entrega da F1.

### 3.2 `client_contracts` — 1:N, com vigência

Contrato único perde a história: renovação, reajuste, churn e reativação são fatos datados,
e sobrescrever uma linha impede explicar de onde veio o MRR do mês passado.

`company_id`, `monthly_value`, `starts_at`, `ends_at`, `renewal_date`, `status`
(`vigente`\|`encerrado`\|`rascunho`), `payment_method`, `scope` (text[]),
`document_type`, `document_number`, `address_*`, `signed_asset_id`.

Um índice único parcial garante **um só contrato vigente por empresa**:

```sql
CREATE UNIQUE INDEX client_contracts_um_vigente
  ON public.client_contracts (company_id) WHERE status = 'vigente';
```

Sem ele, o join da listagem multiplica o MRR silenciosamente — a soma fica maior e nada
acusa. Tabela de PII: RLS e Storage em §7.1, documento e validação em §7.5.

### 3.3 Satélites (reduzidos de sete para quatro)

- `client_context` — 1:1 por `company_id` (PK = FK, sem id próprio). Tom de voz, palavras-chave,
  o que evitar, público, concorrentes, valores, logo, paleta, **e também** `links` (jsonb:
  presença online + plataformas de anúncio) e `offerings` (jsonb: catálogo do cliente) e
  `benchmarks` (jsonb: CPA alvo, ROAS mínimo, ticket médio). São dados que só se leem no
  contexto de um cliente; ninguém consulta "todos os clientes com Instagram". Viram tabela
  no dia em que alguém precisar consultar entre clientes, não antes.
- `client_assets` — dossiê. `company_id`, `file_name`, `file_path`, `mime_type`, `file_size`,
  `kind` (`documento`\|`foto_autorizada`\|`contrato`\|`gerado`), `rag_document_id`, `rag_uploaded_at`.
- `client_rag_store` — 1:1 por empresa: `store_id`. A cardinalidade certa: **um store contém
  muitos documentos**. Guardar `store_id` por arquivo (como a v1 deste plano propunha) estaria
  errado e teria que ser desfeito.
- `client_team` — `company_id` + `profile_id` + `role`.

**Timeline não ganha tabela.** Ela é derivada: `activities` dos deals e contatos da empresa,
mais `deal_stage_events`, mais `client_events` só para marcos escritos à mão. `activities`
**não** tem `client_company_id` (verificado: só `deal_id` e `contact_id`), então a derivação
é por join, exatamente como `ContactDetailPage.tsx:146` já faz. `client_events` entra na F2
com um campo só de marco manual, e nunca duplica o que já é derivável.

### 3.4 Integridade entre organizações

`organization_id` correto na linha não impede uma FK apontar pra outra organização.
Precedente já no repositório: `20260806140000_contact_product_interests.sql:43`. Toda FK do
módulo (`company_id`, `owner_id`, `profile_id`, `signed_asset_id`) usa o mesmo formato de
FK composta ou trigger de checagem. Sem isso, RLS por organização protege a leitura e deixa
a escrita cruzar o limite.

### 3.5 Métricas do painel — fórmulas explícitas

| Indicador | Fórmula |
|---|---|
| Receita total mensal | `sum(monthly_value)` dos contratos `status='vigente'` de empresas `is_client` não excluídas |
| Clientes ativos | `count(*)` com `is_client`, `lifecycle_stage <> 'churn'`, `deleted_at is null` |
| LTV médio | `avg(monthly_value × meses entre contract.starts_at e hoje)` — **realizado, não projetado** |
| Alertas de renovação | `count(*)` com `renewal_date` entre hoje e hoje+90d, contrato vigente |

LTV projetado exige premissa de churn que ninguém definiu; o realizado não exige nada e não
mente. Cliente sem contrato entra como zero em toda soma — por isso o painel diz quantos são,
em vez de deixar a omissão passar por resultado (§7.4).

## 4. Telas

### 4.1 Rota e navegação

`/clients` (listagem) e `/clients/[clientId]` (ficha). Página inteira, empilhada na vertical,
sem rolagem lateral — mesma regra da revisão de 2026-09-04. Item novo na sidebar.
Voltar contextual via `resolverOrigem()`, com `?from=clientes` nos links de saída.

### 4.2 Faixas de saúde

Promotor 80-100 · Satisfeito 60-79 · Neutro 30-59 · Detrator 10-29 · Churn 0-9.
Cor: **lima é proibida aqui.** Lima significa "precisa da sua decisão" (HITL) neste produto e
nada mais. As faixas usam a escala neutra do design system.

### 4.3 Três formatos

Grade de cartões (padrão), tabela (`.table-list--fit`) e kanban por `lifecycle_stage`.
O formato escolhido vai pra URL (`?view=grade|tabela|kanban`), não pra `useState` — mesma
lição da revisão anterior: estado de tela que dá pra mandar pra alguém mora na URL.
Kanban é a **única** tela do módulo que rola na horizontal, e por ser kanban.

### 4.4 Ficha — 7 abas

Aba na URL (`?aba=visao-geral`). Cada aba carrega sua própria query; nenhuma aba paga o
custo das outras seis. Abas: visão geral · dossiê · contexto criativo · identidade e produtos ·
operacional · timeline · comercial.

## 5. Fases de entrega

> Reordenado depois da revisão. A ordem da v1 entregava na F1 uma listagem de uma tabela
> vazia: a carga automática estava fora de escopo e o cadastro só aparecia na F2. Tela que
> não tem como receber dado não é entrega.

| Fase | Entrega | Por que essa ordem |
|---|---|---|
| **F1** | Migration completa (colunas de governança + `client_contracts` + satélites + RLS + integridade cross-org) · cadastro de cliente · aba Comercial · listagem em tabela · os 4 indicadores | Primeira fase utilizável de ponta a ponta: dá pra cadastrar, contratar e ver o MRR |
| **F2** | Ficha: Visão Geral, Timeline derivada, equipe atribuída | Leitura sobre dado que a F1 já produz |
| **F3** | Grade de cartões · kanban do ciclo de vida · filtros combináveis · ordenação | Camada de visualização |
| **F4** | Dossiê: bucket, upload, e o RAG **consertado** — `uploadToFileSearchStore` ganha call site e passa a devolver o id do documento | Depende de mexer no fornecedor de RAG, risco isolado |
| **F5** | Contexto Criativo · Identidade & Produtos · Operacional | Campos livres sobre a estrutura da F1 |
| **F6** | Assistente de cadastro em 3 camadas + scraping | Ver §7.3 — maior risco, menor certeza |

**A migration inteira sai na F1, não fatiada.** Duas correções da revisão só existem se
forem decididas antes da primeira linha de SQL: a cardinalidade do RAG (store por empresa,
documento por arquivo) e o contrato 1:N com índice de vigência. Descobrir isso na F4 custa
uma migration de correção sobre dado real.

**As query keys nascem paginadas.** `clients.paginated(pagination, filters)` desde a F1, no
formato que `contacts` já usa (`queryKeys.ts:27`). Começar com um `lists()` simples e
parametrizar na F3 é repetir uma migração que este repositório já pagou uma vez.

Cada fase é um PR próprio, com `npm run precheck` verde e teste de guarda.

## 6. Fora de escopo (explícito)

- Pesquisa de NPS (envio, coleta, cálculo). O `health_score` é um número que alguém digita
  até existir uma fonte. Ver §7.2.
- Faturamento, boleto, nota fiscal, cobrança recorrente.
- Assinatura eletrônica de contrato (já está no roadmap do ecossistema, fase A1/B).
- Migrar os deals de `pos-venda` pra clientes automaticamente. Nesta entrega o vínculo
  é manual/assistido; a automação depende de F1 estar em produção com dado real.
- Mexer em `crm_companies`, `contacts`, `deals` ou `products`. O módulo lê essas tabelas,
  não as altera.

## 7. Riscos e decisões abertas

### 7.1 PII — CNPJ/CPF e endereço

`client_contract` guarda documento e endereço de pessoa física ou jurídica real.
Duas camadas, sem exceção:

- **RLS da tabela** por `organization_id`, no formato que este repositório já usa:
  `USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))`
  (`20260221200000_fix_rls_org_scoping.sql`). Não inventar formato novo.
- **Query da aplicação** filtra `organization_id` além do RLS. Defense-in-depth já é a
  regra da casa e vale principalmente pro service role, que ignora RLS.

#### A policy de Storage que NÃO deve ser copiada

O fluxo de `lib/supabase/dealFiles.ts` é o modelo certo pro upload. A policy do bucket
dele **não é**. Estado verificado hoje nas migrations:

| Camada | `deal-files` | Veredito |
|---|---|---|
| RLS da tabela `deal_files` | join por `deals.organization_id` (`20260221200000:161`) | correta |
| Policy `deal_files_read` em `storage.objects` | `USING (bucket_id = 'deal-files')` para todo `authenticated` (`schema_init.sql:1156`) | **cega pra organização** |

A linha do arquivo é isolada por organização; os bytes do arquivo não. Qualquer usuário
logado de qualquer organização lê qualquer arquivo daquele bucket se souber o caminho.
Nenhuma migration posterior mexeu nessas três policies — `storage.objects` só reaparece em
`20260210100002_create_messaging_media_bucket.sql`, que trata de outro bucket.

O padrão certo está justamente nessa migration de mídia: prefixo de pasta por organização.

```sql
bucket_id = 'client-assets'
AND (storage.foldername(name))[1] = (
  SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
)
```

O bucket `client-assets` nasce privado e usa esse formato nas **três** operações —
INSERT, SELECT e DELETE. O `messaging-media` deixa o SELECT público de propósito, porque a
API do WhatsApp precisa baixar o arquivo; contrato assinado com CNPJ não tem essa desculpa.

**Correção do `deal-files` fica fora desta entrega** — é bug pré-existente em outra
funcionalidade, e entra como P1 no `TODOS.md`. O que esta entrega garante é não replicar
o buraco numa tabela que guarda documento de pessoa real.

### 7.5 O que mais o dado sensível exige

Levantado pela revisão adversarial; tudo entra na F1, junto da migration.

- **Documento normalizado.** `document_number` guarda só dígitos. `CHECK` amarra o tamanho
  ao `document_type` (11 para CPF, 14 para CNPJ). Único por organização quando não nulo.
  Dígito verificador é validado na aplicação, com teste nos casos conhecidos de repetição
  (`111.111.111-11` passa no tamanho e falha no dígito).
- **PII nunca vai pro RAG.** `client_assets.kind = 'contrato'` é excluído do caminho de
  upload pro File Search Store, com teste que injeta um contrato e exige que ele não suba.
  Documento e endereço não são enviados a fornecedor de IA nenhum.
- **Redação em log.** `document_number`, endereço e caminho de contrato não entram em
  `console`, toast, analytics ou payload de auditoria. `redactSecrets()`
  (`lib/security/redactSecrets.ts`) cobre chave de API, não documento — ganha um padrão
  para dígitos longos.
- **Retenção.** Soft-delete é ocultação, não exclusão: `deleted_at` mantém CPF no banco
  indefinidamente. A F1 entrega o campo e a tela; o descarte efetivo após churn e o
  atendimento a pedido de eliminação ficam registrados como pendência de LGPD no
  `TODOS.md`, com prazo a definir com a fundadora. **Não é a mesma coisa que estar resolvido.**
- **Quem vê.** Hoje toda policy do repositório é `FOR ALL TO authenticated` por organização
  — qualquer membro lê e escreve tudo da organização. Para CPF isso é decisão, não
  descuido: a agência tem um punhado de pessoas e nenhum sistema de papéis. Fica assim,
  **dito em voz alta**, e vira P2 no `TODOS.md` para o dia em que a equipe crescer.

### 7.2 De onde vem o health score — DECIDIDO: manual

A spec dá as faixas mas não a fonte. Sem pesquisa de NPS respondida, não existe número
pra classificar. Três saídas, e a escolha muda o que F1 entrega.

### 7.3 Scraping — DECIDIDO: só o site do cliente, com a IA que já existe

Buscar site e redes do cliente pra pré-preencher tom de voz, identidade e concorrentes
tem três problemas que não são de código: termos de uso dos alvos (Instagram bloqueia),
custo por execução, e latência dentro de um formulário. O projeto irmão de prospecção
já resolve isso com Apify, mas é outro repositório e outro Supabase.

### 7.4 Modos de falha mapeados

| Falha | Sintoma | Guarda |
|---|---|---|
| Cliente sem contrato | MRR total conta `null` como zero e o painel mente por omissão | Indicador mostra "N de M clientes sem contrato cadastrado" |
| `renewal_date` no passado | Cai fora da janela de 90 dias e some do alerta | Faixa "Atrasada" é filtro de primeira classe, já na spec |
| Data de renovação em UTC | Vira o dia seguinte depois das 21h (GMT-3) | `dataLocalISO()` obrigatório; guarda estática já existe |
| Upload pro RAG falha depois do upload pro Storage | Arquivo aparece no dossiê mas a IA não enxerga | `rag_uploaded_at` nulo é estado visível na tela, não erro silencioso |
| Aba de contexto salva texto de estado | "Sem tom de voz definido" vira dado no primeiro salvamento | Variável de valor real separada da de exibição — lição de 2026-09-05 |
| `lifecycle_stage` sem linha correspondente | Cartão some do kanban sem aviso | Coluna "sem estágio" no kanban, nunca ocultar |
| Policy de Storage copiada do bucket errado | Contrato com CNPJ legível por outra organização | Migration do bucket usa prefixo de pasta por organização nas 3 operações; teste estático confere |
| Dois contratos vigentes na mesma empresa | Join duplica a linha e o MRR total sobe sem nada acusar | Índice único parcial em `status='vigente'` (§3.2) |
| FK apontando pra outra organização | RLS protege a leitura e a escrita cruza o limite | FK composta com `organization_id`, no formato de `contact_product_interests` |
| Contrato assinado sobe pro File Search Store | CPF e endereço vão parar em fornecedor de IA | `kind='contrato'` fora do caminho de RAG, com teste de injeção |
| Capacidade sem call site | Hook/rota escrita e nunca chamada | `grep` pelo nome fora do arquivo de definição antes de fechar cada fase |

## 8. Testes

- `test/clientesMetricas.test.ts` — as 4 fórmulas do painel, incluindo cliente sem contrato
  e renovação atrasada.
- `test/clientesRlsFilters.test.ts` — estático: toda query do módulo filtra `organization_id`
  e `deleted_at`, no modelo de `test/softDeleteFilters.test.ts`.
- `test/clientesSemRolagemLateral.test.ts` — invariantes de CSS, no modelo de
  `test/telasDeDetalheSemRolagemLateral.test.ts`.
- `lib/clients/health.test.ts` — faixas de saúde nos limites (9/10, 29/30, 59/60, 79/80).
- `test/clientAssetsBucketPolicy.test.ts` — estático: a migration do bucket `client-assets`
  usa `storage.foldername` nas três operações e nunca um `USING (bucket_id = ...)` solto.
- `test/clientContratoVigenteUnico.test.ts` — a migration declara o índice único parcial.
- `test/clientPiiForaDoRag.test.ts` — asset `kind='contrato'` não entra no upload pro store.
- `lib/clients/documento.test.ts` — CPF/CNPJ: normalização, tamanho e dígito verificador,
  incluindo os repetidos que passam no tamanho.
- **Injeção de regressão obrigatória** em todo teste estático novo: apagar a linha do
  conserto e exigir vermelho.

---

## Trilha de decisões automáticas (/autoplan)

| # | Fase | Decisão | Tipo | Princípio | Motivo |
|---|---|---|---|---|---|
| 1 | CEO | Entregar as 7 abas e os 3 formatos, não um MVP recortado | mecânica | P1 completude | Foi o pedido; recortar escopo é decisão da fundadora, não minha |
| 2 | Eng | `crm_companies` estendida em vez de tabela `clients` nova | mecânica | P4 DRY | Duas identidades = 5 campos sincronizados pra sempre e tradução de FK em toda query |
| 3 | Eng | `client_contracts` 1:N com vigência, não 1:1 | mecânica | P1 completude | Contrato único não explica MRR histórico nem renovação |
| 4 | Eng | Satélites 7 → 4; links, ofertas e metas viram jsonb no contexto | mecânica | P5 explícito | Ninguém consulta entre clientes por link; tabela é custo sem uso |
| 5 | Eng | Timeline derivada de `activities` + `deal_stage_events` | mecânica | P4 DRY | Segundo log de eventos sem fonte canônica definida |
| 6 | Eng | Kanban próprio reusando só o CSS; não generificar `KanbanBoard` | gosto | P3 pragmático | Generificar mexe no coração do pipeline por uma tela nova |
| 7 | Eng | Query keys paginadas desde a F1 | mecânica | P2 blast radius | `contacts` já pagou essa migração uma vez |
| 8 | Eng | Migration inteira na F1, não fatiada por fase | mecânica | P1 completude | Cardinalidade do RAG e vigência do contrato têm que estar certas antes do dado real |
| 9 | Eng | Corrigir `deal-files` fica FORA | mecânica | P3 escopo | Bug pré-existente de outra funcionalidade; vai pro `TODOS.md` |
| 10 | Eng | `lifecycle_stage` é terceiro estado, deliberado | gosto | P5 explícito | Descreve a conta, não o negócio; nunca escrito por automação de deal |
