/**
 * Autenticação compartilhada das rotas de cron (`ai-health`, `evolution-health`,
 * `stage-evaluations`, `template-sync`) — mesmo `CRON_SECRET`, chamado tanto pela
 * Vercel quanto pelo pg_cron via `net.http_get`.
 *
 * `timingSafeEqual` em vez de `!==`: comparação de string normal vaza quanto do
 * prefixo bate através do tempo de resposta (ataque de timing). Risco prático é
 * baixo aqui — tudo atrás de HTTPS, sem usuário final tentando adivinhar — mas o
 * custo de corrigir é três linhas. Issue #23, item 18.
 */
import { timingSafeEqual } from 'node:crypto';

function secretBate(recebido: string, esperado: string): boolean {
  const bufRecebido = Buffer.from(recebido);
  const bufEsperado = Buffer.from(esperado);
  // Buffers de tamanho diferente: timingSafeEqual lança em vez de devolver
  // false. Tamanho do secret não é informação sensível (é sempre o mesmo
  // comprimento fixo), então comparar o length primeiro não reabre o timing
  // attack que a função existe para fechar.
  if (bufRecebido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecebido, bufEsperado);
}

/** `true` se o header `Authorization: Bearer <CRON_SECRET>` da requisição bate com o segredo configurado. */
export function autenticaCron(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.get('Authorization');
  const esperado = `Bearer ${cronSecret}`;
  if (!authHeader) return false;

  return secretBate(authHeader, esperado);
}
