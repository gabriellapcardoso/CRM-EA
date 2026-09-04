/**
 * Guardas do texto do toggle "IA ativa na organização".
 *
 * O texto anterior era "Quando desligado, recursos de IA ficam indisponíveis
 * para toda a equipe" — verdade, e vago o bastante para ninguém associar ao
 * WhatsApp. Em 2026-09-03 esta chave foi desligada e leads ficaram horas sem
 * resposta: a mensagem entrava, contato e negócio eram criados, a conversa
 * aparecia no inbox, e nada indicava o porquê.
 *
 * Copy de consequência é comportamento, não decoração: é o que separa um toggle
 * de uma armadilha. Por isso tem teste — para alguém "simplificando" o texto
 * depois não apagar o WhatsApp dele sem perceber.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let aiOrgEnabled = true;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ profile: { role: 'admin' } }),
}));

vi.mock('@/lib/query/hooks/useOrgSettingsQuery', () => ({
  useOrgSettings: () => ({ data: { aiOrgEnabled } }),
  useUpdateAISettings: () => ({ mutate: vi.fn() }),
}));

// As seções filhas puxam rede e outros contextos; o alvo aqui é só o bloco do
// toggle, no topo da página.
vi.mock('./components/AIConfigSection', () => ({ AIConfigSection: () => null }));
vi.mock('./components/ai/AIAgentConfigSection', () => ({ AIAgentConfigSection: () => null }));
vi.mock('./components/ai/TelegramNotificationSettings', () => ({ TelegramNotificationSettings: () => null }));
vi.mock('./components/AIFeaturesSection', () => ({ AIFeaturesSection: () => null }));

import { AICenterSettings } from './AICenterSettings';

describe('toggle "IA ativa na organização"', () => {
  it('a descrição nomeia o WhatsApp — não basta dizer "recursos de IA"', () => {
    aiOrgEnabled = true;
    render(<AICenterSettings />);

    const descricao = screen.getByText(/Desliga a IA inteira da organização/i);
    expect(descricao.textContent).toMatch(/WhatsApp/i);
  });

  it('a descrição deixa claro que o alcance passa desta tela', () => {
    aiOrgEnabled = true;
    render(<AICenterSettings />);

    expect(screen.getByText(/não só desta tela/i)).toBeInTheDocument();
  });

  it('desligado, mostra a consequência concreta pra quem está olhando', () => {
    aiOrgEnabled = false;
    render(<AICenterSettings />);

    const aviso = screen.getByRole('status');
    expect(aviso.textContent).toMatch(/A IA está desligada/i);
    // O ponto do aviso é dizer que o silêncio é invisível — sem isso, ele só
    // repete o que o toggle já mostra.
    expect(aviso.textContent).toMatch(/não recebe resposta/i);
    expect(aviso.textContent).toMatch(/Nada no inbox indica isso/i);
  });

  it('ligado, o aviso não aparece', () => {
    aiOrgEnabled = true;
    render(<AICenterSettings />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
