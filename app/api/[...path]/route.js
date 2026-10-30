import api from '../../../lib/api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(req, ctx) {
  const { path } = await ctx.params;
  return api.handle(req, path || []);
}

export const GET = handler;
export const POST = handler;
