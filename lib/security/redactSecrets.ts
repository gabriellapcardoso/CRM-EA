/**
 * Redação de segredo em texto livre (issue #23, item 19).
 *
 * O texto de erro de um provider de IA vai direto pro banco
 * (`security_alerts.details.motivo`) e pro corpo do e-mail de alerta, sem
 * nenhuma filtragem. Provedores às vezes ecoam parte da credencial recebida
 * na própria mensagem de erro pra ajudar a debugar
 * ("Invalid API key: sk-or-v1-abc123..."), e essa é exatamente a mensagem
 * que se quer ver quando a IA cai — o motivo da falha é dado que precisa
 * chegar até quem lê o alerta.
 *
 * Cobre os formatos de chave já tratados nas varreduras de PII deste
 * projeto: OpenRouter/OpenAI (`sk-...`), Resend (`re_...`), JWT/Supabase
 * (`eyJ...`) e `Bearer <token>` genérico.
 */
const PADROES_DE_SEGREDO: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{10,}/g,
  /\bre_[A-Za-z0-9_-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+){1,2}/g,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
];

export function redactSecrets(texto: string): string {
  let resultado = texto;
  for (const padrao of PADROES_DE_SEGREDO) {
    resultado = resultado.replace(padrao, '[REDACTED]');
  }
  return resultado;
}
