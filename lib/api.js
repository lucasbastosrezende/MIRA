'use strict';
// Roteador da API do MIRA. Usa Request/Response padrão, então roda dentro do Next.js (route handler)
// e também direto no Node para testes.
const S = require('./service.js');
const L = require('./logic.js');
const { open } = require('./db.js');

// Nome do cookie da sessão.
const COOKIE = 'mira_sid';
// Resposta JSON que nunca fica em cache.
const json = (status, body, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(headers || {}),
    },
  });
// Lê o token da sessão no cookie.
function getToken(req) {
  const c = req.headers.get('cookie') || '';
  const m = c
    .split(/;\s*/)
    .map(x => x.split('='))
    .find(x => x[0] === COOKIE);
  return m ? m[1] : null;
}
// Cookie da sessão: HttpOnly (o JavaScript da página não lê) e SameSite=Strict (outro site não envia).
// Com MIRA_HTTPS=1 (instância atrás de HTTPS), o cookie também é Secure: o navegador só o manda por HTTPS.
const cookie = (v, age) =>
  COOKIE +
  '=' +
  v +
  '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' +
  age +
  (process.env.MIRA_HTTPS === '1' ? '; Secure' : '');
// Corpo JSON da requisição; objeto vazio se vier inválido.
async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

/* ===== Assistente de IA (opcional) ===== */
async function ai(u, b) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    throw new S.HttpError(
      503,
      'O assistente de IA não está configurado. Defina ANTHROPIC_API_KEY no arquivo .env.local.',
    );
  if (u.papel !== 'cadastrador' && u.papel !== 'gestor') throw S.forbid();
  const f = b.fields || {};
  const review = !!b.review;
  const text = review
    ? ['titulo', 'causa', 'evento', 'impacto', 'objetivo']
        .filter(k => f[k])
        .map(k => k + ': ' + String(f[k]).slice(0, 500))
        .join('\n')
    : String(b.text || '').slice(0, 4000);
  if (!text.trim()) throw S.bad('Escreva algo para o assistente analisar.');
  const existing =
    open()
      .prepare('SELECT data FROM risks WHERE unit=?')
      .all(u.unit)
      .slice(0, 25)
      .map(r => {
        const x = JSON.parse(r.data);
        return x.id + ': ' + x.titulo;
      })
      .join('\n') || '(nenhum)';
  const prompt =
    'Você apoia servidores da SETIC (tecnologia da informação do governo de Rondônia) a registrar riscos no Modelo de Gestão de Riscos (MGR).\n' +
    'Regras do MGR: risco é um evento futuro e incerto que, se ocorrer, afeta um objetivo. Problema é algo que já está acontecendo. Descrição no formato: "Devido a <causa>, poderá ocorrer <evento>, levando a <impacto>, afetando <objetivo>". ' +
    'Probabilidade de 1 a 5: ' +
    L.PROB.map((x, i) => i + 1 + '=' + x[0]).join(', ') +
    '. Impacto de 1 a 5: ' +
    L.IMPS.map((x, i) => i + 1 + '=' + x[0]).join(', ') +
    '.\n' +
    'Texto do servidor (coordenadoria ' +
    u.unit +
    '):\n"""\n' +
    text +
    '\n"""\nRiscos já cadastrados na coordenadoria:\n' +
    existing +
    '\n\n' +
    'Responda somente com um objeto JSON com estas chaves: ehRisco (true se o texto descreve um risco, false se descreve um problema que já ocorre), motivo (uma frase), titulo (até 8 palavras), causa (sem "Devido a"), evento (sem "poderá ocorrer", futuro e incerto; se o texto descreve um problema, escreva o que PODE acontecer em seguida), impacto (sem "levando a"), objetivo (sem "afetando"), probabilidade (1 a 5), justificativaProbabilidade (uma frase), impactoNota (1 a 5), justificativaImpacto (uma frase), acoes (lista de até 3 ações concretas de tratamento), parecidos (lista de IDs dos riscos já cadastrados que se parecem; pode ser vazia). Escreva em português do Brasil, em linguagem simples. Use apenas o que está no texto; não invente fatos.';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.MIRA_AI_MODEL || 'claude-sonnet-5-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  }).catch(() => null);
  if (!res || !res.ok) throw new S.HttpError(502, 'Não foi possível consultar o assistente agora.');
  const data = await res.json();
  const t = (data.content || []).map(c => c.text || '').join('');
  const a = t.indexOf('{'),
    z = t.lastIndexOf('}');
  try {
    return JSON.parse(t.slice(a, z + 1));
  } catch {
    throw new S.HttpError(502, 'A resposta do assistente veio fora do formato esperado. Tente reformular.');
  }
}

/* ===== Rotas ===== */
async function route(req, seg) {
  const method = req.method,
    p = seg.join('/');
  if (method !== 'GET' && req.headers.get('x-requested-with') !== 'mira')
    throw S.forbid('Requisição não reconhecida.');
  if (method === 'GET' && p === 'status') return json(200, { ai: !!process.env.ANTHROPIC_API_KEY });
  // Não existe rota de criação de conta sem login: o administrador é criado na implantação
  // (npm run admin) e as demais pessoas só por ele, já com sessão aberta.
  if (method === 'POST' && p === 'login') {
    const b = await body(req);
    // Segurança: o cabeçalho X-Forwarded-For pode ser escrito por quem chama. Só vale com MIRA_TRUST_PROXY=1,
    // quando há um proxy confiável na frente; sem isso o endereço é fixo (o servidor escuta só em 127.0.0.1).
    const ip =
      process.env.MIRA_TRUST_PROXY === '1'
        ? (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim()
        : 'local';
    const { token, user } = S.login(String(b.username || ''), String(b.password || ''), ip);
    return json(200, { user }, { 'set-cookie': cookie(token, 8 * 3600) });
  }
  const tok = getToken(req),
    u = S.userFromToken(tok);
  if (method === 'POST' && p === 'logout') {
    S.logout(tok);
    return json(200, { ok: true }, { 'set-cookie': cookie('', 0) });
  }
  if (!u) throw new S.HttpError(401, 'Entre para continuar.');
  if (method === 'GET' && p === 'state') return json(200, S.getState(u));
  // PDF do relatório de pedido de uma pessoa (só administrador). Vai como download, nunca aberto dentro da página.
  let g = method === 'GET' && p.match(/^users\/([\w-]+)\/sei$/);
  if (g) {
    const d = S.seiDoc(u, g[1]);
    return new Response(d.pdf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="SEI-' + d.numero.replace(/[^\d-]/g, '-') + '.pdf"',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    });
  }
  if (method === 'POST') {
    const b = await body(req);
    if (p === 'risks') return json(200, { risk: S.createRisk(u, b) });
    let m = p.match(/^risks\/(R-\d+)\/(ident|aval|prr|action)$/);
    if (m) {
      const fn = { ident: S.updateIdent, aval: S.updateAval, prr: S.savePrr, action: S.riskAction }[m[2]];
      return json(200, { risk: fn(u, m[1], b) });
    }
    if (p === 'ctx/escopo') return json(200, { ctx: S.ctxEscopo(u, b) });
    if (p === 'ctx/marco') return json(200, { ctx: S.ctxMarco(u, b) });
    if (p === 'alerts/read') {
      S.readAlerts(u);
      return json(200, { ok: true });
    }
    if (p === 'ai') return json(200, { ia: await ai(u, b) });
    if (p === 'users') return json(200, { user: S.createUser(u, b) });
    if (p === 'units') return json(200, { units: S.createUnit(u, b) });
    if (p === 'units/nome') return json(200, { units: S.renameUnit(u, b) });
    if (p === 'units/remove') return json(200, { units: S.removeUnit(u, b.sigla) });
    m = p.match(/^users\/([\w-]+)\/(password|ativo|apagar|pedido)$/);
    if (m) {
      if (m[2] === 'apagar') S.deleteUser(u, m[1]);
      else if (m[2] === 'pedido') S.addPedido(u, m[1], b);
      else if (m[2] === 'password') S.resetPassword(u, m[1], b.password);
      else S.setAtivo(u, m[1], !!b.ativo);
      return json(200, { ok: true });
    }
  }
  throw new S.HttpError(404, 'Rota não encontrada.');
}
// Ponto de entrada: transforma HttpError na resposta certa e esconde detalhes de erros internos.
async function handle(req, seg) {
  try {
    return await route(req, seg);
  } catch (e) {
    if (e instanceof S.HttpError) return json(e.status, { error: e.message, ...e.extra });
    console.error('[mira] erro', e);
    return json(500, { error: 'Erro interno do servidor.' });
  }
}
module.exports = { handle };
