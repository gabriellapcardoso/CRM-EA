'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SelectField, SubmitButton } from '@/components/ui/FormField';
import { clientFormSchema, type ClientFormData } from '@/lib/validations/schemas';
import type { ClientView } from '@/types/clients';

type ClientFormInput = z.input<typeof clientFormSchema>;

const NICHOS = [
    { value: 'local', label: 'Negócio Local' },
    { value: 'ecommerce', label: 'E-commerce' },
    { value: 'infoproduto', label: 'Infoproduto' },
    { value: 'servicos_digitais', label: 'Serviços Digitais' },
    { value: 'politico_mandato', label: 'Político · Mandato' },
    { value: 'politico_eleitoral', label: 'Político · Eleitoral' },
];

const ESTAGIOS = [
    { value: 'lead', label: 'Lead' },
    { value: 'contrato_assinado', label: 'Contrato Assinado' },
    { value: 'kickoff', label: 'Kickoff' },
    { value: 'setup_concluido', label: 'Setup Concluído' },
    { value: 'em_operacao', label: 'Em Operação' },
    { value: 'churn', label: 'Churn' },
];

const CATEGORIAS = [
    { value: 'ouro', label: 'Ouro' },
    { value: 'prata', label: 'Prata' },
    { value: 'bronze', label: 'Bronze' },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (dados: ClientFormData) => void;
    clienteEmEdicao?: ClientView | null;
    salvando?: boolean;
    /** Mensagem da última tentativa que falhou. */
    erro?: string;
}

/**
 * Cadastro e edição do cliente.
 *
 * Campo vazio é gravado como vazio, nunca com o texto que a tela mostra
 * quando não há dado. "Setor não informado" é legenda de leitura; se virasse
 * valor inicial aqui, o primeiro salvamento transformaria texto de interface
 * em dado. Foi o que quase aconteceu com "Empresa não vinculada" no modal do
 * contato, em 2026-09-05.
 */
export const ClientFormModal: React.FC<Props> = ({
    isOpen,
    onClose,
    onSubmit,
    clienteEmEdicao,
    salvando,
    erro,
}) => {
    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<ClientFormInput>({
        resolver: zodResolver(clientFormSchema),
        defaultValues: { lifecycleStage: 'lead' },
    });

    React.useEffect(() => {
        if (!isOpen) return;
        reset({
            name: clienteEmEdicao?.name ?? '',
            niche: clienteEmEdicao?.niche ?? '',
            industry: clienteEmEdicao?.industry ?? '',
            website: clienteEmEdicao?.website ?? '',
            lifecycleStage: clienteEmEdicao?.lifecycleStage ?? 'lead',
            category: clienteEmEdicao?.category ?? '',
            healthScore:
                clienteEmEdicao?.healthScore === undefined
                    ? ''
                    : String(clienteEmEdicao.healthScore),
        });
    }, [isOpen, clienteEmEdicao, reset]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={clienteEmEdicao ? 'Editar Cliente' : 'Novo Cliente'}
        >
            <ModalForm onSubmit={handleSubmit(dados => onSubmit(clientFormSchema.parse(dados)))}>
                <InputField
                    label="Nome"
                    placeholder="Ex: Padaria do Bairro"
                    required
                    error={errors.name}
                    registration={register('name')}
                />

                <SelectField
                    label="Nicho"
                    options={NICHOS}
                    placeholder="Escolha o nicho"
                    error={errors.niche}
                    registration={register('niche')}
                />

                <InputField
                    label="Setor"
                    placeholder="Ex: Alimentação"
                    error={errors.industry}
                    registration={register('industry')}
                />

                <InputField
                    label="Site"
                    placeholder="padariadobairro.com.br"
                    error={errors.website}
                    registration={register('website')}
                />

                <SelectField
                    label="Estágio do Ciclo de Vida"
                    options={ESTAGIOS}
                    required
                    hint="Descreve a relação com a conta, não o estágio de nenhum negócio."
                    error={errors.lifecycleStage}
                    registration={register('lifecycleStage')}
                />

                <SelectField
                    label="Categoria"
                    options={CATEGORIAS}
                    placeholder="Sem categoria"
                    error={errors.category}
                    registration={register('category')}
                />

                <InputField
                    label="Saúde (0 a 100)"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Deixe em branco se ainda não avaliou"
                    hint="Pontuação preenchida pela agência. Não é pesquisa respondida pelo cliente."
                    error={errors.healthScore}
                    registration={register('healthScore')}
                />

                {erro && <p className="muted">Não foi possível salvar: {erro}</p>}

                <SubmitButton isLoading={!!salvando}>
                    {clienteEmEdicao ? 'Salvar' : 'Cadastrar Cliente'}
                </SubmitButton>
            </ModalForm>
        </Modal>
    );
};
