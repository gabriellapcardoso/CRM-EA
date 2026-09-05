# Revisão — fim da rolagem lateral e telas de detalhe completas

Revisão de 4 set 2026 sobre o pacote anterior. Cinco mudanças, todas de layout e navegação;
nada de cor, tipografia ou regra de HITL foi alterado.

## 1. Detalhe do deal virou página única (`cockpit-deal.html`)

Antes: `.cockpit__body` era um grid de 3 colunas (`288px 1fr 320px`) com `min-width: 1180px`,
o que forçava rolagem horizontal em telas menores e picava a informação em três painéis.

Agora: uma coluna só, `max-width: 1180px`, seções empilhadas na ordem de leitura:

1. **contato principal** — avatar, cargo, ações de canal, link "ver contato completo" e a
   grade de campos do deal (`.field-grid`, `repeat(auto-fit, minmax(180px, 1fr))`) + etiquetas;
2. **risco do deal** — nível, motivo, três números de apoio e a barra de **saúde do deal**;
3. **aguardando sua decisão** — o card HITL lima, inalterado;
4. **próximos passos** — checklist em grade;
5. **linha do tempo**;
6. **responder**;
7. **o que a IA já fez sozinha**.

O stepper dos 13 estágios agora **quebra linha** (`flex-wrap: wrap`) em vez de rolar na horizontal.
CSS: `css/cockpit.css` reescrito. Classes novas: `.cockpit__sections`, `.section-card`,
`.field-grid`/`.field`, `.risk-row`, `.risk-stats`, `.health`, `.checklist--grid`, `.back-link`.

## 2. Contato tem página própria (`contato-detalhe.html`)

O drawer lateral de 340px (`.detail-pane`) saiu de `contatos.html`. Clicar num contato abre
uma tela cheia com **← voltar pra contatos**, nas seções: dados do contato → pendência da IA →
deals do contato (cards que abrem o cockpit) → histórico.

`.detail-pane` continua no CSS só como legado (o inbox ainda usa) — não use em telas novas.

## 3. Tabela de contatos cabe na tela

`.table-list` perdeu o `min-width: 840px`. A coluna "empresa" foi absorvida como segunda
linha do nome (`.cell-name__stack` / `.cell-name__co`); a célula do nome é um link
(`.table-list__link`) para `contato-detalhe.html`. Seis colunas: contato · canal · dono ·
último toque · deals · em aberto.

## 4. Menu lateral ocultável (paridade com produção)

Botão `.nav-toggle` no topbar, à esquerda do título, em todas as telas internas.
Alterna `.app--nav-collapsed` no `.app` (`.sidebar { display: none }`) e grava o estado em
`localStorage['crm-nav-collapsed']`. Implementação de referência em `js/nav-toggle.js` —
na aplicação real, troque por estado da UI (contexto/store), mantendo a classe no wrapper.

## 5. Botão de voltar é contextual

`.back-link` no detalhe do deal volta **para a tela de origem**, não sempre pra Negociação:
veio do Inbox → volta pro Inbox; do contato → volta pro contato; do board → volta pro board.
No mock isso está sinalizado pelo `?from=inbox` nos links do inbox; na implementação, use o
histórico de navegação ou um parâmetro de origem e ajuste o rótulo ("← voltar pra inbox").

Bônus: `.card-approval` (IA · aprovações) trocou `grid-template-columns: 1fr 268px` por
`repeat(auto-fit, minmax(320px, 1fr))` — a coluna de confiança agora desce em vez de estourar.

## O que continua com rolagem horizontal — de propósito

O kanban de `pipeline.html` (13 estágios) e o de `boards.html`. É a natureza do quadro e é
assim no sistema em produção. Todo o resto do produto rola só na vertical.
