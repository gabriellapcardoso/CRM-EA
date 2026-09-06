/**
 * Validação dos formulários do Módulo Clientes.
 *
 * Os `refine` do contrato existem pra devolver mensagem legível onde o banco
 * devolveria erro de constraint. Vale conferir os dois lados: o que passa e o
 * que é recusado.
 */
import { describe, expect, it } from 'vitest';
import { clientFormSchema, contractFormSchema } from '@/lib/validations/schemas';

const contratoBase = {
    monthlyValue: '1500',
    startsAt: '2026-01-01',
    endsAt: '',
    renewalDate: '',
    status: 'vigente' as const,
    paymentMethod: '',
    documentType: '' as const,
    documentNumber: '',
    addressZip: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressDistrict: '',
    addressCity: '',
    addressState: '',
};

const clienteBase = {
    name: 'Padaria do Bairro',
    niche: '' as const,
    industry: '',
    website: '',
    lifecycleStage: 'lead' as const,
    category: '' as const,
    healthScore: '',
};

describe('contractFormSchema', () => {
    it('aceita o caso mínimo', () => {
        expect(contractFormSchema.safeParse(contratoBase).success).toBe(true);
    });

    it('recusa término antes do início', () => {
        const r = contractFormSchema.safeParse({
            ...contratoBase,
            startsAt: '2026-06-01',
            endsAt: '2026-05-31',
        });
        expect(r.success).toBe(false);
        expect(JSON.stringify(r)).toContain('Término não pode ser antes do início');
    });

    it('aceita término igual ao início', () => {
        const r = contractFormSchema.safeParse({
            ...contratoBase,
            startsAt: '2026-06-01',
            endsAt: '2026-06-01',
        });
        expect(r.success).toBe(true);
    });

    // O CHECK do banco exige document_type quando há número. Pegar aqui
    // devolve mensagem legível em vez de erro cru de constraint.
    it('recusa número de documento sem tipo', () => {
        const r = contractFormSchema.safeParse({
            ...contratoBase,
            documentNumber: '52998224725',
        });
        expect(r.success).toBe(false);
        expect(JSON.stringify(r)).toContain('Escolha CPF ou CNPJ');
    });

    it('aceita número com tipo declarado', () => {
        const r = contractFormSchema.safeParse({
            ...contratoBase,
            documentType: 'cpf',
            documentNumber: '529.982.247-25',
        });
        expect(r.success).toBe(true);
    });

    it('recusa valor mensal negativo e não numérico', () => {
        expect(contractFormSchema.safeParse({ ...contratoBase, monthlyValue: '-5' }).success).toBe(false);
        expect(contractFormSchema.safeParse({ ...contratoBase, monthlyValue: 'abc' }).success).toBe(false);
        expect(contractFormSchema.safeParse({ ...contratoBase, monthlyValue: '' }).success).toBe(false);
        expect(contractFormSchema.safeParse({ ...contratoBase, monthlyValue: '0' }).success).toBe(true);
    });

    it('exige data de início', () => {
        expect(contractFormSchema.safeParse({ ...contratoBase, startsAt: '' }).success).toBe(false);
    });
});

describe('clientFormSchema', () => {
    it('aceita o caso mínimo, com saúde em branco', () => {
        const r = clientFormSchema.safeParse(clienteBase);
        expect(r.success).toBe(true);
    });

    // Saúde em branco é estado próprio: cliente novo ainda não foi avaliado,
    // e isso é diferente de zero, que significa churn.
    it('aceita saúde vazia e os dois extremos', () => {
        for (const v of ['', '0', '100']) {
            expect(clientFormSchema.safeParse({ ...clienteBase, healthScore: v }).success).toBe(true);
        }
    });

    it('recusa saúde fora de 0..100 e não inteira', () => {
        for (const v of ['101', '999', '-1', '12.5', 'abc']) {
            const r = clientFormSchema.safeParse({ ...clienteBase, healthScore: v });
            expect(r.success, `healthScore '${v}' deveria ser recusado`).toBe(false);
        }
    });

    it('exige nome e estágio válido', () => {
        expect(clientFormSchema.safeParse({ ...clienteBase, name: '' }).success).toBe(false);
        expect(
            clientFormSchema.safeParse({ ...clienteBase, lifecycleStage: 'inventado' }).success,
        ).toBe(false);
    });
});
