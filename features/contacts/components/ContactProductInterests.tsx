import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { formatBRL } from '@/lib/utils/formatCurrency';
import {
  useContactProductInterests,
  useCreateContactProductInterest,
  useDeleteContactProductInterest,
  useActiveProducts,
} from '@/lib/query/hooks';
import { useToast } from '@/context/ToastContext';

interface ContactProductInterestsProps {
  contactId: string;
}

/**
 * Seção da ficha do contato: lista, adiciona e remove interesses de produto
 * (contact_product_interests) — sinal de intenção antes do contato virar
 * deal. Interesses já convertidos (converted_at preenchido) aparecem como
 * histórico somente-leitura; a conversão em si acontece via
 * `convert_contact_to_deal` no momento de criar o negócio.
 */
export const ContactProductInterests: React.FC<ContactProductInterestsProps> = ({ contactId }) => {
  const { addToast } = useToast();
  const { data: interests = [], isLoading } = useContactProductInterests(contactId);
  const { data: products = [] } = useActiveProducts();
  const createMutation = useCreateContactProductInterest();
  const deleteMutation = useDeleteContactProductInterest();

  const [selectedProductId, setSelectedProductId] = useState('');
  const [observacao, setObservacao] = useState('');

  const pending = interests.filter(i => !i.convertedAt);
  const converted = interests.filter(i => i.convertedAt);

  const availableProducts = products.filter(
    p => !pending.some(i => i.productId === p.id)
  );

  const handleAdd = () => {
    if (!selectedProductId) return;

    createMutation.mutate(
      { contactId, productId: selectedProductId, observacao: observacao.trim() || undefined },
      {
        onSuccess: () => {
          setSelectedProductId('');
          setObservacao('');
          addToast('Interesse registrado', 'success');
        },
        onError: (error: Error) => {
          addToast(`Erro ao registrar interesse: ${error.message}`, 'error');
        },
      }
    );
  };

  const handleRemove = (id: string) => {
    deleteMutation.mutate(
      { id, contactId },
      {
        onSuccess: () => {
          addToast('Interesse removido', 'success');
        },
        onError: (error: Error) => {
          addToast(`Erro ao remover interesse: ${error.message}`, 'error');
        },
      }
    );
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
        Interesses de Produto
      </label>

      {isLoading ? (
        <p className="text-xs text-slate-400">Carregando...</p>
      ) : (
        <>
          {pending.length > 0 && (
            <ul className="space-y-1 mb-2">
              {pending.map(interest => (
                <li
                  key={interest.id}
                  className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-slate-900 dark:text-white truncate">
                      {interest.productName} <span className="text-slate-400">· {formatBRL(interest.productPrice)}</span>
                    </p>
                    {interest.observacao && (
                      <p className="text-xs text-slate-400 truncate">{interest.observacao}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(interest.id)}
                    disabled={deleteMutation.isPending}
                    aria-label={`Remover interesse em ${interest.productName}`}
                    className="text-slate-400 hover:text-red-500 focus-visible-ring rounded shrink-0"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {converted.length > 0 && (
            <details className="mb-2">
              <summary className="text-xs text-slate-400 cursor-pointer select-none">
                {converted.length} já convertido(s) em negócio
              </summary>
              <ul className="space-y-1 mt-1">
                {converted.map(interest => (
                  <li
                    key={interest.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-slate-400"
                  >
                    <span className="truncate">{interest.productName}</span>
                    <span className="shrink-0 bg-slate-100 dark:bg-white/5 rounded px-1.5 py-0.5">convertido</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {pending.length === 0 && converted.length === 0 && (
            <p className="text-xs text-slate-400 mb-2">Nenhum interesse registrado ainda.</p>
          )}

          {availableProducts.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                aria-label="Selecionar produto"
                className="flex-1 min-w-0 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Selecione um produto...</option>
                {availableProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatBRL(p.price)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!selectedProductId || createMutation.isPending}
                aria-label="Adicionar interesse"
                className="shrink-0 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3 flex items-center justify-center"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              {products.length === 0 ? 'Nenhum produto ativo no catálogo.' : 'Todos os produtos ativos já têm interesse registrado.'}
            </p>
          )}
          {selectedProductId && (
            <input
              type="text"
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Observação (opcional)"
              aria-label="Observação sobre o interesse"
              className="w-full mt-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
            />
          )}
        </>
      )}
    </div>
  );
};
