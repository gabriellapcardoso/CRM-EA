/**
 * A URL da tela de Mensagens tem que acompanhar a conversa selecionada.
 *
 * `handleSelectConversation` chamava `router.push('/messaging?id=…')`. Só que
 * `/messaging` é **prerenderizada como estática** — `○ /messaging` na saída do
 * `next build`. Em rota estática, navegar para a mesma rota com outro
 * `searchParam` faz o roteador do cliente reconciliar a URL de volta para a
 * entrada prerenderizada.
 *
 * O efeito medido em produção, instrumentando `history.pushState`: ao clicar na
 * segunda conversa, a tela trocava (o `card-conv--active` andava, a thread
 * mudava) e o histórico registrava um `replace` com o id ANTERIOR, sem nenhum
 * `push`. A URL congelava na primeira conversa aberta depois de cada
 * carregamento. Recarregar levava a pessoa pra conversa errada; copiar o link
 * pra mandar a alguém compartilhava a conversa errada.
 *
 * O detalhe que quase escondeu isso: **só reproduz quando a página é carregada
 * já com `?id=` na URL**. Entrando em `/messaging` limpo, os dois primeiros
 * cliques gravam certo. Um teste que só cobrisse o caminho limpo passaria com o
 * bug em pé.
 *
 * `pushState`/`replaceState` é o caminho documentado do App Router pra refletir
 * estado do cliente na URL sem navegação de servidor, e continua em sincronia
 * com `useSearchParams`.
 *
 * Teste estático porque o comportamento é do roteador do Next sobre uma rota
 * prerenderizada — happy-dom não tem roteador nem prerender, então montar o
 * componente não exerceria nada. Comentários são removidos antes de casar: esta
 * prosa aqui em cima cita as duas APIs e satisfaria as asserções sozinha.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(join(process.cwd(), 'features/messaging/MessagingPage.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('sincronia entre URL e conversa selecionada', () => {
  it('nenhuma escrita de URL de /messaging passa pelo router', () => {
    // `router.push('/messaging…')` e `router.replace('/messaging…')` são
    // exatamente o que a rota estática desfaz.
    const infratores = FONTE.match(/router\.(push|replace)\(\s*[`'"]\/messaging/g) ?? [];

    expect(
      infratores,
      'Rota estática desfaz navegação para a própria rota. Use window.history.',
    ).toEqual([]);
  });

  it('a seleção de conversa grava a URL com pushState', () => {
    const bloco = FONTE.slice(FONTE.indexOf('const handleSelectConversation'));
    const corpo = bloco.slice(0, bloco.indexOf('}, ['));

    expect(corpo).toMatch(/escreverConversaNaURL\(\s*id\s*\)/);
  });

  it('o helper usa as duas APIs nativas — push pra troca, replace pra limpeza', () => {
    const inicio = FONTE.indexOf('const escreverConversaNaURL');
    expect(inicio, 'helper de URL não encontrado').toBeGreaterThan(-1);
    const helper = FONTE.slice(inicio, FONTE.indexOf('const handleDeleteConversation'));

    expect(helper).toContain('window.history.pushState');
    expect(helper).toContain('window.history.replaceState');
    // Sem id vira /messaging limpo, e não `/messaging?id=undefined`.
    expect(helper).toMatch(/\?id=\$\{id\}`\s*:\s*'\/messaging'/);
  });

  it('conversa não encontrada limpa a URL sem empilhar histórico', () => {
    // Empilhar aqui prenderia a pessoa: voltar cairia na conversa inexistente
    // de novo, que dispararia a limpeza outra vez.
    expect(FONTE).toMatch(/escreverConversaNaURL\(undefined,\s*'replace'\)/);
  });

  it('navegação para OUTRA rota continua no router — o problema é só a própria rota', () => {
    // `/contacts` e `/boards` são navegações de verdade; trocá-las por
    // history.pushState puliria o roteamento do Next e quebraria a tela.
    expect(FONTE).toMatch(/router\.push\(`\/contacts\?id=/);
    expect(FONTE).toMatch(/router\.push\(`\/boards\?contact=/);
  });
});
