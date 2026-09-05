# Prompt para o Claude Code

Cole o texto abaixo (a pasta `handoff/` precisa estar na raiz do repositório ou anexada).

---

Você vai aplicar uma revisão de layout no CRM. O design de referência está na pasta
`handoff/` — HTML + CSS estáticos, sem framework, uma tela por arquivo. Comece lendo
`handoff/MUDANCAS.md`: ele descreve exatamente as cinco mudanças desta revisão. Depois
compare cada tela do pacote com a tela equivalente do nosso código.

**O objetivo é um só: acabar com a rolagem lateral e com os painéis que picam a tela.**
Toda tela de detalhe passa a ser uma página completa, com seções empilhadas na vertical.

Aplique, na ordem:

1. **Detalhe do deal** — hoje é um layout de três colunas com largura mínima. Refaça como
   página única seguindo `handoff/cockpit-deal.html` + `handoff/css/cockpit.css`: seções
   nesta ordem — contato principal (com os dados do deal na grade de campos), risco do deal
   (com a barra de saúde), decisão da IA aguardando aprovação, próximos passos, linha do
   tempo, responder, o que a IA já fez sozinha. O stepper dos 13 estágios quebra linha,
   não rola.

2. **Contato** — remova o drawer lateral da lista. Clicar num contato navega para uma rota
   própria de detalhe (`/contatos/:id`), tela cheia, com botão de voltar para a lista.
   Referência: `handoff/contato-detalhe.html`.

3. **Lista de contatos** — tire a largura mínima da tabela; a empresa vira segunda linha do
   nome. Seis colunas: contato, canal, dono, último toque, deals, em aberto. A linha inteira
   (ou a célula do nome) leva ao detalhe.

4. **Menu lateral ocultável** — botão no topbar à esquerda do título, alternando a classe
   `app--nav-collapsed` no wrapper da aplicação. Persista a preferência do usuário.
   Se o nosso código já tem esse comportamento, mantenha o dele e só garanta que o botão
   apareça em todas as telas novas.

5. **Botão de voltar contextual** — no detalhe do deal, voltar leva para a tela de origem
   (inbox, contato, board ou negociação), com o rótulo correspondente. Use o histórico de
   navegação ou um parâmetro de origem na rota.

6. **IA · aprovações** — o card de aprovação não pode ter coluna de largura fixa: use
   `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`.

Regras a respeitar:

- **Não invente estilo.** Todos os valores saem dos tokens em `handoff/css/tokens.css`
  (cores, tipo, espaçamento, raio, sombra). Reaproveite as classes de componente que já
  existem no pacote (`.section-card`, `.field-grid`, `.card-hitl`, `.timeline`,
  `.badge-stage`, `.badge-confidence`, `.btn`, `.tag`) em vez de criar classes novas por tela.
- **Amarelo-limão é só "precisa da sua decisão"** (HITL, confiança 0.70–0.85). Ação
  automática da IA usa roxo discreto; vermelho é só erro de sistema. Não use limão como
  destaque decorativo.
- **Mantenha a rolagem horizontal apenas nos kanbans** (Negociação e Boards).
- **Não mude** cor, tipografia, copy, regras de confiança da IA nem os 13 estágios.
- Nenhuma tela de detalhe deve exigir rolagem para a direita em 1280px de largura.
- Os dados do pacote são fictícios (Bruna Alcântara, Construtora Meridiano, valores) —
  ligue os dados reais da API, não copie os placeholders.

Ao terminar, liste os arquivos que você alterou e me diga onde o nosso código divergiu do
pacote de referência (o que você adaptou e por quê).
