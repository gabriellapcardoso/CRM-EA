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
            json: async () => ({ killSwitchActive: false, alertEmail: null }),
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
      expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
    });
    expect(screen.getByLabelText(/e-mail de alerta/i)).toHaveValue('');
  });

  it('mostra o kill switch ativo quando a API retorna true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ killSwitchActive: true, alertEmail: 'ops@aaagencia.com.br' }),
      }))
    );

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
    });
    expect(screen.getByLabelText(/e-mail de alerta/i)).toHaveValue('ops@aaagencia.com.br');
  });

  it('ativa o kill switch e envia POST com killSwitchActive=true', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return { ok: true, json: async () => ({ killSwitchActive: false, alertEmail: null }) } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsAppSafetySection />);

    await waitFor(() => {
      expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
    });

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ killSwitchActive: true });
    });
  });

  it('salva o e-mail de alerta ao clicar em salvar', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return { ok: true, json: async () => ({ killSwitchActive: false, alertEmail: null }) } as Response;
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
});
