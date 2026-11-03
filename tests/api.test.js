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
// Fim do número de um risco cadastrado neste mês: "-MM-AAAA" (horário de Brasília).
const FIM_ID = (() => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return '-' + p.find(x => x.type === 'month').value + '-' + p.find(x => x.type === 'year').value;
})();
// Número esperado do primeiro risco do teste.
const R1 = 'R-0001' + FIM_ID;
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
  // Sem residual informado não há redução (antes, 5 × 5 com R$ 1 mi mostrava R$ 840 mil de redução inventada)
  const semRes = Lg.econ({
    prob: 5,
    imp: 5,
    exposicao: 1e6,
    prr: { tratamento: 'mitigar', custo: 50000, probRes: '', impRes: '' },
  });
  ok(semRes.gain === 0 && semRes.res === semRes.cur, 'PRR sem residual não gera redução');
  ok(
    Lg.prrErrors({ probRes: '', impRes: '' }, { semDefinir: true }).includes(
      'Informe a probabilidade e o impacto residuais.',
    ),
    'PRR sem residual não é enviado',
  );
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
    ['Conformidade', 'ascf.user', 'ascf', 'Cosegi', 15],
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
    ['ascf', 'ascf.user'],
    ['altagestao', 'altagestao.teste'],
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
  ok(
    r.s === 200 && r.risk.id === R1 && r.risk.status === 'rascunho',
    'cria o primeiro risco com o número R-0001-MM-AAAA',
  );
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
  r = await call('cad2', 'POST', 'risks/' + R1 + '/aval', { prob: 2, imp: 5 });
  ok(r.s === 404, 'outra coordenadoria não acessa por id');

  // Avaliação (fase 3) e PRR (fase 4)
  // Regra do MGR (p. 14–15): controles existentes e linha do tempo vêm antes das notas e são obrigatórios
  r = await call('cad', 'POST', 'risks/' + R1 + '/aval', { prob: 2, imp: 5, linhaTempo: 'últimos 12 meses' });
  ok(r.s === 422 && /controles/i.test(r.error || ''), 'avaliação sem controles existentes é recusada');
  r = await call('cad', 'POST', 'risks/' + R1 + '/aval', { prob: 2, imp: 5, controles: 'Nenhum' });
  ok(r.s === 422 && /linha do tempo/i.test(r.error || ''), 'avaliação sem linha do tempo é recusada');
  r = await call('cad', 'POST', 'risks/' + R1 + '/aval', {
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
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
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
  r = await call('cad', 'POST', 'risks/' + R1 + '/prr', { prr: { ...prr, responsavelId: cadCosegi.id } });
  // Cadastrador sem a permissão do cadastro não define responsável, prazo e custo: quem define é o gestor
  ok(
    r.s === 200 && r.risk.prr.custo === 0 && !r.risk.prr.prazo && !r.risk.prr.responsavelId,
    'salva PRR; sem permissão, responsável, prazo e custo ficam para o gestor',
  );
  r = await call('cad', 'POST', 'risks/' + R1 + '/prr', { prr: { ...prr, ideal: 7 } });
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
  ok(r.s === 422 && r.errors && r.errors.length, 'parâmetros incoerentes barrados');
  await call('cad', 'POST', 'risks/' + R1 + '/prr', { prr });

  // Tramitação do PRR: cada perfil só decide na sua vez; devolver exige motivo
  // Todo PRR diz o que fazer se o evento ocorrer; sem isso o envio é recusado
  await call('cad', 'POST', 'risks/' + R1 + '/prr', { prr: { ...prr, contingencia: '' } });
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
  ok(
    r.s === 422 && /evento ocorrer/.test(r.error || JSON.stringify(r)),
    'PRR sem plano para o evento é recusado',
  );
  // Regra do MGR (p. 21): restrições legais e recursos fazem parte do tratamento
  await call('cad', 'POST', 'risks/' + R1 + '/prr', { prr: { ...prr, restricoes: '' } });
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
  ok(r.s === 422, 'PRR sem restrições legais é recusado');
  await call('cad', 'POST', 'risks/' + R1 + '/prr', { prr });
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
  ok(r.s === 200 && r.risk.status === 'ag_gestor', 'envia ao gestor');
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'altagestao-ok' });
  ok(r.s === 403, 'cadastrador não aprova');
  r = await call('altagestao', 'POST', 'risks/' + R1 + '/action', { action: 'altagestao-ok' });
  ok(r.s === 403, 'Alta Gestão não aprova antes do gestor');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'gestor-dev' });
  ok(r.s === 422, 'devolver exige motivo');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', {
    action: 'gestor-dev',
    motivo: 'Detalhar a ação',
  });
  ok(r.s === 200 && r.risk.status === 'devolvido', 'gestor devolve');
  r = await call('cad', 'POST', 'risks/' + R1 + '/prr', {
    prr: { ...prr, acao: 'Análise periódica e correção em 15 dias' },
  });
  ok(r.s === 200, 'cadastrador ajusta após devolução');
  await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
  // Gestor não valida sem responsável e prazo; o responsável tem de ser do time da coordenadoria
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'gestor-ok' });
  ok(r.s === 422 && /responsável/.test(r.error || ''), 'gestor não encaminha sem responsável');
  const fora = st.users.find(x => x.username === 'cad.coinfra');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', {
    action: 'gestor-ok',
    responsavelId: fora.id,
    prazo: '2026-12-30',
  });
  ok(r.s === 422, 'gestor não delega a alguém fora do time');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', {
    action: 'gestor-ok',
    responsavelId: cadCosegi.id,
    prazo: '2026-12-30',
    custo: 85000,
  });
  ok(r.s === 200 && r.risk.status === 'ag_altagestao', 'gestor encaminha');
  // Na devolução, a Alta Gestão pode indicar uma empresa terceirizada como responsável (e só empresa)
  r = await call('altagestao', 'POST', 'risks/' + R1 + '/action', {
    action: 'altagestao-dev',
    motivo: 'Ação exige empresa especializada',
    responsavelId: cadCosegi.id,
  });
  ok(r.s === 422, 'Alta Gestão só indica empresa terceirizada');
  r = await call('altagestao', 'POST', 'risks/' + R1 + '/action', {
    action: 'altagestao-dev',
    motivo: 'Ação exige empresa especializada',
    responsavelId: emp.id,
  });
  ok(
    r.s === 200 && r.risk.status === 'devolvido' && r.risk.prr.responsavel === 'empresateste',
    'Alta Gestão devolve indicando a empresa terceirizada',
  );
  // O supervisor ajusta e reenvia o PRR devolvido pela Alta Gestão: o envio dele já é a validação,
  // e o PRR volta à Alta Gestão em vez de parar na fila do próprio gestor.
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
  ok(
    r.s === 200 && r.risk.status === 'ag_altagestao',
    'gestor reenvia o PRR devolvido e ele volta à Alta Gestão',
  );
  ok(r.risk.prr.responsavelId === emp.id, 'empresa indicada segue como responsável');
  st = await call('altagestao', 'GET', 'state');
  ok(
    st.risks.some(x => x.id === R1 && x.status === 'ag_altagestao') &&
      st.alerts.filter(a => a.tipo === 'aprovacao' && a.riskId === R1).length >= 2,
    'Alta Gestão vê o PRR reenviado e recebe o aviso de novo',
  );
  // Regra do MGR (p. 21): a CSGR emite parecer; aprovar sem parecer é recusado
  r = await call('altagestao', 'POST', 'risks/' + R1 + '/action', { action: 'altagestao-ok' });
  ok(r.s === 422, 'aprovar sem parecer é recusado');
  r = await call('altagestao', 'POST', 'risks/' + R1 + '/action', {
    action: 'altagestao-ok',
    motivo: 'Parecer favorável: ação adequada ao risco.',
  });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'Alta Gestão aprova');
  // A empresa terceirizada responsável pela ação informa a execução (medição), mas não reavalia o nível
  r = await call('emp', 'POST', 'login', { username: 'empresateste', password: 'senha-forte-2' });
  r = await call('emp', 'POST', 'risks/' + R1 + '/action', { action: 'add-med', valor: '' });
  ok(r.s === 422 && /numérico/.test(r.error), 'empresa responsável pela ação pode registrar medição');
  r = await call('emp', 'POST', 'risks/' + R1 + '/action', {
    action: 'reaval',
    prob: 1,
    imp: 1,
    motivo: 'x',
  });
  ok(r.s === 403, 'empresa responsável não reavalia o nível');

  // Pesquisa do histórico por data: o período vem do servidor, com as mesmas regras de quem vê o quê
  const hoje0 = new Date(Date.now() - 864e5).toISOString(),
    hoje1 = new Date(Date.now() + 864e5).toISOString();
  r = await call('altagestao', 'GET', 'audit?ini=' + hoje0 + '&fim=' + hoje1);
  ok(r.s === 200 && r.audit.some(a => a.riskId === R1), 'histórico do período traz o que aconteceu');
  r = await call('cad2', 'GET', 'audit?ini=' + hoje0 + '&fim=' + hoje1);
  ok(
    r.s === 200 && !r.audit.some(a => a.unit === 'Cosegi'),
    'histórico do período não mostra outra coordenadoria',
  );
  r = await call('altagestao', 'GET', 'audit?ini=2001-01-01T00:00:00.000Z&fim=2001-01-02T00:00:00.000Z');
  ok(r.s === 200 && r.audit.length === 0, 'período sem registros volta vazio');
  r = await call('altagestao', 'GET', 'audit?ini=' + hoje1 + '&fim=' + hoje0);
  ok(r.s === 422, 'data inicial depois da final é recusada');

  // "Estou ciente" num alerta que exige ação: registra quem e quando, sem mudar a situação do risco
  const msgPrazo = 'Prazo da ação em 5 dia(s): risco de teste';
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', {
    action: 'ciente',
    chave: 'prazo-' + R1,
    msg: msgPrazo,
  });
  ok(
    r.s === 200 &&
      r.risk.ciencias.length === 1 &&
      r.risk.ciencias[0].por &&
      r.risk.status === 'em_tratamento',
    'ciência registrada e o risco continua como estava',
  );
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', {
    action: 'ciente',
    chave: 'prazo-' + R1,
    msg: msgPrazo,
  });
  ok(r.s === 200 && r.risk.ciencias.length === 1, 'ciência repetida não duplica');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', {
    action: 'ciente',
    chave: 'prazo-R-999',
    msg: msgPrazo,
  });
  ok(r.s === 422, 'ciência de alerta de outro risco é recusada');
  r = await call('cad2', 'POST', 'risks/' + R1 + '/action', {
    action: 'ciente',
    chave: 'prazo-' + R1,
    msg: msgPrazo,
  });
  ok(r.s === 404, 'outra coordenadoria não registra ciência');
  st = await call('ges', 'GET', 'state');
  ok(
    st.audit.some(a => a.riskId === R1 && a.action === 'Registrou ciência do alerta'),
    'ciência vai para o histórico',
  );
  // Marcar um aviso só como lido
  const naoLidos = st.alerts.filter(a => !Object.values(a.lido)[0]);
  ok(naoLidos.length >= 2 && naoLidos.every(a => a.id), 'avisos chegam com o identificador');
  await call('ges', 'POST', 'alerts/read', { id: naoLidos[0].id });
  st = await call('ges', 'GET', 'state');
  ok(
    st.alerts.find(a => a.id === naoLidos[0].id).lido[Object.keys(st.alerts[0].lido)[0]] === true &&
      st.alerts.find(a => a.id === naoLidos[1].id).lido[Object.keys(st.alerts[0].lido)[0]] === false,
    'marca só aquele aviso como lido',
  );

  // Monitoramento (fase 5) e trilha de auditoria
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'add-med', valor: 12 });
  ok(r.s === 200, 'medição 12 (crítico)');
  st = await call('altagestao', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'metrica'),
    'alerta de métrica gerado',
  );
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', {
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
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', {
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
  const ch = st.audit.filter(a => a.riskId === R1);
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
  r = await call('adm', 'POST', 'risks/' + R1 + '/aval', { prob: 1, imp: 1 });
  ok(r.s === 404, 'administrador não acessa risco por id');

  // Quadro: só o gestor da coordenadoria delega quem resolve, e só para gente da própria coordenadoria
  st = await call('ges', 'GET', 'state');
  const cadId = st.team.find(t => t.nome === 'cad.cosegi').id;
  const outraId = (await call('adm', 'GET', 'state')).users.find(x => x.username === 'cad.coinfra').id;
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'delegar', para: cadId });
  ok(r.s === 403, 'cadastrador não delega');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'delegar', para: outraId });
  ok(r.s === 422, 'não delega a pessoa de outra coordenadoria');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', {
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
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'delegar', para: '' });
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
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'evento' });
  ok(r.s === 200 && r.risk.status === 'ocorrido', 'cadastrador registra que o evento ocorreu');
  st = await call('ges', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'evento' && a.msg.includes('Faça agora: Isolar o sistema afetado')),
    'aviso de evento traz o que fazer (plano do PRR)',
  );
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'retomar' });
  ok(r.s === 422, 'retomar o tratamento exige motivo');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'retomar', motivo: 'Evento contido' });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'gestor retoma o tratamento depois do evento');
  r = await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'add-med', valor: 3 });
  ok(r.s === 200, 'gestor registra medição');
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', {
    action: 'revisar-prr',
    motivo: 'Ação precisa mudar',
  });
  ok(r.s === 200 && r.risk.status === 'avaliado', 'PRR reaberto para revisão');
  r = await call('cad', 'POST', 'risks/' + R1 + '/prr', {
    prr: { ...prr, acao: 'Ação revisada depois do evento' },
  });
  ok(r.s === 200, 'PRR reaberto pode ser editado');
  await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'send-prr' });
  await call('ges', 'POST', 'risks/' + R1 + '/action', { action: 'gestor-ok' });
  r = await call('altagestao', 'POST', 'risks/' + R1 + '/action', {
    action: 'altagestao-ok',
    motivo: 'Parecer favorável à revisão.',
  });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'PRR revisado passa de novo pelas aprovações');
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'concluir-acao' });
  ok(r.s === 200 && !!r.risk.prr.concluidaEm, 'ação do PRR marcada como concluída');
  r = await call('cad', 'POST', 'risks/' + R1 + '/action', { action: 'concluir-acao' });
  ok(r.s === 403, 'ação já concluída não é concluída de novo');
  r = await call('cad2', 'POST', 'risks/' + R1 + '/action', { action: 'revisar-prr', motivo: 'tentativa' });
  ok(r.s === 404, 'outra coordenadoria não reabre o PRR');
  r = await call('ges', 'POST', 'ctx/escopo', { escopo: 'Sistemas da coordenadoria, revisado pelo gestor' });
  ok(r.s === 200, 'gestor edita o contexto da coordenadoria');
  r = await call('ges', 'POST', 'risks', { ...ident, titulo: 'Risco aberto pelo gestor' });
  ok(
    r.s === 200 && r.risk.unit === 'Cosegi' && r.risk.criadoPor === 'ges.cosegi',
    'gestor cria risco na coordenadoria',
  );
  ok(r.risk.id === 'R-0002' + FIM_ID, 'o segundo risco do mês recebe R-0002-MM-AAAA');
  // Risco com o número antigo (R-007), de antes do formato com mês e ano: continua abrindo e sendo editado,
  // e não entra na conta do próximo número.
  open()
    .prepare('INSERT INTO risks(id,unit,data) VALUES (?,?,?)')
    .run(
      'R-007',
      'Cosegi',
      JSON.stringify({ ...ident, id: 'R-007', unit: 'Cosegi', status: 'rascunho', niveis: [], prr: null }),
    );
  r = await call('cad', 'POST', 'risks/R-007/ident', { ...ident, titulo: 'Risco de número antigo' });
  ok(
    r.s === 200 && r.risk.titulo === 'Risco de número antigo',
    'risco com o número antigo continua editável',
  );
  r = await call('ges', 'POST', 'risks', { ...ident, titulo: 'Terceiro risco do mês' });
  ok(r.risk.id === 'R-0003' + FIM_ID, 'o número antigo não muda a contagem do mês');

  // Contexto (fase 1), assistente de IA sem chave, avisos e segurança da sessão
  r = await call('cad', 'POST', 'ctx/escopo', { escopo: 'Riscos de segurança da informação' });
  ok(r.s === 200, 'salva escopo');
  r = await call('cad', 'POST', 'ctx/marco', { op: 'add', marco: 'Primeira avaliação', data: '2026-11-30' });
  ok(r.s === 200 && r.ctx.marcos.length === 1, 'inclui marco');
  r = await call('cgge', 'POST', 'ctx/escopo', { escopo: 'x' });
  ok(r.s === 403, 'CGGE não edita contexto');
  r = await call('cad', 'POST', 'ai', { text: 'algo' });
  ok(r.s === 503, 'IA sem chave retorna 503 claro');
  // Etapa 2: decisões da CSGR (premissas financeiras, apetite a risco e priorização)
  r = await call('cad', 'POST', 'config/apetite', { nivelMax: 4 });
  ok(r.s === 403, 'só a CSGR registra decisões');
  r = await call('altagestao', 'POST', 'config/premissas', { pct: { 1: 5, 2: 20, 3: 45, 4: 75, 5: 80 } });
  ok(r.s === 422, 'premissa com a nota 5 abaixo de 90% é recusada');
  r = await call('altagestao', 'POST', 'config/premissas', {
    pct: { 1: 5, 2: 20, 3: 45, 4: 75, 5: 95 },
    aprovada: true,
  });
  ok(
    r.s === 200 && r.config.premissas.aprovada && r.config.premissas.pct[3] === 0.45,
    'CSGR aprova as premissas',
  );
  r = await call('altagestao', 'POST', 'config/apetite', { nivelMax: 4 });
  ok(
    r.s === 200 && r.config.apetite.nivelMax === 4 && r.config.apetite.por,
    'CSGR registra o apetite a risco',
  );
  r = await call('altagestao', 'POST', 'config/priorizacao', { metodo: 'nivel-prazo-situacao' });
  ok(r.s === 200 && r.config.priorizacao.metodo === 'nivel-prazo-situacao', 'CSGR escolhe a priorização');
  st = await call('altagestao', 'GET', 'state');
  ok(
    st.config.apetite.nivelMax === 4 &&
      st.audit.some(x => /Registrou decisão da CSGR: limite para aceitar o risco/.test(x.action)),
    'decisão vai para o estado e para a auditoria, com o nome legível',
  );
  ok(
    st.audit
      .filter(x => /Registrou decisão da CSGR/.test(x.action))
      .every(x => (x.changes || x.mudancas || []).every(c => !/[{}]/.test(String(c.para)))),
    'valores das decisões no histórico sem JSON',
  );
  // Com o apetite em 4, um risco de nível 10 não pode ser só aceito
  r = await call('cad', 'POST', 'risks', {
    titulo: 'Risco para o apetite',
    causa: 'falta de energia no prédio',
    evento: 'parada do serviço de protocolo',
    impacto: 'atraso no atendimento',
    objetivo: 'manter o atendimento ao cidadão',
  });
  const rap = r.risk.id;
  await call('cad', 'POST', 'risks/' + rap + '/aval', {
    prob: 2,
    imp: 5,
    controles: 'Nenhum',
    linhaTempo: 'últimos 12 meses',
  });
  await call('cad', 'POST', 'risks/' + rap + '/prr', {
    prr: { ...prr, tratamento: 'aceitar', probRes: 2, impRes: 5 },
  });
  r = await call('cad', 'POST', 'risks/' + rap + '/action', { action: 'send-prr' });
  ok(r.s === 422 && /apetite/.test(r.error || ''), 'Aceitar acima do apetite não é enviado');
  await call('altagestao', 'POST', 'config/apetite', { nivelMax: '' });
  r = await call('cad', 'POST', 'risks/' + rap + '/action', { action: 'send-prr' });
  ok(r.s === 200, 'sem apetite definido, Aceitar volta a valer');
  // Apetite por coordenadoria vale sobre o geral; coordenadoria inexistente é recusada
  r = await call('altagestao', 'POST', 'config/apetite', { nivelMax: '', porUnidade: { Inexistente: 4 } });
  ok(r.s === 422, 'apetite de coordenadoria inexistente é recusado');
  r = await call('altagestao', 'POST', 'config/apetite', { nivelMax: 9, porUnidade: { Cosegi: 4 } });
  ok(
    r.s === 200 && Lg.apetiteDe(r.config, 'Cosegi') === 4 && Lg.apetiteDe(r.config, 'Coinfra') === 9,
    'apetite da coordenadoria vale sobre o geral',
  );
  await call('altagestao', 'POST', 'config/apetite', { nivelMax: '', porUnidade: {} });
  // Alçada do gestor (MGR p. 8): PRR acima do limite chega à CSGR marcado
  r = await call('altagestao', 'POST', 'config/alcada', {
    porUnidade: { Cosegi: { nivelMax: 5, exposicaoMax: '' } },
  });
  ok(r.s === 200 && r.config.alcada.porUnidade.Cosegi.nivelMax === 5, 'CSGR registra a alçada do gestor');
  r = await call('ges', 'POST', 'risks/' + rap + '/action', {
    action: 'gestor-ok',
    responsavelId: cadCosegi.id,
    prazo: '2026-12-30',
  });
  ok(
    r.s === 200 && r.risk.status === 'ag_altagestao' && /nível 10 acima de 5/.test(r.risk.acimaAlcada || ''),
    'PRR acima da alçada chega marcado à CSGR',
  );
  // Problemas: o que já está acontecendo, com o plano de agora, ligado ao risco que ocorreu
  r = await call('altagestao', 'POST', 'risks/' + rap + '/action', {
    action: 'altagestao-ok',
    motivo: 'Parecer favorável.',
  });
  ok(r.s === 200 && r.risk.status === 'em_tratamento', 'risco do apetite aprovado para o teste de problema');
  const hojeBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const prob = {
    titulo: 'Protocolo fora do ar',
    descricao: 'O serviço de protocolo parou por falta de energia no prédio.',
    afeta: 'atendimento ao cidadão',
    desde: hojeBR,
    acao: 'Ligar o gerador e avisar o atendimento.',
    responsavelId: cadCosegi.id,
    prazo: '2099-12-31',
  };
  r = await call('cgge', 'POST', 'problemas', prob);
  ok(r.s === 403 && count('problemas') === 0, 'CGGE não registra problema');
  r = await call('cad', 'POST', 'problemas', { ...prob, acao: '' });
  ok(
    r.s === 422 && /agora/.test(r.error) && count('problemas') === 0,
    'problema sem o que fazer agora é recusado',
  );
  r = await call('cad', 'POST', 'problemas', { ...prob, desde: '2099-01-01' });
  ok(r.s === 422 && /futuro/.test(r.error), 'problema que começa no futuro é recusado');
  r = await call('cad', 'POST', 'problemas', { ...prob, responsavelId: 'x' });
  ok(r.s === 422 && /responsável/.test(r.error), 'responsável fora da coordenadoria é recusado');
  r = await call('cad', 'POST', 'problemas', { ...prob, riscoId: rap });
  const P1 = r.problema && r.problema.id;
  ok(
    r.s === 200 && P1 === 'P-0001' + FIM_ID && r.problema.status === 'aberto' && r.problema.riscoId === rap,
    'cadastrador registra o problema P-0001-MM-AAAA ligado ao risco',
  );
  st = await call('altagestao', 'GET', 'state');
  ok(
    st.risks.find(x => x.id === rap).status === 'ocorrido' &&
      st.risks.find(x => x.id === rap).problemas.includes(P1) &&
      st.alerts.some(a => a.tipo === 'problema' && a.riskId === P1) &&
      st.problemas.some(x => x.id === P1),
    'risco em tratamento passa a "evento ocorreu" e a Alta Gestão vê o problema e o aviso',
  );
  ok(
    st.audit.some(a => a.riskId === P1 && a.action === 'Registrou o problema') &&
      st.audit.some(a => a.riskId === rap && a.action === 'Registrou que o evento ocorreu'),
    'problema e evento do risco vão para o histórico',
  );
  r = await call('cad2', 'GET', 'state');
  ok(!r.problemas.some(x => x.id === P1), 'outra coordenadoria não vê o problema');
  r = await call('cad2', 'POST', 'problemas/' + P1 + '/action', { action: 'andamento', texto: 'tentativa' });
  ok(r.s === 404, 'outra coordenadoria não mexe no problema');
  r = await call('altagestao', 'POST', 'problemas/' + P1 + '/action', {
    action: 'andamento',
    texto: 'Priorizar o atendimento presencial.',
  });
  ok(r.s === 200 && r.problema.andamento.length === 1, 'Alta Gestão orienta sobre o problema');
  r = await call('altagestao', 'POST', 'problemas/' + P1 + '/action', {
    action: 'resolver',
    solucao: 'x'.repeat(9),
  });
  ok(r.s === 403, 'Alta Gestão não resolve o problema da coordenadoria');
  r = await call('ges', 'POST', 'problemas/' + P1 + '/action', {
    action: 'plano',
    acao: prob.acao,
    responsavelId: cadCosegi.id,
    prazo: '2099-11-30',
  });
  ok(r.s === 200 && r.problema.plano.prazo === '2099-11-30', 'gestor muda o prazo do plano');
  r = await call('ges', 'POST', 'problemas/' + P1 + '/action', {
    action: 'ciente',
    chave: 'prob-' + P1,
    msg: 'Problema acontecendo agora',
  });
  await call('ges', 'POST', 'problemas/' + P1 + '/action', {
    action: 'ciente',
    chave: 'prob-' + P1,
    msg: 'Problema acontecendo agora',
  });
  ok(r.s === 200 && r.problema.ciencias.length === 1, '"Estou ciente" no problema, sem repetir');
  r = await call('cad', 'POST', 'problemas/' + P1 + '/action', { action: 'resolver', solucao: '' });
  ok(r.s === 422, 'resolver exige dizer o que resolveu');
  r = await call('cad', 'POST', 'problemas/' + P1 + '/action', {
    action: 'resolver',
    solucao: 'Energia restabelecida e gerador revisado.',
  });
  ok(
    r.s === 200 && r.problema.status === 'resolvido' && r.problema.resolvidoEm,
    'cadastrador resolve o problema',
  );
  r = await call('cad', 'POST', 'problemas/' + P1 + '/action', { action: 'reabrir' });
  ok(r.s === 422, 'reabrir exige motivo');
  r = await call('cad', 'POST', 'risks', {
    titulo: 'Queda de energia no prédio do protocolo',
    causa: 'falta de gerador revisado no prédio',
    evento: 'nova parada do serviço de protocolo',
    impacto: 'atraso no atendimento',
    objetivo: 'manter o atendimento ao cidadão',
    origemProblema: P1,
  });
  ok(r.s === 200 && r.risk.origemProblema === P1, 'risco novo cadastrado a partir do problema');
  st = await call('cad', 'GET', 'state');
  ok(
    st.problemas.find(x => x.id === P1).riscosNovos.includes(r.risk.id),
    'o problema guarda o risco cadastrado para que não volte a acontecer',
  );
  r = await call('cad2', 'POST', 'risks', {
    titulo: 'Risco de outra coordenadoria',
    causa: 'causa qualquer bem descrita',
    evento: 'evento qualquer',
    impacto: 'impacto qualquer',
    objetivo: 'objetivo qualquer',
    origemProblema: P1,
  });
  ok(r.s !== 200, 'outra coordenadoria não liga risco ao problema');
  r = await call('cad', 'POST', 'problemas', { ...prob, titulo: 'Segundo problema' });
  ok(r.s === 200 && r.problema.id === 'P-0002' + FIM_ID && !r.problema.riscoId, 'problema sem risco ligado');
  // ASCF: elabora o MGR em articulação com a CSGR
  st = await call('ascf', 'GET', 'state');
  ok(
    st.me.unit === null && st.risks.length > 0 && st.problemas.length > 0 && st.mgr,
    'ASCF fica sem coordenadoria e consulta riscos e problemas de todas',
  );
  r = await call('ascf', 'POST', 'risks', { ...ident });
  ok(r.s === 403, 'ASCF não cadastra risco');
  r = await call('ascf', 'POST', 'config/apetite', { nivelMax: 4 });
  ok(r.s === 403, 'ASCF não registra decisões da CSGR');
  const ajuste = {
    titulo: 'Linha do tempo padrão',
    oQue: 'Usar 12 meses como linha do tempo padrão.',
    porQue: 'Cada coordenadoria usa um período.',
    onde: 'p. 15',
  };
  r = await call('cad', 'POST', 'mgr', { action: 'propor', ...ajuste });
  ok(r.s === 403, 'só a ASCF propõe ajuste ao MGR');
  r = await call('ascf', 'POST', 'mgr', { action: 'propor', ...ajuste, porQue: '' });
  ok(r.s === 422, 'proposta sem o porquê é recusada');
  r = await call('ascf', 'POST', 'mgr', { action: 'propor', ...ajuste });
  ok(r.s === 200 && r.mgr.propostas[0].situacao === 'analise', 'ASCF propõe ajuste ao MGR');
  st = await call('altagestao', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'mgr-proposta'),
    'CSGR recebe o aviso da proposta',
  );
  r = await call('ascf', 'POST', 'mgr', { action: 'responder', n: 1, decisao: 'acordo', parecer: 'ok' });
  ok(r.s === 403, 'ASCF não responde à própria proposta');
  r = await call('altagestao', 'POST', 'mgr', { action: 'responder', n: 1, decisao: 'ajustar', parecer: '' });
  ok(r.s === 422, 'resposta da CSGR exige parecer');
  r = await call('altagestao', 'POST', 'mgr', {
    action: 'responder',
    n: 1,
    decisao: 'ajustar',
    parecer: 'Citar o Quadro 2.',
  });
  ok(r.s === 200 && r.mgr.propostas[0].situacao === 'ajustar', 'CSGR pede ajuste com parecer');
  r = await call('ascf', 'POST', 'mgr', { action: 'reenviar', n: 1, ...ajuste, onde: 'p. 15, Quadro 2' });
  ok(r.s === 200 && r.mgr.propostas[0].situacao === 'analise', 'ASCF corrige e reenvia');
  r = await call('altagestao', 'POST', 'mgr', {
    action: 'responder',
    n: 1,
    decisao: 'acordo',
    parecer: 'De acordo.',
  });
  ok(r.s === 200 && r.mgr.propostas[0].respostas.length === 2, 'CSGR fica de acordo');
  r = await call('ascf', 'POST', 'mgr', {
    action: 'versao',
    versao: '1.1',
    data: '2099-01-01',
    mudancas: 'Linha do tempo padrão.',
  });
  ok(r.s === 422, 'versão com data no futuro é recusada');
  r = await call('ascf', 'POST', 'mgr', {
    action: 'versao',
    versao: '1.1',
    data: '2026-10-01',
    documento: 'SEI 0001',
    mudancas: 'Linha do tempo padrão.',
  });
  ok(r.s === 200 && r.mgr.versoes[0].versao === '1.1', 'ASCF registra a versão em vigor');
  r = await call('ascf', 'POST', 'mgr', {
    action: 'versao',
    versao: '1.1',
    data: '2026-10-01',
    mudancas: 'De novo.',
  });
  ok(r.s === 422, 'a mesma versão não é registrada duas vezes');
  st = await call('ascf', 'GET', 'state');
  ok(
    st.audit.some(a => /Registrou a versão 1.1 do MGR/.test(a.action)) &&
      st.alerts.some(a => a.tipo === 'mgr-resposta'),
    'histórico do MGR e aviso da resposta para a ASCF',
  );
  r = await call('cad', 'GET', 'state');
  ok(r.mgr === null, 'cadastrador não recebe as propostas do MGR');
  // Recomendações da CSGR: a Alta Gestão emite, o gestor da coordenadoria responde
  r = await call('ascf', 'POST', 'recs', {
    action: 'recomendar',
    unit: 'Cosegi',
    texto: 'Revisar os controles existentes.',
  });
  ok(r.s === 403, 'só a CSGR emite recomendação');
  r = await call('altagestao', 'POST', 'recs', {
    action: 'recomendar',
    unit: 'Cosegi',
    texto: 'Revisar os controles existentes.',
  });
  ok(r.s === 200 && r.recs.length === 1, 'CSGR emite recomendação para a coordenadoria');
  st = await call('cad', 'GET', 'state');
  ok(
    st.recs.length === 1 && st.alerts.some(a => a.tipo === 'recomendacao'),
    'coordenadoria vê a recomendação e o aviso',
  );
  st = await call('cad2', 'GET', 'state');
  ok(st.recs.length === 0, 'outra coordenadoria não vê a recomendação');
  r = await call('cad', 'POST', 'recs', { action: 'responder', n: 1, texto: 'Vamos revisar.' });
  ok(r.s === 403, 'só o gestor responde à recomendação');
  r = await call('ges', 'POST', 'recs', {
    action: 'responder',
    n: 1,
    texto: 'Revisão marcada para o mês que vem.',
  });
  ok(r.s === 200 && r.recs[0].respostas.length === 1, 'gestor responde à recomendação');
  r = await call('ges', 'POST', 'recs', { action: 'responder', n: 1, texto: 'De novo.' });
  ok(r.s === 422, 'a coordenadoria responde uma vez só');
  st = await call('altagestao', 'GET', 'state');
  ok(
    st.alerts.some(a => a.tipo === 'recomendacao-resposta'),
    'CSGR recebe o aviso da resposta',
  );
  r = await call('cad', 'POST', 'alerts/read', {});
  ok(r.s === 200, 'marca avisos como lidos');
  // Servidor no ar que recebe código com esquema novo (o Next recarrega o código e mantém a conexão aberta):
  // a mesma conexão ganha a tabela que falta, sem reiniciar.
  open().exec('ALTER TABLE problemas RENAME TO problemas_antes');
  globalThis.__miraEsquema = 0;
  ok(
    open().prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='problemas'").get().n ===
      1,
    'esquema novo cria a tabela que falta no banco já aberto',
  );
  r = await call('x', 'GET', 'state');
  ok(r.s === 401, 'sem sessão não acessa estado');
  const noHdr = await handle(new Request('http://x/api/state', { method: 'POST' }), ['risks']);
  ok(noHdr.status === 403, 'POST sem cabeçalho de segurança é barrado');
  r = await call('cad', 'POST', 'logout');
  r = await call('cad', 'GET', 'state');
  ok(r.s === 401, 'logout encerra a sessão');
})();
