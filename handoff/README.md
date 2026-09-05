# CRM aaagência — pacote de handoff (HTML + CSS)

Abra `index.html` para navegar por todas as telas. Nenhum framework; o único JS é o toggle do menu lateral (`js/nav-toggle.js`).

## Estrutura

```
handoff/
  index.html                  índice de telas
  MUDANCAS.md                 o que mudou nesta revisão (leia primeiro)
  PROMPT.md                   prompt pronto pro Claude Code
  js/nav-toggle.js            único JS: ocultar/mostrar menu lateral
  <tela>.html                 uma tela por arquivo
  <tela>--<estado>.html       estados (vazio / carregando / erro / tempo-real / fila-cheia)
  assets/logo-aaagencia-white.png
  css/
    tokens.css                SÓ variáveis (espelho do design system + 5 tokens de produto)
    base.css                  reset, shell (.app/.main/.screen), utilitários, keyframes
    shell.css                 sidebar + topbar
    components.css            vocabulário compartilhado (botões, badges, banners, forms, estados)
    card-deal.css  board.css  table-list.css  inbox.css
    timeline.css   approval.css  cockpit.css  report.css  auth.css
    design-system.css         só da tela de referência
```

## Regras seguidas

- zero `style=""` nas telas — todo valor vem de classe + `var(--token)`;
- classe por **componente**, reutilizada entre telas (`.card-deal` é o mesmo no board, no cockpit e na referência);
- variação por modificador (`--pending`, `--proposta`, `--whatsapp`), nunca classe nova por tela;
- HTML semântico: `aside/main/header/section/article/table/dl/ul`, `aria-current` na navegação, `aria-pressed` nos toggles.

## Onde o dado entra

Largura de barra e posição do marcador de confiança estão como classes de escala
(`.bar__fill--p62`, `.confidence__marker--c74`, `.chart__bar--h46`) só para o mock ficar sem
inline style. Na implementação, ligue o valor real via style inline ou custom property.

## Dados fictícios

Nomes de clientes, valores, a fundadora "Bruna Alcântara" e os números do agente são
placeholders plausíveis para o mock — troque pelos reais.
