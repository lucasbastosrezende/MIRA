'use strict';
// Teste de ponta a ponta da API (banco real em pasta temporária). Rode com: npm run test:api
const os = require('node:os'),
  fs = require('node:fs'),
  path = require('node:path');
process.env.MIRA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-test-'));
delete process.env.ANTHROPIC_API_KEY;
const { handle } = require('../lib/api.js');
const jars = {};
// Chama a API como a pessoa 'who', guardando o cookie de sessão de cada uma.
async function call(who, method, path, body) {
  const h = { 'x-requested-with': 'mira', 'content-type': 'application/json' };
  if (jars[who]) h.cookie = 'mira_sid=' + jars[who];
  const res = await handle(
    new Request('http://x/api/' + path, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
    }),
    path.split('?')[0].split('/'),
  );
  const sc = res.headers.get('set-cookie');
  if (sc) {
    const v = sc.split(';')[0].split('=')[1];
    if (v) jars[who] = v;
  }
  const j = await res.json();
  return { s: res.status, ...j };
}
// Registra uma verificação; qualquer falha faz o processo terminar com erro.
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};
(async () => {
  // Primeiro acesso: o sistema começa vazio e a conta da CSGR só pode ser criada uma vez
  let r = await call('x', 'GET', 'status');
  ok(r.needsSetup === true, 'começa sem usuários');
  r = await call('csgr', 'POST', 'setup', {
    nome: 'Administrador CSGR',
    username: 'csgr.admin',
    password: 'senha-forte-1',
  });
  ok(r.s === 200 && r.user.papel === 'csgr', 'setup cria CSGR e entra');
  r = await call('x', 'POST', 'setup', { nome: 'Outro', username: 'outro.user', password: 'senha-forte-1' });
  ok(r.s === 403, 'setup bloqueado depois');
  let st = await call('csgr', 'GET', 'state');
  ok(
    st.risks.length === 0 && st.audit.length === 1 && st.alerts.length === 0,
    'estado vazio (só auditoria do setup)',
  );

  // Cadastro de pessoas e login
  for (const [nome, username, papel, unit] of [
    ['Pessoa Cad', 'cad.cosegi', 'cadastrador', 'Cosegi'],
    ['Pessoa Ges', 'ges.cosegi', 'gestor', 'Cosegi'],
    ['Outra Cad', 'cad.coinfra', 'cadastrador', 'Coinfra'],
    ['Consulta', 'cgge.user', 'cgge', null],
  ]) {
    r = await call('csgr', 'POST', 'users', { nome, username, papel, unit, password: 'senha-forte-2' });
    ok(r.s === 200, 'cria ' + username);
  }
  r = await call('csgr', 'POST', 'users', {
    nome: 'Gestor 2',
    username: 'ges2.cosegi',
    papel: 'gestor',
    unit: 'Cosegi',
    password: 'senha-forte-2',
  });
  ok(r.s === 422, 'segundo gestor da unidade bloqueado');
  r = await call('cad', 'POST', 'login', { username: 'cad.cosegi', password: 'errada' });
  ok(r.s === 401, 'senha errada');
  for (const [k, u] of [
    ['cad', 'cad.cosegi'],
    ['ges', 'ges.cosegi'],
    ['cad2', 'cad.coinfra'],
    ['cgge', 'cgge.user'],
  ]) {
    r = await call(k, 'POST', 'login', { username: u, password: 'senha-forte-2' });
    ok(r.s === 200, 'login ' + u);
  }

  // Identificação (fase 2) e isolamento entre coordenadorias
  r = await call('cad', 'POST', 'risks', {
    titulo: 'T',
    causa: '',
    evento: 'e',
    impacto: 'i',
    objetivo: 'o',
  });
  ok(r.s === 422, 'identificação incompleta barrada');
  r = await call('cad', 'POST', 'risks', {
    titulo: 'Vazamento no Sistema X',
    causa: 'exploração de vulnerabilidades no Sistema X',
    evento: 'vazamento de dados pessoais',
    impacto: 'sanções ao Estado',
    objetivo: 'a segurança dos sistemas da Setic',
  });
  ok(r.s === 200 && r.risk.id === 'R-001' && r.risk.status === 'rascunho', 'cria R-001');
  r = await call('cgge', 'POST', 'risks', {
    titulo: 'T',
    causa: 'xxxxxxxxxxxxx',
    evento: 'e',
    impacto: 'iiiiiiiiii',
    objetivo: 'oooooooooo',
  });
  ok(r.s === 403, 'CGGE não cadastra');
  r = await call('cad2', 'GET', 'state');
  ok(r.risks.length === 0, 'outra coordenadoria não vê o risco');
  r = await call('cad2', 'POST', 'risks/R-001/aval', { prob: 2, imp: 5 });
  ok(r.s === 404, 'outra coordenadoria não acessa por id');

  // Avaliação (fase 3) e PRR (fase 4)
  r = await call('cad', 'POST', 'risks/R-001/aval', { prob: 2, imp: 5, exposicao: 4000000 });
  ok(r.s === 200 && r.risk.status === 'avaliado' && r.risk.niveis.length === 1, 'avalia nível 10');
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(r.s === 422, 'enviar PRR vazio é barrado');
  const prr = {
    tratamento: 'mitigar',
    controles: 'x',
    acao: 'Análise periódica de vulnerabilidades',
    responsavel: 'Pessoa Cad',
    prazo: '2026-12-30',
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
  r = await call('cad', 'POST', 'risks/R-001/prr', { prr });
  ok(r.s === 200 && r.risk.prr.custo === 85000, 'salva PRR');
  r = await call('cad', 'POST', 'risks/R-001/prr', { prr: { ...prr, ideal: 7 } });
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(r.s === 422 && r.errors && r.errors.length, 'parâmetros incoerentes barrados');
  await call('cad', 'POST', 'risks/R-001/prr', { prr });

  // Tramitação do PRR: cada perfil só decide na sua vez; devolver exige motivo
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(r.s === 200 && r.risk.status === 'ag_gestor', 'envia ao gestor');
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'csgr-ok' });
  ok(r.s === 403, 'cadastrador não aprova');
  r = await call('csgr', 'POST', 'risks/R-001/action', { action: 'csgr-ok' });
  ok(r.s === 403, 'CSGR não aprova antes do gestor');
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-dev' });
  ok(r.s === 422, 'devolver exige motivo');
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-dev', motivo: 'Detalhar a ação' });
  ok(r.s === 200 && r.risk.status === 'devolvido', 'gestor devolve');
  r = await call('cad', 'POST', 'risks/R-001/prr', {
    prr: { ...prr, acao: 'Análise periódica e correção em 15 dias' },
  });
  ok(r.s === 200, 'cadastrador ajusta após devolução');
  await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-ok' });
  ok(r.s === 200 && r.risk.status === 'ag_csgr', 'gestor encaminha');
  r = await call('csgr', 'POST', 'risks/R-001/action', { action: 'csgr-ok' });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'CSGR aprova');

  // Monitoramento (fase 5) e trilha de auditoria
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'add-med', valor: 12 });
  ok(r.s === 200, 'medição 12 (crítico)');
  st = await call('csgr', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'metrica'),
    'alerta de métrica gerado',
  );
  r = await call('cad', 'POST', 'risks/R-001/action', {
    action: 'reaval',
    prob: 3,
    imp: 5,
    motivo: 'Nova vulnerabilidade pública',
  });
  ok(r.s === 200 && r.risk.niveis.length === 2, 'reavaliação registra histórico');
  st = await call('cad', 'GET', 'state');
  const ch = st.audit.filter(a => a.riskId === 'R-001');
  ok(
    ch.length >= 10 && ch.every(a => a.user && a.ts && a.action),
    'auditoria: ' + ch.length + ' registros do risco',
  );
  ok(
    ch.some(a => a.changes.some(c => c.campo === 'Probabilidade' && c.de === 2 && c.para === 3)),
    'auditoria guarda valor anterior e novo',
  );

  // Contexto (fase 1), assistente de IA sem chave, avisos e segurança da sessão
  r = await call('cad', 'POST', 'ctx/escopo', { escopo: 'Riscos de segurança da informação' });
  ok(r.s === 200, 'salva escopo');
  r = await call('cad', 'POST', 'ctx/marco', { op: 'add', marco: 'Primeira avaliação', data: '2026-11-30' });
  ok(r.s === 200 && r.ctx.marcos.length === 1, 'inclui marco');
  r = await call('cgge', 'POST', 'ctx/escopo', { escopo: 'x' });
  ok(r.s === 403, 'CGGE não edita contexto');
  r = await call('cad', 'POST', 'ai', { text: 'algo' });
  ok(r.s === 503, 'IA sem chave retorna 503 claro');
  r = await call('cad', 'POST', 'alerts/read', {});
  ok(r.s === 200, 'marca avisos como lidos');
  r = await call('x', 'GET', 'state');
  ok(r.s === 401, 'sem sessão não acessa estado');
  const noHdr = await handle(new Request('http://x/api/state', { method: 'POST' }), ['risks']);
  ok(noHdr.status === 403, 'POST sem cabeçalho de segurança é barrado');
  r = await call('cad', 'POST', 'logout');
  r = await call('cad', 'GET', 'state');
  ok(r.s === 401, 'logout encerra a sessão');
})();
