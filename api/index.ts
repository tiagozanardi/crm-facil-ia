/**
 * Entry da função serverless na Vercel (`/api/*`).
 *
 * O import do app Express é feito de forma **tolerante**: se ele falhar (env faltando, Prisma sem
 * engine, etc.) a Vercel não devolve mais um `FUNCTION_INVOCATION_FAILED` opaco — a resposta traz o
 * motivo, que é o que precisamos durante a configuração do deploy.
 *
 * ⚠️ Diagnóstico temporário da Onda 1: expõe mensagem de erro e **nomes** das variáveis presentes
 * (nunca os valores). Remover depois que o deploy estiver estável.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let app: ExpressApp | null = null;
let bootAttempted = false;
let bootError: { name?: string; message: string; stack?: string } | null = null;

/** Só os nomes das variáveis que a API usa — nunca os valores. */
const MONITORED_ENV =
  /^(DATABASE_URL|DIRECT_URL|OPENAI_API_KEY|OPENAI_MODEL|EVOLUTION_[A-Z_]+|APP_PUBLIC_URL|API_AUTH_TOKEN|NODE_ENV|VERCEL_ENV|VERCEL_URL)$/;

async function loadApp(): Promise<ExpressApp | null> {
  if (bootAttempted) return app;
  bootAttempted = true;

  try {
    const mod = await import('../server/app');
    app = (mod as unknown as { app: ExpressApp }).app;
  } catch (error) {
    const err = error as Error & { code?: string };
    bootError = {
      name: err?.name,
      message: String(err?.message ?? error).slice(0, 500),
      stack: err?.stack?.split('\n').slice(0, 8).join(' | '),
    };
    console.error('[api] falha ao inicializar o app Express:', bootError);
  }

  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const expressApp = await loadApp();
  if (expressApp) {
    return expressApp(req, res);
  }

  const envPresent = Object.keys(process.env)
    .filter((key) => MONITORED_ENV.test(key))
    .sort();

  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      error: 'A API não conseguiu inicializar.',
      code: 'BOOT_ERROR',
      message: bootError?.message ?? 'erro desconhecido no import',
      errorName: bootError?.name,
      stack: bootError?.stack,
      envPresent,
    }),
  );
}
