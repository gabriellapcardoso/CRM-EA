import { describe, expect, it } from 'vitest';
import {
  decidirResultado,
  elegivelParaEnvio,
  montarCorpoRequisicao,
  resolverDestino,
  MAX_ATTEMPTS,
  MAX_422_ATTEMPTS,
  type DealStageEventPayload,
} from './dispatcher-logic';

describe('decidirResultado', () => {
  it('200 é sucesso, zera trilha de falha', () => {
    const r = decidirResultado(200, 2);
    expect(r).toEqual({ novoStatus: 'enviado', attemptCount: 3, permanente: false });
  });

  it('409 (corrida) é tratado como sucesso', () => {
    const r = decidirResultado(409, 0);
    expect(r.novoStatus).toBe('enviado');
    expect(r.permanente).toBe(false);
  });

  it('401/404/5xx é falha reciclável enquanto não bate o teto geral', () => {
    for (const status of [401, 404, 500, 502, 503]) {
      const r = decidirResultado(status, 0);
      expect(r.novoStatus).toBe('falhou');
      expect(r.attemptCount).toBe(1);
      expect(r.permanente).toBe(false);
    }
  });

  it('timeout/erro de rede (httpStatus null) conta como falha reciclável', () => {
    const r = decidirResultado(null, 1);
    expect(r.novoStatus).toBe('falhou');
    expect(r.attemptCount).toBe(2);
    expect(r.permanente).toBe(false);
  });

  it('falha reciclável vira permanente ao bater MAX_ATTEMPTS', () => {
    const r = decidirResultado(500, MAX_ATTEMPTS - 1);
    expect(r.novoStatus).toBe('falhou');
    expect(r.attemptCount).toBe(MAX_ATTEMPTS);
    expect(r.permanente).toBe(true);
  });

  it('não avança attempt_count além do teto em novas tentativas depois de permanente', () => {
    const r = decidirResultado(500, MAX_ATTEMPTS);
    expect(r.attemptCount).toBe(MAX_ATTEMPTS);
    expect(r.permanente).toBe(true);
  });

  it('422 antes do teto específico é reciclável', () => {
    const r = decidirResultado(422, 0);
    expect(r.novoStatus).toBe('falhou');
    expect(r.attemptCount).toBe(1);
    expect(r.permanente).toBe(false);
  });

  it('422 vira falha permanente ao bater MAX_422_ATTEMPTS — mais cedo que MAX_ATTEMPTS geral', () => {
    const r = decidirResultado(422, MAX_422_ATTEMPTS - 1);
    expect(r.novoStatus).toBe('falhou');
    expect(r.permanente).toBe(true);
    // Pula direto pro teto geral pra sair da leitura do dispatcher
    // (elegivelParaEnvio usa MAX_ATTEMPTS, não MAX_422_ATTEMPTS)
    expect(r.attemptCount).toBe(MAX_ATTEMPTS);
    expect(MAX_422_ATTEMPTS).toBeLessThan(MAX_ATTEMPTS);
  });
});

describe('elegivelParaEnvio', () => {
  it('pendente é sempre elegível', () => {
    expect(elegivelParaEnvio('pendente', 0)).toBe(true);
    expect(elegivelParaEnvio('pendente', 99)).toBe(true);
  });

  it('falhou é elegível só abaixo do teto', () => {
    expect(elegivelParaEnvio('falhou', MAX_ATTEMPTS - 1)).toBe(true);
    expect(elegivelParaEnvio('falhou', MAX_ATTEMPTS)).toBe(false);
    expect(elegivelParaEnvio('falhou', MAX_ATTEMPTS + 1)).toBe(false);
  });

  it('enviado nunca é elegível — proteção contra reprocessar sucesso', () => {
    expect(elegivelParaEnvio('enviado', 0)).toBe(false);
  });
});

describe('montarCorpoRequisicao', () => {
  it('repassa o payload gravado pelo trigger sem alterar', () => {
    const payload: DealStageEventPayload = {
      external_event_id: 'deal:11111111-1111-1111-1111-111111111111:topou:1',
      deal_id: '11111111-1111-1111-1111-111111111111',
      contador: 1,
      organization_id: '22222222-2222-2222-2222-222222222222',
      contact: { nome: 'Fulano', telefone: '+5531999999999', email: null, empresa: null },
      deal: { titulo: 'Proposta X', valor: 1500, moeda: 'BRL' },
      topou_em: '2026-08-02T12:00:00Z',
    };
    expect(montarCorpoRequisicao(payload)).toBe(payload);
  });
});

describe('resolverDestino', () => {
  const env = {
    PROPOSTAS_INGEST_URL: 'https://propostas.test/webhook',
    PROPOSTAS_INGEST_SECRET: 'segredo-propostas',
    PROSPECCAO_REAQUECER_URL: 'https://prospeccao.test/webhook',
    PROSPECCAO_REAQUECER_SECRET: 'segredo-prospeccao',
    PROPOSTAS_PRONTA_URL: 'https://propostas.test/webhook/proposta-pronta',
    PROPOSTAS_PRONTA_SECRET: 'segredo-propostas-pronta',
  };

  it("roteia stage_slug 'proposta-pronta' pro destino dedicado do gerador de propostas (T4)", () => {
    expect(resolverDestino('proposta-pronta', env)).toEqual({
      url: 'https://propostas.test/webhook/proposta-pronta',
      secret: 'segredo-propostas-pronta',
    });
  });

  it("roteia stage_slug 'perdido' pro destino da prospecção (T3c)", () => {
    expect(resolverDestino('perdido', env)).toEqual({
      url: 'https://prospeccao.test/webhook',
      secret: 'segredo-prospeccao',
    });
  });

  it("roteia stage_slug 'topou-proposta' pro destino do gerador de propostas (T3)", () => {
    expect(resolverDestino('topou-proposta', env)).toEqual({
      url: 'https://propostas.test/webhook',
      secret: 'segredo-propostas',
    });
  });

  it('qualquer stage_slug futuro não mapeado cai no destino padrão (propostas)', () => {
    expect(resolverDestino('estagio-novo-desconhecido', env)).toEqual({
      url: 'https://propostas.test/webhook',
      secret: 'segredo-propostas',
    });
  });

  it('retorna undefined quando a env do destino resolvido não está configurada', () => {
    expect(resolverDestino('perdido', {})).toEqual({ url: undefined, secret: undefined });
  });
});
