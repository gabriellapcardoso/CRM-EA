# DESAFIOS — fricções operacionais e de ambiente (registradas pra não redescobrir)

## Abrir e salvar uma tela de configuração mudou o comportamento do sistema (2026-09-03)

**O quê:** o agente respondeu três leads reais de manhã. Alguém visitou
Configurações → Central de IA → agentes por board às 17:51 e salvou. A partir
dali, toda resposta virou log de DRY-RUN e nada mais saiu — por horas, sem que
nada mudasse de aparência.

**Causa:** `board_ai_config.agent_mode` tem `DEFAULT 'observe'`, e a linha de
`board_ai_config` **só nasce quando alguém salva aquela tela**. Sem linha,
`isDryRun` é falso e o agente envia. Com linha recém-criada, ele emudece.

**O que torna isso traiçoeiro:** a mudança de comportamento não foi editar um
campo — foi a **existência da linha**. Quem salvou não alterou nada visível;
provavelmente só abriu a tela pra ver o que tinha nela. E o estado resultante é
indistinguível de funcionamento normal do lado do canal: mensagem entra, contato
e negócio são criados, conversa aparece no inbox. Só não sai resposta.

**Regra:** default seguro-mas-mudo inverte o risco. Ele protege contra o erro
barulhento (agente falando o que não devia) e cria o erro silencioso (agente não
falando, sem ninguém saber). Quando o default silencioso for a escolha certa, a
tela precisa dizer em texto o que aquele modo faz — "observe: gera e registra,
não envia" — e não só nomear o modo. Ver `TODOS.md`.

## Três chaves diferentes seguraram a mesma coisa, uma de cada vez (2026-09-03)

**O quê:** "o agente não responde" foi diagnosticado e corrigido três vezes na
mesma noite, e o sintoma não mudou nas duas primeiras:

1. `ai_enabled` global estava `false` → religado, ainda sem resposta;
2. `ai_takeover_enabled` estava `false` → ligado, ainda sem resposta;
3. `agent_mode` estava `observe` → trocado, e aí funcionou.

**A armadilha de raciocínio:** depois de corrigir a primeira e o sintoma
persistir, a reação natural é achar que a correção falhou e voltar a mexer nela.
A leitura certa é a oposta — cada correção **revela** o próximo portão, que
estava lá o tempo todo, escondido atrás do primeiro. Guardas em série só
mostram a segunda depois que a primeira sai da frente.

**O que fez a diferença:** ler o log de `/api/messaging/ai/process` a cada
tentativa, em vez de inferir. Ele nomeia a causa exata
(`AI is disabled for organization`, `AI not enabled for this stage`,
`DRY-RUN — would have sent`). Sem isso, seriam três rodadas de adivinhação.

**Regra:** quando um sintoma sobrevive à correção da causa confirmada, procurar
a **próxima** guarda no mesmo caminho antes de duvidar da correção que você
acabou de fazer.

## Enumerar é afirmar completude, e eu errei duas horas depois de escrever (2026-09-03)

**O quê:** documentei no `CLAUDE.md` "as quatro chaves que calam a IA", com
tabela e sintoma de log de cada uma. Duas horas depois, a resposta de teste não
saiu por causa de uma **quinta** chave que eu não tinha listado.

**Por que dói mais que uma omissão comum:** "quatro chaves" não é uma lista
parcial, é uma afirmação de que são quatro. Quem lê e checa as quatro conclui
que o problema está em outro lugar e para de procurar ali. Um mapa incompleto
que se anuncia completo é pior que nenhum mapa.

**Como eu deveria ter verificado:** a lista saiu do que eu tinha visto durante o
debug, não de uma varredura. O certo era percorrer todos os pontos de saída
antecipada do caminho (`processIncomingMessage` e o que ele chama) e listar cada
condição que impede a resposta — o `agent_mode` estava lá, no passo 3c, antes
mesmo das guardas que eu já conhecia.

**Regra:** ao escrever uma enumeração fechada sobre código, derivá-la do código,
não da memória do que você acabou de depurar. Se não der pra varrer, não numerar
— escrever "entre outras" custa uma palavra e não mente.

## Capacidade sem call site é capacidade ausente — três vezes na mesma base (2026-09-03)

**O quê:** em uma única sessão, três capacidades implementadas, corretas e
testáveis não faziam nada, porque nenhum caminho as chamava:

1. `configureWebhook()` nos providers de WhatsApp — 5 semanas de canal mudo.
2. `useRetryMessage()` + a rota de retry — mensagem falha sem saída na tela.
3. `INTERNAL_API_SECRET` — nome de env var que só o código conhecia.

**Por que engana:** as três passam em revisão de código, têm tipos certos e
comentário explicando o propósito. Uma delas até tinha teste de unidade do
próprio método. Nada disso responde a pergunta que importa: **quem chama?**

**Verificação que custa 5 segundos:** ao encontrar uma função que "já existe",
`grep` pelo nome dela excluindo o arquivo onde é definida. Zero resultados fora
da definição significa que ela não roda, por mais correta que seja. Vale também
pra env var: `grep` pelo nome no repositório inteiro, e depois conferir se
existe no ambiente (`supabase secrets list`, painel da Vercel).

**Sinal de alerta na leitura de código:** comentário no estilo "isto serve pra
X" sem nenhum ponto que faça X. O comentário descreve a intenção; o call site é
o que prova a execução.

## Nome de env var que só o código conhece é feature desligada (2026-09-03)

**O quê:** a Edge Function do WhatsApp lia `INTERNAL_API_SECRET` e `APP_URL` pra
acionar o agente de IA. Nenhum dos dois existia em ambiente nenhum. O que
existia, configurado e em uso por outro fluxo do mesmo repositório, era
`CRM_EA_INTERNAL_WEBHOOK_SECRET` e `CRM_EA_APP_URL`. Dois nomes pro mesmo
conceito, e o código lia o que ninguém setava.

**Por que passou:** o caminho degradava em silêncio (`console.warn` + `return`),
e o efeito só aparece quando existe tráfego real. Como o canal de WhatsApp nunca
funcionou até hoje, nunca houve mensagem pra revelar. Duas ausências se
escondendo uma na outra.

**Como conferir sem ver segredo nenhum:**

- `supabase secrets list --project-ref <ref>` lista os NOMES dos secrets da Edge
  Function, sem valores. Resolve "está setado?" em um comando.
- Do lado da app, uma rota que devolve 500 quando a env falta e 401 quando ela
  existe mas a chave está errada distingue os dois casos sem enviar credencial
  nenhuma. Vale desenhar rotas internas assim de propósito.

**Regra:** ao introduzir uma env var nova, conferir se o mesmo conceito já tem
nome neste repositório antes de inventar outro. E fazer ausência de configuração
obrigatória ser `console.error` com o nome exato da variável — `warn` some no
meio do log e a feature morre em silêncio.

## Conclusão tirada de caso quebrado contamina o caso são (2026-09-03)

**O quê:** o provider mandava `?number=` na chamada de QR, com um comentário
afirmando que era obrigatório porque "sem ele a Evolution devolve corpo vazio".
Verdade — na instância `integration: EVOLUTION`, que não tem WhatsApp atrás e
devolve corpo vazio pra tudo. Numa instância Baileys real, `number` faz a
Evolution escolher o fluxo de código de pareamento e **suprimir o QR**. A regra
tirada do ambiente doente quebrava o ambiente são.

**Como se protege:** ao anotar um comportamento observado ao vivo, registrar
CONTRA O QUÊ foi observado, não só o que foi visto. "Sem `number` vem vazio"
virou lei; "sem `number` vem vazio nesta instância, que responde vazio pra
qualquer chamada" teria levantado a suspeita certa. Observação sem sujeito viaja
pra onde não vale.

**Sinal de alerta:** quando um workaround existe porque "senão vem vazio",
desconfiar do ambiente antes de aceitar o workaround. Corpo vazio raramente é
uma resposta legítima de API.

## Arme de pré-requisito não fica atrás da chamada que pode falhar (2026-09-03)

**O quê:** a rota de QR armava o webhook DEPOIS de pedir o QR. Quando o pedido
de QR falhou, o arme não rodou — canal em `error` com webhook nulo. Dois
problemas onde havia um, e o segundo silencioso.

**Regra:** passo que é pré-requisito de outra coisa (e idempotente, e útil
sozinho) vai ANTES do passo que pode falhar, não depois. Aqui o webhook precisa
estar vivo antes do scan de qualquer forma; pendurá-lo no sucesso do QR só criou
acoplamento sem ganho. Fora do `try`, o resultado ainda serve todos os caminhos
de saída sem duplicar o efeito.

## `state: open` da Evolution não quer dizer que existe WhatsApp (2026-09-03)

**O quê:** passei uma sessão inteira consertando o webhook de um canal cuja
instância nunca teve WhatsApp nenhum. Li `connectionState` devolvendo
`{"state":"open"}` e afirmei "o WhatsApp está conectado de verdade".

**Por que enganou:** a Evolution cria instâncias de três tipos. Com
`integration: "EVOLUTION"` (canal genérico interno, não Baileys), o servidor
responde `open` permanentemente — não há sessão de WhatsApp pra estar aberta ou
fechada. `open` ali significa "o objeto existe", não "tem telefone pareado".

**O que responde a pergunta certa**, na mesma chamada que eu já tinha:

- `ownerJid` — nulo significa nenhuma conta ligada. É O campo.
- `profileName` / `profilePicUrl` — nulos junto confirmam.
- `_count` — Chat/Contact/Message zerados numa conta comercial em uso é impossível.
- `integration` — tem que ser `WHATSAPP-BAILEYS` pra ser WhatsApp real.
- `POST /chat/whatsappNumbers/{instance}` — devolve
  `"Method not available on Evolution Channel"` no tipo errado. Prova barata,
  não envia nada.

**A parte constrangedora, que é a lição:** o `ownerJid` estava vazio na primeira
resposta que li, no primeiro dia. Meu próprio regex de redação de segredo
transformou o valor vazio em `"..."`, e eu li aquilo como "mascarado" em vez de
"vazio". Mascarar campo pra não vazar segredo é certo; mascarar de um jeito que
não distingue **vazio** de **oculto** apaga evidência. Redação deve preservar a
diferença — `(vazio)` e `(N chars)` dizem tudo que importa sem revelar nada.

**Regra geral:** status agregado de fornecedor (`open`, `healthy`, `active`)
responde a pergunta mais fácil, não a que interessa. Procurar sempre o campo que
só existe quando a coisa funciona de verdade — um identificador da conta, uma
contagem, um timestamp de último uso.

## Mensagem de erro que chuta causa vira causa raiz falsa depois (2026-09-03)

**O quê:** `getQrCode()` lançava `"QR code not available. Instance may already be
connected."` sempre que não achava o base64. Ele lia o campo do lugar errado
(aninhado, quando a Evolution v2 devolve plano), então lançava SEMPRE — com o QR
pronto no corpo da resposta.

**O dano real:** em 2026-08-31 aquela frase foi lida como diagnóstico. Virou a
justificativa do branch `alreadyConnected`, que marca o canal como conectado. Um
palpite escrito em tom afirmativo dentro de um `throw` atravessou semanas e
duas sessões como se fosse fato observado.

**Regra:** erro relata o que foi observado, nunca o que se supõe que causou.
`"campo X ausente (campos recebidos: a, b, c)"` é verificável e leva ao lugar
certo. `"pode ser que Y"` vira Y na cabeça de quem lê depois — inclusive na
sua própria, três semanas mais tarde.

## Vigia que só olha quem já se apresentou nunca vê quem nunca chegou (2026-09-03)

**O quê:** o watchdog de cron pegou o `ai-health` parado em 50 minutos e não
pegou o `evolution-health` nunca, apesar de os dois estarem quebrados pelo mesmo
motivo, na mesma hora, com o mesmo sintoma.

**Causa:** `check_cron_heartbeats()` percorre as linhas de `cron_heartbeats`. O
`ai-health` gravava heartbeat, então tinha linha e ficou velha. O
`evolution-health` nunca gravou: sem linha, não entra no laço, invisível.

**A lição geral:** monitor construído em cima de "registros que envelhecem" só
enxerga quem já se registrou uma vez. A ausência total não envelhece. Sempre que
o monitoramento for por heartbeat/last_seen, perguntar quem DEVERIA estar na
lista e semear essas linhas — senão o pior caso, o serviço que nunca subiu,
é exatamente o que não dispara nada.

**Correção barata que preferi à lógica nova:** semear a tabela na migration
transforma "nunca reportou" em "parou de reportar", e o laço que já existe passa
a tratar o caso. Zero caminho novo no watchdog.

## Guarda de placeholder não é guarda de valor (2026-09-03)

**O quê:** a migration que reagendou os health checks tinha guarda pra impedir
que o `__CRON_SECRET__` fosse aplicado sem substituir. A guarda passou — o
placeholder tinha sido substituído. Por um valor de 11 caracteres que não é o
segredo. Resultado: 401 a cada 15 minutos por 20 horas, sem ninguém notar.

**A lição:** checar "o placeholder foi substituído?" responde uma pergunta bem
mais fraca que "o valor faz sentido?". Substituição manual erra de duas formas —
não substituir (a guarda pega) e substituir errado (não pega). Guarda de segredo
em migration deve checar **formato mínimo**: tamanho plausível, e quando houver
outra fonte no mesmo banco com o mesmo segredo, igualdade contra ela.

**Como conferir sem ver segredo nenhum:** comparar `md5()` do token de um job
contra o de outro, e olhar `length()`. Os dois respondem "é o mesmo valor?" e
"tem tamanho de segredo?" sem imprimir nada. Foi assim que este bug foi isolado.

## "Conectado" não é "recebendo": integração que só metade funciona não alerta (2026-09-03)

**O quê:** o WhatsApp comercial ficou 5 semanas sem entregar nenhuma mensagem
ao CRM. Status no CRM: `connected`. Sessão na Evolution: `open`. Cron de health
check: verde, execução após execução. Nada em lugar nenhum dizia que havia um
problema.

**Causa real:** o webhook da instância tinha a URL certa e mais nada —
`enabled: false`, `events: []`, `headers: null`.

**A armadilha de diagnóstico:** três sinais fortes diziam "está funcionando", e
todos os três eram verdade. A sessão do WhatsApp estava mesmo no ar; o canal
estava mesmo conectado; a URL estava mesmo correta. Um canal de integração tem
pelo menos dois sentidos, e é perfeitamente possível um estar perfeito com o
outro morto. Perguntar "está conectado?" não é a mesma pergunta que "o que
chega lá chega aqui?".

**Como separar rápido da próxima vez:** não olhar status, olhar tráfego.
`select max(created_at) from messaging_webhook_events` responde em um segundo o
que meia hora de leitura de status não responde. Se o último evento é de
semanas atrás, o cano está entupido, não importa o que o status diga. E o
`channel_id` desses eventos diz de qual canal eles são — no caso, todos os 4712
eram de um canal já excluído, o que sozinho já contava a história.

**Três lições que valem além deste bug:**

1. **Código certo que ninguém chama é código que não existe.**
   `configureWebhook()` estava implementado nos dois providers desde julho,
   correto, com header de auth e tudo. Zero call sites. Um `grep` por
   chamadas de uma função que "já existe" custa 5 segundos e teria fechado
   isto em julho. Ao encontrar uma capacidade implementada, confirmar quem a
   aciona antes de assumir que ela roda.

2. **Health check tem que medir o caminho que pode quebrar, não o mais fácil
   de medir.** Já estava escrito no `CLAUDE.md` desde 2026-09-01 pro
   `ai-health` ("nunca um ping ao fornecedor") e não tinha sido aplicado ao
   `evolution-health`, que continuou perguntando ao fornecedor se ele estava
   de pé. Lição aprendida em um lugar não se propaga sozinha pros outros
   lugares com a mesma forma — quando um princípio de monitoramento for
   escrito, varrer os outros health checks no mesmo commit.

3. **Passo manual de configuração é passo que vai ficar meio feito.** A tela
   mandava copiar a URL e colar no painel do provider; o painel deixa
   `enabled`, `events` e `headers` em branco por padrão. Ninguém errou nada
   — a pessoa fez exatamente o que a tela pediu. Quando o app sabe montar a
   configuração inteira, ele que a aplique; quando não puder, precisa pelo
   menos conseguir verificar depois se ficou certa.

**Sinal de alerta que se camuflou:** a limpeza de dados de teste de 2026-08-31
zerou `messaging_conversations` e `messaging_messages` de propósito. Uma tabela
vazia por motivo legítimo escondeu uma tabela vazia por motivo ilegítimo. Ao
investigar "não tem dado", checar se alguém apagou antes de concluir que nunca
chegou — e vice-versa.

## Dev server servindo build velho faz bug corrigido "voltar" (2026-08-31)

**O quê:** ao testar a barra lateral ocultável em `localhost`, o dashboard
voltou a mostrar R$ 5.600 de deals já excluídos — bug que tinha sido
corrigido e verificado em produção horas antes. Também sumiu do topbar um
botão que eu tinha acabado de adicionar e visto funcionando.
**Reação errada que quase tomei:** achar que alguém restaurou os deals no
banco, ou que meu fix tinha regredido.
**Causa real:** o dev server estava rodando desde antes das correções
(`preview_start` devolveu `reused: true`) e servia bundle antigo. O banco
estava certo o tempo todo — confirmado por SQL: os dois deals seguiam com
`deleted_at` preenchido.
**Como separar rápido:** conferir o DADO na fonte (SQL direto) antes de
suspeitar do código. Se o banco está certo e a tela não, o problema está
entre os dois — cache de build, service worker, ou bundle velho.
**Correção:** `preview_stop` + `rm -rf .next` + `preview_start`.
**Sinal de que é build velho, não regressão:** código NOVO que você acabou
de escrever some da tela junto com o comportamento antigo voltando. Uma
regressão de dados não faria um botão novo desaparecer.

## Disco cheio (ENOSPC) se disfarça de erro de aplicação (2026-08-31)

**O quê:** a página de Contatos passou a devolver "Internal Server Error" no
dev. Nos logs, antes do erro real, apareciam vários `panicked at
turbopack_ctx.rs` e `PoisonError` do Turbopack — tudo com cara de bug do
Next.js. A causa era `ENOSPC: no space left on device`: 2,1 GB livres de
228 GB.
**O que denunciou:** o próprio agente parou de conseguir rodar comandos
(`ENOSPC` ao escrever o arquivo de saída do shell).
**Regra prática:** ao ver panic de toolchain (Rust/Turbopack/esbuild) em
cascata, checar `df -h` ANTES de investigar o stack trace. Ferramenta de
build costuma reportar disco cheio como corrupção interna.
**Onde o espaço estava:** WhatsApp Desktop com 52 GB de mídia
(`~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared`) — só
limpável pelo app. Cuidado com `du -sh ~/Library/*`: não pega diretórios
ocultos, e o total do pai não bate com a soma dos filhos; usar
`du -h -d 1` pra achar o real culpado.

## VPS suspensa e religada: Evolution volta quebrada em 3 camadas, não 1 (2026-08-31)

**O quê:** VPS Hostinger venceu e foi religada. Pagar
e ver `state: running` no painel **não** significa Evolution no ar. Depois do
reboot, três coisas separadas estavam quebradas ao mesmo tempo:

1. **Conflito de porta 80/443** — o Caddy do host (systemd, `enabled`) subiu
   antes do `easypanel-traefik` e ocupou as portas. Traefik ficou `0/1` com
   `failed to bind host port 0.0.0.0:80/tcp: address already in use`. Sintoma
   enganoso: porta 80 respondia (`Server: Caddy`, 308 pra https) e 443 dava
   `tlsv1 alert internal error` / `no peer certificate available` — parece
   certificado vencido, **não é**. O Caddyfile só conhecia um domínio
   `sslip.io` de fallback (app BetAnalytics na 8000); nunca teve o domínio da
   Evolution. Correção: `systemctl stop caddy && systemctl disable caddy`
   (backup do Caddyfile salvo em `/root` antes de desabilitar).
2. **Load balancer do Swarm (IPVS) morto** — com o Traefik no ar, todos os
   domínios davam 502. DNS interno resolvia o VIP do serviço
   (`evolution_evolution-api`), mas o container real estava em outro IP
   da rede overlay e o VIP respondia `Host is unreachable`. Correção sem
   reiniciar o daemon: `docker service update --force --endpoint-mode dnsrr
   <serviço>` — com `dnsrr` o DNS entrega o IP do container e o IPVS sai do
   caminho.
3. **Redis desconectado** — mesma causa do item 2 (Evolution alcançava o Redis
   por VIP). Resolveu com `dnsrr` no `evolution_evolution-api-redis`; log passa
   de `redis disconnected` em loop pra `redis ready`.

**Ordem de diagnóstico que funcionou** (repetir nesta ordem numa próxima):
`state` da VPS → `docker service ls` (procurar réplica `0/1`) →
`docker service ps <serviço> --no-trunc` pro erro real → `ss -tlnp | grep ":80 "`
pra achar quem roubou a porta → de dentro do Traefik,
`getent hosts <serviço>` + `wget` pro backend, comparando com o IP real do
container (`docker inspect`).

**Armadilha principal:** cada camada mascara a de baixo. Com a porta tomada, o
erro parece de TLS/certificado. Com o TLS resolvido, o 502 parece de aplicação.
A Evolution respondia 200 em `localhost:8080` dentro do container o tempo todo —
o container nunca foi o problema.

**Serviços com `dnsrr` aplicado (todos os 4 domínios em 200):**
`evolution_evolution-api`, `evolution_evolution-api-redis`, `n8n_n8n`,
`gerador-design_web`, `easypanel`.

**Pendência deixada:** BetAnalytics Pro (`betanalytics.service`, uvicorn na
8000) continua rodando mas perdeu o HTTPS no domínio `sslip.io` de fallback —
precisa ser republicado pelo Easypanel se o domínio importar.

**Atenção pro futuro:** o `dnsrr` pode ser revertido pelo Easypanel num
redeploy do serviço, porque ele reescreve a spec. Se um domínio voltar a dar
502 do nada, checar `endpoint-mode` (`docker service inspect <serviço>
--format '{{.Spec.EndpointSpec.Mode}}'`) antes de qualquer outra coisa. A
correção de raiz seria reiniciar o daemon do Docker (`systemctl restart
docker`), que reconstrói o IPVS — o `dnsrr` é contorno, não cura.

**Confirmado no mesmo dia:** rotacionar a `AUTHENTICATION_API_KEY` da
Evolution pelo painel Easypanel (Environment → Salvar → Implantar) disparou
um redeploy do serviço, que reverteu `endpoint-mode` pra `vip` de novo —
502 voltou imediatamente após o deploy, `dnsrr` reaplicado pra resolver.
Qualquer clique em "Implantar" no Easypanel, não só reboot da VPS, é gatilho
suficiente pra reverter o `dnsrr`.

## Chave de API de produção era a chave de EXEMPLO da documentação oficial (2026-08-31)

**O quê:** a `AUTHENTICATION_API_KEY` do servidor Evolution em produção era,
literalmente, a chave de exemplo publicada na documentação oficial da
Evolution API — a mesma que aparece em todos os tutoriais, READMEs e nos
próprios snippets que o Context7 devolve ao consultar a doc. Como o servidor
está exposto na internet, qualquer pessoa que já leu a documentação tinha
acesso de admin: enviar mensagem como o número da aaagência, ler conversas,
derrubar a sessão.
**Como apareceu:** por acaso, durante um `/qa` de outro assunto. Eu precisei
da chave pra chamar um endpoint de restart e reconheci o valor de imediato —
não veio de auditoria de segurança nenhuma. Ninguém tinha olhado pra essa
variável desde o setup.
**Correção:** chave nova de 64 caracteres (`openssl rand -hex 32`),
atualizada em 3 lugares que precisam estar em sincronia:
1. `docker service update --env-add` (efeito imediato no serviço)
2. `messaging_channels.credentials.apiKey` no banco do CRM (senão o app
   perde acesso na hora)
3. Easypanel → Environment → Salvar → **Implantar** (senão o próximo
   redeploy pelo painel reverte pra chave antiga)
Verificado depois: chave antiga passou a devolver `401`, chave nova `200`.
**Regra prática:** ao subir qualquer serviço self-hosted a partir de um
template/tutorial, tratar TODA credencial que veio junto como já
comprometida — o valor default de doc não é "placeholder que ninguém usa",
é uma senha pública. Vale conferir `AUTHENTICATION_API_KEY`, senha de banco
e afins ANTES de expor o serviço na internet, não meses depois por acaso.
**Pendência relacionada:** o setup do Evolution também tem
`AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true`, que faz o endpoint
`/instance/fetchInstances` devolver o token de cada instância no corpo da
resposta. Com a chave rotacionada o risco caiu, mas vale revisar se esse
`true` é mesmo necessário.

## Soft-delete só funciona se TODA query de leitura filtrar (2026-08-31)

**O quê:** `deals` tem `deleted_at` e o app inteiro trata exclusão como
soft-delete — mas `dealsService.getAll()` (`lib/supabase/deals.ts`), que é a
fonte ÚNICA de deals do frontend (board de Negociação, board de Pós-venda,
dashboard, qualquer lista), nunca filtrou `deleted_at`. Deal excluído
continuava aparecendo na tela e somando valor na coluna, inclusive depois de
refresh forçado.
**O agravante:** o padrão CERTO já existia no projeto — toda a API pública
(`app/api/public/v1/deals/*`, `lib/public-api/dealsMoveStage.ts`) filtra
`.is('deleted_at', null)` corretamente. A divergência era entre camadas:
API pública certa, camada do frontend errada. Quem lesse só um dos lados
concluiria que o projeto trata soft-delete direito.
**Por que passou despercebido:** bug latente. Só aparece quando alguém
exclui algo E vai conferir na tela. A exclusão "funciona" (grava
`deleted_at`), a tela só não obedece.
**Regra prática:** ao introduzir/manter soft-delete numa tabela, `grep` por
TODAS as queries daquela tabela (`.from('<tabela>')`) e conferir uma a uma se
filtram a coluna — inclusive contadores e updates em massa, não só listagens.
Aqui, além do `getAll()`, faltava em `boardsService.canDelete()` (contava
deal excluído como bloqueio pra apagar board), `deleteStage()` (idem pra
estágio) e `moveDealsToBoard()` (ressuscitaria deal excluído ao mover de
board).
**Guarda:** `test/softDeleteFilters.test.ts` verifica os 8 pontos (4 do fix
inicial + 4 achados na auditoria seguinte, ver desafio abaixo).

## Corrigir o caso que aparece não é corrigir a classe do bug (2026-08-31)

**O quê:** depois de corrigir o `deleted_at` faltando em `deals` (o caso que
a fundadora viu na tela), a auditoria pedida em seguida achou a MESMA classe
de bug em mais 3 serviços — 2 deles com registro excluído aparecendo na tela
**naquele exato momento**: 3 atividades em Atividades e 3 empresas em
Empresas. Ninguém tinha reclamado dessas duas telas; o bug estava lá, à
vista, só não tinha sido olhado.
**Por que aconteceu:** o primeiro fix atacou o sintoma reportado (board
somando R$5.600). Como a causa era "camada de leitura do frontend não filtra
`deleted_at`", e essa camada tem um arquivo por entidade, era previsível que
o mesmo defeito existisse nos vizinhos — mas só foi encontrado porque a
fundadora pediu a auditoria, não porque o fix original a incluiu.
**Regra prática:** ao corrigir um bug que tem "classe" (mesmo padrão
replicável em N lugares), rodar o grep da classe inteira ANTES de fechar o
PR, mesmo que só um caso tenha sido reportado. Aqui foram 221 queries em 7
tabelas — 20 minutos de auditoria contra 2 telas erradas em produção por
tempo indeterminado.
**Como fazer barato:** triagem automática primeiro (script que lista as
ocorrências de `.from('<tabela>')` sem `deleted_at` no bloco seguinte),
leitura manual só das candidatas. Dos 149 candidatos brutos, a esmagadora
maioria era falso positivo (INSERT, UPDATE por id, retry de migration) — o
script derruba o custo de "ler 221 queries" pra "ler ~30".
**Ressalva que vale mais que o fix:** na camada de IA/MCP e nas Edge
Functions o mesmo grep achou ~30 ocorrências, mas ali **nem toda ocorrência
é bug** — webhook que faz lookup por `external_id` pra garantir idempotência
provavelmente PRECISA enxergar o registro excluído. Adicionar o filtro em
massa ali quebraria idempotência, que é pior que o bug original. Ficou como
P2 pra análise fluxo a fluxo, e essa decisão de NÃO corrigir foi deliberada.

## Banco de produção mexido enquanto alguém usa o app ao vivo (2026-08-31)

**O quê:** durante a limpeza de dados de teste, a contagem de contatos caiu
de 62 pra 61 e a de deals de 19 pra 17 — registros sumiram de vez, sendo que
eu só tinha rodado `UPDATE` (soft-delete), nunca `DELETE` nessas tabelas.
Passei um tempo caçando trigger, cascade e bug na minha própria SQL.
**Causa real:** a fundadora estava usando o CRM ao vivo no mesmo momento —
fez merges de contato e excluiu um registro manualmente pela interface.
Confirmado por `contact_merge_log` (2 merges novos, timestamps no meio da
minha operação, um deles pela conta dela) e depois confirmado por ela.
**Regra prática:** antes de caçar bug fantasma em operação de banco de
produção, checar se há atividade humana concorrente — tabelas de log/auditoria
(`contact_merge_log`, `audit_logs`) e `updated_at` recente denunciam. E, ao
relatar divergência de contagem, dizer explicitamente "não consigo explicar
X" em vez de assumir que a própria operação causou; foi perguntar que
resolveu, não investigar mais fundo.
**Melhor ainda:** avisar antes de começar operação em massa em produção, pra
combinar de ninguém mexer enquanto roda.

## Método de serviço sem caller nenhum = botão que mente (2026-08-31)

**O quê:** o TODO dizia "`EvolutionWhatsAppProvider.disconnect()` só loga,
não chama a Evolution". Verdade, mas incompleto: mesmo com o provider
corrigido nada mudaria, porque o botão "Desconectar" nunca chegava no
provider — ia direto num `UPDATE messaging_channels SET status` feito do
browser. `ChannelRouterService.disconnectChannel()`, o único caminho que
chamaria `provider.disconnect()`, era código morto (zero callers no
projeto inteiro).
**Por que aconteceu:** o método existia, tinha assinatura correta e
tratamento de erro — parecia vivo em qualquer leitura de código local. O
que denunciou foi `grep` pelo nome do método no projeto inteiro, não a
leitura do arquivo.
**Regra prática:** ao pegar um TODO do tipo "função X não faz o que
promete", antes de corrigir X rodar `grep -rn "X("` pra confirmar **quem
chama X**. Se ninguém chama, o bug real é o caminho ausente, e corrigir X
sozinho é entrega que não muda nada na tela.
**Custo se ignorado:** PR "corrige disconnect", merge, deploy, bug
continua idêntico em produção — exatamente o ciclo que já tinha acontecido
com o botão "Conectar" (issue #3, dois PRs até funcionar).
**Bônus:** o mesmo `grep` mostrou que "Desconectar" tinha a mesma origem
de bug que "Conectar" — quando um par de botões compartilha o mesmo
`onToggle`, corrigir um lado não corrige o outro; vale checar o gêmeo.

## Falha no provider não pode travar o estado local (2026-08-31)

**O quê:** primeira versão da rota `POST /channels/[id]/disconnect`
retornava 500 e não gravava nada quando a Evolution recusava o logout.
Consequência: canal com credencial errada ou servidor fora do ar ficaria
com `status='connected'` no CRM pra sempre, sem o admin ter como marcar
como desconectado pela UI.
**Correção:** status no banco sempre reflete a intenção do admin (vira
`disconnected`); a resposta carrega `providerDisconnected: false` +
`warning`, e a UI mostra toast de aviso em vez de "Canal desconectado".
Honestidade sem travar o usuário.
**Regra prática:** ação que toca sistema externo + estado local deve
poder terminar em "estado local atualizado, externo falhou, e o usuário
sabe disso" — não em tudo-ou-nada.

## Reusar o mesmo "evento de negócio" pra automação de 2 canais herda o gate de revisão de só 1 deles (2026-08-15)

**O quê:** no desenho do disparo automático de proposta (estágio "Proposta
pronta" → e-mail + WhatsApp automáticos), a primeira versão fez o WhatsApp
automático depender do webhook T3b evento `'enviada'` chegando com
`target_stage_slug='proposta-enviada'` — o MESMO evento que também dispara
quando alguém clica "Enviar por e-mail" manualmente no Propostas, pra
QUALQUER proposta, sem relação nenhuma com o estágio novo "Proposta
pronta". Resultado: o gate de revisão humana (deal só avança automação
depois que um humano confirma no estágio novo) valia de verdade só pro
e-mail — o WhatsApp automático dispararia em cima de qualquer envio manual
de e-mail, inclusive de propostas antigas sem nenhuma relação com o fluxo
novo, se a org tivesse o flag ligado.
**Por que aconteceu:** dois canais (e-mail automático, WhatsApp
automático) foram amarrados ao mesmo evento de infraestrutura (T3b
`'enviada'`) por reuso de infra — fazia sentido técnico (mesmo payload,
mesmo webhook já testado), mas esse evento historicamente significava
"e-mail foi enviado" (qualquer origem), não "passou pelo gate novo".
Reusar infraestrutura sem reusar a SEMÂNTICA que ela carrega é o erro.
**Achado por:** `/review` adversarial (subagent dedicado, achado #5 da
rodada), não pela implementação original nem pela revisão manual.
**Correção:** antes de disparar WhatsApp automático, checar o próprio
outbox (`deal_stage_events` do CRM-EA, mesmo banco, sem depender do
sistema do outro lado saber a "origem" do envio) por uma linha
`stage_slug='proposta-pronta'` pra aquele `deal_id` — confirma que o gate
específico foi cruzado, não só que "um e-mail saiu em algum momento".
**Generalizável:** sempre que 2+ automações de canal forem amarradas ao
mesmo evento/webhook compartilhado, perguntar explicitamente "esse evento
significa a MESMA coisa pros dois gatilhos, ou só peguei carona na infra
que já existia?" — antes de assumir que reuso de payload = reuso de
regra de negócio.

## Indexar `Record<Provider, Model>` pelo valor do banco (não pela constante) quebra silenciosamente com dado stale (2026-08-15)

Durante a migração do provider de IA (Google Gemini → OpenRouter,
`/plan-eng-review` + implementação em 2026-08-15), `lib/ai/config.ts` e
`lib/ai/agent/agent.service.ts` tinham `AI_DEFAULT_MODELS[provider]`, onde
`provider` vinha de `orgSettings.ai_provider` (coluna do banco) com um cast
`as AIProvider`. Depois da migração, `AIProvider` só tem 1 literal real
(`'openrouter'`) e `AI_DEFAULT_MODELS` só tem essa chave — mas
`organization_settings.ai_provider` tem `DEFAULT 'google'` no schema (nunca
atualizado) e orgs criadas antes da migration carregam esse valor stale no
banco. `AI_DEFAULT_MODELS['google']` retorna `undefined` silenciosamente (TS
não acusa erro — o cast `as AIProvider` mente em compile-time, mas o valor
real em runtime continua sendo o que está no banco), e esse `undefined` só
vira erro de verdade lá na frente, dentro do SDK (`openrouter.chat(undefined)`),
pra qualquer org antiga sem `ai_model` explicitamente setado.

Achado por `/review` no diff final (não no `/plan-eng-review` nem na
implementação inicial) — confiança 9/10, motivador citado: a linha
`AI_DEFAULT_MODELS[provider]` lida junto com a definição de `AI_DEFAULT_MODELS`
(só 1 chave) e o `DEFAULT 'google'` da coluna no `schema_init.sql`.

**Como isso não repete**: nunca indexar um objeto `Record<EnumType, X>` pelo
valor *lido de uma fonte externa* (banco, API, arquivo) quando esse enum
tiver só 1 literal real (ou quando a fonte externa pode ter dado desatualizado
de antes de uma migration de app). O cast TypeScript não protege — só o
compilador acredita que o valor bate com o union type, o runtime não. Indexar
direto pela constante (`AI_DEFAULT_MODELS.openrouter`) em vez do valor
dinâmico elimina a classe inteira de bug. Se o enum algum dia tiver múltiplos
literais reais, esse padrão de indexação dinâmica volta a fazer sentido — mas
exige então validar/normalizar o valor lido do banco antes de indexar
(fallback explícito pra um literal válido, não confiar que o dado já está
migrado).

## `fixed inset-0` + `w-screen h-screen` juntos cortam painel fora da tela dentro de ancestral com `transform` (2026-08-06)

`features/inbox/components/FocusContextPanel.tsx` (painel de detalhe do
Inbox, 3 colunas) usava `fixed inset-0 w-screen h-screen` no container raiz.
Parece redundante mas não é: quando `width`/`height` são especificados
explicitamente (`w-screen`=100vw, `h-screen`=100vh), o navegador recalcula a
posição do elemento `fixed` a partir de `left`+`width` em vez de resolver
`right:0`/`bottom:0` do `inset-0` — e um ancestral qualquer com `transform`
ativo (aqui, o `motion.div` do framer-motion durante a animação de abertura)
vira o *containing block* de todo `position: fixed` descendente, no lugar do
viewport real. Resultado: o painel nasce deslocado pelo `left` herdado (a
largura da sidebar, 236px) e o `w-screen` soma 100vw a partir desse ponto —
sobra exatamente uma faixa do tamanho da sidebar cortada na borda direita,
sem overflow visível, sem erro de console. Sintoma reportado pelo usuário:
"não vejo o painel de Chat IA/Notas, não dá pra fechar" (o botão de fechar
também ficava na faixa cortada).

**Como isso não repete**: `fixed inset-0` sozinho já ocupa o containing
block inteiro — nunca empilhar `w-screen`/`h-screen` (ou qualquer
`width`/`height` explícito) em cima de `inset-0` num elemento `fixed`. Se o
elemento precisa mesmo de dimensão explícita por algum motivo, usar `w-full
h-full` (relativo ao containing block, não ao viewport) em vez de `w-screen
h-screen`. Vale auditar outros overlays do projeto que combinem
`fixed`/`absolute` com `w-screen`/`h-screen` dentro de qualquer ancestral
animado por framer-motion (`motion.div` com `scale`/`transform`) — o mesmo
padrão pode se repetir em qualquer modal full-screen novo.

## Modal de detalhe do board (`DealDetailModal`) ficou de pé mas parou de ser o caminho real de uso (2026-08-06)

QA revelou que o board (`/boards`) nunca navegava pra `/deals/[id]/
cockpit-v2` (página cheia, redesenhada e testada desde a 5ª rodada de QA) —
o clique no card sempre abriu `DealDetailModal` (modal condensado antigo,
título/estágios/botões sobrepostos em telas normais). Corrigido religando o
clique (`features/boards/components/PipelineView.tsx`) pra `router.push`
até o cockpit-v2 em vez de `setSelectedDealId` abrir o modal.

**Pegadinha pra quem for mexer aqui de novo**: `DealDetailModal.tsx`
continua existindo no repo (~1400 linhas) e continua coberto por
`DealDetailModal.test.tsx` e `test/stories/US-001-abrir-deal-no-boards.
test.tsx` (que o renderizam isolado, fora do fluxo real do board) — não é
dead code no sentido de "sem teste", mas é dead code no sentido de "nenhum
caminho de clique real do usuário chega nele mais". Antes de investir tempo
consertando um bug visual *dentro* do `DealDetailModal`, confirmar primeiro
se o board realmente ainda abre ele (pode não abrir mais, dependendo de
mudanças futuras) — e considerar deletar o componente + os 2 testes numa
limpeza futura, já que o cockpit-v2 cobre o mesmo caso de uso.

## Plugin oficial do Supabase para Claude Code usa OAuth hospedado que estava fora do ar ("Unrecognized client_id") — solução: token de acesso pessoal via `.mcp.json` (2026-08-04)

O plugin `supabase` instalado (`~/.claude/plugins/cache/claude-plugins-official/
supabase/`) registra o MCP server sempre como `https://mcp.supabase.com/mcp`
(OAuth hospedado, `.claude-plugin/plugin.json` → `agents/claude/.mcp.json`) —
não tem opção de token embutida. Nesta sessão esse endpoint respondia
`{"message":"Unrecognized client_id"}` pra qualquer tentativa de
`mcp__plugin_supabase_supabase__authenticate`, de forma consistente — bug
externo (do lado da Supabase/registro do app OAuth), não algo configurável
daqui.

**Solução que funcionou**: ignorar o plugin OAuth e apontar um MCP server
próprio, self-hosted, direto no `.mcp.json` do projeto (já no `.gitignore`,
linha 45), usando o pacote oficial `@supabase/mcp-server-supabase` com
Personal Access Token via `SUPABASE_ACCESS_TOKEN`:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--project-ref=zuuqcwxletrfmpcqagxc"],
      "env": { "SUPABASE_ACCESS_TOKEN": "sbp_..." }
    }
  }
}
```
Token gerado em https://supabase.com/dashboard/account/tokens. **Só carrega
numa sessão nova** — servidores adicionados ao `.mcp.json` de um projeto não
são hot-reloaded no meio de uma sessão já aberta.

## `AuthContext.tsx` loga erro de console em toda carga de página — provavelmente RPC `is_instance_initialized` não aplicada no Supabase remoto (achado 2026-08-04, não corrigido — pré-existente, fora do escopo do redesign)

QA em browser real (Chrome, conta admin) do redesign achou um `console.error`
real em toda tela: `Error checking initialization: {}`, origem
`context/AuthContext.tsx:136`, dentro de `checkInitialization` (chama
`sb.rpc('is_instance_initialized')`, cai no `catch` com um objeto de erro
vazio). A função existe em `supabase/migrations/20251201000000_schema_init.sql`
e `20260221200002_fix_function_search_path.sql`, então é candidata forte ao
padrão já documentado acima ("Migrations locais podem não estar aplicadas no
Supabase remoto") — mas não foi investigado a fundo, só confirmado que **não
é do redesign** (arquivo não tocado por nenhum dos 6 blocos) e **não trava
nada** (o `catch` já faz `setIsInitialized(true)`, então o app segue
funcionando normal, só com ruído no console). Comparar
`mcp__plugin_supabase_supabase__list_migrations` (agora disponível via token,
ver acima) contra `ls supabase/migrations/` antes de investigar mais a fundo.

## Trocar o *default* de uma preferência persistida em localStorage não afeta usuários que já têm o valor antigo salvo (2026-08-04)

Ao tornar o redesign do CRM light-only, mudei `usePersistedState('crm_dark_mode',
true)` pra `usePersistedState(..., false)` em `context/ThemeContext.tsx` — óbvio
demais, parecia resolvido. Só que `usePersistedState` só usa o default quando a
chave **não existe ainda** no `localStorage`. Qualquer usuária que já tinha
usado o app antes (quando `true` era o default) já tinha a chave salva com
`true` — trocar o default no código não muda o que já está gravado no
navegador dela. Como o redesign também removeu o botão de toggle da topbar
(não fazia sentido manter, já que o handoff não previa tema escuro), essas
usuárias ficaram **presas** no escuro, sem nenhum controle de UI pra sair —
pior do que antes de qualquer mudança.

**Como isso não repete**: trocar o *default* de uma preferência persistida
(`localStorage`/cookie/flag no banco) não é o mesmo que migrar usuários
existentes pra esse novo default — só afeta quem nunca tinha a chave salva.
Se a intenção é "todo mundo usa o novo comportamento a partir de agora", tem
que **ativamente limpar/sobrescrever** o valor antigo (ex: `localStorage.
removeItem()` no mount, ou uma migration/versionamento da chave), não só
mudar o argumento default da função que lê. Vale sobretudo quando, junto com
a mudança de default, algum controle de UI que permitia reverter a preferência
também foi removido — nesse caso, sem a limpeza ativa, não existe mais
NENHUM caminho pra sair do estado antigo.

## `tsc`/`eslint`/`vitest`/`next build` verdes não pegam bug de CSS puro — só QA em browser real acha (2026-08-04)

No redesign do CRM (ver `CHANGELOG.md`/`REDESIGN-CRM.md`), toda a bateria
automática passou limpa (0 erros/warnings/falhas) mas 2 bugs visuais reais só
apareceram ao abrir o app de verdade no Chrome (via `/qa` + claude-in-chrome
CDP, não o Chromium headless isolado do gstack browse — embora headless
também pegaria, já que é CSS puro renderizado, não algo específico do browser
real):

1. Classe com `flex: 1; min-width: 0` mas **sem** `display: flex;
   flex-direction: column` — se os filhos são `<span>` (inline) em vez de
   `<div>`/`<p>` (block), eles renderizam lado a lado na mesma linha em vez de
   empilhados, e texto de dois campos diferentes aparece colado sem espaço
   (`"Propostateste ww — ..."`). **Como checar rápido**: ao portar um trecho
   do handoff que usa `<span>` pra várias linhas de texto dentro de um mesmo
   container, sempre perguntar "esse container empilha os filhos visualmente,
   ou só confia no navegador quebrar linha por falta de espaço?" — se a
   resposta for a 2ª, falta `display:flex;flex-direction:column` explícito no
   container (não basta ele ser item de um flex pai, isso só blockifica ELE,
   não afeta como OS FILHOS DELE se organizam).
2. Escopar uma regra CSS genérica (`a`, `button`, `input`) com uma classe
   ancestral (`.minha-classe a { color: ... }`) pra não vazar pro app inteiro
   **aumenta a especificidade** de (0,0,1) pra (0,1,1) — maior que qualquer
   classe de componente de 1 nível (`.nav-item`, `.btn`, `.tab`, especificidade
   0,1,0), o que **inverte a cascata**: a regra "genérica" escopada passa a
   vencer a regra "específica" do componente, silenciosamente trocando cor/
   fonte de qualquer link/botão/input dentro do escopo. **Fix**: usar
   `:where(.minha-classe) a { ... }` — `:where()` sempre conta como
   especificidade zero, então o seletor todo fica com a especificidade só do
   `a`/`button`/`input` interno (0,0,1), igual ao original sem escopo, e o
   escopo continua funcionando estruturalmente sem competir com nada.

3. Container flex sem `flex-wrap: wrap` que assume um número fixo de filhos
   (o mock estático só mostrava 2-3 botões numa fileira) — quando a tela real
   tem mais conteúdo do que o mock previu (ex: mais tipos de ação disponíveis
   num card), os itens que não cabem na largura ficam **cortados pela borda
   do container e escondidos**, sem scroll nem indicação visual de que existe
   mais conteúdo (achado em `.card-hitl__actions`, cockpit de negócio, 6
   botões reais vs. 2-3 no mock). **Como checar rápido**: qualquer `display:
   flex` sem `flex-wrap` que renderiza uma lista de tamanho variável (botões
   de ação, tags, chips) — se o dado real pode ter mais itens que o mock
   estático mostrava, ou falta `flex-wrap: wrap` ou o container precisa de
   `overflow-x: auto` deliberado.

**Lição geral**: `tsc`/`eslint`/`vitest`/`build` verificam tipo, padrão de
código, comportamento e que o bundle compila — nenhum deles renderiza CSS.
Qualquer redesign/porting de CSS de handoff estático precisa de pelo menos uma
passada de olho em browser real antes de considerar "pronto", mesmo com os 4
comandos 100% verdes — e quanto mais perto do dado real de produção (não só
o primeiro estado vazio/mock), mais chance de achar containers que o mock
estático nunca testou com volume de conteúdo variável.

## Múltiplos agentes em paralelo na mesma árvore de trabalho: `git stash`/checkout de um pode reverter o progresso de outro (2026-08-04)

Redesign completo da UI (ver `CHANGELOG.md` e `REDESIGN-CRM.md`) rodou com 6
agentes em background trabalhando em paralelo, cada um num conjunto de
arquivos diferente, mas todos no **mesmo working tree** (não em worktrees
isoladas). No meio da execução, algo externo à sessão (provavelmente
ferramenta de QA de outra sessão rodando ao mesmo tempo na mesma máquina) deu
um `git stash`/`checkout` que reverteu temporariamente `app/globals.css` (a
camada de CSS compartilhada por todos os 6 blocos) e deixou `features/**`
aparentando estar limpo por alguns instantes. Um dos agentes detectou a
inconsistência, viu que outro processo já tinha restaurado o stash antes dele,
e confirmou depois via `git status`/diff que nada foi perdido — mas foi sorte
de timing, não proteção real.

**Como isso não repete**: ao orquestrar múltiplos agentes em paralelo que vão
editar arquivos no mesmo repositório, ou (a) usar `isolation: "worktree"` por
agente quando a ferramenta de orquestração suportar (evita colisão de
verdade), ou (b) instruir explicitamente cada agente a **nunca** rodar
`git checkout .`, `git stash`/`git stash pop`, `git reset --hard` ou qualquer
comando destrutivo/de reversão enquanto outros agentes podem estar com
mudanças não commitadas no mesmo working tree — só operações aditivas (Read/
Edit/Write) até o orquestrador confirmar que é seguro. Vale sobretudo pra
`app/globals.css`/arquivos de configuração compartilhados que vários blocos de
trabalho tocam ao mesmo tempo.

## Estreitar `cancelQueries`/`invalidateQueries` de `.all` pra `.lists()`/predicate pode reabrir race condition se a mutation escreve em `detail(id)` (2026-08-04)

Corrigindo a violação "invalidação de cache com `.all`" do `docs/audit-report.md`
(trocar `queryKeys.deals.all` por `queryKeys.deals.lists()` em ~90 pontos), a
revisão adversarial do `/review` (subagente Claude, confirmado depois pelo
Codex antes dele expirar) achou um bug real que a própria correção introduziu:
`.all` é só `['entity']`, e o TanStack Query faz *prefix match* por padrão —
então `cancelQueries({queryKey: entity.all})` cancelava **qualquer** query em
andamento daquela entidade, inclusive `entity.detail(id)`. Trocar pra
`entity.lists()` (`['entity', 'list']`) ou pro predicate novo
`entityCachesExceptDetail()` (que exclui `detail` de propósito) para de
cobrir o `detail(id)` — mas 3 mutations (`useUpdateDeal`, `useMoveDeal`,
`useUpdateConversation`) continuam escrevendo otimisticamente nesse mesmo
cache de detalhe no mesmo `onMutate`. Resultado: um fetch de `detail(id)`
que já estava em andamento (ex: usuário com o cockpit do deal aberto numa
aba) não é mais cancelado, pode terminar depois da escrita otimista e
sobrescrever ela silenciosamente com o dado pré-mutation. `useMoveDeal` é o
drag-and-drop do Kanban — a mutation mais comum do app.

**Como isso não repete**: sempre que estreitar um `cancelQueries`/
`invalidateQueries` de uma key ampla (`.all`) pra uma mais específica
(`.lists()` ou um predicate), grep no arquivo por `setQueryData` /
`setQueriesData` dentro do mesmo `onMutate` — se algum desses escrever num
cache que a key nova não cobre (tipicamente `detail(id)`), a mutation
precisa de um `cancelQueries` adicional específico pra esse cache. A key
ampla "por acidente" cobria tudo; a específica não cobre nada que não
esteja explicitamente nela.

## Barrel `@/lib/supabase` não pode reexportar `createClient`/`createStaticAdminClient` — quebra o boundary client/server do Next.js (2026-08-04)

O `docs/audit-report.md` (violação média #6) recomendava migrar os ~99 imports diretos de `@/lib/supabase/{client,server,staticAdminClient}` para o barrel `@/lib/supabase`, mesma orientação do `CLAUDE.md` ("Importar sempre de `@/lib/supabase`"). Tentativa real de fazer isso (adicionar `createClient`/`createAdminClient`/`createStaticAdminClient` ao barrel `lib/supabase.ts` e migrar todos os call sites) passou limpo em typecheck/lint/testes, mas **quebrou o `npm run build`**: o Next.js analisa `lib/supabase.ts` como módulo único, então qualquer arquivo que importe *qualquer coisa* do barrel (mesmo só `supabase`, o client de browser) arrasta transitivamente o `import 'server-only'` de `server.ts`/`staticAdminClient.ts` pro bundle do client component — erro `'server-only' cannot be imported from a Client Component module`.

**Conclusão**: a regra do barrel no `CLAUDE.md`/auditoria vale pra **services** (`boardsService`, `dealsService`, etc. — já é o que `lib/supabase.ts` faz hoje) e pro client singleton de browser (`supabase`), mas **não pode ser estendida** pras funções que criam cliente (`createClient` de `client.ts`/`server.ts`, `createStaticAdminClient`) sem quebrar o build — essas têm que continuar importadas por subcaminho direto, porque cada uma só é segura num contexto específico (browser/Server Component/service-role) e o bundler precisa conseguir isolar o `server-only` por arquivo. **Não tentar essa migração de novo sem antes rodar `npm run build`** (typecheck e testes não pegam esse tipo de erro, só o build real).

**Achado colateral (não revertido, correto de qualquer jeito)**: havia dois arquivos de barrel conflitantes, `lib/supabase.ts` (o real, usado) e `lib/supabase/index.ts` (morto, sombreado por resolução de módulo — nada importava por caminho explícito). Removido. Também havia **duas implementações divergentes de `createStaticAdminClient`** (`lib/supabase/server.ts` sem cache, `lib/supabase/staticAdminClient.ts` com cache + validação de env var mais rígida) — se for consolidar no futuro, usar a versão com cache como canônica e trocar os 23 call sites de `server.ts` pra importar de `staticAdminClient.ts` diretamente (sem depender do barrel).

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

## `rtk`/pnpm wrapper quebra `npx eslint` (2026-07-24, reconfirmado 2026-08-04)

O hook que intercepta comandos (`rtk`) reescreve `npx eslint ...` numa checagem de supply-chain do pnpm que falha com `[ERR_PNPM_IGNORED_BUILDS]` (builds nativos ignorados: `esbuild`, `sharp`, etc — não relacionado ao lint em si). **Bypass**: chamar o binário direto, `./node_modules/.bin/eslint --max-warnings 0 <arquivos>` — não passa pelo wrapper, funciona normal.

**Atualização (2026-08-04, sessão de redesign com 6 agentes em paralelo)**: o mesmo problema aparece em **qualquer** `npx <bin>` nesse ambiente, não só `eslint` — `npx tsc`, `npx vitest`, `npx next build` também disparam o wrapper e falham do mesmo jeito. Bypass idêntico pros três: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/next build`. Um dos agentes, tentando resolver o erro do wrapper, criou um `pnpm-workspace.yaml` na raiz do projeto com placeholders (`allowBuilds: {core-js: "set this to true or false", ...}`) — isso não é config real do projeto, é lixo gerado pela tentativa de responder ao prompt interativo do pnpm; **apagar se aparecer de novo**, nunca preencher os placeholders.

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

## RPC com guard `auth.uid()`/`service_role` em teste pgTAP precisa simular o JWT (2026-08-02)

Testando o trigger T3 (`deal_stage_events`) via `move_deal_to_stage`, toda chamada falhava com `Not authenticated` mesmo dentro de `BEGIN;...ROLLBACK;`. Causa: a RPC (guard introduzido no T1) lê `auth.jwt() ->> 'role'` e `auth.uid()` — numa sessão psql/pgTAP crua (sem PostgREST na frente) essas funções sempre leem vazio/null, então qualquer RPC com esse guard rejeita. **Fix**: `SET LOCAL request.jwt.claims TO '{"role":"service_role"}';` logo após `SELECT plan(...)` simula o mesmo caminho que o agente IA usa em produção (service_role bypassa o guard). Pra simular um usuário autenticado específico (ex: testar RLS/RPC que dependem de `auth.uid()` real, como `retry_deal_stage_event`), usar `'{"role":"authenticated","sub":"<uuid>"}'` com um `profiles.id` correspondente. **Vale pra qualquer teste pgTAP futuro que chame uma RPC com guard de auth** — sem isso, o erro "Not authenticated" não diz de onde vem, parece bug no trigger/RPC quando na verdade é só o ambiente de teste sem JWT simulado.

Achado relacionado no mesmo teste: `pgtap.is()` exige que os dois lados tenham o mesmo tipo — comparar uma coluna `numeric` (ex: `payload->>'valor'` castado) contra um literal inteiro (`1500`) falha por ambiguidade de overload; sempre castar o literal também (`1500::numeric`).

## Layout do `/messaging`: `min-w-0` obrigatório na coluna central (2026-07-24)

`MessagingPage.tsx` tem 3 colunas (lista `w-80` fixa, thread `flex-1`, painel de contato `w-80` fixo, sempre montado mesmo sem seleção visível de "aberto/fechado"). Sem `min-w-0` na coluna `flex-1`, ela cresce pro conteúdo em vez de encolher, empurrando o painel de contato (e qualquer botão nele) pra fora da viewport em telas ≤1440px — sem scroll, sem erro no console, só invisível/inclicável. Já corrigido (`MessagingPage.tsx:188`), mas o padrão vale registrar: **qualquer nova coluna de largura fixa nesse layout de 3 painéis precisa checar se o `flex-1` do meio tem `min-w-0`.**

## Migration history com drift silencioso duplicou um board inteiro (2026-08-02)

Reconciliando o histórico de migrations do T3/T3b (`supabase db push --dry-run` antes de aplicar as novas), apareceu que várias migrations antigas — incluindo o T1 (board semantics) e o T2 inteiro — nunca tinham sido tracked pelo CLI: foram aplicadas direto via Management API meses atrás, sem passar pelo histórico oficial (`supabase_migrations.schema_migrations`). Rodar `migration repair` + `db push --include-all` pra reconciliar reaplicou a migration original (não-corrigida, com ids não-RFC4122) do board `negociacao` do T1 por cima da versão já corrigida — resultado: 21 linhas no board em vez de 14, com duplicatas de id ligeiramente diferente da fórmula determinística usada pela versão corrigida.

**Como isso não repete**: antes de rodar `migration repair`/`db push --include-all` num projeto onde há suspeita de aplicação manual via Management API (comum neste ecossistema, ver desafios anteriores neste arquivo), comparar `list_migrations` (MCP) inteiro contra `ls supabase/migrations/` — se uma migration "antiga" que já foi corrigida por uma migration posterior aparecer como "nunca aplicada" no reconcile, ela vai rodar de novo e pode reintroduzir o estado que a correção posterior já tinha fechado. Checar dado real (quantas linhas existem, quantos deals referenciam cada id) antes de confiar que o reconcile deixou o schema como esperado — não só que ele rodou sem erro.

## Edge Function lê secrets do cofre do Supabase, não da Vercel — são dois cofres separados (2026-08-02)

Configurar `PROPOSTAS_INGEST_URL`/`PROPOSTAS_INGEST_SECRET` só nas env vars da Vercel (onde ficam as env vars do Next.js) não bastava pro dispatcher T3 (`deal-stage-dispatcher`, Edge Function) funcionar — ela rodava sem erro (cron disparando normalmente) mas não processava nenhum evento, respondendo `{"motivo":"PROPOSTAS_INGEST_URL/SECRET não configurados"}`. Edge Functions do Supabase leem variáveis só do próprio cofre de secrets (`supabase secrets set` / `mcp__plugin_supabase_supabase__*` correspondente), nunca da Vercel — mesmo os dois projetos fazendo parte do mesmo ecossistema.

**Como checar rápido da próxima vez**: qualquer secret que uma Edge Function (não uma API Route Next.js) precisa ler tem que ser configurado via `supabase secrets set` (ou MCP equivalente) no projeto Supabase correspondente — configurar só na Vercel é insuficiente e o erro resultante (função "roda" mas não faz nada) não aponta pra causa óbvia sem checar o log da função.

## Telefone sem `+` quebra silenciosamente qualquer integração que exija E.164 estrito (2026-08-02)

O trigger `emit_deal_stage_event` (T3) passava `contacts.phone` direto pro payload do webhook sem normalizar. Contatos reais deste banco têm telefone salvo sem o prefixo `+` (ex: `"5511999999999"`), mas o receptor (Gerador de Propostas) valida E.164 estrito (`+` obrigatório) e rejeita com `422` qualquer payload fora do formato — nenhum deal com telefone preenchido conseguiria completar o T3 até esse fix, e o erro só aparecia no log do dispatcher, não em lugar nenhum visível pra quem move o card.

**Como isso não repete**: qualquer trigger/integração nova que leia `contacts.phone` direto do banco pra mandar pra fora não pode assumir que já está em E.164 — normalizar (só dígitos, 10-15 chars → prefixar `+`) antes de montar o payload, não confiar que o dado já chega formatado.

## `.or()` do PostgREST não escapa `+` — vira espaço na querystring e quebra dedupe por telefone (2026-08-02)

`webhook-in` (usado pelo T3b) buscava contato existente com `.or("phone.eq.+5511999999999,email.eq....")` do cliente PostgREST/Supabase-js. O caractere `+` não é escapado antes de virar querystring HTTP — e `+` em querystring é espaço (`application/x-www-form-urlencoded`). O filtro chegava no PostgREST como `"phone.eq. 5511999999999"` (com espaço no lugar do `+`) e nunca batia contra o telefone E.164 real salvo com `+` — cada webhook repetido criava um contato duplicado em vez de achar o existente. Reproduzido ao vivo durante o `/qa`: 3 contatos "Cliente Teste" duplicados em poucos minutos de teste repetindo o mesmo evento.

**Como isso não repete**: nunca usar `.or()` do PostgREST/Supabase-js com um valor que contenha `+` (ou outro caractere especial de querystring) sem escapar manualmente — trocar por buscas `.eq()` sequenciais (um campo de cada vez) é mais simples e não tem esse risco de encoding. Vale pra qualquer dedupe futuro por telefone neste projeto, não só o `webhook-in`.

## Regra genérica `*.png` no `.gitignore` deixou a logo fora do git por vários commits (2026-08-06)

Dois "fixes" anteriores de QA (#4/#5, logo corrompida) mexeram só no CSS/proporção do `<Image>` que renderiza `public/brand/logo-aaagencia-white.png` (`Layout.tsx`, `NavigationRail.tsx`) — o problema visual persistiu porque o binário **nunca tinha sido commitado**. O `.gitignore` tinha uma regra específica pra screenshot de debug (`debug_navigation_failed_*.png`) seguida, na linha de baixo, de uma regra genérica solta `*.png` — provavelmente copiada/generalizada sem querer a partir da regra específica. Isso bloqueava qualquer PNG do projeto, incluindo assets de produção em `public/`. `git status`/`git diff` nunca acusavam nada errado porque o arquivo simplesmente não existia pro git — parecia que o fix "não pegou" no deploy, mas o código estava certo o tempo todo.

**Como isso não repete**: quando um asset estático (`public/**`) "não aparece" em produção mesmo com o código correto e sem erro de build, checar `git check-ignore -v <caminho>` antes de qualquer outra investigação — é mais rápido que revisar CSS/proporção de novo. E ao adicionar uma regra de `.gitignore` pra um artefato específico de debug/teste, nunca generalizar pra extensão inteira (`*.ext`) sem checar primeiro se essa extensão já é usada por asset de produção (`find public -iname "*.<ext>"`).

## Investigação concluiu "padrão de design intencional" sem confirmar com o usuário — 30 arquivos alterados por engano (2026-08-06)

Uma sessão anterior investigou um caso de texto de UI em minúsculas (ex: saudação do dashboard, labels de filtro de período) e concluiu, com alta confiança, que era uma "decisão de design intencional do redesign de agosto/2026" — sem checar com o usuário. Essa conclusão errada virou premissa de trabalho na sessão seguinte: um agente mapeou ~30 arquivos com títulos/botões/labels em Iniciais Maiúsculas e outro aplicou a conversão pra minúsculas em todos eles (confirmada por `npm run typecheck` limpo). O usuário corrigiu com firmeza assim que viu o resultado: a interface usa Iniciais Maiúsculas, sempre foi esse o padrão. Todas as 30 alterações foram revertidas via `git checkout` no mesmo dia — trabalho de duas rodadas de agentes (mapeamento + aplicação) jogado fora.

**Causa raiz**: uma observação exploratória ("o texto está em minúsculas em vários lugares") foi tratada como fato confirmado ("isso é intencional") sem nunca perguntar ao usuário — e essa suposição não verificada foi reusada como premissa numa sessão futura sem revalidação, ganhando peso de "decisão já tomada" só por estar registrada em memória/observações anteriores.

**Como isso não repete**: quando uma investigação conclui que uma inconsistência visual/textual é "decisão de design intencional" (em vez de bug), essa é uma inferência, não um fato — sinalizar como hipótese e confirmar com o usuário antes de usá-la como base para qualquer mudança em lote. Padrões vagos e abrangentes ("todo texto de UI em minúsculas") merecem ainda mais ceticismo que bugs pontuais, porque justificam mudanças de escopo grande. Ver [[feedback_ui_text_capitalization]] (memória do assistente) para o registro da correção — botões/títulos/labels usam Iniciais Maiúsculas, não minúsculas.

## Service worker (`public/sw.js`) cacheava GETs cross-origin, servindo dados obsoletos da API (2026-08-06)

QA da seção "Interesses de Produto" achou um bug que parecia ser corrida do TanStack Query (dado sumia/reaparecia errado depois de add/remove, mesmo com `invalidateQueries` correto no código). Investigação (inspeção direta do cache via árvore de fiber do React, comparando `dataUpdatedAt` do cache com `created_at` do banco) revelou algo mais profundo: `public/sw.js` registra um `fetch` listener que aplica stale-while-revalidate em **qualquer GET**, sem checar `origin` — o comentário no código dizia "para assets estáticos", mas nada no código restringia isso a same-origin. Isso incluía as chamadas REST cross-origin ao Supabase (`https://<project>.supabase.co/rest/v1/...`), já que o Supabase JS client usa `fetch()` por baixo e o service worker intercepta toda `fetch` da página, independente de origem.

Resultado prático: em teste com reload completo (sem nenhuma interação prévia na aba), depois de apagar registros via SQL direto no banco, a UI continuou mostrando os registros já apagados — o navegador serviu a resposta cacheada da mesma URL em vez de ir pra rede. Isso não é específico da feature testada: qualquer tela que dependa de dado dinâmico via `fetch()` (praticamente tudo no app, já que Supabase-js usa fetch) estava exposta ao mesmo risco, mascarado até então porque a janela de corrida geralmente é pequena e o SW eventualmente revalida em segundo plano.

**Fix**: `if (new URL(req.url).origin !== self.location.origin) return;` antes da lógica de cache no `fetch` handler — restringe a estratégia de cache a requisições de mesma origem. Bump de `CACHE_NAME` pra forçar limpeza de qualquer resposta de API já cacheada por engano.

**Como isso não repete**: ao debugar "dado sumiu/não atualizou na UI mesmo com a mutation/invalidation certas no código", checar se existe service worker registrado (`navigator.serviceWorker.getRegistrations()`) e se o `fetch` handler dele filtra por origem — antes de assumir que é corrida do TanStack Query ou bug na lógica de invalidação. Um SW mal escopado pode mascarar como sintoma de "cache do React Query" um problema que na verdade é cache de rede, uma camada abaixo.

## Padrão "refetch depois da mutation" é frágil — atualizar o estado local direto é mais robusto (2026-08-06/07)

Achado em 2 telas na mesma rodada de QA (interesses de produto, catálogo de produtos): componentes que fazem `create()`/`update()`/`delete()` e depois disparam um **segundo request** (`invalidateQueries` do TanStack Query, ou um `load()` manual que refaz o GET) pra atualizar a lista na tela. Esse padrão é frágil de duas formas independentes, já vistas neste projeto:

1. O segundo request pode coincidir com um refetch de mount ainda em andamento (`refetchOnMount: true`) — o dedupe do TanStack Query reaproveita a fetch já em voo em vez de criar uma nova, e essa fetch antiga responde com dados de ANTES da mutation.
2. Qualquer camada de cache de rede no caminho (service worker, CDN, proxy) pode servir uma resposta antiga da mesma URL — ver entrada acima sobre `public/sw.js`.

Em ambos os casos, o dado no banco está certo, a mutation funcionou, mas a UI mostra o estado errado até um reload manual.

**Como isso não repete**: quando a resposta da própria mutation já contém (ou dá pra deduzir) o dado que mudou, atualizar a lista local direto a partir dela (`queryClient.setQueryData` no TanStack Query, ou `setState` direto em componentes com state local) em vez de depender de um segundo round-trip de rede. Esse é o padrão que `DEALS_VIEW_KEY` já usava neste projeto antes dessas correções — vale generalizar pra qualquer mutation nova, não só reagir quando o bug aparecer de novo em outra tela.

## Fallback silencioso escondeu config errada por meses, e só apareceu quando o próprio default morreu (2026-09-01)

`getModel` (`lib/ai/config.ts`) valida `organization_settings.ai_model` contra o formato `provider/model` da OpenRouter e, quando não bate, cai no default. Sem log, sem aviso, sem nada. A org tinha `ai_model = 'gemini-2.5-flash'` (formato nativo do Google, sem barra) e `ai_provider = 'google'` — sobra da migração pra OpenRouter que trocou o código mas nunca migrou os dados.

Resultado: durante meses **toda** chamada de IA ignorou a configuração escolhida na tela de settings e usou o default. A IA respondia normalmente, então nada indicava problema. Só apareceu em 2026-09-01, quando a OpenRouter removeu `google/gemini-2.0-flash-001` do catálogo e o default virou 404 — derrubando 17 arquivos de uma vez, do agente do WhatsApp ao cron de avaliação de estágios.

**A ironia é o ponto**: o fallback existia pra impedir uma falha, e o que ele fez foi acumular a falha até ela estourar toda junta, num momento em que a causa (config stale) não tinha relação nenhuma com o sintoma (modelo 404).

**Como isso não repete**: fallback de configuração precisa ser barulhento. Quando o código descarta um valor que alguém escolheu conscientemente numa tela, isso é um evento — logar com o valor rejeitado nomeado. Fallback mudo só é aceitável para ausência de config (campo vazio, org nova), nunca para config presente e inválida: a primeira é o comportamento esperado, a segunda é um bug que alguém precisa consertar. Guarda em `lib/ai/config.test.ts`.

**Corolário sobre migração**: a migração pra OpenRouter (2026-08-15) trocou provider e formato de id no código, mas não escreveu migration pros dados. Ao trocar o formato de um valor que vive no banco, migrar as linhas existentes faz parte da mudança — senão o código novo lê dado velho e o comportamento diverge em silêncio de org pra org.

## `vercel.json` inválido pro plano não falha o build — impede o deployment de existir (2026-09-01)

Ao adicionar o health check de IA, o `vercel.json` passou a ter 3 cron jobs, dois deles `*/15 * * * *`. O plano deste projeto é **Hobby**, que permite no máximo 2 crons e só cadência diária. Resultado: o push foi pra `main`, o GitHub aceitou, e a Vercel **não criou deployment nenhum**. Produção ficou congelada no commit anterior.

O modo de falha é traiçoeiro porque não se parece com falha: não há build vermelho, não há e-mail de erro, não há entrada na lista de deployments. A rota nova responde 404 em produção e tudo o mais funciona, o que parece "deploy ainda propagando". Levou ~15 minutos e três hipóteses erradas até eu comparar a lista de deployments com o `git log` e ver que o último deploy era de um commit anterior.

**O pior**: a resposta já estava no repositório desde julho. `supabase/migrations/20260715173000_pg_cron_stage_evaluations.sql:3` diz textualmente *"Vercel Hobby only allows daily cron schedules, so this runs via pg_cron + pg_net instead"*. O projeto já tinha batido nesse limite, já tinha resolvido, e já tinha documentado a solução no lugar certo. Eu escrevi um spec inteiro propondo cron da Vercel a cada 15 min sem ler isso.

**Como isso não repete**: antes de tocar em `vercel.json`, ler as migrations de `pg_cron` — se existem, é porque o limite do plano já foi encontrado antes. Regra de bolso mais geral: quando o projeto já tem uma solução alternativa para uma capacidade óbvia da plataforma (cron, cache, fila), a alternativa costuma existir porque a via óbvia não estava disponível; descobrir o porquê é mais barato que redescobrir o limite. E ao investigar "deploy não saiu", conferir **se o deployment existe** antes de investigar por que ele falhou — são diagnósticos diferentes.

## Alerta que grava no banco mas não entrega ficou 30 dias mudo sem ninguém notar (2026-09-01)

`evolution-health` detecta canal WhatsApp caído, grava em `security_alerts` e manda e-mail via Resend. Funcionava — detectou e gravou 4 quedas em 30 dias. Nenhum e-mail saiu: `organization_settings.alert_email` estava NULL, e o código faz `if (settings?.alert_email && ...)`, seguindo em silêncio quando está vazio.

O comentário do próprio arquivo (`route.ts:22`) diz *"não basta logar em tabela que ninguém olha às 2h da sexta"*. Era exatamente o que estava acontecendo, escrito por quem escreveu o código, dentro do arquivo que fazia isso.

**A falha não é o `if`** — pular o envio sem destinatário é razoável. A falha é ele ser silencioso: um alerta que não consegue alertar é uma falha operacional, não um caminho normal. E o único sinal de que existia era a ausência de e-mails, que ninguém percebe, porque ausência não chega em lugar nenhum.

**Como isso não repete**: todo canal de entrega de alerta precisa de teste de fumaça no dia em que é configurado (mandar um alerta real, conferir que chegou), e a falta de configuração do destino tem que gritar em `console.error` no momento em que o alerta seria enviado — foi o que o `ai-health` passou a fazer. Regra geral: quando o código detecta um problema e não consegue entregar o aviso, isso vira um segundo problema, não um `return` mudo.

**Corolário sobre alerta que ninguém testa**: quatro alertas gravados são quatro oportunidades de perceber, todas perdidas porque nada olha a tabela. Se o mecanismo de alerta não tem alarme próprio, ele é só um log com nome bonito.

## Comentário de código afirmando cadência que o agendador não pratica (2026-09-01)

`evolution-health/route.ts:21` dizia "Roda a cada 30min (ver vercel.json)". O `vercel.json` agendava `0 9 * * *` — uma vez por dia, 9h. O comentário até apontava o arquivo certo, o que dá a impressão de ter sido verificado.

Consequências reais: um canal caindo às 10h ficava ~23h sem alerta, e o cooldown de 4h contra spam logo abaixo (`route.ts:56`) protegia contra um problema que não existia naquela cadência — 4h de cooldown numa checagem diária nunca dispara.

**Como isso não repete**: quando um comentário afirma cadência, timeout ou limite que vive em outro arquivo, ou o valor sai do código (importado da mesma fonte) ou o comentário aponta o arquivo sem repetir o número. Número duplicado em prosa não tem quem o verifique e desatualiza na primeira mudança. Aqui: cadência vive no agendamento — que pra estes crons é a migration de pg_cron, não o `vercel.json`.

## Dois arquivos de regra escritos no mesmo dia se contradiziam, e o de maior precedência estava errado (2026-09-01)

No mesmo lote em que documentei o incidente do `vercel.json`, escrevi no `CLAUDE.md`: *"Cadência de cron vive **só** no `vercel.json`"*. O `AGENTS.md`, a migration e o próprio parágrafo do `DESAFIOS.md` sobre o incidente diziam o oposto — cadência sub-diária vive no pg_cron, e mexer no `vercel.json` derruba o deployment inteiro. A frase falsa ainda apareceu numa terceira cópia, no fecho da lição anterior deste arquivo.

Por que a frase falsa nasceu: a lição verdadeira era sobre **comentário de código não repetir número**, e ao comprimi-la numa linha eu troquei "o número vive no agendamento" por "o número vive no `vercel.json`" — que era verdade pro caso que eu estava olhando (`evolution-health`, na época agendado lá) e virou mentira duas horas depois, quando ele saiu pro pg_cron no mesmo dia.

O que torna isto pior que uma imprecisão comum: `CLAUDE.md` tem **precedência de projeto** sobre `AGENTS.md`. Um leitor que confira as duas fontes e encontre divergência segue a de maior precedência — ou seja, a errada — e a ação que ela induz (editar o `vercel.json`) é exatamente a que congela a produção sem sinal nenhum. A documentação não estava só desatualizada: ela apontava a arma pro pé.

**Como isso não repete**: (1) ao documentar um incidente, a regra tem que descrever o **estado final**, não o estado em que o incidente começou — este texto foi escrito enquanto a migração pro pg_cron acontecia, e congelou o "antes"; (2) regra que já falhou duas vezes em prosa vira **teste**, e foi o que aconteceu: `test/vercelCronLimit.test.ts` quebra num 3º cron do `vercel.json`, em qualquer agendamento sub-diário, e no retorno da própria frase falsa ao `CLAUDE.md`; (3) ao corrigir uma afirmação errada em documentação, `grep` pela frase no repositório inteiro antes de dar por encerrado — esta tinha três cópias, e a busca pela versão em negrito só achava uma.

## Guarda de placeholder comparando um valor contra ele mesmo — dispara sempre, substituído ou não (2026-09-01)

A migration do dead-man's switch (issue #23, item 1) copiou o padrão de guarda do `CRON_SECRET`: `IF position('__X__' in $g$__X__$g$) > 0 THEN RAISE EXCEPTION`. A ideia era "se o placeholder ainda estiver aqui sem ser trocado, falha". Na prática, falhava sempre — a usuária colou o SQL já com a Ping URL certa no lugar do placeholder e recebeu `HEALTHCHECKS_PING_URL não substituído` mesmo assim, direto no SQL Editor de produção, na segunda tentativa.

**A causa**: substituição por texto (`sed`, find-and-replace) troca *todas* as ocorrências do placeholder no arquivo — inclusive as duas metades do comparador da guarda, já que os dois lados eram literalmente o mesmo texto `__X__`. Antes de substituir: `'__X__' in '__X__'` → verdadeiro (dispara, correto). Depois de substituir: os dois `__X__` viram o mesmo valor real, e `'valor-real' in 'valor-real'` → **também** verdadeiro (dispara, errado). A guarda comparava o placeholder contra uma cópia dele mesmo, e uma cópia de qualquer coisa é sempre igual a si mesma — o `sed` nunca tinha como fazer os dois lados divergirem, porque os dois eram o mesmo texto-fonte desde o início.

Isto não é bug de digitação: é o padrão em si sendo logicamente incapaz de detectar "substituído" vs "não substituído", porque as duas metades da comparação são atualizadas junto, sempre. Fui verificar e o `CRON_SECRET` original (`20260901180000_pg_cron_health_checks.sql`) tem exatamente o mesmo formato — não vou editar migration histórica já aplicada, mas o defeito provavelmente está lá também, adormecido (só aparece se essa migration precisar ser reaplicada do zero).

**Conserto**: canário escrito **quebrado** — concatenado em runtime, não como um literal contíguo:
```sql
valor_no_arquivo TEXT := '__HEALTHCHECKS_PING_URL__';
canario_do_placeholder TEXT := '__HEALTHCHECKS' || '_PING_URL__';
IF valor_no_arquivo = canario_do_placeholder THEN RAISE EXCEPTION ...
```
`sed` procura o texto contíguo `__HEALTHCHECKS_PING_URL__`; a string `'__HEALTHCHECKS' || '_PING_URL__'` não contém esse contíguo em lugar nenhum (está partida pelo `||`), então nunca é tocada — continua avaliando pro placeholder de verdade em runtime, pra sempre. `valor_no_arquivo` é a ÚNICA metade que o `sed` deveria alcançar. Antes de substituir, os dois avaliam pro mesmo texto (dispara, certo); depois, divergem (não dispara, certo).

**Como isso não repete**: (1) uma guarda de "isto foi substituído?" nunca pode comparar duas cópias do MESMO texto-fonte — tem que haver uma metade que o mecanismo de substituição garantidamente NÃO alcança, servindo de referência fixa; (2) `test/healthchecksDeadMansSwitch.test.ts` ganhou dois testes que montam a comparação a partir do texto real do arquivo — um simulando o estado "antes" (dispara) e outro simulando "depois" de um `sed` de verdade (não dispara) — em vez de só checar que a palavra `RAISE EXCEPTION` existe em algum lugar, que é o que o teste anterior fazia e que não teria pego este bug; (3) antes de mandar um SQL de aplicar-em-produção pro usuário rodar, simular a lógica da guarda localmente (Python bastou) em vez de assumir que copiar um padrão já usado no repo garante que ele funciona.

## Item de backlog previu o incidente, ficou em P3, e a falha chegou antes da prioridade (2026-09-01)

`TODOS.md` tinha desde 2026-08-14 o item "Configurar fallback nativo de modelo da OpenRouter (`models: [...]`)", com o Why escrito assim: *"dá resiliência a falha de modelo específico (rate limit, outage pontual)"*. Estava em **P3, effort S** — ou seja, identificado corretamente, dimensionado corretamente como trabalho pequeno, e adiado. Dezoito dias depois a falha aconteceu e derrubou 17 arquivos, incluindo o agente que negocia no WhatsApp.

O item tinha um "Cons" que travava tudo: *"nenhuma lista de fallback foi escolhida ainda"*. Escolher a lista levou uma decisão e dois minutos. O bloqueio real não era técnico — era que ninguém tinha motivo pra decidir ainda.

**Como isso não repete**: prioridade de item de resiliência não deveria sair só do esforço e da probabilidade, mas do **alcance quando acontecer**. Este era `effort: S` com blast radius de "produto inteiro para" — essa combinação não é P3. Ao triar um item cuja descrição já contém a frase "se X cair", perguntar quanto do sistema para junto; se a resposta for "tudo", o esforço pequeno é argumento pra fazer agora, não pra adiar. E quando o único bloqueio de um item é uma decisão pequena não tomada ("falta escolher a lista"), isso é um item de decisão, não de engenharia — resolve-se perguntando, não esperando.

## Modelo de IA sumindo do catálogo do roteador é falha operacional esperada, não acidente (2026-09-01)

`google/gemini-2.0-flash-001` simplesmente deixou de existir na OpenRouter, sem depreciação visível pra quem consome. A resposta é 404 `No endpoints found`, e `isRetryable: false` — nenhum retry salva.

O catálogo da OpenRouter tem 417 modelos e muda toda semana. Depender de um id fixo de modelo é depender de um recurso de terceiro que pode evaporar sem aviso, e hoje isso derruba a esteira comercial inteira: o agente que negocia no WhatsApp para junto.

**Como isso não repete**: preferir ids de modelo datados/pinados (`deepseek-v4-flash-0731`) a aliases móveis quando a estabilidade importa mais que ganhar melhorias sozinho — foi justamente um alias que quebrou aqui. E existe pendência em `TODOS.md` pra configurar o fallback nativo da OpenRouter (`models: [...]`), que aceita uma lista e cai pro próximo quando um some: é o conserto estrutural, este aqui foi o pontual.

## `display: contents` é regra de layout, não de DOM — seletor `> *` não alcança os filhos promovidos (2026-08-31)

Ao transformar o cockpit de 3 painéis em coluna única, os containers viraram `display: contents` pra que os 12 blocos internos subissem a itens flex do avô e pudessem ser reordenados com `order`. O layout funcionou de primeira. O que não funcionou foi o CSS que pintava os blocos: `.cockpit__body > * { max-width: 900px }` e `.cockpit__body > .cockpit__block { background: ... }` não casavam com nada visível.

Motivo: `display: contents` remove a **caixa** do elemento, não o elemento da **árvore**. Os 3 containers continuam sendo os filhos diretos de `.cockpit__body` no DOM; quem virou item flex foram os netos. Então `> *` seleciona os containers — que não têm caixa e não pintam nada — e os blocos ficam sem estilo nenhum.

**Como foi achado**: medindo no browser, não lendo o código. `document.querySelectorAll('.cockpit__body > *')` devolveu 3 elementos com os rótulos "contato principal", "próxima ação" e "risco do deal" — os primeiros labels de cada container. Se a checagem tivesse sido visual ("parece certo"), o bug passaria: a ordem estava certa, só a pintura estava ausente.

**Como isso não repete**: ao usar `display: contents` pra achatar hierarquia, trocar todo seletor de filho direto (`>`) por descendente no mesmo diff. Regra de bolso: `display: contents` muda quem participa do layout, e `>` fala de quem participa da árvore — os dois deixam de coincidir no instante em que a propriedade entra. Guarda em `test/cockpitLayout.test.ts` (afirma que `.cockpit__body > *` não existe no CSS).

## `min-width` copiado do handoff vira restrição de produto sem ninguém decidir (2026-08-31)

`.cockpit__body` e `.inbox` carregavam `min-width: 1180px` desde o commit do redesign (`d924a86`). Duas sessões de QA (06/08 e 14/08) trataram o número como decisão deliberada de densidade e não mexeram nele. A soma real das colunas era 1028px no cockpit e 1104px no inbox — 1180 não corresponde a nenhuma das duas. Era a largura de trabalho do arquivo HTML do handoff, copiada literal pra duas classes diferentes.

O custo: quatro meses de scroll horizontal em toda tela de notebook, com o `REDESIGN-CRM.md` documentando o comportamento como intencional ("essas telas rolam horizontalmente em vez de espremer, exatamente como especificado"), o que fez cada revisão seguinte parar na porta.

**Como isso não repete**: ao herdar CSS de handoff/mockup, conferir se cada `min-width`/`max-width` fixo bate com a soma dos filhos. Quando não bate, é número de conveniência do arquivo de origem, não requisito — anotar isso no CSS na hora da importação, enquanto ainda se sabe. Um número mágico sem justificativa escrita vira, por omissão, uma decisão que ninguém tomou e ninguém se sente autorizado a reverter.

## `min-width: auto` implícito de flex item faz `flex: 1` não encolher (2026-08-31)

Os 4 botões de canal do cockpit mediam 327px numa coluna de 288px e cortavam na borda, mesmo tendo `flex: 1` (= `flex: 1 1 0%`, que deveria permitir encolher até zero). O culpado é o `min-width: auto` implícito que todo item flex tem: ele trava o encolhimento no `min-content` do próprio conteúdo — no caso, o rótulo "enviar proposta" com o badge de canal.

Corolário que também vale registrar: `flex-wrap` **não** conserta isso de forma previsível. A quebra é decidida pelo tamanho hipotético já clampado pelo min-content, então uma grade 2×2 sai por acidente aritmético e reagrupa sozinha quando um rótulo muda em runtime (aqui, "enviar proposta" vira "enviando..."). A saída foi `display: grid` com `auto-fit`, que é determinístico.

**Como isso não repete**: sempre que um item flex com `flex: 1` estourar o pai, o primeiro suspeito é `min-width: auto` — adicionar `min-width: 0` explícito. E quando o objetivo é uma grade estável de N colunas, usar grid, não `flex-wrap`.

## Media query não enxerga painel irmão que encolhe o container (2026-08-31)

O painel de IA do CRM é um `<aside class="w-96">` (384px) irmão flex do `<main>` em `Layout.tsx:366`. Quando ele abre, a área útil do conteúdo cai de 1203px para 820px — **sem o viewport mudar**. Qualquer `@media (max-width: N)` continua avaliando 1440px e não dispara.

Foi medido durante o fix do cockpit: com breakpoint de media query, a coluna central ficava em 256px com o painel aberto; com `@container` no mesmo limiar, ia a 520px. (A solução final acabou não precisando de nenhum dos dois, porque a tela virou coluna única — mas a armadilha vale pras outras telas.)

Verificado de quebra: `container-type: inline-size` **não** deslocou o toast `.banner--realtime`, que é `position: absolute` — medido antes e depois, continua ancorado em `.screen` nas mesmas coordenadas.

**Como isso não repete**: neste app, responsividade de conteúdo interno é caso de container query, não media query — o viewport quase nunca é a medida certa, porque sidebar (236px) e painel de IA (384px) mudam a área útil sem mexer nele.

## Inbox/cockpit `.inbox { min-width: 1180px }` corta conteúdo em telas de 1280px sem indicar que dá pra rolar (2026-08-14)

QA confirmou ao vivo (viewport 1280×800, resolução comum de notebook) que o card "aprovações IA" na visão geral do Inbox fica 102px fora da área visível — corta na borda direita da tela, sem barra de rolagem visível, sem gradiente ou qualquer pista de que há mais conteúdo. `.inbox` (`app/globals.css:1060`) tem `min-width: 1180px`; com a sidebar de 236px, sobra só 1044px de área útil em telas de 1280px — 136px a menos do que o layout exige.

**O dado não está perdido**: `main` (o container que envolve `.inbox`) já tem `overflow-x: auto`, então dá pra ver o card rolando a tela horizontalmente (confirmado: `document.querySelector('main').scrollLeft = 200` revela o card completo). O problema é 100% de descoberta — nada na UI sugere que existe conteúdo pra rolar.

**Por que não foi corrigido nesta sessão**: essa mesma constraint de `min-width: 1180px` já tinha sido registrada numa sessão de QA anterior (06/08) como compartilhada entre Inbox e cockpit — provavelmente decisão de design pra telas densas de dado. Mudar isso sem confirmar com a fundadora se telas de 1280px são um caso real de uso (vs. só o notebook do QA) arrisca quebrar o espaçamento calculado a dedo em duas telas ao mesmo tempo.

**RESOLVIDO PELA METADE em 2026-08-31**: a fundadora reclamou da tela do cockpit espontaneamente ("tem que rolar para o lado... não dá para ver informação correta"), o que era exatamente a confirmação que faltava. O `min-width` saiu do cockpit e a tela virou coluna única. **`.inbox` continua com o `min-width: 1180px`** e com o mesmo problema — ver `TODOS.md`. A suspeita de "decisão de design pra telas densas" também caiu: o número não corresponde à soma das colunas de nenhuma das duas telas (ver o item de `min-width` de handoff acima).

**Como isso não repete**: antes de tratar como bug de layout, testar em viewport de 1280×800 primeiro (menor notebook comum) e verificar se existe overflow horizontal escondido via `element.scrollWidth > element.clientWidth` antes de assumir "conteúdo sumiu". Se a decisão for manter o `min-width`, considerar adicionar uma pista visual de scroll (sombra/gradiente na borda ou scrollbar sempre visível) — mudança de baixo risco que não mexe no layout em si.

## Webhook que filtra por `status` no lookup do canal descarta o próprio evento que sairia desse status (2026-08-16)

Ao corrigir o botão "Conectar" do WhatsApp (issue #3) pra gerar QR code de verdade, o endpoint passou a gravar `messaging_channels.status = 'waiting_qr'` depois de obter o QR da Evolution API. Só que `messaging-webhook-evolution` (Edge Function que recebe `connection.update` da Evolution, inclusive o evento que confirma que o QR foi escaneado) busca o canal com `.in("status", ["connected", "active"])` — um canal em `waiting_qr` não bate nesse filtro, então o webhook responde `{ok:false, error:"Canal não encontrado"}` (200, sem erro visível) e descarta silenciosamente o próprio evento que faria o canal sair de `waiting_qr`. Sem esse achado, o fluxo de QR nunca completaria: QR gerado, usuário escaneia, nada acontece, pra sempre.

**Achado por**: outside voice (codex) no `/plan-eng-review`, antes de qualquer código ser escrito — não foi achado testando, foi achado lendo o código do webhook durante a revisão do plano.

**Como isso não repete**: sempre que um plano introduz um novo valor de `status` intermediário (ex: `waiting_qr`, `pending`, `syncing`) pra uma entidade que já tem um consumidor (webhook, cron, Edge Function) que filtra por `status` num `.in()`/`.eq()`, grepar esse consumidor especificamente procurando esse filtro antes de considerar o plano pronto. Um novo status que "atravessa" um filtro existente sem ser adicionado a ele é um deadlock por design — o status nunca é revisitado porque o evento que o revisitaria já foi descartado.

## `useMutation().isPending`/`.isError` não refletiram no render mesmo com a promise resolvendo certo (2026-08-17)

`QrConnectModal` (fluxo de QR do WhatsApp) ficava travado em "Gerando QR code..." pra sempre quando o endpoint retornava erro, mesmo em produção real. Instrumentando `window.fetch` diretamente (`performance.getEntriesByType('resource')` + wrapper manual) confirmei que a requisição completava certinho — resposta 500 chegando em ~2s, `res.json()` resolvendo em 1ms com o corpo do erro certo. Ou seja: a mutation REJEITAVA de verdade, rápido, sem service worker nem cache no meio — mas `connectMutation.isPending`/`isError`, lidos direto no render (padrão comum: `{mutation.isPending && <Spinner/>}`), nunca refletiam essa transição. Sem retry visível nos logs do servidor (só 1 tentativa por clique, confirmado no Vercel), então não era o `retry` global (`mutations: {retry: 1}`) mascarando o problema.

Não cheguei à causa exata (sem React DevTools na sessão pra inspecionar o fiber/hook state ao vivo) — mas testes unitários que MOCKAVAM o retorno do hook inteiro (`useConnectChannelMutation: () => ({isPending, isError, ...})` fixo por teste) nunca teriam pego isso, porque simulam o estado final direto, sem exercitar a transição real da mutation ao longo do tempo.

**Fix**: reescrevi `QrConnectModal` pra estado local explícito (`{status: 'idle'|'loading'|'success'|'error', ...}`) setado direto dentro dos callbacks `onSuccess`/`onError` passados pro `mutate()`, em vez de derivar o JSX de `mutation.isPending`/`.isError`/`.data`/`.error`. Mais verboso, mas a fonte de verdade do render é um `setState` síncrono que eu controlo, não uma flag derivada de dentro da lib.

**Como isso não repete**: pra estado de UI de curta duração e alto risco de ficar travado pra sempre (loading que bloqueia toda a tela), preferir estado local setado nos callbacks da mutation a ler `isPending`/`isError` direto no JSX — principalmente se o teste unitário desse componente mocka o hook inteiro (nesse caso, escrever pelo menos 1 teste com a mutation REAL, só fetch/API mockados, pra exercitar a transição de verdade — foi isso que expôs a lacuna de cobertura aqui).

## Config errada (typo num campo salvo) se disfarça de "servidor externo quebrado" (2026-08-17)

Depois do fluxo de QR code corrigido e testado, o canal WhatsApp real da aaagência continuava retornando 404 da Evolution API (`Cannot GET /instance/connect?instanceName=aaagencia`). A leitura óbvia era "servidor Evolution com problema" — documentado inicialmente em `TODOS.md` como bloqueio de infra externa, fora do alcance de um agente de código. Só ao acessar o painel `/manager` da Evolution diretamente (não só a API) ficou claro: a instância real se chama `"aaagência"` (com acento), mas `credentials.instanceName` salvo no banco do CRM tinha `"aaagencia"` (sem acento) — erro de digitação de quando o canal foi cadastrado. O WhatsApp já estava `Connected` no servidor Evolution o tempo todo; o CRM só nunca conseguia falar com o endpoint certo.

## Escrevi a chave real que o usuário colou no chat como fixture de teste (2026-09-01)

Implementando `redactSecrets()` (issue #23, item 19 — redação de segredo em texto de erro), escrevi um teste pro caso "chave estilo Resend" usando a chave Resend **de verdade** que a usuária tinha colado em texto puro no chat, mais cedo na mesma sessão, pra eu configurar na Vercel (episódio já registrado como "tratar como comprometida e rotacionar"). Copiei da minha própria memória de conversa pro arquivo de teste sem perceber que não era um exemplo genérico — era a chave real, prestes a entrar num commit num repositório **público**.

Pego no scan de PII de rotina antes do commit (o mesmo grep que faço em todo PR desta sessão), não por revisão deliberada da fixture em si — o scan roda sempre, independente de eu "achar" que o conteúdo é seguro.

**Como isso não repete**: chave/segredo que apareceu em algum momento da conversa — mesmo já marcado como comprometido, mesmo prestes a ser rotacionado — nunca deve ser reescrito de memória em NENHUM arquivo, nem como "exemplo", nem como fixture de teste. Fixture de segredo tem que nascer visivelmente falsa (`re_fake000_teste...`, `sk-aaaaaaaa...`), nunca reaproveitar a forma ou os caracteres de um valor real que passou pela conversa. O scan de PII antes de commitar não é formalidade pós-fato — é a rede que existe exatamente pra pegar este tipo de deslize, e funcionou.

**Como isso não repete**: um 404/erro vindo de uma API externa não significa necessariamente "servidor quebrado" — pode ser um valor de configuração salvo errado apontando pra um recurso que não existe com esse nome exato. Antes de classificar como "infra externa, fora do alcance", comparar o valor salvo (`instanceName`, `serverUrl`, IDs de recurso externo) contra o painel/console real do serviço, se houver acesso — string com acento/case/espaço diferente é o tipo de erro que passa despercebido em code review porque "parece" o nome certo.

## Teste de texto casando em comentário passa sem proteger nada (2026-09-02)

`test/cockpitAiErrorText.test.ts` guardava a distinção entre "sem sugestão" e "IA fora do ar" com `expect(bloco).toContain('IA fora do ar')`, lendo o `.tsx` como texto. Ao mover essa string do código pra dentro de `describeAIError()` (issue #23, item 2), o teste **continuou verde** — não porque o comportamento tinha sido preservado, mas porque a frase sobreviveu num comentário que eu mesma acabara de escrever explicando a mudança. A asserção estava batendo em prosa, com zero efeito em runtime.

O arquivo tinha ainda um segundo defeito, esse já flagrado no review: `expect(semSugestao && foraDoAr).toBe(true)` sob o nome "os dois textos são diferentes" — dois `includes` recalculados e um `true && true`, sem comparar string nenhuma.

**Como isso não repete**: teste que lê código como texto (padrão legítimo e usado bastante neste repo, porque montar componente de 2600 linhas pra checar uma string custa caro) precisa **remover comentários antes de procurar** — a versão nova faz `linha.replace(/\/\/.*$/, '')` antes de casar. E, quando o alvo vira uma função pura exportada, o certo é parar de fazer grep e passar a **chamar a função de verdade**: `describeAIError('AI_DISABLED')` comparado contra `describeAIError('INTERNAL_ERROR')` prova a distinção; procurar as duas strings no arquivo, não.

**Repetiu em 2026-09-03, um dia depois desta entrada ser escrita.** Um teste
novo lendo a Edge Function passou verde com a regressão injetada, casando
`last_connected_at` num comentário que eu tinha acabado de pôr ao lado da linha
consertada. Saber a regra não impediu: a asserção parece certa nas duas
versões, e a suíte fica verde nas duas.

**O que efetivamente pega:** injeção de regressão. Apagar a linha do conserto e
exigir que o teste fique VERMELHO. Isso não depende de lembrar de nada — é o
único passo que distingue teste que protege de teste que só existe. Nas duas
vezes, foi ele que revelou o problema, não a leitura do código do teste.

## "Precisa de decisão do usuário" virou escapatória de análise (2026-09-02)

Ao varrer os P2 da issue #23, classifiquei 6 itens como bloqueados em decisão de produto ou arquitetura e abri a #34 pra eles, com a justificativa de que não eram "código só". Quando a usuária respondeu `decide o item 3`, e depois `termina tudo que estiver pendente`, **5 dos 6 fecharam na mesma sessão** — 4 por decisão escrita em minutos, 1 por código.

O que cada "decisão pendente" exigia de verdade era a análise que eu ainda não tinha feito:

- *cap de crédito de IA*: bastava calcular. ~100 tokens por execução × 96/dia = ~290k tokens/mês por org, centavos em modelo flash. Não era decisão de produto, era uma conta de duas linhas;
- *`CRON_SECRET` em texto puro*: bastava perguntar quem consegue ler `cron.job`. Resposta: quem já tem `service_role`, que já lê qualquer tabela ignorando RLS. Não era decisão de arquitetura, era análise de fronteira de confiança;
- *lista de reserva com 1 fabricante alternativo*: bastava confrontar a lista com o objetivo declarado dela. "Sobreviver a um fornecedor cair" já estava cumprido nos dois sentidos.

Só um item era genuinamente decisão de produto (tela pra `security_alerts`: onde na navegação, quem vê, o que fazer com linha de instância sem org).

**Como isso não repete**: antes de marcar item como "precisa de decisão do usuário", fazer a análise que a decisão exigiria e escrever a recomendação. Se depois disso a resposta for óbvia, não era decisão — era trabalho não feito. "Bloqueado em decisão" só vale quando a análise **está pronta** e o que falta é escolha de gosto, custo ou prioridade que o dono do produto precisa fazer. O formato do §7 (opções, prós, contras, riscos, recomendação) não é cerimônia pra decisão grande: é o teste que separa "decisão de verdade" de "ainda não pensei".

## Segredo que nem o agente nem a usuária conseguem ler, e o comando que resolveu (2026-09-02)

Três migrations de cron precisaram ser aplicadas em produção num único dia, cada uma exigindo substituir `__CRON_SECRET__` pelo valor real antes de rodar (a guarda bloqueia o fluxo normal de propósito). Na terceira, mandei "pega o `CRON_SECRET` no dashboard da Vercel" — e a usuária respondeu que não dá.

Ela estava certa, por dois motivos que se somam:

- **na Vercel**, env var marcada como sensível não reexibe o valor depois de criada. O dashboard só oferece editar (digitar um valor novo por cima) ou remover — não há "revelar";
- **do meu lado**, tentar ler `.env.local` é bloqueado por permissão, e mesmo passando, o harness mascara segredo lido de arquivo como `[SENSITIVE]`. Não é limitação contornável: é proteção funcionando.

Ou seja, os dois lados da conversa estavam cegos pro mesmo valor, cada um por um motivo diferente.

**Como isso não repete**: pra aplicar migration com placeholder de segredo, entregar **um comando único** que a pessoa roda no terminal dela, sem ninguém precisar enxergar o valor:

```bash
vercel env pull /tmp/s.env --environment=production --yes && \
SECRET=$(grep '^CRON_SECRET=' /tmp/s.env | cut -d= -f2- | tr -d '"') && \
sed "s/__CRON_SECRET__/$SECRET/g" supabase/migrations/<arquivo>.sql > /tmp/apply.sql && \
rm /tmp/s.env && open -e /tmp/apply.sql
```

O valor existe só como variável de shell na máquina dela, some com o `rm`, e nunca passa pelo chat nem pelo meu contexto. Copiar/colar valor de segredo à mão entre dashboard e SQL Editor foi a maior fonte de fricção do dia — vale gastar as três linhas de comando.

## Teste só vale depois de falhar de propósito (2026-09-02)

Prática usada em todos os ~20 fixes desta sessão: escrever o teste, vê-lo passar, **reintroduzir o bug no código de produção**, confirmar que o teste fica vermelho, restaurar, confirmar verde de novo. Custa segundos por fix e pegou coisa que nenhuma outra checagem pegaria:

- a guarda de placeholder do dead-man's switch, que comparava um valor contra ele mesmo e disparava **sempre** — descoberta só quando a usuária rodou o SQL já substituído e recebeu o erro assim mesmo. O teste que eu tinha escrito antes só verificava que a palavra `RAISE EXCEPTION` existia no arquivo, e teria continuado verde pra sempre;
- o `toContain` casando em comentário (lição acima);
- um teste meu que contava blocos com `toBeGreaterThanOrEqual(12, 8)` — quatro vagas de folga, dava pra adicionar quatro blocos sem classe e seguir verde.

O padrão comum aos três: **o teste passava, e o que ele afirmava proteger não estava protegido.** Passar não é evidência de nada — só falhar quando deve falhar é.

**Como isso não repete**: nenhum teste novo de guarda entra num PR sem a injeção de regressão correspondente ter sido rodada e registrada na descrição do PR ("verificado injetando X: vermelho, depois verde"). Se a regressão injetada **não** derruba o teste, o teste está errado, não o código.

## Três majors de pnpm em três ambientes, e dois lockfiles no mesmo repo (2026-09-03)

Sintoma que apareceu: `npm run precheck` parou de funcionar na máquina local, e um `pnpm-workspace.yaml` com conteúdo de placeholder (`core-js: set this to true or false`) reaparecia toda vez que era apagado.

A causa era bem maior que o sintoma. O repositório rodava com **três versões major diferentes** do mesmo gerenciador, cada ambiente escolhendo a sua por um caminho diferente:

| Onde | pnpm | Como escolhia |
|---|---|---|
| GitHub Actions | 9 | `PNPM_VERSION: "9"` no `ci.yml` |
| Vercel (produção) | 10.28.0 | heurística da própria Vercel, "based on project creation date" |
| Máquina local | 11.8.0 | corepack, o que estivesse instalado |

E **dois lockfiles versionados**: `package-lock.json` (503KB) e `pnpm-lock.yaml` (329KB). O do npm não era usado por ninguém — nem Vercel nem CI —, mas qualquer `npm install` acidental o atualizava, criando um segundo conjunto de versões que ninguém instalava mas que parecia autoritativo no diff.

O `pnpm-workspace.yaml` fantasma era consequência: o pnpm 10 introduziu aprovação explícita de build scripts, e cada `pnpm install` local sem essa decisão gerava o arquivo pedindo a resposta.

**O que enganava**: nada disso quebrava a produção. O build da Vercel passava, verde, todo dia — porque *ela* sempre usou a mesma versão. A divergência só machucava quem rodava local, e do jeito mais confuso possível: o comando que a documentação mandava usar simplesmente falhava com um stack trace de pnpm, num projeto cuja documentação inteira dizia `npm run`.

**Conserto**: `packageManager: "pnpm@10.28.0"` no `package.json` (a versão que a produção já usava — alinhar pra baixo, pro que roda em produção, não pra cima, pro mais novo), `PNPM_VERSION` do CI de 9 pra 10.28.0, `package-lock.json` removido, e `pnpm.onlyBuiltDependencies: []` declarando explicitamente o que a produção já fazia na prática (ignorar os build scripts de core-js, esbuild, protobufjs, sharp e unrs-resolver).

**Como isso não repete**: (1) versão de gerenciador de pacote é config de projeto, não de máquina — se não estiver fixada no `package.json`, cada ambiente escolhe uma e a divergência só aparece quando alguém pergunta "por que na minha máquina não roda?"; (2) dois lockfiles no mesmo repositório nunca é intencional — o que não é usado pelo deploy tem que sair, senão vira fonte de verdade paralela que ninguém consulta mas todo mundo commita; (3) ao alinhar versões entre ambientes, alinhar **pelo que a produção já roda**, não pelo mais recente — a produção é a única que não dá pra testar antes.
