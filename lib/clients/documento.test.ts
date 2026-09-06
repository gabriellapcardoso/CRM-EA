// Os números usados aqui são os exemplos canônicos de CPF e CNPJ que toda
// biblioteca de validação brasileira usa em documentação: algoritmicamente
// válidos e sem vínculo com pessoa nenhuma. Nenhum documento real entra em teste.
import { describe, expect, it } from 'vitest';
import {
    apenasDigitos,
    cnpjValido,
    cpfValido,
    documentoValido,
    formatarDocumento,
} from './documento';

describe('apenasDigitos', () => {
    it('tira máscara, espaço e nulo', () => {
        expect(apenasDigitos('529.982.247-25')).toBe('52998224725');
        expect(apenasDigitos('11.222.333/0001-81')).toBe('11222333000181');
        expect(apenasDigitos(null)).toBe('');
        expect(apenasDigitos(undefined)).toBe('');
    });
});

describe('cpfValido', () => {
    it('aceita CPF válido, com e sem máscara', () => {
        expect(cpfValido('529.982.247-25')).toBe(true);
        expect(cpfValido('52998224725')).toBe(true);
    });

    // O CHECK do banco confere só o tamanho (`^[0-9]{11}$`), então estes
    // passam lá. A aritmética do dígito verificador é o que os pega — as duas
    // barreiras existem porque nenhuma sozinha cobre o caso.
    it('rejeita os repetidos, que passam no CHECK de tamanho do banco', () => {
        for (const d of ['00000000000', '11111111111', '99999999999']) {
            expect(cpfValido(d)).toBe(false);
        }
    });

    it('rejeita dígito verificador errado e tamanho errado', () => {
        expect(cpfValido('52998224724')).toBe(false);
        expect(cpfValido('5299822472')).toBe(false);
        expect(cpfValido('')).toBe(false);
    });
});

describe('cnpjValido', () => {
    it('aceita CNPJ válido, com e sem máscara', () => {
        expect(cnpjValido('11.222.333/0001-81')).toBe(true);
        expect(cnpjValido('11222333000181')).toBe(true);
    });

    it('rejeita os repetidos e o dígito errado', () => {
        expect(cnpjValido('11111111111111')).toBe(false);
        expect(cnpjValido('11222333000182')).toBe(false);
        expect(cnpjValido('1122233300018')).toBe(false);
    });
});

describe('documentoValido', () => {
    it('cobra o tipo antes do número', () => {
        expect(documentoValido(undefined, '52998224725')).toBe(false);
        expect(documentoValido('cpf', '52998224725')).toBe(true);
        // Número de CNPJ declarado como CPF é inválido: o tipo faz parte do dado.
        expect(documentoValido('cpf', '11222333000181')).toBe(false);
        expect(documentoValido('cnpj', '11222333000181')).toBe(true);
    });
});

describe('formatarDocumento', () => {
    it('formata só pra exibição e devolve dígitos quando não dá', () => {
        expect(formatarDocumento('cpf', '52998224725')).toBe('529.982.247-25');
        expect(formatarDocumento('cnpj', '11222333000181')).toBe('11.222.333/0001-81');
        expect(formatarDocumento('cpf', '529')).toBe('529');
        expect(formatarDocumento(undefined, '52998224725')).toBe('52998224725');
    });
});
