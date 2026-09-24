/**
 * @fileoverview Dossiê do cliente — arquivos em `client-assets` + `client_assets`.
 *
 * Arquivo separado do `clients.ts` de propósito: aqui cada operação toca DUAS
 * coisas (bytes no Storage e linha na tabela), e as duas podem falhar em
 * ordens diferentes. Essa é a única complexidade real desta camada, e ela
 * merece um arquivo onde dê pra ler as quatro ordens de falha juntas.
 *
 * O fluxo de `lib/supabase/dealFiles.ts` foi o modelo, com três correções
 * deliberadas — todas registradas em PLANO-CLIENTES.md §7.7:
 *
 * 1. **O caminho começa pelo id da organização.** O `dealFiles` grava em
 *    `${dealId}/uuid.ext`, e o bucket dele tem policy cega pra organização
 *    (`USING (bucket_id = 'deal-files')`, um P1 aberto no TODOS.md). O
 *    `client-assets` compara `(storage.foldername(name))[1]` com
 *    `get_user_org_id()`: copiar o formato do `dealFiles` faria TODO upload
 *    falhar, com erro de policy que não explica nada.
 * 2. **Byte órfão é pior que linha órfã.** Se o insert falha depois do upload,
 *    o arquivo fica no bucket sem nada que o descreva — invisível pra qualquer
 *    consulta do produto e fora do alcance de qualquer pedido de eliminação.
 *    Aqui o upload é desfeito quando o insert falha.
 * 3. **Erro de Storage na exclusão não é engolido.** O `dealFiles` faz
 *    `console.warn` e apaga a linha assim mesmo, o que produz exatamente o
 *    byte órfão do item 2. Aqui a exclusão para e devolve o erro.
 *
 * A exclusão é DEFINITIVA, não `deleted_at`. Para um arquivo, "excluir" tem
 * que ser descarte: `deleted_at` esconderia a linha e deixaria os bytes, que é
 * o problema de LGPD que o §7.6 levanta sobre o RAG, só que dentro de casa.
 */

import { supabase } from './client';
import type { ClientAsset, ClientAssetKind } from '@/types/clients';

const BUCKET = 'client-assets';

/** Igual ao `file_size_limit` do bucket (`20260905120000_modulo_clientes.sql:572`). */
export const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024;

type DbClientAsset = {
    id: string;
    company_id: string;
    file_name: string;
    file_path: string;
    file_size: number | null;
    mime_type: string | null;
    kind: ClientAssetKind;
    rag_document_id: string | null;
    rag_uploaded_at: string | null;
    deleted_at: string | null;
    created_at: string;
    created_by: string | null;
    organization_id: string;
};

function transform(db: DbClientAsset): ClientAsset {
    return {
        id: db.id,
        companyId: db.company_id,
        fileName: db.file_name,
        filePath: db.file_path,
        fileSize: db.file_size ?? undefined,
        mimeType: db.mime_type ?? undefined,
        kind: db.kind,
        ragDocumentId: db.rag_document_id ?? undefined,
        ragUploadedAt: db.rag_uploaded_at ?? undefined,
        createdAt: db.created_at,
        createdBy: db.created_by ?? undefined,
        organizationId: db.organization_id,
    };
}

/**
 * Extensão do nome do arquivo, ou vazio.
 *
 * `split('.').pop()` devolve o nome inteiro quando não há ponto — `'contrato'`
 * viraria a extensão `'contrato'` e o caminho sairia `uuid.contrato`. Por isso
 * a checagem de posição em vez do idioma curto.
 */
export function extensaoDe(nomeDoArquivo: string): string {
    const ponto = nomeDoArquivo.lastIndexOf('.');
    if (ponto <= 0 || ponto === nomeDoArquivo.length - 1) return '';
    return nomeDoArquivo.slice(ponto + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Caminho do objeto no bucket.
 *
 * O primeiro segmento é o id da organização porque é isso que a policy lê. O
 * segundo é a empresa, pra que o bucket seja navegável quando alguém precisar
 * olhar direto. O nome é um UUID: nome de arquivo escolhido por pessoa traz
 * acento, barra e espaço, e o nome original já está guardado em `file_name`.
 */
export function caminhoDoAsset(
    organizationId: string,
    companyId: string,
    nomeDoArquivo: string,
    uuid: string,
): string {
    const ext = extensaoDe(nomeDoArquivo);
    return `${organizationId}/${companyId}/${uuid}${ext ? `.${ext}` : ''}`;
}

export const clientAssetsService = {
    async listar(
        companyId: string,
        options?: { signal?: AbortSignal },
    ): Promise<{ data: ClientAsset[] | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
            let query = supabase
                .from('client_assets')
                .select('*')
                .eq('company_id', companyId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (options?.signal) query = query.abortSignal(options.signal);

            const { data, error } = await query;
            if (error) return { data: null, error };
            return { data: (data ?? []).map(a => transform(a as DbClientAsset)), error: null };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },

    /**
     * Sobe o arquivo e registra a linha.
     *
     * `organizationId` vem do chamador (`useAuth`) porque o caminho precisa
     * dele ANTES do insert. A linha também ganha `organization_id` sozinha,
     * pelo trigger `client_assets_set_org_id` — as duas checagens são
     * independentes de propósito: se o chamador passar a organização errada, a
     * policy do bucket recusa o upload antes de qualquer linha existir.
     */
    async enviar(entrada: {
        companyId: string;
        organizationId: string;
        file: File;
        kind: ClientAssetKind;
    }): Promise<{ data: ClientAsset | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

            if (entrada.file.size === 0) {
                return { data: null, error: new Error('O arquivo está vazio.') };
            }
            if (entrada.file.size > TAMANHO_MAXIMO_BYTES) {
                return {
                    data: null,
                    error: new Error(
                        `O arquivo tem ${formatarTamanho(entrada.file.size)} e o limite é ${formatarTamanho(TAMANHO_MAXIMO_BYTES)}.`,
                    ),
                };
            }

            const filePath = caminhoDoAsset(
                entrada.organizationId,
                entrada.companyId,
                entrada.file.name,
                crypto.randomUUID(),
            );

            const { error: erroUpload } = await supabase.storage
                .from(BUCKET)
                .upload(filePath, entrada.file, {
                    contentType: entrada.file.type || undefined,
                    upsert: false,
                });
            if (erroUpload) return { data: null, error: erroUpload };

            const { data, error } = await supabase
                .from('client_assets')
                .insert({
                    company_id: entrada.companyId,
                    file_name: entrada.file.name,
                    file_path: filePath,
                    file_size: entrada.file.size,
                    mime_type: entrada.file.type || null,
                    kind: entrada.kind,
                })
                .select('*')
                .single();

            if (error) {
                // Desfaz o upload: sem a linha, o arquivo é invisível pro
                // produto e ninguém consegue apagá-lo pela tela depois.
                const { error: erroLimpeza } = await supabase.storage.from(BUCKET).remove([filePath]);
                if (erroLimpeza) {
                    console.error(
                        '[clientAssets] insert falhou e a limpeza do arquivo também — byte órfão em',
                        `${BUCKET}/${filePath}`,
                        erroLimpeza,
                    );
                }
                return { data: null, error };
            }

            return { data: transform(data as DbClientAsset), error: null };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },

    /** URL assinada de 1 hora. O bucket é privado: não existe URL pública. */
    async urlDeDownload(filePath: string): Promise<{ url: string | null; error: Error | null }> {
        try {
            if (!supabase) return { url: null, error: new Error('Supabase não configurado') };
            const { data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(filePath, 3600);
            if (error) return { url: null, error };
            return { url: data?.signedUrl ?? null, error: null };
        } catch (e) {
            return { url: null, error: e as Error };
        }
    },

    /**
     * Exclusão definitiva: bytes primeiro, linha depois.
     *
     * A ordem é a parte que importa. Se o Storage falha, nada é apagado e a
     * pessoa vê o erro. Se o Storage apaga e o delete da linha falha, sobra uma
     * linha apontando pra arquivo que não existe — visível na tela e resolvível
     * clicando em excluir de novo (`remove` de objeto ausente não dá erro). A
     * ordem inversa produziria byte órfão: invisível e permanente.
     *
     * Antes de qualquer coisa, recusa apagar asset que é o contrato assinado de
     * algum contrato. A FK é `ON DELETE SET NULL`, então sem esta checagem a
     * exclusão zeraria `signed_asset_id` em silêncio.
     */
    async excluir(asset: Pick<ClientAsset, 'id' | 'filePath'>): Promise<{ error: Error | null }> {
        try {
            if (!supabase) return { error: new Error('Supabase não configurado') };

            const { data: vinculados, error: erroVinculo } = await supabase
                .from('client_contracts')
                .select('id')
                .eq('signed_asset_id', asset.id)
                .is('deleted_at', null)
                .limit(1);
            if (erroVinculo) return { error: erroVinculo };
            if ((vinculados?.length ?? 0) > 0) {
                return {
                    error: new Error(
                        'Este arquivo é o contrato assinado de um contrato cadastrado. Desvincule-o do contrato antes de excluir.',
                    ),
                };
            }

            const { error: erroStorage } = await supabase.storage.from(BUCKET).remove([asset.filePath]);
            if (erroStorage) return { error: erroStorage };

            const { error } = await supabase.from('client_assets').delete().eq('id', asset.id);
            return { error };
        } catch (e) {
            return { error: e as Error };
        }
    },
};

/** Tamanho legível. Copiado do `dealFiles.formatFileSize`, que não é exportável isolado. */
export function formatarTamanho(bytes: number | undefined): string {
    if (!bytes) return '0 B';
    const unidades = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let tamanho = bytes;
    while (tamanho >= 1024 && i < unidades.length - 1) {
        tamanho /= 1024;
        i++;
    }
    return `${tamanho.toFixed(i === 0 ? 0 : 1)} ${unidades[i]}`;
}
