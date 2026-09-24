/**
 * O caminho do arquivo no bucket tem que bater com a policy do bucket.
 *
 * A policy do `client-assets` compara `(storage.foldername(name))[1]` com
 * `get_user_org_id()`. Isso torna o PRIMEIRO segmento do caminho parte do
 * contrato de segurança, e não uma escolha de organização de pastas: caminho
 * sem o id da organização na frente é upload recusado, com erro de policy que
 * não diz qual é o problema.
 *
 * O modelo que a F4a copiou (`lib/supabase/dealFiles.ts:47`) grava em
 * `${dealId}/uuid.ext`, porque o bucket dele tem a policy cega pra organização
 * que é P1 no TODOS.md. Copiar aquele formato aqui quebraria todo upload. Este
 * arquivo amarra os dois lados: o formato que o código gera e o formato que a
 * migration exige.
 *
 * A leitura estática remove comentários antes de casar. Sem isso a asserção
 * casaria na prosa acima com a mesma facilidade que no código — já aconteceu
 * duas vezes neste repositório, em dias seguidos.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { caminhoDoAsset, extensaoDe } from '@/lib/supabase/clientAssets';

function semComentarios(caminho: string): string {
    return readFileSync(join(process.cwd(), caminho), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(l => l.replace(/^\s*\/\/.*$/, ''))
        .join('\n');
}

const FONTE = semComentarios('lib/supabase/clientAssets.ts');
const MIGRATION = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260905120000_modulo_clientes.sql'),
    'utf-8',
);

describe('caminhoDoAsset', () => {
    it('põe o id da organização no primeiro segmento', () => {
        const caminho = caminhoDoAsset('org-1', 'empresa-9', 'contrato.pdf', 'uuid-abc');
        expect(caminho.split('/')[0]).toBe('org-1');
        expect(caminho).toBe('org-1/empresa-9/uuid-abc.pdf');
    });

    it('a empresa é o segundo segmento, não o primeiro', () => {
        // A inversão é o erro plausível: `empresa/org/uuid` parece igualmente
        // organizado e é recusado pela policy.
        const caminho = caminhoDoAsset('org-1', 'empresa-9', 'x.png', 'u');
        expect(caminho.split('/')[1]).toBe('empresa-9');
    });

    it('nunca usa o nome escolhido pela pessoa no caminho', () => {
        const caminho = caminhoDoAsset('o', 'e', 'Contrato Final (revisão 2).pdf', 'u');
        expect(caminho).toBe('o/e/u.pdf');
        expect(caminho).not.toContain(' ');
        expect(caminho).not.toContain('ã');
    });

    it('arquivo sem extensão não vira extensão inventada', () => {
        // `nome.split('.').pop()` devolve o nome inteiro quando não há ponto:
        // 'contrato' viraria a extensão e o caminho sairia `u.contrato`.
        expect(extensaoDe('contrato')).toBe('');
        expect(caminhoDoAsset('o', 'e', 'contrato', 'u')).toBe('o/e/u');
    });

    it('extensão é normalizada e sem caractere estranho', () => {
        expect(extensaoDe('FOTO.PNG')).toBe('png');
        expect(extensaoDe('arquivo.tar.gz')).toBe('gz');
        expect(extensaoDe('planilha.')).toBe('');
        expect(extensaoDe('.gitignore')).toBe('');
    });
});

describe('o código bate com a policy do bucket', () => {
    // As asserções sobre a migration viviam aqui e foram REMOVIDAS: a guarda da
    // F1 (`clientesMigrationGuards.test.ts:125-147`) já cobre as quatro policies
    // e cobre melhor — exige a string inteira
    // `(storage.foldername(name))[1] = public.get_user_org_id()::text` nas
    // quatro, mais `FOR <OP> TO authenticated`, mais "exatamente quatro
    // policies". A versão que estava aqui exigia a string inteira só no INSERT e
    // aceitava qualquer `storage.foldername(name)` no resto — inclusive `[2]`,
    // ou comparação contra literal. Duplicata mais fraca não é reforço: ela
    // ocupa o lugar mental da guarda boa. Este arquivo cuida do CÓDIGO.

    it('o template do caminho começa pela organização', () => {
        // Mira o corpo de `caminhoDoAsset`, não "o primeiro `return` com
        // template": o template tem crase aninhada (`${ext ? \`.${ext}\` : ''}`)
        // e um `[^`]*` casaria no `formatarTamanho`, 100 linhas abaixo, com as
        // asserções passando por vacuidade sobre a função errada.
        const corpo = FONTE.match(
            /export function caminhoDoAsset\([\s\S]*?\n\}/,
        )?.[0];
        expect(corpo, 'função caminhoDoAsset não encontrada').toBeDefined();
        expect(corpo).toContain('organizationId');
        expect(corpo).toContain('companyId');
        expect(
            corpo!.indexOf('${organizationId}'),
            'a organização não aparece interpolada no caminho',
        ).toBeGreaterThanOrEqual(0);
        expect(
            corpo!.indexOf('${organizationId}'),
            'a empresa vem antes da organização — a policy recusa esse caminho',
        ).toBeLessThan(corpo!.indexOf('${companyId}'));
    });

    it('o caminho usa organização E empresa, nessa ordem', () => {
        // Asserção POSITIVA sobre a forma inteira. A versão anterior era
        // `not.toMatch(/`${companyId}\//)`, que proibia um formato errado
        // específico e continuaria verde se `companyId` sumisse do caminho por
        // completo. Proibir um erro não é o mesmo que exigir o acerto.
        expect(caminhoDoAsset('ORG', 'EMP', 'a.pdf', 'UUID')).toBe('ORG/EMP/UUID.pdf');
        expect(caminhoDoAsset('ORG', 'EMP', 'a.pdf', 'UUID').split('/')).toEqual([
            'ORG', 'EMP', 'UUID.pdf',
        ]);
    });
});
