/**
 * Guardas de `dataLocalISO`.
 *
 * O teste central é a janela das 21:00 à meia-noite em GMT-3: é exatamente onde
 * `toISOString().split('T')[0]` devolve o dia seguinte, e onde o bug vivia.
 * Fora dessa janela as duas implementações concordam, que é por isso que isto
 * passou despercebido — quem testa de manhã nunca vê.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataLocalISO, hojeLocalISO, dataLocalISOEmDias } from './dataLocal';

/** A implementação antiga, pra provar a divergência em vez de afirmá-la. */
function viaUTC(d: Date): string {
  return d.toISOString().split('T')[0];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('dataLocalISO', () => {
  it('formata com zero à esquerda', () => {
    expect(dataLocalISO(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
    expect(dataLocalISO(new Date(2026, 8, 3, 12, 0))).toBe('2026-09-03');
  });

  it('meia-noite local é o próprio dia, não o anterior', () => {
    expect(dataLocalISO(new Date(2026, 8, 3, 0, 0, 0))).toBe('2026-09-03');
  });

  it('23:59 local ainda é o mesmo dia', () => {
    expect(dataLocalISO(new Date(2026, 8, 3, 23, 59, 59))).toBe('2026-09-03');
  });

  it('vira o mês corretamente', () => {
    expect(dataLocalISO(new Date(2026, 8, 30, 22, 0))).toBe('2026-09-30');
    expect(dataLocalISOEmDias(1, new Date(2026, 8, 30, 22, 0))).toBe('2026-10-01');
  });

  it('vira o ano corretamente', () => {
    expect(dataLocalISOEmDias(1, new Date(2026, 11, 31, 22, 0))).toBe('2027-01-01');
  });

  it('lida com ano bissexto', () => {
    expect(dataLocalISOEmDias(1, new Date(2028, 1, 28, 22, 0))).toBe('2028-02-29');
  });
});

describe('a janela em que a implementação antiga erra', () => {
  // Em fuso negativo (São Paulo é GMT-3), o fim da noite local já é o dia
  // seguinte em UTC. Este bloco só roda quando a máquina está num fuso
  // negativo — no CI em UTC as duas implementações coincidem, e o teste
  // documenta isso em vez de falhar por causa do ambiente.
  const offsetMin = new Date(2026, 8, 3, 22, 0).getTimezoneOffset(); // >0 em GMT-3
  const emFusoNegativo = offsetMin > 0;

  it.runIf(emFusoNegativo)('às 22:00 local, a antiga devolve o dia seguinte e a nova não', () => {
    const noite = new Date(2026, 8, 3, 22, 0, 0);

    expect(dataLocalISO(noite)).toBe('2026-09-03');
    expect(viaUTC(noite)).toBe('2026-09-04');
    expect(dataLocalISO(noite)).not.toBe(viaUTC(noite));
  });

  it.runIf(emFusoNegativo)('ao meio-dia local as duas concordam — por isso passou despercebido', () => {
    const meioDia = new Date(2026, 8, 3, 12, 0, 0);

    expect(dataLocalISO(meioDia)).toBe(viaUTC(meioDia));
  });

  it('em UTC as duas coincidem sempre, o que esconde o bug no CI', () => {
    if (emFusoNegativo) return;
    const noite = new Date(2026, 8, 3, 22, 0, 0);
    expect(dataLocalISO(noite)).toBe(viaUTC(noite));
  });
});

describe('hojeLocalISO', () => {
  it('usa o relógio atual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 22, 30));

    expect(hojeLocalISO()).toBe(dataLocalISO(new Date(2026, 8, 3, 22, 30)));
  });
});

describe('dataLocalISOEmDias', () => {
  it('soma dias sem depender de milissegundos', () => {
    expect(dataLocalISOEmDias(0, new Date(2026, 8, 3, 22, 0))).toBe('2026-09-03');
    expect(dataLocalISOEmDias(1, new Date(2026, 8, 3, 22, 0))).toBe('2026-09-04');
    expect(dataLocalISOEmDias(7, new Date(2026, 8, 3, 22, 0))).toBe('2026-09-10');
  });

  it('aceita dias negativos', () => {
    expect(dataLocalISOEmDias(-1, new Date(2026, 8, 1, 22, 0))).toBe('2026-08-31');
  });
});
