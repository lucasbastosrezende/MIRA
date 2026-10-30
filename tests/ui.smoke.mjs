// Fumaça da interface: executa o código real do navegador contra a API real, com um DOM mínimo de mentira.
// Não substitui um teste em navegador; só garante que nenhuma tela quebra com dados reais.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.MIRA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-ui-'));
delete process.env.ANTHROPIC_API_KEY;
const api = (await import('../lib/api.js')).default;
const { mountMira } = await import('../app/mira-ui.js');
let fails = 0;
// Registra uma verificação; qualquer falha faz o processo terminar com erro.
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) {
    fails++;
    process.exitCode = 1;
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// --- API direta (para montar os dados) ---
const jars = {};
async function call(who, method, p, body) {
  const h = { 'x-requested-with': 'mira', 'content-type': 'application/json' };
  if (jars[who]) h.cookie = 'mira_sid=' + jars[who];
  const res = await api.handle(
    new Request('http://x/api/' + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }),
    p.split('/'),
  );
  const sc = res.headers.get('set-cookie');
  if (sc) {
    const v = sc.split(';')[0].split('=')[1];
    jars[who] = v || undefined;
  }
  return { s: res.status, ...(await res.json()) };
}
// --- DOM de mentira ---
const els = {};
const listeners = {};
let uiCookie = null;
globalThis.window = { scrollY: 0, scrollTo() {} };
globalThis.document = {
  getElementById: id => els[id] || null,
  querySelector: () => null,
  createElement: () => ({ style: {}, click() {}, remove() {}, setAttribute() {} }),
  body: { appendChild() {} },
};
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};
globalThis.fetch = async (url, opts) => {
  const h = { ...(opts.headers || {}) };
  if (uiCookie) h.cookie = 'mira_sid=' + uiCookie;
  const res = await api.handle(
    new Request('http://x' + url, { method: opts.method, headers: h, body: opts.body }),
    url
      .replace(/^\/api\//, '')
      .split('?')[0]
      .split('/'),
  );
  const sc = res.headers.get('set-cookie');
  if (sc) uiCookie = sc.split(';')[0].split('=')[1] || null;
  return res;
};
const root = {
  innerHTML: '',
  addEventListener(t, f) {
    listeners[t] = f;
  },
  removeEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
};
// Simula um clique num elemento com os data-* informados.
const click = async data => {
  const el = { dataset: data };
  listeners.click({ target: { closest: () => el }, preventDefault() {} });
  await sleep(60);
};
// Simula o envio do formulário com o id informado.
const submit = async id => {
  listeners.submit({ target: { id }, preventDefault() {} });
  await sleep(120);
};
// Define os valores dos campos que a interface vai ler (por id).
const setVals = o => {
  for (const k of Object.keys(els)) delete els[k];
  for (const [k, v] of Object.entries(o)) els[k] = { value: v };
};
const html = () => root.innerHTML;
// Sinais de tela quebrada: mensagem de erro de tela ou valores que não deviam aparecer.
const bad = () => /Não foi possível abrir esta tela|undefined|NaN|\[object/.test(html());

// --- Primeiro acesso pela tela: cria a CSGR e cadastra uma pessoa ---
const stop = mountMira(root);
await sleep(150);
ok(html().includes('Primeiro acesso'), 'tela de primeiro acesso quando o sistema está vazio');
setVals({ 'a-nome': 'Administrador CSGR', 'a-user': 'csgr.admin', 'a-pw': 'senha-forte-1' });
await submit('auth-form');
ok(
  html().includes('Painel Alta Gestão') && html().includes('Usuários'),
  'após o setup, CSGR entra no painel de alta gestão e vê Usuários',
);
ok(
  !html().includes('R$ NaN') && html().includes('Exposição esperada hoje'),
  'painel de alta gestão vazio renderiza sem NaN',
);
await click({ panel: 'op' });
ok(html().includes('Riscos ativos') && !bad(), 'painel operacional vazio renderiza');
await click({ nav: 'usuarios' });
setVals({
  'n-nome': 'Pessoa Cad',
  'n-user': 'cad.cosegi',
  'n-papel': 'cadastrador',
  'n-unit': 'Cosegi',
  'n-pw': 'senha-forte-2',
});
await submit('user-form');
ok(html().includes('cad.cosegi'), 'cadastra pessoa pela tela de usuários');
await call('csgr', 'POST', 'login', { username: 'csgr.admin', password: 'senha-forte-1' });
for (const [nome, username, papel, unit] of [
  ['Pessoa Ges', 'ges.cosegi', 'gestor', 'Cosegi'],
  ['Consulta', 'cgge.user', 'cgge', null],
  ['Outra Cad', 'cad.coinfra', 'cadastrador', 'Coinfra'],
])
  await call('csgr', 'POST', 'users', { nome, username, papel, unit, password: 'senha-forte-2' });
// dados via API
for (const [k, u] of [
  ['cad', 'cad.cosegi'],
  ['ges', 'ges.cosegi'],
  ['cad2', 'cad.coinfra'],
])
  await call(k, 'POST', 'login', { username: u, password: 'senha-forte-2' });
const prr = {
  tratamento: 'mitigar',
  controles: 'x',
  acao: 'Análise periódica de vulnerabilidades',
  responsavel: 'Pessoa Cad',
  prazo: '2026-11-05',
  custo: 85000,
  metrica: 'Vulnerabilidades críticas abertas',
  unidadeMetrica: 'un',
  sentido: 'menor',
  critico: 10,
  alerta: 5,
  ideal: 0,
  probRes: 1,
  impRes: 5,
};
// Cria um risco pela API e o leva até a etapa pedida (upTo), para cobrir todas as situações.
async function mkRisk(who, f, prob, imp, exp, upTo) {
  const r = (await call(who, 'POST', 'risks', f)).risk;
  if (!prob) return r;
  await call(who, 'POST', `risks/${r.id}/aval`, { prob, imp, exposicao: exp });
  if (upTo === 'aval') return r;
  await call(who, 'POST', `risks/${r.id}/prr`, { prr });
  await call(who, 'POST', `risks/${r.id}/action`, { action: 'send-prr' });
  if (upTo === 'gestor') return r;
  await call('ges', 'POST', `risks/${r.id}/action`, { action: 'gestor-ok' });
  if (upTo === 'csgr') return r;
  await call('csgr', 'POST', `risks/${r.id}/action`, { action: 'csgr-ok' });
  await call(who, 'POST', `risks/${r.id}/action`, { action: 'add-med', valor: 7 });
  return r;
}
// Campos de identificação de teste (sem nomes de pessoas).
const F = (t, c) => ({
  titulo: t,
  causa: c,
  evento: 'perda de dados',
  impacto: 'indisponibilidade de serviços',
  objetivo: 'a continuidade dos serviços',
});
await mkRisk('cad', F('Risco A', 'falha sem redundância no servidor principal'), 2, 5, 4000000, 'ativo');
await mkRisk('cad', F('Risco B', 'ausência de rotina de backup testada'), 3, 5, 6000000, 'gestor');
await mkRisk('cad', F('Risco C', 'dependência de fornecedor único de licenças'), 3, 3, 250000, 'csgr');
await mkRisk('cad', F('Risco D', 'equipe pequena para a demanda de suporte'), 0);
await mkRisk('cad2', F('Risco E', 'link de internet sem contingência definida'), 4, 4, 900000, 'ativo');
// navegação por perfil
// Entra com um perfil e abre todas as telas do menu, os dois painéis e as 5 fases de cada risco.
async function browse(label, user, pw, nameChk) {
  await click({ act: 'logout' });
  setVals({ 'a-user': user, 'a-pw': pw });
  await submit('auth-form');
  ok(html().includes(nameChk), label + ': entrou');
  const navs = [...html().matchAll(/data-nav="(\w+)"/g)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i);
  for (const n of navs) {
    if (n === 'novo') continue;
    await click({ nav: n });
    if (bad()) {
      ok(false, label + ': tela ' + n + ' quebrou');
    }
  }
  await click({ nav: 'paineis' });
  await click({ panel: 'alta' });
  ok(!bad(), label + ': painel alta gestão');
  const t = [...html().matchAll(/data-tce="(R-\d+)"/g)].find(
    m => !html().includes('data-tce="' + m[1] + '" disabled'),
  );
  if (t) {
    await click({ tce: t[1] });
    ok(html().includes('JUSTIFICATIVA DE DESPESA'), label + ': gera justificativa para o TCE');
  }
  await click({ panel: 'op' });
  ok(!bad(), label + ': painel operacional');
  const ids = [...html().matchAll(/data-open="(R-\d+)"/g)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i);
  for (const id of ids) {
    await click({ open: id });
    for (let k = 1; k <= 5; k++) {
      await click({ tab: String(k) });
      if (bad()) ok(false, label + ': ' + id + ' fase ' + k + ' quebrou');
    }
  }
  ok(
    ids.length > 0 || label.startsWith('CGGE') === false,
    label + ': abriu ' + ids.length + ' riscos em todas as fases',
  );
}
await browse('CSGR', 'csgr.admin', 'senha-forte-1', 'Administrador CSGR');
await browse('Cadastrador Cosegi', 'cad.cosegi', 'senha-forte-2', 'Pessoa Cad');
await browse('Gestor Cosegi', 'ges.cosegi', 'senha-forte-2', 'Pessoa Ges');
await browse('CGGE', 'cgge.user', 'senha-forte-2', 'Consulta');
await browse('Cadastrador Coinfra', 'cad.coinfra', 'senha-forte-2', 'Outra Cad');
// ação de tela: cadastrador registra medição
await click({ act: 'logout' });
setVals({ 'a-user': 'cad.cosegi', 'a-pw': 'senha-forte-2' });
await submit('auth-form');
await click({ open: 'R-001' });
await click({ tab: '5' });
setVals({ 'm-valor': '12' });
await click({ act: 'add-med' });
const st = await call('cad', 'GET', 'state');
ok(
  st.risks.find(r => r.id === 'R-001').prr.medicoes.length === 2,
  'medição registrada pela tela chega ao banco',
);
await click({ act: 'logout' });
setVals({ 'a-user': 'cad.cosegi', 'a-pw': 'errada' });
await submit('auth-form');
ok(html().includes('Usuário ou senha incorretos'), 'login com senha errada mostra o aviso');
stop();
console.log(fails ? '\n' + fails + ' falha(s)' : '\ntudo certo');
