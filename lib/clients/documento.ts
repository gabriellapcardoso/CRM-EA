/**
 * CPF e CNPJ do contrato.
 *
 * O banco checa só o formato (`^[0-9]{11}$` / `^[0-9]{14}$`, migration
 * 20260905120000). Dígito verificador é aqui, de propósito: '11111111111'
 * passa no CHECK de tamanho e é inválido — a validação estrutural e a
 * aritmética são barreiras diferentes e as duas precisam existir.
 */

/** Tira tudo que não é dígito. É esta forma que vai pro banco. */
export function apenasDigitos(valor: string | null | undefined): string {
    return (valor ?? '').replace(/\D/g, '');
}

function digitosTodosIguais(digitos: string): boolean {
    return /^(\d)\1+$/.test(digitos);
}

export function cpfValido(valor: string | null | undefined): boolean {
    const d = apenasDigitos(valor);
    if (d.length !== 11 || digitosTodosIguais(d)) return false;

    const calcula = (ate: number): number => {
        let soma = 0;
        for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
    };

    return calcula(9) === Number(d[9]) && calcula(10) === Number(d[10]);
}

export function cnpjValido(valor: string | null | undefined): boolean {
    const d = apenasDigitos(valor);
    if (d.length !== 14 || digitosTodosIguais(d)) return false;

    const calcula = (ate: number): number => {
        let peso = ate - 7;
        let soma = 0;
        for (let i = 0; i < ate; i++) {
            soma += Number(d[i]) * peso;
            peso -= 1;
            if (peso < 2) peso = 9;
        }
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    return calcula(12) === Number(d[12]) && calcula(13) === Number(d[13]);
}

export function documentoValido(
    tipo: 'cpf' | 'cnpj' | null | undefined,
    valor: string | null | undefined,
): boolean {
    if (!tipo) return false;
    return tipo === 'cpf' ? cpfValido(valor) : cnpjValido(valor);
}

/** Formata para exibição. Nunca guardar o resultado disto no banco. */
export function formatarDocumento(
    tipo: 'cpf' | 'cnpj' | null | undefined,
    valor: string | null | undefined,
): string {
    const d = apenasDigitos(valor);
    if (tipo === 'cpf' && d.length === 11) {
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    if (tipo === 'cnpj' && d.length === 14) {
        return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    }
    return d;
}
