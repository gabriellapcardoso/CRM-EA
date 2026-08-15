import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { WhatsAppSafetySection } from './WhatsAppSafetySection';

describe('WhatsAppSafetySection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!init || init.method === undefined) {
          return {
            ok: true,
            json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
          } as Response;
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carrega o estado atual do kill switch e do e-mail de alerta', async () => {
    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /kill switch/i })).toHaveAttribute('data-state', 'unchecked');
    });
    expect(screen.getByLabelText(/e-mail de alerta/i)).toHaveValue('');
  });

  it('mostra o kill switch ativo quando a API retorna true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ killSwitchActive: true, alertEmail: 'ops@aaagencia.com.br', autoSendProposalWhatsapp: false }),
      }))
    );

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /kill switch/i })).toHaveAttribute('data-state', 'checked');
    });
    expect(screen.getByLabelText(/e-mail de alerta/i)).toHaveValue('ops@aaagencia.com.br');
  });

  it('mostra o envio automático de proposta ativo quando a API retorna true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: true }),
      }))
    );

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /enviar proposta automaticamente/i })).toHaveAttribute(
        'data-state',
        'checked'
      );
    });
  });

  it('ativa o kill switch e envia POST com killSwitchActive=true', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /kill switch/i })).toHaveAttribute('data-state', 'unchecked');
    });

    fireEvent.click(screen.getByRole('switch', { name: /kill switch/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ killSwitchActive: true });
    });
  });

  it('ativa o envio automático de proposta por WhatsApp e envia POST com autoSendProposalWhatsapp=true', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    const autoSendSwitch = await screen.findByRole('switch', { name: /enviar proposta automaticamente/i });
    await waitFor(() => {
      expect(autoSendSwitch).toHaveAttribute('data-state', 'unchecked');
    });

    fireEvent.click(autoSendSwitch);

    fireEvent.click(await screen.findByRole('button', { name: /^ligar$/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ autoSendProposalWhatsapp: true });
    });
  });

  it('salva o e-mail de alerta ao clicar em salvar', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByLabelText(/e-mail de alerta/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/e-mail de alerta/i), {
      target: { value: 'fundadora@aaagencia.com.br' },
    });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ alertEmail: 'fundadora@aaagencia.com.br' });
    });
  });

  it('reverte o kill switch na tela se o POST falhar', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      }
      return { ok: false, json: async () => ({ error: 'Erro ao salvar' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /kill switch/i })).toHaveAttribute('data-state', 'unchecked');
    });

    fireEvent.click(screen.getByRole('switch', { name: /kill switch/i }));

    // Otimista: liga na hora do clique...
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /kill switch/i })).toHaveAttribute('data-state', 'checked');
    });

    // ...mas volta pro estado anterior quando o POST falha.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /kill switch/i })).toHaveAttribute('data-state', 'unchecked');
    });
  });

  it('cancela o envio automático de proposta: fecha o dialog, não envia POST e mantém o switch desligado', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    const autoSendSwitch = await screen.findByRole('switch', { name: /enviar proposta automaticamente/i });
    await waitFor(() => {
      expect(autoSendSwitch).toHaveAttribute('data-state', 'unchecked');
    });

    fireEvent.click(autoSendSwitch);
    fireEvent.click(await screen.findByRole('button', { name: /^cancelar$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^ligar$/i })).not.toBeInTheDocument();
    });
    expect(autoSendSwitch).toHaveAttribute('data-state', 'unchecked');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('desliga o envio automático de proposta direto, sem confirm dialog', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: true }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    const autoSendSwitch = await screen.findByRole('switch', { name: /enviar proposta automaticamente/i });
    await waitFor(() => {
      expect(autoSendSwitch).toHaveAttribute('data-state', 'checked');
    });

    fireEvent.click(autoSendSwitch);

    expect(screen.queryByRole('button', { name: /^ligar$/i })).not.toBeInTheDocument();

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ autoSendProposalWhatsapp: false });
    });
  });

  it('mostra aviso quando o canal WhatsApp está desconectado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/messaging/channels')) {
          return {
            ok: true,
            json: async () => ({ channels: [{ channel_type: 'whatsapp', status: 'disconnected' }] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      })
    );

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByText(/canal whatsapp está desconectado/i)).toBeInTheDocument();
    });
  });

  it('não bloqueia o toggle mesmo com o canal WhatsApp desconectado — aviso é só informativo', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/messaging/channels')) {
        return {
          ok: true,
          json: async () => ({ channels: [{ channel_type: 'whatsapp', status: 'disconnected' }] }),
        } as Response;
      }
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByText(/canal whatsapp está desconectado/i)).toBeInTheDocument();
    });

    const autoSendSwitch = screen.getByRole('switch', { name: /enviar proposta automaticamente/i });
    expect(autoSendSwitch).not.toBeDisabled();

    fireEvent.click(autoSendSwitch);
    fireEvent.click(await screen.findByRole('button', { name: /^ligar$/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ autoSendProposalWhatsapp: true });
    });
  });

  it('não mostra aviso de canal quando o WhatsApp está conectado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/messaging/channels')) {
          return {
            ok: true,
            json: async () => ({ channels: [{ channel_type: 'whatsapp', status: 'connected' }] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      })
    );

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /enviar proposta automaticamente/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/canal whatsapp está desconectado/i)).not.toBeInTheDocument();
  });

  it('não quebra a tela quando a checagem de status do canal falha (rede/erro)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/messaging/channels')) {
          throw new Error('network error');
        }
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      })
    );

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /enviar proposta automaticamente/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/canal whatsapp está desconectado/i)).not.toBeInTheDocument();
  });

  it('reverte o envio automático de proposta na tela se o POST falhar', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ killSwitchActive: false, alertEmail: null, autoSendProposalWhatsapp: false }),
        } as Response;
      }
      return { ok: false, json: async () => ({ error: 'Erro ao salvar' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    const autoSendSwitch = await screen.findByRole('switch', { name: /enviar proposta automaticamente/i });
    await waitFor(() => {
      expect(autoSendSwitch).toHaveAttribute('data-state', 'unchecked');
    });

    fireEvent.click(autoSendSwitch);
    fireEvent.click(await screen.findByRole('button', { name: /^ligar$/i }));

    // Otimista: liga na hora do clique...
    await waitFor(() => {
      expect(autoSendSwitch).toHaveAttribute('data-state', 'checked');
    });

    // ...mas volta pro estado anterior quando o POST falha.
    await waitFor(() => {
      expect(autoSendSwitch).toHaveAttribute('data-state', 'unchecked');
    });
  });
});
