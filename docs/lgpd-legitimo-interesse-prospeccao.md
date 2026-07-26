# Base legal do contato frio de prospecção (LGPD)

## O que é este documento

Descreve a base legal para o primeiro contato via WhatsApp com leads vindos da
prospecção fria (`prospeccao-aaagencia`) — não é análise jurídica formal, é o
registro interno de por que a aaagência entende que pode fazer esse contato,
e o que faz pra mitigar risco caso a base legal seja questionada.

**Não é código.** Nenhum sistema depende deste arquivo pra funcionar — é
documentação de conformidade, mantida ao lado do código que ela cobre.

## O contato: o que é, o que não é

- **Natureza**: comercial, B2B. A prospecção busca negócios (via Google
  Maps/Apify — motor `pagina`), não pessoas físicas em contexto de consumo.
  O contato é com o número de WhatsApp comercial do negócio, oferecendo um
  serviço (site/demo) pra esse negócio.
- **Dado usado**: nome do negócio, telefone, e-mail e Instagram **quando
  publicamente listados** no próprio perfil comercial (Google Maps, site,
  rede social do negócio). Não há coleta de dado sensível (Art. 5º, II da
  LGPD), nem de pessoa física fora do papel de responsável pelo negócio
  contatado.
- **Volume**: hoje limitado ao piloto controlado (T5, 10-20 leads reais,
  medidos manualmente). Sem disparo em massa automatizado.

## Base legal: Art. 10 da LGPD (legítimo interesse)

A LGPD permite tratamento de dado pessoal sem consentimento prévio quando
há **legítimo interesse** do controlador, desde que respeitados os direitos
do titular (Art. 10, `caput` e §1º) e a finalidade seja legítima, específica
e informada previamente ao titular na medida do possível.

Como isso se aplica aqui:

- **Finalidade legítima e específica**: oferta de serviço comercial (site/
  demo) a um negócio que já expõe publicamente seus dados de contato pra
  ser encontrado por clientes — o mesmo canal (WhatsApp comercial) é usado
  pra receber contato de qualquer interessado, não é um canal privado.
- **Legítimo interesse concreto**: interesse comercial direto da aaagência
  em oferecer um serviço a negócios que se encaixam no perfil (nicho/
  cidade da campanha) — não é interesse genérico ou especulativo.
- **Necessidade e proporcionalidade**: só os dados mínimos pra viabilizar o
  contato (nome, telefone, e-mail/Instagram se públicos) — sem enriquecimento
  de dado, sem cruzamento com outras bases, sem dado sensível.
- **Expectativa legítima do titular**: um negócio que publica seu WhatsApp
  comercial no Google Maps espera ser contatado por esse canal para fins
  comerciais — é a própria função do dado publicado.

## Direitos do titular — como são respeitados na prática

O Art. 10 só sustenta o tratamento se os direitos do titular (Art. 18) forem
preserváveis. Mecanismos já implementados no T4 (`crm-ea-tmp`):

- **Opt-out imediato e automático**: rodapé fixo na 1ª mensagem convida a
  responder "SAIR" (ou variantes: parar/descadastrar/stop). O parser
  (`opt-out-parser.ts`) detecta a resposta e insere o telefone em
  `whatsapp_suppression_list` — nenhuma mensagem futura é enviada a esse
  número, em nenhum fluxo (reaquecimento, cadência, IA), enforced no único
  ponto de envio (`ChannelRouterService.sendMessage()`).
- **Sem retenção indevida**: dado de lead que não vira negócio segue as
  regras normais de retenção do CRM — ver
  [`lgpd-retencao-exclusao.md`](./lgpd-retencao-exclusao.md) (decidido
  2026-07-26: 24 meses sem interação → exclusão).
- **Kill switch manual**: a fundadora pode interromper todo envio automático
  a qualquer momento (`organization_settings.whatsapp_kill_switch_active`),
  independente de decisão técnica.
- **Canal identificável**: a mensagem se identifica como da aaagência —
  não há uso de número anônimo ou disfarçado.

## Riscos aceitos conscientemente (registrados, não resolvidos por este doc)

- **Ban do número por denúncia em massa**: risco específico de prospecção
  fria com API não oficial (Evolution), diferente de ban por volume — o
  aquecimento do número mitiga volume, não denúncia. Decisão da fundadora:
  aceitar esse risco usando o número comercial real (não descartável).
- **Zona cinzenta pessoa física vs. jurídica**: microempreendedores
  individuais (MEI) e autônomos podem ter o WhatsApp "comercial" no mesmo
  aparelho pessoal. O tratamento aqui considera a *função* do dado (contato
  comercial publicado) e não o CPF/CNPJ por trás — mas é uma área que exige
  bom senso caso a caso (ex.: recusa educada e imediata se o titular deixar
  claro que não é o contato certo).

## Quando revisar este documento

- Se o volume deixar de ser piloto controlado e virar operação contínua/
  escalada — a análise de proporcionalidade muda com a escala.
- Se houver reclamação formal (ANPD, Procon, ou notificação direta) sobre
  um contato específico.
- Antes do T5 (piloto com leads reais) rodar de fato — ver `T4-EXECUCAO.md`
  e `PLANO-NOVO-FLUXO.md` na pasta mãe.
