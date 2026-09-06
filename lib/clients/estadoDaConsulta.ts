/**
 * Traduz o estado de uma query do TanStack no estado que a tela mostra.
 *
 * Existe porque `isLoading` engana. Ele é `isPending && isFetching`, então há
 * um quarto estado sem nome próprio: `pending` sem estar `fetching`. Acontece
 * quando o retry fica pausado (o gerenciador de rede julgou a máquina
 * offline), quando a query está desabilitada porque a sessão ainda não
 * resolveu, e no intervalo entre falhar e tentar de novo. Nele `isLoading` é
 * falso, `isError` é falso e não há dado — e a condição intuitiva
 * `!isLoading && !isError && lista.length === 0` afirma "não há nada".
 *
 * Foi o que esta tela mostrou na primeira verificação no navegador: a consulta
 * devolvia 400 e a página dizia "nenhum cliente cadastrado ainda".
 *
 * A regra que sai daqui: **só quem recebeu resposta pode afirmar que não há
 * nada.** Vazio não é resultado.
 */
export type EstadoDaConsulta =
    /** Buscando, sem nada em mãos ainda. */
    | 'carregando'
    /** A busca falhou e o erro é conhecido. */
    | 'erro'
    /** Nem falhou nem respondeu: pausado, desabilitado ou entre tentativas. */
    | 'indefinido'
    /** Respondeu, e não veio nada — com filtro aplicado. */
    | 'vazio-por-filtro'
    /** Respondeu, e não há nada mesmo. */
    | 'vazio'
    /** Respondeu com conteúdo. */
    | 'com-dados';

export interface EntradaDaConsulta {
    isSuccess: boolean;
    isError: boolean;
    isFetching: boolean;
    temDados: boolean;
    quantidade: number;
    temFiltro?: boolean;
}

export function estadoDaConsulta({
    isSuccess,
    isError,
    isFetching,
    temDados,
    quantidade,
    temFiltro = false,
}: EntradaDaConsulta): EstadoDaConsulta {
    // Erro conhecido vem primeiro: ele é a informação mais útil, mesmo que uma
    // nova tentativa já esteja em curso.
    if (isError) return 'erro';
    if (isFetching && !temDados) return 'carregando';
    if (!isSuccess) return 'indefinido';
    if (quantidade > 0) return 'com-dados';
    return temFiltro ? 'vazio-por-filtro' : 'vazio';
}
