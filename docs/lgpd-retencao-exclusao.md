# Política de retenção e exclusão de dados (LGPD, cross-banco)

## O que é este documento

Decisão prática de quanto tempo guardar dado pessoal nos 3 bancos do
ecossistema (`prospeccao-aaagencia`, `crm-ea-tmp`, `gerador de propostas
comerciai`) e como atender um pedido de exclusão. **Não é análise jurídica
formal** — é o registro interno da decisão da fundadora (aprovada
2026-07-26), complementar ao `lgpd-legitimo-interesse-prospeccao.md` (que
cobre a base legal do 1º contato, não a retenção).

## 1. Lead que nunca virou cliente

- **Prazo**: 24 meses sem nenhuma interação (resposta, mensagem, mudança de
  estágio) → apagar dado pessoal identificável (nome, telefone, e-mail,
  Instagram).
- **O que sobra**: contagem agregada (ex.: "X leads contatados em
  campanha Y") sem nenhum campo que identifique a pessoa/negócio.
- **Onde se aplica**: `prospeccao-aaagencia` (leads nunca exportados pro
  CRM) e `crm-ea` (deals em estágio anterior a "Ganho", sem interação há
  24 meses — inclui os que passaram por reaquecimento e nunca reengataram).
- **Como**: hoje é execução manual (rodar uma query de limpeza
  periodicamente); não há job automático ainda — volume do piloto não
  justifica automatizar agora (ver seção "Quando revisar").

## 2. Cliente que fechou negócio

- **Prazo**: 5 anos após o fim do contrato/relação — alinhado ao prazo
  fiscal brasileiro pra guarda de documento (nota fiscal, contrato).
- **Onde se aplica**: `gerador de propostas comerciai` (propostas, PDFs,
  dados de pagamento) e `crm-ea` (deals em "Ganho", Pós-venda).
- **Depois dos 5 anos**: apagar dado pessoal identificável; documento
  fiscal em si segue a regra própria da Receita Federal (fora do escopo
  deste ecossistema — geralmente já é responsabilidade do
  emissor/contador, não deste banco de dados).

## 3. Pedido de exclusão ("apaga meus dados")

- **Processo**: manual. Buscar telefone/e-mail da pessoa nos 3 bancos
  (Supabase `prospeccao-aaagencia`, `crm-ea`, `gerador de propostas`) e
  apagar/anonimizar registro por registro.
- **Por que manual e não automatizado**: os 3 bancos não têm uma chave
  compartilhada nem sincronização de exclusão entre si; construir isso
  agora seria complexidade desproporcional ao volume atual (piloto de
  10-20 leads). Reavaliar se o volume crescer (ver abaixo).
- **Diferente do opt-out de WhatsApp**: opt-out (responder "SAIR") só
  para de mandar mensagem — não apaga o dado. Pedido de exclusão é mais
  raro e mais amplo, tratado à parte.

## Quando revisar esta política

- Se o volume deixar de ser piloto controlado e virar operação contínua/
  escalada (mesmo gatilho do doc de legítimo interesse) — nesse ponto,
  automatizar a limpeza de 24 meses e considerar uma chave compartilhada
  entre os 3 bancos pra exclusão em cascata.
- Se houver mais de 1 pedido de exclusão no mesmo mês (sinal de que o
  processo manual não escala mais).
- Se a Receita Federal ou legislação de guarda fiscal mudar o prazo de
  5 anos.
