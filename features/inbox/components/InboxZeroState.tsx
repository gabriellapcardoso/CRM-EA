import React from 'react';

/**
 * Estado vazio do inbox no vocabulário `.state-empty` do redesign
 * (mesmo texto/tom do mock `inbox--vazio.html`).
 */
export const InboxZeroState: React.FC = () => {
  return (
    <div className="state-empty">
      <h2 className="state-empty__title">
        inbox zerada<span className="dot-accent">.</span>
      </h2>
      <p className="state-empty__text">
        você zerou tudo — nada atrasado, nada pra hoje e nenhuma sugestão pendente.
        aproveite o momento ou planeje o futuro.
      </p>
    </div>
  );
};

