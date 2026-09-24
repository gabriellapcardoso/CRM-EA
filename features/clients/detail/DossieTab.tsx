'use client';

import React from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import {
    useClientAssets,
    useUploadClientAsset,
    useDeleteClientAsset,
} from '@/lib/query/hooks/useClientsQuery';
import { estadoDaConsulta } from '@/lib/clients/estadoDaConsulta';
import {
    clientAssetsService,
    formatarTamanho,
    TAMANHO_MAXIMO_BYTES,
} from '@/lib/supabase/clientAssets';
import type { ClientAsset, ClientAssetKind } from '@/types/clients';

/**
 * Tipos que uma pessoa escolhe ao subir arquivo.
 *
 * `gerado` fica de fora: ele marca arquivo produzido pelo sistema, e oferecê-lo
 * num seletor manual deixaria a origem do arquivo mentindo. Os três aqui são os
 * que alguém de fato sobe.
 */
const TIPOS: ReadonlyArray<{ value: ClientAssetKind; label: string }> = [
    { value: 'documento', label: 'Documento' },
    { value: 'foto_autorizada', label: 'Foto Autorizada' },
    { value: 'contrato', label: 'Contrato' },
];

/**
 * Rótulos de EXIBIÇÃO, que incluem `gerado`.
 *
 * O seletor de upload (`TIPOS`) omite `gerado` de propósito — arquivo produzido
 * pelo sistema não é coisa que alguém escolhe ao subir. Mas o CHECK do banco
 * aceita o valor, então a tabela pode conter uma linha assim, e derivar o
 * rótulo só de `TIPOS` fazia ela aparecer crua como "gerado". Duas listas
 * porque são duas perguntas: o que dá pra escolher, e o que dá pra mostrar.
 */
const ROTULO_DO_TIPO = new Map<ClientAssetKind, string>([
    ...TIPOS.map(t => [t.value, t.label] as const),
    ['gerado', 'Gerado pelo Sistema'],
]);

/** `timestamptz` no fuso do navegador. O banco guarda UTC; a tela converte. */
function quando(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

/**
 * Aba Dossiê — arquivos do cliente (F4a).
 *
 * **Sem nenhuma IA, de propósito.** O caminho de RAG é a F4b e tem quatro
 * requisitos de entrada que ainda não existem (PLANO-CLIENTES.md §7.6), sendo
 * o primeiro deles poder apagar o documento do lado do fornecedor. Enquanto
 * isso, `rag_uploaded_at` nulo em toda linha é a verdade, e a tela diz isso em
 * vez de fingir que o arquivo chegou em algum lugar.
 *
 * O download abre em aba nova com URL assinada de 1 hora, obtida no clique e
 * não na listagem: assinar 20 URLs pra que a pessoa use uma é gasto de chamada
 * e, pior, deixa link válido circulando no HTML da página.
 */
export const DossieTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const assets = useClientAssets(companyId);
    const enviar = useUploadClientAsset();
    const excluir = useDeleteClientAsset();

    const inputRef = React.useRef<HTMLInputElement>(null);
    const [tipo, setTipo] = React.useState<ClientAssetKind>('documento');
    const [erroDeDownload, setErroDeDownload] = React.useState<string | null>(null);
    const [baixando, setBaixando] = React.useState<string | null>(null);

    const lista = assets.data ?? [];

    const estado = estadoDaConsulta({
        isSuccess: assets.isSuccess,
        isError: assets.isError,
        isFetching: assets.isFetching,
        temDados: !!assets.data,
        quantidade: lista.length,
    });

    async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        // Limpa o input SEMPRE: sem isto, escolher o mesmo arquivo de novo
        // depois de um erro não dispara `change` e o botão parece morto.
        e.target.value = '';
        if (!file) return;
        await enviar.mutateAsync({ companyId, file, kind: tipo }).catch(() => {
            // A mensagem sai por `enviar.error` abaixo.
        });
    }

    async function baixar(asset: ClientAsset) {
        setErroDeDownload(null);
        setBaixando(asset.id);

        // A aba é aberta AGORA, dentro do clique, e só depois recebe a URL.
        // `window.open` depois do `await` já não está na pilha de ativação do
        // usuário: o Safari bloqueia e devolve `null`, e o Chrome bloqueia em
        // configuração restritiva — o botão não fazia nada e a tela não dizia
        // nada. Abrir vazio e navegar depois é o padrão que sobrevive a isso.
        const aba = window.open('', '_blank', 'noopener,noreferrer');

        const { url, error } = await clientAssetsService.urlDeDownload(asset.filePath);
        setBaixando(null);

        if (error || !url) {
            aba?.close();
            setErroDeDownload(
                error?.message ?? 'O arquivo não foi encontrado no armazenamento.',
            );
            return;
        }

        if (aba) {
            aba.location.href = url;
            return;
        }

        // A aba foi bloqueada mesmo assim (bloqueador agressivo). Dizer isso é
        // melhor que um botão mudo: sem esta mensagem o download "simplesmente
        // não acontece" e não há nada na tela pra explicar.
        setErroDeDownload(
            'O navegador bloqueou a abertura da aba. Libere pop-ups para este site e tente de novo.',
        );
    }

    async function remover(asset: ClientAsset) {
        const ok = window.confirm(
            `Excluir "${asset.fileName}" definitivamente? O arquivo é apagado do armazenamento e não dá pra desfazer.`,
        );
        if (!ok) return;
        await excluir.mutateAsync({ asset, companyId }).catch(() => {
            // A mensagem sai por `excluir.error` abaixo.
        });
    }

    return (
        <section className="section-card">
            <h2 className="title-md">Dossiê</h2>

            <div className="list-toolbar">
                <label className="client-dossie__tipo">
                    <span className="meta">Tipo</span>
                    <select
                        className="input"
                        value={tipo}
                        onChange={e => setTipo(e.target.value as ClientAssetKind)}
                        disabled={enviar.isPending}
                        aria-label="Tipo do arquivo a enviar"
                    >
                        {TIPOS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </label>

                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => inputRef.current?.click()}
                    disabled={enviar.isPending}
                >
                    <Upload size={14} aria-hidden />{' '}
                    {enviar.isPending ? 'Enviando…' : 'Enviar Arquivo'}
                </button>

                <input
                    ref={inputRef}
                    type="file"
                    className="sr-only"
                    onChange={aoEscolherArquivo}
                    aria-label="Escolher arquivo do dossiê"
                />

                <span className="meta">Até {formatarTamanho(TAMANHO_MAXIMO_BYTES)} por arquivo.</span>
            </div>

            {enviar.isError && (
                <p className="muted">
                    Não foi possível enviar: {(enviar.error as Error)?.message}
                </p>
            )}
            {excluir.isError && (
                <p className="muted">
                    Não foi possível excluir: {(excluir.error as Error)?.message}
                </p>
            )}
            {erroDeDownload && <p className="muted">Não foi possível baixar: {erroDeDownload}</p>}

            {estado === 'carregando' && <p className="muted">Carregando o dossiê…</p>}

            {estado === 'indefinido' && (
                <p className="muted">
                    O dossiê não chegou. Recarregue a página — isto não quer dizer que
                    não há arquivo.
                </p>
            )}

            {estado === 'erro' && (
                <p className="muted">
                    Não foi possível carregar o dossiê: {(assets.error as Error)?.message}
                </p>
            )}

            {estado === 'vazio' && (
                <p className="muted">
                    Nenhum arquivo no dossiê. Contrato assinado, briefing, manual de marca
                    e foto autorizada moram aqui.
                </p>
            )}

            {estado === 'com-dados' && (
                <div className="table-list__scroll">
                    <table className="table-list table-list--fit">
                        <thead>
                            <tr>
                                <th scope="col">Arquivo</th>
                                <th scope="col">Tipo</th>
                                <th scope="col" className="cell-num">Tamanho</th>
                                <th scope="col">Enviado</th>
                                <th scope="col"><span className="sr-only">Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lista.map(a => (
                                <tr key={a.id}>
                                    <td>
                                        <span className="client-dossie__nome">{a.fileName}</span>
                                    </td>
                                    <td>{ROTULO_DO_TIPO.get(a.kind) ?? a.kind}</td>
                                    <td className="cell-num num">{formatarTamanho(a.fileSize)}</td>
                                    <td>{quando(a.createdAt)}</td>
                                    <td>
                                        <div className="client-dossie__acoes">
                                            <button
                                                type="button"
                                                className="btn btn--quiet"
                                                onClick={() => void baixar(a)}
                                                disabled={baixando === a.id}
                                            >
                                                <Download size={14} aria-hidden />{' '}
                                                {baixando === a.id ? 'Abrindo…' : 'Baixar'}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn--quiet"
                                                onClick={() => void remover(a)}
                                                disabled={excluir.isPending}
                                            >
                                                <Trash2 size={14} aria-hidden /> Excluir
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="meta">
                Os arquivos ficam num bucket privado, isolado por organização. Nada daqui
                é enviado para nenhum fornecedor de IA — o dossiê e o caminho de RAG são
                fases separadas.
            </p>
        </section>
    );
};
