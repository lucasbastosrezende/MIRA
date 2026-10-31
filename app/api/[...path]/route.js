import api from '../../../lib/api.js';

// Rota única do Next.js para /api/*: repassa a requisição ao roteador do MIRA (lib/api.js).
// Roda no Node (o banco usa node:sqlite) e nunca é pré-renderizada.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(req, ctx) {
  const { path } = await ctx.params;
  return api.handle(req, path || []);
}

export const GET = handler;
export const POST = handler;
