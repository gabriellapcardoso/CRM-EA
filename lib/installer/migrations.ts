import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const SCHEMA_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20251201000000_schema_init.sql'
);

function needsSsl(connectionString: string) {
  return !/sslmode=disable/i.test(connectionString);
}

function stripSslModeParam(connectionString: string) {
  // Some drivers/envs treat `sslmode=require` inconsistently. We control SSL via `Client({ ssl })`.
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString;
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Tenta conectar ao banco com retry e backoff exponencial.
 * Útil quando o DNS do projeto Supabase ainda não propagou.
 */
async function connectWithRetry(
  client: Client,
  opts?: { maxAttempts?: number; initialDelayMs?: number }
): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const initialDelayMs = opts?.initialDelayMs ?? 3000;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.connect();
      return; // Sucesso!
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable = 
        lastError.message.includes('ENOTFOUND') || 
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('ETIMEDOUT') ||
        lastError.message.includes('EAI_AGAIN');
      
      if (!isRetryable || attempt === maxAttempts) {
        throw lastError;
      }
      
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1); // Backoff exponencial
      console.log(`[migrations] Conexão falhou (${lastError.message}), tentativa ${attempt}/${maxAttempts}. Aguardando ${delayMs/1000}s...`);
      await sleep(delayMs);
    }
  }
  
  throw lastError || new Error('Falha ao conectar ao banco de dados');
}

async function waitForStorageReady(client: Client, opts?: { timeoutMs?: number; pollMs?: number }) {
  const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 210_000;
  const pollMs = typeof opts?.pollMs === 'number' ? opts.pollMs : 4_000;
  const t0 = Date.now();

  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await client.query<{ ready: boolean }>(
        `select (to_regclass('storage.buckets') is not null) as ready`
      );
      const ready = Boolean(r?.rows?.[0]?.ready);
      if (ready) return;
    } catch {
      // keep polling on transient errors
    }
    await sleep(pollMs);
  }

  throw new Error(
    'Supabase Storage ainda não está pronto (storage.buckets não existe). Aguarde o projeto terminar de provisionar e tente novamente.'
  );
}

/**
 * Função pública `runSchemaMigration` do projeto.
 *
 * @param {string} dbUrl - Parâmetro `dbUrl`.
 * @returns {Promise<void>} Retorna uma Promise resolvida sem valor.
 */
export async function runSchemaMigration(dbUrl: string) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const normalizedDbUrl = stripSslModeParam(dbUrl);

  const client = new Client({
    connectionString: normalizedDbUrl,
    // NOTE: Supabase DB uses TLS; on some networks a MITM/corporate proxy can inject a cert chain
    // that Node doesn't trust. For the installer/migrations step we prefer "no-verify" over failure.
    ssl: needsSsl(dbUrl) ? { rejectUnauthorized: false } : undefined,
  });

  // Tenta conectar com retry (DNS pode demorar a propagar após criar projeto)
  await connectWithRetry(client, { maxAttempts: 5, initialDelayMs: 3000 });
  
  try {
    // Never "skip" Storage. We wait until it's ready, then run migrations.
    await waitForStorageReady(client);
    await client.query(schemaSql);
  } finally {
    await client.end();
  }
}
