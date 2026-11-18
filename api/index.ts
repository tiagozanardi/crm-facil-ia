/**
 * Entry da função serverless na Vercel (`/api/*`).
 *
 * ⚠️ Duas pegadinhas que derrubaram a API em produção (2026-11-18):
 *
 * 1. O `package.json` da raiz declara `"type": "module"`, então a função é emitida como **ESM**.
 *    ESM resolve import de forma estrita: `import '../server/app'` (sem extensão) falha com
 *    `ERR_MODULE_NOT_FOUND` e a Vercel devolve `FUNCTION_INVOCATION_FAILED` em **todas** as rotas.
 *    Por isso todo import relativo aqui — e em `server/**` — usa `.js` explícito.
 * 2. O import é dinâmico de propósito: se o app não subir, o erro vai para o log da função em vez
 *    de derrubar o processo sem rastro.
 *
 * O app Express em si fica em `server/app.ts` e é o mesmo usado por `npm run server` (tsx).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let app: ExpressApp | null = null;
let bootAttempted = false;

async function loadApp(): Promise<ExpressApp | null> {
  if (bootAttempted) return app;
  bootAttempted = true;

  try {
    const mod = await import('../server/app.js');
    app = (mod as unknown as { app: ExpressApp }).app;
  } catch (error) {
    console.error('[api] falha ao inicializar o app Express:', error);
  }

  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const expressApp = await loadApp();

  if (expressApp) {
    return expressApp(req, res);
  }

  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      error: 'A API não conseguiu inicializar. Verifique os logs da função na Vercel.',
      code: 'BOOT_ERROR',
    }),
  );
}
