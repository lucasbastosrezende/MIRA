'use strict';
// Teste de ponta a ponta da API (banco real em pasta temporária). Rode com: npm run test:api
const os = require('node:os'),
  fs = require('node:fs'),
  path = require('node:path');
process.env.MIRA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-test-'));
delete process.env.ANTHROPIC_API_KEY;
const { handle } = require('../lib/api.js');
const S = require('../lib/service.js');
const { open } = require('../lib/db.js');
// Quantidade de linhas de uma tabela, para conferir que uma ação recusada não gravou nada.
const count = t =>
  open()
    .prepare('SELECT COUNT(*) n FROM ' + t)
    .get().n;
const jars = {};
// Chama a API como a pessoa 'who', guardando o cookie de sessão de cada uma.
async function call(who, method, path, body, extra) {
  const h = { 'x-requested-with': 'mira', 'content-type': 'application/json', ...(extra || {}) };
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
  // Regra do MGR (p. 17–18, Figura 5): matriz 5 × 5, 25 células, nível = probabilidade × impacto (1 a 25)
  const Lg = require('../lib/logic.js');
  const FIG5 = [
    // impacto 1 a 5 (linhas) × probabilidade 1 a 5 (colunas): faixa esperada (0 Irrelevante … 4 Extremo)
    [0, 0, 1, 1, 2],
    [0, 1, 2, 2, 3],
    [1, 2, 2, 3, 3],
    [1, 2, 3, 3, 4],
    [2, 3, 3, 4, 4],
  ];
  const erradas = [];
  for (let i = 1; i <= 5; i++)
    for (let p = 1; p <= 5; p++) if (Lg.band(p * i) !== FIG5[i - 1][p - 1]) erradas.push(p + '×' + i);
  ok(
    !erradas.length,
    'as 25 células da matriz batem com a Figura 5' + (erradas.length ? ': ' + erradas : ''),
  );
  ok(Lg.LV[Lg.band(10)] === 'Alto', 'exemplo do MGR: 2 × 5 = 10 é Alto');
  // Premissa da exposição esperada: percentuais crescentes, e a nota 5 (nível 25, Extremo) nunca abaixo de 90%
  ok(
    [1, 2, 3, 4].every(n => Lg.PPCT[n] < Lg.PPCT[n + 1]) && Lg.PPCT[5] >= 0.9,
    'percentual da probabilidade 5 é de pelo menos 90%',
  );
  // Implantação: não há criação de conta pela API; o administrador é criado pelo comando no servidor
  let r = await call('x', 'GET', 'status');
  ok(r.s === 200 && r.needsSetup === undefined, 'status não oferece primeiro acesso');
  r = await call('x', 'POST', 'setup', { username: 'outro.user', password: 'senha-forte-1' });
  ok(r.s === 401 && count('users') === 0, 'não existe rota para criar conta sem login');
  for (const [u, m] of [
    ['ninguem.aqui', 'usuário inexistente'],
    ["x' OR '1'='1", 'usuário fora do formato'],
  ]) {
    r = await call('x', 'POST', 'login', { username: u, password: 'qualquer-senha' });
    ok(
      r.s === 401 && count('users') === 0 && count('sessions') === 0 && count('audit') === 0,
      m + ' é barrado e nada é gravado no banco',
    );
  }
  const adm = S.createAdmin({ username: 'admin.teste', password: 'senha-forte-0' });
  ok(
    adm.papel === 'admin' && adm.unit === null && adm.nome === 'admin.teste',
    'comando de implantação cria o administrador',
  );
  let dup = null;
  try {
    S.createAdmin({ username: 'outro.admin', password: 'senha-forte-0' });
  } catch (e) {
    dup = e;
  }
  ok(dup && dup.status === 403 && count('users') === 1, 'só existe um administrador');
  r = await call('adm', 'POST', 'login', { username: 'admin.teste', password: 'senha-forte-0' });
  ok(r.s === 200 && r.user.papel === 'admin', 'administrador entra com usuário e senha');
  let st = await call('adm', 'GET', 'state');
  ok(
    st.risks.length === 0 && st.units.length === 0 && st.audit.length === 1 && st.alerts.length === 0,
    'estado vazio: sem riscos e sem coordenadorias (só a auditoria da implantação)',
  );

  // Coordenadorias: criadas na hora pelo administrador
  for (const sigla of ['Cosegi', 'Coinfra', 'Teste-1']) {
    r = await call('adm', 'POST', 'units', { sigla, nome: 'Coordenadoria ' + sigla });
    ok(r.s === 200 && r.units.some(x => x.sigla === sigla), 'cria a coordenadoria ' + sigla);
  }
  r = await call('adm', 'POST', 'units', { sigla: 'cosegi' });
  ok(r.s === 422, 'sigla repetida (sem diferença de maiúsculas) é barrada');
  r = await call('adm', 'POST', 'units', { sigla: '<b>' });
  ok(r.s === 422, 'sigla com caracteres inválidos é barrada');
  r = await call('adm', 'POST', 'units/remove', { sigla: 'Teste-1' });
  ok(r.s === 200 && !r.units.some(x => x.sigla === 'Teste-1'), 'remove coordenadoria vazia');

  // Cadastro de pessoas: só o administrador, sempre com o relatório de pedido (tipo, documento, número SEI e data)
  const sei = n => ({
    tipo: 'sei',
    data: '2026-10-30',
    nome: 'Portaria de designação ' + n,
    numero: '00451234' + n,
    arquivo: 'portaria-' + n + '.pdf',
    pdf: Buffer.from('%PDF-1.4\n% documento de teste ' + n + '\n%%EOF\n').toString('base64'),
  });
  const base = { nome: 'Pessoa Sem SEI', username: 'sem.sei', papel: 'cgge', password: 'senha-forte-2' };
  r = await call('adm', 'POST', 'users', base);
  ok(r.s === 422, 'cadastro sem relatório de pedido é barrado');
  r = await call('adm', 'POST', 'users', { ...base, pedido: { ...sei(89), data: '' } });
  ok(r.s === 422 && /data/.test(r.error), 'relatório de pedido sem data é barrado');
  r = await call('adm', 'POST', 'users', { ...base, pedido: { ...sei(88), pdf: '' } });
  ok(r.s === 422 && /PDF/.test(r.error), 'tipo SEI sem PDF é barrado');
  r = await call('adm', 'POST', 'users', {
    ...base,
    username: 'formal.sem.pdf',
    pedido: { ...sei(87), tipo: 'formal', pdf: '', arquivo: '' },
  });
  ok(r.s === 200, 'pedido formal com número SEI e data é aceito sem PDF');
  for (const [u, s, m] of [
    ['teste1', 200, 'teste1 é criada sem relatório de pedido'],
    ['teste20', 200, 'teste20 é criada sem relatório de pedido'],
    ['teste21', 422, 'teste21 já não é conta de teste e exige o pedido'],
  ]) {
    r = await call('adm', 'POST', 'users', { ...base, username: u });
    ok(r.s === s, m);
  }
  r = await call('adm', 'POST', 'users', { ...base, pedido: { ...sei(90), numero: 'abc' } });
  ok(r.s === 422, 'número SEI inválido é barrado');
  r = await call('adm', 'POST', 'users', {
    ...base,
    pedido: { ...sei(91), pdf: Buffer.from('não é pdf').toString('base64') },
  });
  ok(r.s === 422 && /não é um PDF/.test(r.error), 'arquivo que não é PDF é barrado');
  r = await call('adm', 'POST', 'users', {
    ...base,
    papel: 'cadastrador',
    unit: 'Inexistente',
    pedido: sei(92),
  });
  ok(r.s === 422, 'coordenadoria que não foi criada é barrada');
  for (const [nome, username, papel, unit, i] of [
    ['Alta gestão teste', 'altagestao.teste', 'altagestao', null, 10],
    ['Pessoa Cad', 'cad.cosegi', 'cadastrador', 'Cosegi', 11],
    ['Pessoa Ges', 'ges.cosegi', 'gestor', 'Cosegi', 12],
    ['Outra Cad', 'cad.coinfra', 'cadastrador', 'Coinfra', 13],
    ['Consulta', 'cgge.user', 'cgge', null, 14],
  ]) {
    r = await call('adm', 'POST', 'users', {
      nome,
      username,
      papel,
      unit,
      password: 'senha-forte-2',
      pedido: sei(i),
    });
    ok(r.s === 200, 'cria ' + username + ' com o PDF do SEI');
  }
  r = await call('adm', 'POST', 'users', { ...base, papel: 'admin', pedido: sei(93) });
  ok(r.s === 422, 'não se cria um segundo administrador pela tela');
  r = await call('adm', 'POST', 'users', {
    nome: 'Gestor 2',
    username: 'ges2.cosegi',
    papel: 'gestor',
    unit: 'Cosegi',
    password: 'senha-forte-2',
    pedido: sei(15),
  });
  ok(r.s === 422, 'segundo gestor da unidade bloqueado');
  r = await call('adm', 'POST', 'units/remove', { sigla: 'Cosegi' });
  ok(r.s === 422, 'coordenadoria com pessoas não pode ser removida');
  st = await call('adm', 'GET', 'state');
  const cadCosegi = st.users.find(x => x.username === 'cad.cosegi');
  ok(
    cadCosegi &&
      cadCosegi.seiNumero === '0045123411' &&
      cadCosegi.seiTipo === 'sei' &&
      cadCosegi.seiData === '2026-10-30',
    'lista de pessoas traz tipo, número SEI e data do pedido',
  );
  const t1 = st.users.find(x => x.username === 'teste1');
  r = await call('adm', 'POST', 'users/' + t1.id + '/pedido', { pedido: sei(40) });
  st = await call('adm', 'GET', 'state');
  ok(
    r.s === 200 && st.users.find(x => x.username === 'teste1').seiNumero === '0045123440',
    'administrador registra o pedido de quem já tem conta',
  );
  const pdfRes = await handle(
    new Request('http://x/api/users/' + cadCosegi.id + '/sei', {
      headers: { cookie: 'mira_sid=' + jars.adm },
    }),
    ['users', cadCosegi.id, 'sei'],
  );
  const pdfTxt = Buffer.from(await pdfRes.arrayBuffer()).toString('latin1');
  ok(
    pdfRes.status === 200 &&
      pdfRes.headers.get('content-type') === 'application/pdf' &&
      /attachment/.test(pdfRes.headers.get('content-disposition')) &&
      pdfTxt.includes('documento de teste 11'),
    'administrador baixa o PDF do SEI da pessoa',
  );
  ok(
    st.audit.some(a => a.changes.some(c => c.campo === 'Número SEI' && c.para === '0045123411')),
    'auditoria registra o número SEI do cadastro',
  );
  r = await call('altagestao', 'POST', 'login', { username: 'altagestao.teste', password: 'senha-forte-2' });
  ok(r.s === 200, 'login altagestao.teste');
  r = await call('altagestao', 'POST', 'users', { ...base, pedido: sei(94) });
  ok(r.s === 403, 'Alta Gestão não cadastra pessoas');
  r = await call('altagestao', 'POST', 'units', { sigla: 'Outra' });
  ok(r.s === 403, 'Alta Gestão não cria coordenadoria');
  const pdfAlta = await handle(
    new Request('http://x/api/users/' + cadCosegi.id + '/sei', {
      headers: { cookie: 'mira_sid=' + jars.altagestao },
    }),
    ['users', cadCosegi.id, 'sei'],
  );
  ok(pdfAlta.status === 403, 'Alta Gestão não baixa o PDF do SEI');
  r = await call('altagestao', 'GET', 'state');
  ok(
    r.users.length === 0 && r.units.length === 2,
    'Alta Gestão vê as coordenadorias, mas não a lista de pessoas',
  );
  r = await call('cad', 'POST', 'login', { username: 'cad.cosegi', password: 'errada' });
  ok(r.s === 401, 'senha errada');
  // Segurança: trocar o X-Forwarded-For a cada tentativa não escapa do bloqueio (sem proxy confiável, ele é ignorado)
  let ult;
  for (let i = 0; i < 6; i++)
    ult = await call(
      'x',
      'POST',
      'login',
      { username: 'outro.usuario', password: 'errada' },
      {
        'x-forwarded-for': '10.0.0.' + i,
      },
    );
  ok(ult.s === 429, 'bloqueio de login não é burlado trocando o X-Forwarded-For');
  // Segurança: com MIRA_HTTPS=1 o cookie de sessão sai com Secure
  process.env.MIRA_HTTPS = '1';
  const rs = await handle(
    new Request('http://x/api/login', {
      method: 'POST',
      headers: { 'x-requested-with': 'mira', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ges.cosegi', password: 'senha-forte-2' }),
    }),
    ['login'],
  );
  delete process.env.MIRA_HTTPS;
  ok(/;\s*Secure/.test(rs.headers.get('set-cookie') || ''), 'cookie Secure com MIRA_HTTPS=1');
  for (const [k, u] of [
    ['cad', 'cad.cosegi'],
    ['ges', 'ges.cosegi'],
    ['cad2', 'cad.coinfra'],
    ['cgge', 'cgge.user'],
  ]) {
    r = await call(k, 'POST', 'login', { username: u, password: 'senha-forte-2' });
    ok(r.s === 200, 'login ' + u);
  }
  // Empresa terceirizada: pessoa do sistema que pode ser responsável por ação do PRR da coordenadoria que a contratou
  r = await call('adm', 'POST', 'users', {
    username: 'empresateste',
    papel: 'terceirizado',
    unit: 'Cosegi',
    password: 'senha-forte-2',
  });
  ok(r.s === 200 && r.user && r.user.papel === 'terceirizado', 'administrador cadastra empresa terceirizada');
  const emp = r.user;
  r = await call('ges', 'GET', 'state');
  const r2 = await call('cad2', 'GET', 'state');
  ok(
    r.team.some(t => t.id === emp.id) && !r2.team.some(t => t.id === emp.id),
    'empresa aparece só no time da coordenadoria que a contratou',
  );

  // Contexto antes do risco: sem escopo salvo, a coordenadoria não cadastra risco
  const ident = {
    titulo: 'Vazamento no Sistema X',
    causa: 'exploração de vulnerabilidades no Sistema X',
    evento: 'vazamento de dados pessoais',
    impacto: 'sanções ao Estado',
    objetivo: 'a segurança dos sistemas da Setic',
  };
  r = await call('cad', 'POST', 'risks', ident);
  ok(
    r.s === 422 && /contexto/.test(r.error) && count('risks') === 0,
    'sem contexto salvo o risco é recusado',
  );
  r = await call('cad', 'POST', 'ctx/escopo', { escopo: 'Sistemas da coordenadoria' });
  ok(r.s === 200, 'cadastrador salva o contexto antes do primeiro risco');

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
  // Regra do MGR (p. 14–15): controles existentes e linha do tempo vêm antes das notas e são obrigatórios
  r = await call('cad', 'POST', 'risks/R-001/aval', { prob: 2, imp: 5, linhaTempo: 'últimos 12 meses' });
  ok(r.s === 422 && /controles/i.test(r.error || ''), 'avaliação sem controles existentes é recusada');
  r = await call('cad', 'POST', 'risks/R-001/aval', { prob: 2, imp: 5, controles: 'Nenhum' });
  ok(r.s === 422 && /linha do tempo/i.test(r.error || ''), 'avaliação sem linha do tempo é recusada');
  r = await call('cad', 'POST', 'risks/R-001/aval', {
    prob: 2,
    imp: 5,
    exposicao: 4000000,
    controles: 'Antivírus e atualizações mensais',
    linhaTempo: 'últimos 12 meses',
  });
  ok(
    r.s === 200 &&
      r.risk.status === 'avaliado' &&
      r.risk.niveis.length === 1 &&
      r.risk.linhaTempo === 'últimos 12 meses' &&
      r.risk.controles === 'Antivírus e atualizações mensais',
    'avalia nível 10 com controles e linha do tempo',
  );
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(r.s === 422, 'enviar PRR vazio é barrado');
  const prr = {
    tratamento: 'mitigar',
    controles: 'x',
    acao: 'Análise periódica de vulnerabilidades',
    contingencia: 'Isolar o sistema afetado e acionar a equipe de resposta a incidentes',
    viabilidade: 'Viável com a equipe atual',
    restricoes: 'Nenhuma',
    recursos: 'Duas pessoas da equipe e a ferramenta de varredura já contratada',
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
  r = await call('cad', 'POST', 'risks/R-001/prr', { prr: { ...prr, responsavelId: cadCosegi.id } });
  // Cadastrador sem a permissão do cadastro não define responsável, prazo e custo: quem define é o gestor
  ok(
    r.s === 200 && r.risk.prr.custo === 0 && !r.risk.prr.prazo && !r.risk.prr.responsavelId,
    'salva PRR; sem permissão, responsável, prazo e custo ficam para o gestor',
  );
  r = await call('cad', 'POST', 'risks/R-001/prr', { prr: { ...prr, ideal: 7 } });
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(r.s === 422 && r.errors && r.errors.length, 'parâmetros incoerentes barrados');
  await call('cad', 'POST', 'risks/R-001/prr', { prr });

  // Tramitação do PRR: cada perfil só decide na sua vez; devolver exige motivo
  // Todo PRR diz o que fazer se o evento ocorrer; sem isso o envio é recusado
  await call('cad', 'POST', 'risks/R-001/prr', { prr: { ...prr, contingencia: '' } });
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(
    r.s === 422 && /evento ocorrer/.test(r.error || JSON.stringify(r)),
    'PRR sem plano para o evento é recusado',
  );
  // Regra do MGR (p. 21): restrições legais e recursos fazem parte do tratamento
  await call('cad', 'POST', 'risks/R-001/prr', { prr: { ...prr, restricoes: '' } });
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(r.s === 422, 'PRR sem restrições legais é recusado');
  await call('cad', 'POST', 'risks/R-001/prr', { prr });
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  ok(r.s === 200 && r.risk.status === 'ag_gestor', 'envia ao gestor');
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'altagestao-ok' });
  ok(r.s === 403, 'cadastrador não aprova');
  r = await call('altagestao', 'POST', 'risks/R-001/action', { action: 'altagestao-ok' });
  ok(r.s === 403, 'Alta Gestão não aprova antes do gestor');
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-dev' });
  ok(r.s === 422, 'devolver exige motivo');
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-dev', motivo: 'Detalhar a ação' });
  ok(r.s === 200 && r.risk.status === 'devolvido', 'gestor devolve');
  r = await call('cad', 'POST', 'risks/R-001/prr', {
    prr: { ...prr, acao: 'Análise periódica e correção em 15 dias' },
  });
  ok(r.s === 200, 'cadastrador ajusta após devolução');
  await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  // Gestor não valida sem responsável e prazo; o responsável tem de ser do time da coordenadoria
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-ok' });
  ok(r.s === 422 && /responsável/.test(r.error || ''), 'gestor não encaminha sem responsável');
  const fora = st.users.find(x => x.username === 'cad.coinfra');
  r = await call('ges', 'POST', 'risks/R-001/action', {
    action: 'gestor-ok',
    responsavelId: fora.id,
    prazo: '2026-12-30',
  });
  ok(r.s === 422, 'gestor não delega a alguém fora do time');
  r = await call('ges', 'POST', 'risks/R-001/action', {
    action: 'gestor-ok',
    responsavelId: cadCosegi.id,
    prazo: '2026-12-30',
    custo: 85000,
  });
  ok(r.s === 200 && r.risk.status === 'ag_altagestao', 'gestor encaminha');
  // Na devolução, a Alta Gestão pode indicar uma empresa terceirizada como responsável (e só empresa)
  r = await call('altagestao', 'POST', 'risks/R-001/action', {
    action: 'altagestao-dev',
    motivo: 'Ação exige empresa especializada',
    responsavelId: cadCosegi.id,
  });
  ok(r.s === 422, 'Alta Gestão só indica empresa terceirizada');
  r = await call('altagestao', 'POST', 'risks/R-001/action', {
    action: 'altagestao-dev',
    motivo: 'Ação exige empresa especializada',
    responsavelId: emp.id,
  });
  ok(
    r.s === 200 && r.risk.status === 'devolvido' && r.risk.prr.responsavel === 'empresateste',
    'Alta Gestão devolve indicando a empresa terceirizada',
  );
  await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-ok' });
  ok(r.s === 200 && r.risk.prr.responsavelId === emp.id, 'empresa indicada segue como responsável');
  // Regra do MGR (p. 21): a CSGR emite parecer; aprovar sem parecer é recusado
  r = await call('altagestao', 'POST', 'risks/R-001/action', { action: 'altagestao-ok' });
  ok(r.s === 422, 'aprovar sem parecer é recusado');
  r = await call('altagestao', 'POST', 'risks/R-001/action', {
    action: 'altagestao-ok',
    motivo: 'Parecer favorável: ação adequada ao risco.',
  });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'Alta Gestão aprova');

  // Monitoramento (fase 5) e trilha de auditoria
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'add-med', valor: 12 });
  ok(r.s === 200, 'medição 12 (crítico)');
  st = await call('altagestao', 'GET', 'state');
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
  // Regra do MGR (p. 22): mudança no nível é motivo de reavaliação, para cima ou para baixo
  st = await call('ges', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'nivel' && a.msg.includes('subiu de 10 para 15')),
    'aviso quando o nível sobe',
  );
  r = await call('cad', 'POST', 'risks/R-001/action', {
    action: 'reaval',
    prob: 2,
    imp: 5,
    motivo: 'Correção aplicada pelo fornecedor',
  });
  st = await call('ges', 'GET', 'state');
  ok(
    r.s === 200 && st.alerts.some(a => a.tipo === 'nivel' && a.msg.includes('baixou de 15 para 10')),
    'aviso quando o nível baixa',
  );
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
  st = await call('adm', 'GET', 'state');
  ok(
    st.risks.length === 0 && st.audit.length > 0 && st.audit.every(a => a.role === 'admin'),
    'administrador não recebe riscos e só vê na trilha o que ele fez',
  );
  r = await call('adm', 'POST', 'risks/R-001/aval', { prob: 1, imp: 1 });
  ok(r.s === 404, 'administrador não acessa risco por id');

  // Quadro: só o gestor da coordenadoria delega quem resolve, e só para gente da própria coordenadoria
  st = await call('ges', 'GET', 'state');
  const cadId = st.team.find(t => t.nome === 'cad.cosegi').id;
  const outraId = (await call('adm', 'GET', 'state')).users.find(x => x.username === 'cad.coinfra').id;
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'delegar', para: cadId });
  ok(r.s === 403, 'cadastrador não delega');
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'delegar', para: outraId });
  ok(r.s === 422, 'não delega a pessoa de outra coordenadoria');
  r = await call('ges', 'POST', 'risks/R-001/action', {
    action: 'delegar',
    para: cadId,
    nota: 'Corrigir as vulnerabilidades críticas',
  });
  ok(
    r.s === 200 && r.risk.delegado.nome === 'cad.cosegi' && r.risk.delegado.por === 'ges.cosegi',
    'gestor delega o risco',
  );
  st = await call('cad', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'delegado') &&
      st.audit.some(a => a.action === 'Delegou o risco' && a.changes[0].para === 'cad.cosegi'),
    'delegação gera aviso e fica na auditoria',
  );
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'delegar', para: '' });
  ok(r.s === 200 && r.risk.delegado === null, 'gestor retira o responsável');

  // Coordenadoria: nome por extenso editável pelo administrador; pessoa apagada de vez (menos o administrador)
  r = await call('adm', 'POST', 'units/nome', { sigla: 'Cosegi', nome: 'Nome por extenso de teste' });
  ok(
    r.s === 200 && r.units.find(x => x.sigla === 'Cosegi').nome === 'Nome por extenso de teste',
    'administrador altera o nome por extenso',
  );
  r = await call('altagestao', 'POST', 'units/nome', { sigla: 'Cosegi', nome: 'Outro' });
  ok(r.s === 403, 'Alta Gestão não altera o nome da coordenadoria');
  st = await call('cad', 'GET', 'state');
  ok(
    st.units.length === 1 && st.units[0].nome === 'Nome por extenso de teste',
    'cadastrador recebe o nome por extenso da própria coordenadoria',
  );
  r = await call('adm', 'POST', 'users/' + adm.id + '/apagar', {});
  ok(r.s === 422, 'a conta do administrador não pode ser apagada');
  const cgge = (
    await call('adm', 'POST', 'users', {
      username: 'apagar.teste',
      papel: 'cgge',
      password: 'senha-forte-2',
      pedido: sei(30),
    })
  ).user;
  await call('apagar', 'POST', 'login', { username: 'apagar.teste', password: 'senha-forte-2' });
  r = await call('altagestao', 'POST', 'users/' + cgge.id + '/apagar', {});
  ok(r.s === 403, 'Alta Gestão não apaga pessoas');
  r = await call('adm', 'POST', 'users/' + cgge.id + '/apagar', {});
  ok(r.s === 200, 'administrador apaga uma pessoa');
  r = await call('apagar', 'GET', 'state');
  ok(r.s === 401, 'pessoa apagada perde a sessão');
  r = await call('x', 'POST', 'login', { username: 'apagar.teste', password: 'senha-forte-2' });
  ok(r.s === 401, 'pessoa apagada não entra mais');

  // Depois do evento: retomar o tratamento ou reabrir o PRR (com motivo); o gestor também pode agir
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'evento' });
  ok(r.s === 200 && r.risk.status === 'ocorrido', 'cadastrador registra que o evento ocorreu');
  st = await call('ges', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'evento' && a.msg.includes('Faça agora: Isolar o sistema afetado')),
    'aviso de evento traz o que fazer (plano do PRR)',
  );
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'retomar' });
  ok(r.s === 422, 'retomar o tratamento exige motivo');
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'retomar', motivo: 'Evento contido' });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'gestor retoma o tratamento depois do evento');
  r = await call('ges', 'POST', 'risks/R-001/action', { action: 'add-med', valor: 3 });
  ok(r.s === 200, 'gestor registra medição');
  r = await call('cad', 'POST', 'risks/R-001/action', {
    action: 'revisar-prr',
    motivo: 'Ação precisa mudar',
  });
  ok(r.s === 200 && r.risk.status === 'avaliado', 'PRR reaberto para revisão');
  r = await call('cad', 'POST', 'risks/R-001/prr', {
    prr: { ...prr, acao: 'Ação revisada depois do evento' },
  });
  ok(r.s === 200, 'PRR reaberto pode ser editado');
  await call('cad', 'POST', 'risks/R-001/action', { action: 'send-prr' });
  await call('ges', 'POST', 'risks/R-001/action', { action: 'gestor-ok' });
  r = await call('altagestao', 'POST', 'risks/R-001/action', {
    action: 'altagestao-ok',
    motivo: 'Parecer favorável à revisão.',
  });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'PRR revisado passa de novo pelas aprovações');
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'concluir-acao' });
  ok(r.s === 200 && !!r.risk.prr.concluidaEm, 'ação do PRR marcada como concluída');
  r = await call('cad', 'POST', 'risks/R-001/action', { action: 'concluir-acao' });
  ok(r.s === 403, 'ação já concluída não é concluída de novo');
  r = await call('cad2', 'POST', 'risks/R-001/action', { action: 'revisar-prr', motivo: 'tentativa' });
  ok(r.s === 404, 'outra coordenadoria não reabre o PRR');
  r = await call('ges', 'POST', 'ctx/escopo', { escopo: 'Sistemas da coordenadoria, revisado pelo gestor' });
  ok(r.s === 200, 'gestor edita o contexto da coordenadoria');
  r = await call('ges', 'POST', 'risks', { ...ident, titulo: 'Risco aberto pelo gestor' });
  ok(
    r.s === 200 && r.risk.unit === 'Cosegi' && r.risk.criadoPor === 'ges.cosegi',
    'gestor cria risco na coordenadoria',
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
