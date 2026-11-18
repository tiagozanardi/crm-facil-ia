/**
 * Entry da função serverless na Vercel (`/api/*`).
 *
 * Detalhe importante: o `package.json` da raiz tem `"type": "module"`, mas o `api/package.json`
 * marca **apenas esta pasta** como CommonJS. Sem isso, o arquivo emitido (`api/index.js`) é ESM e
 * o import de `../server/app` (sem extensão) explode com `ERR_MODULE_NOT_FOUND`, derrubando todas
 * as rotas `/api/*` com `FUNCTION_INVOCATION_FAILED`.
 *
 * O import do app Express é tolerante: se ele falhar (env faltando, Prisma sem engine, bundle
 * incompleto), a resposta traz o motivo + o que existe dentro de `/var/task` — em vez de um 500 opaco.
 *
 * ⚠️ Diagnóstico temporário da Onda 1: expõe mensagem de erro e **nomes** de arquivos/variáveis
 * (nunca valores). Remover depois que o deploy estiver estável.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdirSync } from 'node:fs';

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let app: ExpressApp | null = null;
let bootAttempted = false;
let bootError: { name?: string; message: string; stack?: string } | null = null;

/** Só os nomes das variáveis que a API usa — nunca os valores. */
const MONITORED_ENV =
  /^(DATABASE_URL|DIRECT_URL|OPENAI_API_KEY|OPENAI_MODEL|EVOLUTION_[A-Z_]+|APP_PUBLIC_URL|API_AUTH_TOKEN|NODE_ENV|VERCEL_ENV|VERCEL_URL)$/;

function listDir(dir: string, limit = 25): string[] | null {
  try {
    return readdirSync(dir).slice(0, limit);
  } catch {
    return null;
  }
}

async function loadApp(): Promise<ExpressApp | null> {
  if (bootAttempted) return app;
  bootAttempted = true;

  try {
    // Extensão `.js` é obrigatória: a função é emitida como ESM (por causa do `type: module`
    // do package.json) e ESM não resolve import sem extensão. O TypeScript mapeia `.js` → `.ts`
    // na checagem de tipos; na Vercel o arquivo compilado (`server/app.js`) já existe.
    const mod = await import('../server/app.js');
    app = (mod as unknown as { app: ExpressApp }).app;
  } catch (error) {
    const err = error as Error & { code?: string };
    bootError = {
      name: err?.name,
      message: String(err?.message ?? error).slice(0, 600),
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
      // Diagnóstico do bundle: nomes de arquivos/pastas, sem conteúdo.
      bundle: {
        task: listDir('/var/task'),
        server: listDir('/var/task/server'),
        api: listDir('/var/task/api'),
      },
    }),
  );
}
