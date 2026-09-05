'use client';

/**
 * @fileoverview Detalhe do contato — página inteira, não gaveta.
 *
 * Antes o detalhe era o `.detail-pane` de 340px encostado na lista
 * (`ContactsPage`). Três problemas de uma vez, todos de layout:
 *
 * 1. os 340px saíam da mesma linha da tabela, então a lista perdia largura
 *    justo quando alguém queria ler um contato;
 * 2. o painel tinha rolagem própria, dentro da rolagem da página — no macOS a
 *    barra é overlay e some em repouso, então o que estava embaixo parecia não
 *    existir;
 * 3. não dava pra mandar o link de um contato pra ninguém: o estado vivia num
 *    `useState`, não na URL.
 *
 * Agora é `/contacts/[contactId]`, empilhado na vertical, reaproveitando o
 * mesmo vocabulário do cockpit do deal (`.cockpit`, `.section-card`,
 * `.field-grid`, `.timeline`). O `.detail-pane` continua no CSS porque o inbox
 * ainda usa — não usar em tela nova.
 *
 * @module features/contacts/detail/ContactDetailPage
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  useContact,
  useCompanies,
  useDealsView,
  useActivities,
  usePendingAdvancesQuery,
  useUpdateContact,
} from '@/lib/query/hooks';
import { normalizePhoneE164 } from '@/lib/phone';
import { ContactStage } from '@/types';
import { getInitials } from '@/features/boards/cardFormat';
import { StageBadge } from '../components/ContactsStageTabs';
import { resolverOrigemDoContato } from '@/lib/navigation/origem';

const ContactFormModal = dynamic(
  () => import('../components/ContactFormModal').then((m) => ({ default: m.ContactFormModal })),
  { ssr: false }
);
import type { Activity, DealView } from '@/types';

const DATA_LONGA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Ator da linha do tempo — mesma convenção do cockpit: roxo pra IA, limão só pra pendência. */
function atorDaAtividade(a: Activity): { classe: string; glifo: string } {
  if (a.type === 'STATUS_CHANGE') return { classe: 'actor actor--auto', glifo: '⚡' };
  if (a.type === 'CALL') return { classe: 'actor actor--humano', glifo: '☎' };
  if (a.type === 'EMAIL') return { classe: 'actor actor--ia', glifo: '✉' };
  return { classe: 'actor actor--humano', glifo: getInitials(a.user?.name || '—') };
}

/** Classe de estado do card de deal — nunca limão, que aqui significa "decida". */
function toneDoDeal(deal: DealView): string {
  if (deal.isLost) return ' card-deal-open--perdido';
  if (deal.isWon) return ' card-deal-open--ganho';
  return '';
}

/**
 * Componente React `ContactDetailPage` — tela cheia de um contato.
 *
 * @param contactId Id do contato vindo da rota.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function ContactDetailPage({ contactId }: { contactId: string }) {
  const router = useRouter();

  // Busca pelo id, não varredura da lista: `useContacts()` passa por `getAll()`,
  // que tem teto de 1000 linhas — um contato fora desse lote abriria esta página
  // dizendo "não encontrado" numa URL perfeitamente válida.
  const { data: contact = null, isLoading: carregandoContato, isError: erroNoContato } =
    useContact(contactId);
  const { data: companies = [], isError: erroNasEmpresas } = useCompanies();
  const { data: deals = [], isPending: carregandoDeals, isError: erroNosDeals } = useDealsView();
  const {
    data: activities = [],
    isPending: carregandoHistorico,
    isError: erroNoHistorico,
  } = useActivities();
  const { data: pendingAdvances = [] } = usePendingAdvancesQuery({ status: 'pending' });

  // Voltar contextual: esta tela é alcançável pela lista E pelo cockpit de um
  // deal ("ver contato completo"), então o destino sai do `?from=`.
  const searchParams = useSearchParams();
  const origem = React.useMemo(
    () => resolverOrigemDoContato(searchParams?.get('from'), searchParams?.get('fromId')),
    [searchParams]
  );

  /**
   * Nome da empresa. `useCompanies()` passa por um `limit(1000)`
   * (`lib/supabase/contacts.ts`), então "não achei na lista" e "o contato não
   * tem empresa" são coisas diferentes — dizer "Empresa não vinculada" pra uma
   * empresa que existe é afirmação errada. Sem o nome, mostra o estado real.
   */
  const companyName = React.useMemo(() => {
    if (!contact?.clientCompanyId) return 'Empresa não vinculada';
    const achada = companies.find((c) => c.id === contact.clientCompanyId)?.name;
    if (achada) return achada;
    return erroNasEmpresas ? 'empresa não carregou' : 'empresa fora do lote carregado';
  }, [companies, contact?.clientCompanyId, erroNasEmpresas]);

  const dealsDoContato = React.useMemo(
    () => deals.filter((d) => d.contactId === contactId),
    [deals, contactId]
  );

  const valorEmAberto = React.useMemo(
    () => dealsDoContato.reduce((soma, d) => (d.isWon || d.isLost ? soma : soma + (d.value || 0)), 0),
    [dealsDoContato]
  );

  const pendencia = React.useMemo(() => {
    if (dealsDoContato.length === 0) return null;
    const ids = new Set(dealsDoContato.map((d) => d.id));
    return pendingAdvances.find((a) => ids.has(a.deal_id)) ?? null;
  }, [dealsDoContato, pendingAdvances]);

  /**
   * Histórico: atividades do contato E dos deals dele, mais recente primeiro.
   *
   * `useActivities()` e `useDealsView()` param em 1000 linhas cada
   * (`lib/supabase/activities.ts`, `lib/supabase/deals.ts`). Numa base grande o
   * histórico sai truncado sem avisar. Registrado no `TODOS.md`; hoje a base
   * está muito abaixo do teto.
   */
  const historico = React.useMemo(() => {
    const idsDeDeal = new Set(dealsDoContato.map((d) => d.id));
    return activities
      .filter((a) => a.contactId === contactId || idsDeDeal.has(a.dealId))
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activities, contactId, dealsDoContato]);

  /**
   * Edição no lugar. A gaveta de 340px tinha esse botão e ele se perdeu na
   * mudança pra página — capacidade que existia e sumiu sem ninguém pedir.
   *
   * O `ContactFormModal` é apresentacional (recebe formData/onSubmit de fora),
   * então dá pra reusar sem arrastar o `useContactsController` inteiro, que
   * carrega paginação, filtros e a lista toda de contatos.
   */
  const updateContact = useUpdateContact();
  const [editando, setEditando] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    companyName: '',
    stage: ContactStage.LEAD,
  });

  const abrirEdicao = React.useCallback(() => {
    if (!contact) return;
    setFormData({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role || '',
      companyName: companyName,
      stage: (contact.stage as ContactStage) || ContactStage.LEAD,
    });
    setEditando(true);
  }, [contact, companyName]);

  const salvarEdicao = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!contact) return;
      // `companyName` fica de fora de propósito: vincular contato a empresa
      // cria/associa registro em `crm_companies`, o que é trabalho do
      // controller da lista. Aqui só os campos do próprio contato.
      await updateContact.mutateAsync({
        id: contact.id,
        updates: {
          name: formData.name,
          email: formData.email,
          phone: normalizePhoneE164(formData.phone) || formData.phone,
          role: formData.role,
          stage: formData.stage,
        },
      });
      setEditando(false);
    },
    [contact, formData, updateContact]
  );

  const dono = React.useMemo(
    () => dealsDoContato.find((d) => d.owner?.name)?.owner?.name ?? null,
    [dealsDoContato]
  );

  if (!contact) {
    return (
      <div className="screen__inner screen__inner--narrow">
        <section className="panel">
          <div className="panel__body">
            <div className="state-empty">
              {/* Três estados distintos, três textos. Antes qualquer falha de
                  rede virava "não encontrado", que é afirmação sobre o dado —
                  a pessoa concluiria que o contato foi excluído. */}
              <h3 className="state-empty__title">
                {carregandoContato
                  ? 'carregando contato…'
                  : erroNoContato
                    ? 'não deu pra carregar este contato'
                    : 'contato não encontrado'}
              </h3>
              {erroNoContato ? (
                <p className="state-empty__text">
                  a busca falhou. recarregue a página; se persistir, o problema é de conexão
                  com o banco, não do contato.
                </p>
              ) : !carregandoContato ? (
                <p className="state-empty__text">
                  ele pode ter sido excluído, ou o link aponta pra outra organização.
                </p>
              ) : null}
              <p className="state-empty__actions">
                <Link className="btn btn--primary" href="/contacts">
                  voltar pra contatos
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="cockpit">
      <header className="cockpit__head">
        <div className="cockpit__head-top">
          <Link className="back-link" href={origem.href}>
            {origem.label}
          </Link>
          <span className="avatar avatar--purple avatar--md" aria-hidden="true">
            {getInitials(contact.name)}
          </span>
          <h2 className="cockpit__title" title={contact.name}>
            {contact.name}
          </h2>
          <StageBadge stage={contact.stage} />
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => router.push(`/messaging?contactId=${contact.id}`)}
          >
            abrir conversa
          </button>
          <button type="button" className="btn btn--ghost" onClick={abrirEdicao}>
            editar
          </button>
        </div>
        <p className="meta">
          {companyName}
          {contact.role ? ` · ${contact.role}` : ''}
          {dono ? ` · dono: ${dono}` : ''}
        </p>
      </header>

      <div className="cockpit__body">
        <div className="section-head">
          <span className="section-head__swatch section-head__swatch--contato" aria-hidden="true" />
          <h3 className="section-head__title">dados do contato</h3>
        </div>
        <section className="section-card">
          <dl className="field-grid">
            <div className="field">
              <dt className="field__label">WhatsApp</dt>
              <dd className="field__value num">{contact.phone || '—'}</dd>
            </div>
            <div className="field">
              <dt className="field__label">e-mail</dt>
              <dd className="field__value">{contact.email || '—'}</dd>
            </div>
            <div className="field">
              <dt className="field__label">empresa</dt>
              <dd className="field__value">{companyName}</dd>
            </div>
            <div className="field">
              <dt className="field__label">cargo</dt>
              <dd className="field__value">{contact.role || '—'}</dd>
            </div>
            <div className="field">
              <dt className="field__label">origem</dt>
              <dd className="field__value">{contact.source ?? '—'}</dd>
            </div>
            <div className="field">
              <dt className="field__label">status</dt>
              <dd className="field__value">{contact.status}</dd>
            </div>
            <div className="field">
              <dt className="field__label">dono</dt>
              <dd className="field__value">{dono ?? '—'}</dd>
            </div>
            <div className="field">
              <dt className="field__label">criado em</dt>
              <dd className="field__value">{DATA_LONGA.format(new Date(contact.createdAt))}</dd>
            </div>
          </dl>
          {contact.notes?.trim() ? (
            <p className="section-card__split meta">{contact.notes}</p>
          ) : null}
        </section>

        {pendencia && (
          <>
            <div className="section-head">
              <span className="section-head__swatch section-head__swatch--hitl" aria-hidden="true" />
              <h3 className="section-head__title">aguardando sua decisão</h3>
            </div>
            <section className="card-hitl">
              <div className="card-hitl__head">
                <span className="dot dot--pulse" />
                <h4 className="card-hitl__title">
                  avanço de estágio sugerido · conf. {pendencia.confidence.toFixed(2)}
                </h4>
              </div>
              <div className="card-hitl__inner">
                <p>{pendencia.reason}</p>
              </div>
              <p className="card-hitl__actions">
                <Link className="btn btn--on-lime" href="/decisions">
                  revisar decisão
                </Link>
              </p>
            </section>
          </>
        )}

        <div className="section-head">
          <span className="section-head__swatch section-head__swatch--passos" aria-hidden="true" />
          <h3 className="section-head__title">deals deste contato</h3>
          <p className="section-head__note">
            {dealsDoContato.length === 0
              ? 'nenhum deal ainda'
              : `${dealsDoContato.length} deal${dealsDoContato.length > 1 ? 's' : ''} · ${MOEDA.format(valorEmAberto)} em aberto`}
          </p>
        </div>
        {dealsDoContato.length > 0 ? (
          <div className="deal-grid">
            {dealsDoContato.map((deal) => (
              <Link
                key={deal.id}
                className={`card-deal-open${toneDoDeal(deal)}`}
                href={`/deals/${deal.id}/cockpit-v2?from=contato&fromId=${contact.id}`}
              >
                <span className="card-deal-open__head">
                  <span className="card-deal-open__title">{deal.title}</span>
                  <span className="card-deal-open__value num">{MOEDA.format(deal.value || 0)}</span>
                </span>
                <span className="card-deal-open__meta">
                  <span className="badge-stage">
                    {deal.isLost ? 'Perdido' : deal.isWon ? 'Ganho' : deal.stageLabel}
                  </span>
                </span>
                <span className="card-deal-open__cta">abrir cockpit do deal →</span>
              </Link>
            ))}
          </div>
        ) : (
          <section className="section-card">
            {/* "nenhum deal" é afirmação sobre o dado. Enquanto a lista carrega,
                ou se ela falhou, a tela não sabe disso — e dizer que não há deal
                faz a pessoa concluir que o contato está parado. */}
            <p className="meta">
              {carregandoDeals
                ? 'carregando deals…'
                : erroNosDeals
                  ? 'os deals não carregaram. recarregue a página.'
                  : 'nenhum deal vinculado. crie um pela lista de contatos, no botão de mesmo nome.'}
            </p>
          </section>
        )}

        <div className="section-head">
          <span className="section-head__swatch section-head__swatch--tempo" aria-hidden="true" />
          <h3 className="section-head__title">histórico do contato</h3>
          <p className="section-head__note">conversas, IA e movimentações</p>
        </div>
        <section className="section-card section-card--flush">
          {historico.length === 0 ? (
            <p className="meta" style={{ padding: 'var(--space-3) 0' }}>
              {carregandoHistorico
                ? 'carregando histórico…'
                : erroNoHistorico
                  ? 'o histórico não carregou. recarregue a página.'
                  : 'nada registrado ainda.'}
            </p>
          ) : (
            <ul className="timeline">
              {historico.map((a) => {
                const ator = atorDaAtividade(a);
                return (
                  <li className="timeline__item" key={a.id}>
                    <span className={ator.classe} aria-hidden="true">
                      {ator.glifo}
                    </span>
                    <div className="timeline__body">
                      <p className="timeline__text">{a.title || a.type}</p>
                      <p className="timeline__meta">
                        {a.dealTitle ? `${a.dealTitle} · ` : ''}
                        {DATA_HORA.format(new Date(a.date))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <ContactFormModal
        isOpen={editando}
        onClose={() => setEditando(false)}
        onSubmit={salvarEdicao}
        formData={formData}
        setFormData={setFormData}
        editingContact={contact}
        isSubmitting={updateContact.isPending}
      />
    </div>
  );
}
