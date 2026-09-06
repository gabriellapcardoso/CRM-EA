'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { InputField, SelectField, SubmitButton } from '@/components/ui/FormField';
import { contractFormSchema, type ContractFormData } from '@/lib/validations/schemas';
import { apenasDigitos, documentoValido, formatarDocumento } from '@/lib/clients/documento';
import type { ClientContract } from '@/types/clients';

type ContractFormInput = z.input<typeof contractFormSchema>;

const STATUS = [
    { value: 'rascunho', label: 'Rascunho' },
    { value: 'vigente', label: 'Vigente' },
    { value: 'encerrado', label: 'Encerrado' },
];

const TIPOS_DOC = [
    { value: 'cnpj', label: 'CNPJ' },
    { value: 'cpf', label: 'CPF' },
];

interface Props {
    contrato?: ClientContract | null;
    salvando?: boolean;
    onSubmit: (dados: ContractFormData) => void;
}

/**
 * Contrato do cliente: valor, vigência, dados cadastrais e endereço.
 *
 * O documento é guardado só com dígitos; a formatação é de exibição e nunca
 * volta pro banco. O dígito verificador é conferido aqui — o CHECK do banco
 * valida só o tamanho, então '11111111111' passa lá e é inválido.
 */
export const ContractForm: React.FC<Props> = ({ contrato, salvando, onSubmit }) => {
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
        reset,
        setError,
    } = useForm<ContractFormInput>({
        resolver: zodResolver(contractFormSchema),
        defaultValues: { status: 'rascunho', monthlyValue: '0' },
    });

    React.useEffect(() => {
        reset({
            monthlyValue: String(contrato?.monthlyValue ?? 0),
            startsAt: contrato?.startsAt ?? '',
            endsAt: contrato?.endsAt ?? '',
            renewalDate: contrato?.renewalDate ?? '',
            status: contrato?.status ?? 'rascunho',
            paymentMethod: contrato?.paymentMethod ?? '',
            documentType: contrato?.documentType ?? '',
            documentNumber: formatarDocumento(contrato?.documentType, contrato?.documentNumber),
            addressZip: contrato?.addressZip ?? '',
            addressStreet: contrato?.addressStreet ?? '',
            addressNumber: contrato?.addressNumber ?? '',
            addressComplement: contrato?.addressComplement ?? '',
            addressDistrict: contrato?.addressDistrict ?? '',
            addressCity: contrato?.addressCity ?? '',
            addressState: contrato?.addressState ?? '',
        });
    }, [contrato, reset]);

    const tipoDoc = watch('documentType');

    const enviar = (bruto: ContractFormInput) => {
        const dados = contractFormSchema.parse(bruto);
        const digitos = apenasDigitos(dados.documentNumber);

        if (digitos && !documentoValido(dados.documentType || undefined, digitos)) {
            setError('documentNumber', {
                message: `${(dados.documentType || '').toUpperCase()} inválido — confira os dígitos`,
            });
            return;
        }

        onSubmit({ ...dados, documentNumber: digitos });
    };

    return (
        <form onSubmit={handleSubmit(enviar)} className="field-grid">
            <InputField
                label="Valor Mensal (R$)"
                type="number"
                step="0.01"
                min={0}
                required
                error={errors.monthlyValue}
                registration={register('monthlyValue')}
            />
            <SelectField
                label="Situação"
                options={STATUS}
                required
                hint="Só um contrato pode estar vigente por cliente."
                error={errors.status}
                registration={register('status')}
            />
            <InputField
                label="Início"
                type="date"
                required
                error={errors.startsAt}
                registration={register('startsAt')}
            />
            <InputField
                label="Término"
                type="date"
                error={errors.endsAt}
                registration={register('endsAt')}
            />
            <InputField
                label="Renovação"
                type="date"
                hint="Alimenta o alerta de 90 dias no painel."
                error={errors.renewalDate}
                registration={register('renewalDate')}
            />
            <InputField
                label="Forma de Pagamento"
                placeholder="Ex: Pix mensal"
                error={errors.paymentMethod}
                registration={register('paymentMethod')}
            />

            <SelectField
                label="Tipo de Documento"
                options={TIPOS_DOC}
                placeholder="Não informado"
                error={errors.documentType}
                registration={register('documentType')}
            />
            <InputField
                label={tipoDoc === 'cpf' ? 'CPF' : 'CNPJ'}
                placeholder={tipoDoc === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                error={errors.documentNumber}
                registration={register('documentNumber')}
            />

            <InputField
                label="CEP"
                error={errors.addressZip}
                registration={register('addressZip')}
            />
            <InputField
                label="Logradouro"
                error={errors.addressStreet}
                registration={register('addressStreet')}
            />
            <InputField
                label="Número"
                error={errors.addressNumber}
                registration={register('addressNumber')}
            />
            <InputField
                label="Complemento"
                error={errors.addressComplement}
                registration={register('addressComplement')}
            />
            <InputField
                label="Bairro"
                error={errors.addressDistrict}
                registration={register('addressDistrict')}
            />
            <InputField
                label="Cidade"
                error={errors.addressCity}
                registration={register('addressCity')}
            />
            <InputField
                label="UF"
                maxLength={2}
                error={errors.addressState}
                registration={register('addressState')}
            />

            <div style={{ gridColumn: '1 / -1' }}>
                <SubmitButton isLoading={!!salvando}>
                    {contrato ? 'Salvar Contrato' : 'Cadastrar Contrato'}
                </SubmitButton>
            </div>
        </form>
    );
};
