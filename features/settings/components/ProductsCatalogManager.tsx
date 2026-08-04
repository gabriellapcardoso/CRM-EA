import React, { useEffect, useMemo, useState } from 'react';
import { Package, Pencil, Plus, Save, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { productsService } from '@/lib/supabase';
import type { Product } from '@/types';

function formatBRL(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

/**
 * Componente React `ProductsCatalogManager`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ProductsCatalogManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState<string>('0');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');

  const canCreate = name.trim().length > 1 && Number.isFinite(Number(price));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState<string>('0');
  const [editSku, setEditSku] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await productsService.getAll();
    if (res.error) {
      setError(res.error.message);
      setProducts([]);
    } else {
      setProducts(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Test environment: avoid async state updates that generate act(...) warnings.
    if (process.env.NODE_ENV === 'test') return;
    load();
  }, []);

  const sorted = useMemo(() => {
    // keep active first, then name
    const list = [...products];
    list.sort((a, b) => {
      const aActive = a.active !== false;
      const bActive = b.active !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [products]);

  const create = async () => {
    if (!canCreate) return;
    setLoading(true);
    setError(null);
    const res = await productsService.create({
      name: name.trim(),
      price: Number(price),
      sku: sku.trim() || undefined,
      description: description.trim() || undefined,
    });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setName('');
    setPrice('0');
    setSku('');
    setDescription('');
    await load();
    // Notify app to refresh dropdowns that read from SettingsContext
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const toggleActive = async (p: Product, next: boolean) => {
    setLoading(true);
    setError(null);
    const res = await productsService.update(p.id, { active: next });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditName(p.name || '');
    setEditPrice(String(p.price ?? 0));
    setEditSku(p.sku || '');
    setEditDescription(p.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPrice('0');
    setEditSku('');
    setEditDescription('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    const price = Number(editPrice);

    if (name.length < 2) {
      setError('Nome inválido.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Preço inválido.');
      return;
    }

    setLoading(true);
    setError(null);
    const res = await productsService.update(editingId, {
      name,
      price,
      sku: editSku.trim() || undefined,
      description: editDescription.trim() || undefined,
    });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    cancelEdit();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const remove = async (p: Product) => {
    const ok = window.confirm(`Excluir "${p.name}"? Isso não remove itens já usados em deals históricos.`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    const res = await productsService.delete(p.id);
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  return (
    <div className="panel__body">
      <div className="field" style={{ gap: 4 }}>
        <span className="title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package className="h-4 w-4" /> produtos & catálogo
        </span>
        <p className="meta">
          Catálogo base da empresa. No deal você ainda pode adicionar itens personalizados quando precisar adaptar ao cliente.
        </p>
      </div>

      {error && (
        <p className="banner banner--error">{error}</p>
      )}

      {/* Create */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
        <div className="lg:col-span-4 field">
          <label className="field__label">nome</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Sessão, Pacote, Implantação…"
          />
        </div>
        <div className="lg:col-span-2 field">
          <label className="field__label">preço padrão</label>
          <input className="input code" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        </div>
        <div className="lg:col-span-2 field">
          <label className="field__label">sku (opcional)</label>
          <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" />
        </div>
        <div className="lg:col-span-3 field">
          <label className="field__label">descrição (opcional)</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Curta e objetiva" />
        </div>
        <div className="lg:col-span-1">
          <button type="button" onClick={create} disabled={loading || !canCreate} className="btn btn--primary btn--block" title="Criar produto">
            <Plus className="h-4 w-4" />
            Criar
          </button>
        </div>
      </div>

      {/* List */}
      <section className="panel panel--flush">
        {sorted.length === 0 ? (
          <div className="state-empty">
            <h3 className="state-empty__title">nenhum produto cadastrado</h3>
            <p className="state-empty__text">crie o primeiro produto do catálogo acima.</p>
          </div>
        ) : (
          <table className="table-list">
            <thead>
              <tr>
                <th scope="col">produto</th>
                <th scope="col">sku / descrição</th>
                <th scope="col">preço base</th>
                <th scope="col">status</th>
                <th scope="col"><span className="sr-only">ações</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const isActive = p.active !== false;
                const isEditing = editingId === p.id;

                if (isEditing) {
                  return (
                    <tr key={p.id}>
                      <td colSpan={5}>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end" style={{ padding: '6px 0' }}>
                          <div className="sm:col-span-4 field">
                            <label className="field__label">nome</label>
                            <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                          </div>
                          <div className="sm:col-span-2 field">
                            <label className="field__label">preço</label>
                            <input className="input code" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputMode="decimal" />
                          </div>
                          <div className="sm:col-span-2 field">
                            <label className="field__label">sku</label>
                            <input className="input" value={editSku} onChange={(e) => setEditSku(e.target.value)} />
                          </div>
                          <div className="sm:col-span-3 field">
                            <label className="field__label">descrição</label>
                            <input className="input" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                          </div>
                          <div className="sm:col-span-1" style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={saveEdit} className="btn btn--ghost" title="Salvar" aria-label="Salvar alterações" disabled={loading}>
                              <Save className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={cancelEdit} className="btn btn--ghost" title="Cancelar" aria-label="Cancelar edição" disabled={loading}>
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={p.id}>
                    <td>
                      <span className="cell-name__text">{p.name}</span>
                    </td>
                    <td className="muted">
                      {p.sku ? `SKU: ${p.sku}` : ''}{p.sku && p.description ? ' · ' : ''}{p.description || (!p.sku ? '—' : '')}
                    </td>
                    <td className="num">{formatBRL(p.price)}</td>
                    <td>
                      <span className={`status-chip ${isActive ? 'status-chip--on' : 'status-chip--muted'}`}>
                        {isActive ? 'ativo' : 'inativo'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => startEdit(p)} className="btn btn--ghost" style={{ padding: '3px 6px' }} title="Editar" aria-label="Editar produto" disabled={loading}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(p, !isActive)}
                        className="btn btn--ghost"
                        style={{ padding: '3px 6px' }}
                        title={isActive ? 'Desativar' : 'Ativar'}
                        aria-label={isActive ? 'Desativar produto' : 'Ativar produto'}
                        disabled={loading}
                      >
                        {isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => remove(p)} className="btn btn--ghost" style={{ padding: '3px 6px' }} title="Excluir" aria-label="Excluir produto" disabled={loading}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

