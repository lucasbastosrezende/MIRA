'use strict';
// Regras de negócio do MIRA no servidor: acesso por perfil, fluxo do PRR, auditoria e alertas.
// Tudo o que o navegador mostra como botão também é conferido aqui.
const crypto = require('node:crypto');
const L = require('./logic.js');
const { open, newPw, checkPw } = require('./db.js');

// Erro com código HTTP; a mensagem vai para a tela.
class HttpError extends Error {
  constructor(status, msg, extra) {
    super(msg);
    this.status = status;
    this.extra = extra || {};
  }
}
// 422: dado inválido.
const bad = (m, x) => new HttpError(422, m, x);
// 403: perfil sem permissão.
const forbid = m => new HttpError(403, m || 'Você não tem permissão para esta ação.');
// 404: não existe ou não pode ser visto (o servidor não diz qual dos dois).
const notFound = m => new HttpError(404, m || 'Não encontrado.');
// Data e hora atual em ISO (UTC).
const now = () => new Date().toISOString();
// Texto limpo e com tamanho máximo.
const str = (v, max) =>
  String(v == null ? '' : v)
    .trim()
    .slice(0, max);
// Nota inteira de 1 a 5, ou null.
const int15 = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};
const db = () => open();

// Executa fn numa transação: ou grava tudo, ou nada.
function tx(fn) {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/* ===== Usuários e sessões ===== */
const pub = r => ({
  id: r.id,
  username: r.username,
  nome: r.nome,
  papel: r.papel,
  unit: r.unit || null,
  podeDefinir: !!r.pode_definir,
});
// Perfis que o administrador pode cadastrar. Não se cria um segundo administrador pela tela.
const PAPEIS_CADASTRO = ['cadastrador', 'gestor', 'terceirizado', 'altagestao', 'cgge'];
// Perfis que pertencem a uma coordenadoria.
const COM_UNIDADE = ['cadastrador', 'gestor', 'terceirizado'];
// Só o administrador cuida de pessoas e coordenadorias.
const onlyAdmin = u => {
  if (u.papel !== 'admin') throw forbid('Só o administrador cuida de pessoas e coordenadorias.');
};
// Coordenadorias cadastradas, em ordem de sigla.
const unitList = () => db().prepare('SELECT sigla, nome FROM units ORDER BY sigla COLLATE NOCASE').all();
// Verdadeiro se a sigla é de uma coordenadoria cadastrada.
const unitExists = sigla => !!sigla && !!db().prepare('SELECT 1 FROM units WHERE sigla=?').get(sigla);
// Tamanho máximo do PDF do relatório de pedido.
const SEI_MAX = 10 * 1024 * 1024;
// Número SEI: algarismos com ponto, barra ou hífen (documento "0045123456" ou processo "0035.000123/2026-11").
const SEI_NUMERO = /^\d[\d./-]{4,29}$/;
// Tipos de relatório de pedido: documento do SEI ou pedido formal (também com número SEI; PDF opcional).
const TIPO_PEDIDO = { sei: 'SEI', formal: 'Pedido formal' };
// Contas de teste teste1 a teste20: podem ser criadas sem relatório de pedido.
// A empresateste é a empresa terceirizada de demonstração, pedida pelo usuário.
const CONTA_TESTE = /^(teste([1-9]|1\d|20)|empresateste)$/;

// Confere o relatório de pedido de um cadastro: tipo, nome do documento, número SEI, data e o PDF (base64).
// O número SEI vale para os dois tipos. O PDF é obrigatório no tipo SEI e opcional no pedido formal;
// quando vem, precisa ser de fato um PDF: começa com "%PDF-", não só termina em ".pdf".
function validPedido(b) {
  const s = b || {},
    tipo = TIPO_PEDIDO[s.tipo] ? s.tipo : '',
    nome = str(s.nome, 200),
    numero = str(s.numero, 30),
    data = String(s.data || ''),
    arquivo = str(s.arquivo, 200).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'documento.pdf';
  if (!tipo) throw bad('Escolha o tipo do relatório de pedido: SEI ou pedido formal.');
  if (nome.length < 3) throw bad('Informe o nome do documento.');
  if (!SEI_NUMERO.test(numero)) throw bad('Informe o número SEI (só algarismos, ponto, barra ou hífen).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw bad('Informe a data do documento.');
  const b64 = String(s.pdf || '');
  if (!b64 && tipo === 'sei') throw bad('Anexe o PDF do documento SEI.');
  if (b64.length > Math.ceil(SEI_MAX / 3) * 4 + 4) throw bad('O PDF pode ter no máximo 10 MB.');
  const pdf = Buffer.from(b64, 'base64');
  if (pdf.length > SEI_MAX) throw bad('O PDF pode ter no máximo 10 MB.');
  if (b64 && pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw bad('O arquivo anexado não é um PDF.');
  return {
    tipo,
    nome,
    numero,
    data,
    arquivo: pdf.length ? arquivo : '',
    pdf,
    sha256: pdf.length ? crypto.createHash('sha256').update(pdf).digest('hex') : '',
  };
}
// Verdadeiro se algum campo do relatório de pedido foi preenchido.
const temPedido = b => !!b && ['nome', 'numero', 'data', 'pdf'].some(k => String(b[k] || '').trim());
// Grava um relatório de pedido para a pessoa (nunca substitui o anterior).
function insertPedido(userId, p, admin) {
  db()
    .prepare(
      'INSERT INTO user_docs(id,user_id,tipo,sei_nome,sei_numero,data,arquivo,tamanho,sha256,pdf,criado_em,criado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      crypto.randomUUID(),
      userId,
      p.tipo,
      p.nome,
      p.numero,
      p.data,
      p.arquivo,
      p.pdf.length,
      p.sha256,
      p.pdf,
      now(),
      admin.nome,
    );
}
// Campos do relatório de pedido na trilha de auditoria.
const pedidoChanges = p => [
  { campo: 'Relatório de pedido', de: '', para: TIPO_PEDIDO[p.tipo] + ' · ' + p.nome },
  { campo: 'Número SEI', de: '', para: p.numero },
  { campo: 'Data do documento', de: '', para: p.data },
];
// Usuário: 3 a 40 caracteres, minúsculas sem acento, números, ponto, hífen ou sublinhado.
const USERNAME = /^[a-z0-9._-]{3,40}$/;

// Confere usuário e senha de uma pessoa nova. A conta é identificada só pelo usuário: ele também é o nome
// exibido nas telas e na auditoria (o campo nome do banco recebe o próprio usuário).
function validNewUser(b) {
  const username = str(b.username, 40).toLowerCase(),
    nome = username,
    password = String(b.password || '');
  if (!USERNAME.test(username))
    throw bad(
      'O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.',
    );
  if (password.length < 8) throw bad('A senha precisa ter pelo menos 8 caracteres.');
  return { nome, username, password };
}
// Grava a pessoa com a senha já protegida. Recusa usuário repetido.
function insertUser({ nome, username, password }, papel, unit) {
  if (db().prepare('SELECT 1 FROM users WHERE username=?').get(username))
    throw bad('Este usuário já existe.');
  const { salt, hash } = newPw(password),
    id = crypto.randomUUID();
  db()
    .prepare(
      'INSERT INTO users(id,username,nome,papel,unit,salt,hash,ativo,criado_em) VALUES (?,?,?,?,?,?,?,1,?)',
    )
    .run(id, username, nome, papel, unit || null, salt, hash, now());
  return id;
}
// Cria a conta do administrador, sem coordenadoria. Não há rota da API para isto: só o comando
// de implantação (scripts/criar-admin.js), rodado no servidor, chega aqui. Existe um único administrador.
function createAdmin(b) {
  return tx(() => {
    if (db().prepare("SELECT 1 FROM users WHERE papel='admin'").get())
      throw forbid('O administrador já existe.');
    const v = validNewUser(b);
    const id = insertUser(v, 'admin', null);
    const u = pub(db().prepare('SELECT * FROM users WHERE id=?').get(id));
    audit(u, null, 'Criou a conta do administrador na implantação');
    return u;
  });
}
// Administrador cadastra uma pessoa. Exige o relatório de pedido que autoriza o acesso (SEI ou pedido formal),
// menos para as contas de teste teste1 a teste20. Limites: 2 cadastradores e 1 gestor ativos por coordenadoria.
function createUser(admin, b) {
  onlyAdmin(admin);
  return tx(() => {
    const v = validNewUser(b),
      papel = str(b.papel, 20),
      unit = str(b.unit, 20) || null;
    if (!PAPEIS_CADASTRO.includes(papel)) throw bad('Escolha o perfil.');
    if (COM_UNIDADE.includes(papel) && !unitExists(unit))
      throw bad('Escolha a coordenadoria. Se ela não aparece, crie-a antes em Coordenadorias.');
    const ped = CONTA_TESTE.test(v.username) && !temPedido(b.pedido) ? null : validPedido(b.pedido);
    if (
      papel === 'cadastrador' &&
      db().prepare("SELECT COUNT(*) n FROM users WHERE papel='cadastrador' AND unit=? AND ativo=1").get(unit)
        .n >= 2
    )
      throw bad('Cada coordenadoria indica no máximo duas pessoas para cadastrar riscos.');
    if (
      papel === 'gestor' &&
      db().prepare("SELECT COUNT(*) n FROM users WHERE papel='gestor' AND unit=? AND ativo=1").get(unit).n >=
        1
    )
      throw bad(
        'A coordenadoria já tem gestor de riscos (o titular). Desative o atual antes de cadastrar outro.',
      );
    const id = insertUser(v, papel, papel === 'altagestao' || papel === 'cgge' ? null : unit);
    // Só o cadastrador recebe a permissão de definir responsável, prazo e custo; o gestor já tem.
    const pode = papel === 'cadastrador' && !!b.podeDefinir;
    if (pode) db().prepare('UPDATE users SET pode_definir=1 WHERE id=?').run(id);
    if (ped) insertPedido(id, ped, admin);
    audit(
      admin,
      null,
      'Cadastrou ' +
        v.nome +
        ' como ' +
        L.PAPEL[papel] +
        (unit && COM_UNIDADE.includes(papel) ? ' da ' + unit : '') +
        (pode ? ', com permissão de definir responsável, prazo e custo do PRR' : ''),
      ped
        ? pedidoChanges(ped)
        : [{ campo: 'Relatório de pedido', de: '', para: 'Conta de teste, sem pedido' }],
    );
    return pub(db().prepare('SELECT * FROM users WHERE id=?').get(id));
  });
}
// Administrador registra o relatório de pedido de quem já tem conta (cadastro antigo ou pedido novo).
function addPedido(admin, userId, b) {
  onlyAdmin(admin);
  return tx(() => {
    const row = db().prepare('SELECT * FROM users WHERE id=?').get(String(userId));
    if (!row) throw notFound('Pessoa não encontrada.');
    const ped = validPedido(b.pedido);
    insertPedido(row.id, ped, admin);
    audit(admin, null, 'Registrou o relatório de pedido de ' + row.nome, pedidoChanges(ped));
  });
}
// PDF do relatório de pedido mais recente de uma pessoa, para o administrador baixar.
// Sem pedido, ou pedido formal sem PDF, responde 404.
function seiDoc(admin, userId) {
  onlyAdmin(admin);
  const d = db()
    .prepare(
      'SELECT sei_numero, arquivo, tamanho, pdf FROM user_docs WHERE user_id=? ORDER BY criado_em DESC LIMIT 1',
    )
    .get(String(userId));
  if (!d || !d.tamanho) throw notFound('Este relatório de pedido não tem PDF anexado.');
  return { numero: d.sei_numero, arquivo: d.arquivo, pdf: Buffer.from(d.pdf) };
}
// Administrador cria uma coordenadoria: sigla curta (aparece em todas as telas) e nome por extenso.
function createUnit(admin, b) {
  onlyAdmin(admin);
  const sigla = str(b.sigla, 21),
    nome = str(b.nome, 120);
  if (!/^\p{L}[\p{L}\p{N}-]{1,19}$/u.test(sigla))
    throw bad('A sigla deve ter de 2 a 20 caracteres: letras, números ou hífen, começando por letra.');
  return tx(() => {
    if (db().prepare('SELECT 1 FROM units WHERE sigla=? COLLATE NOCASE').get(sigla))
      throw bad('Já existe uma coordenadoria com esta sigla.');
    db().prepare('INSERT INTO units(sigla,nome,criado_em) VALUES (?,?,?)').run(sigla, nome, now());
    audit(admin, null, 'Criou a coordenadoria ' + sigla, [
      { campo: 'Coordenadoria', de: '', para: sigla + (nome ? ' · ' + nome : '') },
    ]);
    return unitList();
  });
}
// Administrador corrige o nome por extenso de uma coordenadoria (a sigla não muda: ela está nos riscos).
function renameUnit(admin, b) {
  onlyAdmin(admin);
  const nome = str(b.nome, 120);
  return tx(() => {
    const row = db()
      .prepare('SELECT * FROM units WHERE sigla=?')
      .get(String(b.sigla || ''));
    if (!row) throw notFound('Coordenadoria não encontrada.');
    if (row.nome === nome) throw bad('O nome não mudou.');
    db().prepare('UPDATE units SET nome=? WHERE sigla=?').run(nome, row.sigla);
    audit(admin, null, 'Alterou o nome da coordenadoria ' + row.sigla, [
      { campo: 'Nome por extenso', de: row.nome, para: nome },
    ]);
    return unitList();
  });
}
// Administrador remove uma coordenadoria criada por engano. Só sai se não tiver pessoas, riscos nem contexto.
function removeUnit(admin, sigla) {
  onlyAdmin(admin);
  return tx(() => {
    const row = db().prepare('SELECT * FROM units WHERE sigla=?').get(String(sigla));
    if (!row) throw notFound('Coordenadoria não encontrada.');
    const usado =
      db().prepare('SELECT 1 FROM users WHERE unit=?').get(row.sigla) ||
      db().prepare('SELECT 1 FROM risks WHERE unit=?').get(row.sigla) ||
      db().prepare('SELECT 1 FROM ctx WHERE unit=?').get(row.sigla);
    if (usado) throw bad('A coordenadoria já tem pessoas, riscos ou contexto e não pode ser removida.');
    db().prepare('DELETE FROM units WHERE sigla=?').run(row.sigla);
    audit(admin, null, 'Removeu a coordenadoria ' + row.sigla, [
      { campo: 'Coordenadoria', de: row.sigla, para: '' },
    ]);
    return unitList();
  });
}
// Administrador redefine a senha de alguém e encerra as sessões abertas dessa pessoa.
function resetPassword(admin, id, password) {
  onlyAdmin(admin);
  if (String(password || '').length < 8) throw bad('A senha precisa ter pelo menos 8 caracteres.');
  const row = db().prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!row) throw notFound('Pessoa não encontrada.');
  const { salt, hash } = newPw(password);
  tx(() => {
    db().prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash, id);
    db().prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    audit(admin, null, 'Redefiniu a senha de ' + row.nome);
  });
}
// Administrador desativa ou reativa uma pessoa, respeitando os limites por coordenadoria.
function setAtivo(admin, id, ativo) {
  onlyAdmin(admin);
  const row = db().prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!row) throw notFound('Pessoa não encontrada.');
  if (row.id === admin.id) throw bad('Você não pode desativar a própria conta.');
  tx(() => {
    if (
      ativo &&
      row.papel === 'gestor' &&
      db().prepare("SELECT COUNT(*) n FROM users WHERE papel='gestor' AND unit=? AND ativo=1").get(row.unit)
        .n >= 1
    )
      throw bad('A coordenadoria já tem gestor de riscos ativo.');
    if (
      ativo &&
      row.papel === 'cadastrador' &&
      db()
        .prepare("SELECT COUNT(*) n FROM users WHERE papel='cadastrador' AND unit=? AND ativo=1")
        .get(row.unit).n >= 2
    )
      throw bad('A coordenadoria já tem duas pessoas cadastrando.');
    db()
      .prepare('UPDATE users SET ativo=? WHERE id=?')
      .run(ativo ? 1 : 0, id);
    if (!ativo) db().prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    audit(admin, null, (ativo ? 'Reativou ' : 'Desativou ') + row.nome);
  });
}
// Administrador apaga uma pessoa de vez: a conta e as sessões abertas. A conta do administrador não pode ser
// apagada. O PDF do SEI e a trilha de auditoria ficam: são o registro de quem teve acesso e do que fez.
function deleteUser(admin, id) {
  onlyAdmin(admin);
  return tx(() => {
    const row = db().prepare('SELECT * FROM users WHERE id=?').get(String(id));
    if (!row) throw notFound('Pessoa não encontrada.');
    if (row.papel === 'admin') throw bad('A conta do administrador não pode ser apagada.');
    db().prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);
    db().prepare('DELETE FROM users WHERE id=?').run(row.id);
    audit(admin, null, 'Apagou a conta de ' + row.nome, [
      {
        campo: 'Pessoa',
        de: row.nome + ' · ' + L.PAPEL[row.papel] + (row.unit ? ' da ' + row.unit : ''),
        para: '',
      },
    ]);
  });
}
// Tentativas de login erradas por usuário e endereço (guardadas na memória do processo).
const fails = () => (globalThis.__miraFails = globalThis.__miraFails || new Map());
// Login: 5 tentativas erradas bloqueiam por 5 minutos. A sessão vale 8 horas.
// Usuário inexistente e senha errada dão a mesma mensagem. Login recusado não grava nada no banco:
// só a contagem de tentativas, que fica na memória. Usuário fora do formato nem chega a ser consultado.
// Além da conta por usuário e endereço, há um limite só por usuário (10 erros em 15 minutos), que trocar de
// endereço não contorna.
function login(username, password, ip) {
  const key = String(username).toLowerCase() + '|' + ip,
    keyU = 'u|' + String(username).toLowerCase(),
    f = fails().get(key),
    fu = fails().get(keyU);
  if ((f && f.until > Date.now()) || (fu && fu.until > Date.now()))
    throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  // Conta um erro nas duas chaves; a do usuário zera depois de 15 minutos sem erro.
  const erro = () => {
    const n = ((f && f.n) || 0) + 1;
    fails().set(key, { n, until: n >= 5 ? Date.now() + 5 * 60e3 : 0 });
    const velho = fu && Date.now() - fu.ts > 15 * 60e3,
      nu = (velho || !fu ? 0 : fu.n) + 1;
    fails().set(keyU, { n: nu, ts: Date.now(), until: nu >= 10 ? Date.now() + 15 * 60e3 : 0 });
  };
  if (!USERNAME.test(String(username).toLowerCase())) {
    erro();
    throw new HttpError(401, 'Usuário ou senha incorretos.');
  }
  const row = db()
    .prepare('SELECT * FROM users WHERE username=? AND ativo=1')
    .get(String(username).toLowerCase());
  if (!row || !checkPw(password, row.salt, row.hash)) {
    erro();
    throw new HttpError(401, 'Usuário ou senha incorretos.');
  }
  fails().delete(key);
  fails().delete(keyU);
  const token = crypto.randomBytes(32).toString('hex');
  db().prepare('DELETE FROM sessions WHERE exp < ?').run(Date.now());
  db()
    .prepare('INSERT INTO sessions(token,user_id,exp) VALUES (?,?,?)')
    .run(token, row.id, Date.now() + 8 * 3600e3);
  return { token, user: pub(row) };
}
// Encerra a sessão.
function logout(token) {
  if (token) db().prepare('DELETE FROM sessions WHERE token=?').run(token);
}
// Pessoa da sessão, se a sessão existe, não venceu e a pessoa está ativa.
function userFromToken(token) {
  if (!token) return null;
  const s = db().prepare('SELECT user_id, exp FROM sessions WHERE token=?').get(token);
  if (!s || s.exp < Date.now()) return null;
  const row = db().prepare('SELECT * FROM users WHERE id=? AND ativo=1').get(s.user_id);
  return row ? pub(row) : null;
}

/* ===== Auditoria e alertas ===== */
// Registro da trilha com os nomes atuais. Registros antigos guardam o perfil "csgr" e a situação "ag_csgr";
// a trilha nunca é reescrita, então a tradução para "altagestao" acontece aqui, só na leitura.
const ANTIGO = { csgr: 'altagestao', ag_csgr: 'ag_altagestao' };
function auditNovo(a) {
  if (ANTIGO[a.role]) a.role = ANTIGO[a.role];
  (a.changes || []).forEach(c => {
    if (ANTIGO[c.de]) c.de = ANTIGO[c.de];
    if (ANTIGO[c.para]) c.para = ANTIGO[c.para];
  });
  return a;
}
function audit(u, r, action, changes, note) {
  const unit = r ? r.unit : u.unit || null,
    ts = now();
  const data = {
    ts,
    user: u.nome,
    role: u.papel,
    unit,
    riskId: r ? r.id : null,
    titulo: r ? r.titulo : '',
    action,
    changes: changes || [],
    note: note || '',
  };
  db()
    .prepare('INSERT INTO audit(ts,unit,risk_id,data) VALUES (?,?,?,?)')
    .run(ts, unit, data.riskId, JSON.stringify(data));
}
// Guarda um aviso para os perfis em "para"; cada pessoa marca o seu como lido.
function alertAdd(tipo, r, msg, para) {
  const ts = now();
  db()
    .prepare('INSERT INTO alerts(id,ts,unit,data) VALUES (?,?,?,?)')
    .run(
      'a' + crypto.randomUUID(),
      ts,
      r.unit,
      JSON.stringify({ ts, tipo, riskId: r.id, unit: r.unit, msg, para, lido: {} }),
    );
}

/* ===== Riscos ===== */
const saveRisk = r =>
  db().prepare('UPDATE risks SET unit=?, data=? WHERE id=?').run(r.unit, JSON.stringify(r), r.id);
// Carrega um risco que a pessoa pode ver; de outra coordenadoria responde "não encontrado".
function loadRisk(u, id) {
  const row = db().prepare('SELECT data FROM risks WHERE id=?').get(String(id));
  if (!row) throw notFound('Risco não encontrado.');
  const r = JSON.parse(row.data);
  if (!L.sameUnit(u, r.unit)) throw notFound('Risco não encontrado.');
  return r;
}
// Aplica as mudanças, registra na auditoria só os campos que mudaram e grava o risco.
// Devolve quantos campos mudaram.
function setFields(u, r, patch, action, note) {
  const ch = [];
  for (const k of Object.keys(patch)) {
    const old = L.getP(r, k),
      nv = patch[k];
    if (String(old == null ? '' : old) !== String(nv == null ? '' : nv)) {
      ch.push({ campo: L.FL[k] || k, de: old == null ? '' : old, para: nv });
      L.setP(r, k, nv);
    }
  }
  if (ch.length || action) audit(u, r, action || 'Alterou o risco', ch, note);
  saveRisk(r);
  return ch.length;
}
// Guarda o nível atual no histórico de níveis, com o motivo.
const levelPush = (r, motivo) =>
  r.niveis.push({ ts: now(), prob: r.prob, imp: r.imp, nivel: L.nivel(r), motivo });
// Guarda uma etapa da tramitação do PRR (enviado, encaminhado, devolvido, aprovado).
const pushAprov = (u, r, decisao, motivo) =>
  r.prr.aprov.push({ ts: now(), por: u.nome, papel: u.papel, decisao, motivo: motivo || '' });
// Campos da identificação; todos obrigatórios.
function identFields(b) {
  const f = {};
  for (const k of ['titulo', 'causa', 'evento', 'impacto', 'objetivo']) {
    f[k] = str(b[k], 500);
    if (!f[k]) throw bad('Preencha todos os campos da identificação.');
  }
  return f;
}
// Cadastrador ou gestor cria um risco na própria coordenadoria, depois de salvar o contexto. ID sequencial: R-001, R-002...
function createRisk(u, b) {
  if (u.papel !== 'cadastrador' && u.papel !== 'gestor')
    throw forbid('Só o cadastrador ou o gestor da coordenadoria cria um risco.');
  const f = identFields(b);
  // MGR: o contexto (fase 1) vem antes da identificação. Sem escopo salvo, a coordenadoria não cadastra risco.
  if (!ctxGet(u.unit).escopo)
    throw bad('Salve o contexto da coordenadoria (fase 1) antes de cadastrar o risco.');
  return tx(() => {
    const m = db().prepare('SELECT MAX(CAST(SUBSTR(id,3) AS INTEGER)) m FROM risks').get().m || 0;
    const r = {
      id: 'R-' + String(m + 1).padStart(3, '0'),
      unit: u.unit,
      ...f,
      prob: null,
      imp: null,
      exposicao: 0,
      status: 'rascunho',
      criadoPor: u.nome,
      criadoEm: now(),
      niveis: [],
      prr: null,
    };
    db().prepare('INSERT INTO risks(id,unit,data) VALUES (?,?,?)').run(r.id, r.unit, JSON.stringify(r));
    audit(u, r, 'Cadastrou o risco');
    return r;
  });
}
// Altera a identificação (fase 2).
function updateIdent(u, id, b) {
  return tx(() => {
    const r = loadRisk(u, id);
    if (!L.canEdit(u, r)) throw forbid('Este risco não pode ser editado agora.');
    setFields(u, r, identFields(b), 'Alterou a identificação');
    return r;
  });
}
// Grava a avaliação (fase 3). A primeira avaliação leva o risco de rascunho para avaliado.
function updateAval(u, id, b) {
  return tx(() => {
    const r = loadRisk(u, id);
    if (!L.canEdit(u, r)) throw forbid('Este risco não pode ser editado agora.');
    const prob = int15(b.prob),
      imp = int15(b.imp),
      exp = Number(b.exposicao || 0),
      controles = str(b.controles, 1000),
      linhaTempo = str(b.linhaTempo, 120);
    // Regra do MGR (p. 14): o nível considera as ações de controle já existentes, descritas antes das notas.
    if (!controles) throw bad('Descreva os controles existentes (se não houver, escreva "Nenhum").');
    // Regra do MGR (p. 14–15): a probabilidade é dada "na linha do tempo definida" (ex.: últimos 12 meses).
    if (linhaTempo.length < 3)
      throw bad('Informe a linha do tempo da probabilidade (ex.: últimos 12 meses).');
    if (!prob || !imp) throw bad('Escolha a probabilidade e o impacto (1 a 5).');
    if (!Number.isFinite(exp) || exp < 0)
      throw bad('A exposição financeira deve ser um valor maior ou igual a zero.');
    const first = !r.prob,
      patch = { prob, imp, exposicao: exp, controles, linhaTempo };
    if (r.status === 'rascunho') patch.status = 'avaliado';
    if (setFields(u, r, patch, 'Avaliou o risco')) {
      levelPush(r, first ? 'Avaliação inicial' : 'Avaliação revisada');
      saveRisk(r);
    }
    return r;
  });
}
// Normaliza o PRR recebido: tipos, tamanhos e valores permitidos.
function cleanPrr(p) {
  const o = {},
    num = v => (v === '' || v == null ? '' : Number(v));
  o.tratamento = Object.keys(L.TRAT).includes(p.tratamento) ? p.tratamento : 'mitigar';
  o.controles = str(p.controles, 1000);
  o.acao = str(p.acao, 1500);
  o.responsavelId = str(p.responsavelId, 60);
  o.viabilidade = str(p.viabilidade, 1000);
  o.restricoes = str(p.restricoes, 1000);
  o.recursos = str(p.recursos, 1000);
  o.contingencia = str(p.contingencia, 1500);
  o.responsavel = str(p.responsavel, 120);
  o.prazo = /^\d{4}-\d{2}-\d{2}$/.test(String(p.prazo || '')) ? p.prazo : '';
  o.custo = Math.max(0, Number(p.custo) || 0);
  o.metrica = str(p.metrica, 200);
  o.unidadeMetrica = str(p.unidadeMetrica, 30);
  o.sentido = p.sentido === 'maior' ? 'maior' : 'menor';
  for (const k of ['critico', 'alerta', 'ideal']) {
    const v = num(p[k]);
    if (v !== '' && !Number.isFinite(v)) throw bad('Os parâmetros da métrica devem ser números.');
    o[k] = v;
  }
  // Residual vazio fica vazio (antes virava 1 × 1 e inventava uma redução).
  o.probRes = int15(p.probRes) || '';
  o.impRes = int15(p.impRes) || '';
  return o;
}
// Nome do responsável escolhido no PRR. Só vale pessoa ativa da coordenadoria do risco: cadastrador, gestor
// ou empresa terceirizada (o gestor não delega a alguém fora do time). A exceção é a empresa terceirizada que a
// Alta Gestão indicou ao devolver o PRR: ela continua valendo enquanto estiver ativa.
// Sem escolha devolve ''; escolha fora dessas pessoas é recusada.
function respNome(r, id) {
  if (!id) return '';
  if (r.prr && id === r.prr.responsavelId) {
    const atual = db()
      .prepare(
        "SELECT nome FROM users WHERE id=? AND ativo=1 AND papel IN ('cadastrador','gestor','terceirizado')",
      )
      .get(id);
    if (atual) return atual.nome;
  }
  const p = db()
    .prepare(
      "SELECT nome FROM users WHERE id=? AND unit=? AND ativo=1 AND papel IN ('cadastrador','gestor','terceirizado')",
    )
    .get(id, r.unit);
  if (!p) throw bad('O responsável precisa ser uma pessoa cadastrada na coordenadoria do risco.');
  return p.nome;
}
// Grava o PRR (fase 4) sem enviar. Exige o risco avaliado.
function savePrr(u, id, b) {
  return tx(() => {
    const r = loadRisk(u, id);
    if (!L.canEdit(u, r)) throw forbid('Este risco não pode ser editado agora.');
    if (!r.prob || !r.imp) throw bad('Avalie probabilidade e impacto antes de elaborar o PRR.');
    // PRR novo: o residual começa igual ao risco de hoje, até o cadastrador dizer o que a ação reduz.
    if (!r.prr) r.prr = Object.assign(L.emptyPrr(), { probRes: r.prob, impRes: r.imp });
    const clean = cleanPrr(b.prr || {}),
      patch = {};
    // Sem permissão, responsável, prazo e custo ficam como estão: quem define é o gestor (ou o cadastrador liberado).
    const fixos = L.canDefinir(u, r) ? [] : ['responsavelId', 'prazo', 'custo'];
    for (const k of fixos) clean[k] = r.prr[k];
    clean.responsavel = fixos.length ? r.prr.responsavel || '' : respNome(r, clean.responsavelId);
    for (const k of L.PRR_KEYS) patch['prr.' + k] = clean[k];
    patch['prr.responsavel'] = clean.responsavel;
    setFields(u, r, patch, 'Atualizou o PRR');
    return r;
  });
}
// Ações sobre um risco já cadastrado. Cada caso confere a permissão (lib/logic.js) antes de mudar algo.
// Fluxo do PRR: avaliado/devolvido → ag_gestor → ag_altagestao → em_tratamento; devolver exige motivo.
function riskAction(u, id, b) {
  const a = str(b.action, 30),
    motivo = str(b.motivo, 600);
  return tx(() => {
    const r = loadRisk(u, id);
    const needMotivo = () => {
      if (motivo.length < 3) throw bad('Explique o motivo.');
    };
    switch (a) {
      // Cadastrador envia o PRR completo ao gestor.
      case 'send-prr': {
        if (!L.canEdit(u, r)) throw forbid();
        if (!r.prob || !r.imp || !r.prr) throw bad('Avalie o risco e preencha o PRR antes de enviar.');
        const errs = L.prrErrors(r.prr, { semDefinir: !L.canDefinir(u, r) });
        // Apetite a risco definido pela CSGR (MGR p. 19–21): "Aceitar" só para risco dentro do apetite.
        const ap = configGet().apetite.nivelMax;
        if (r.prr.tratamento === 'aceitar' && ap != null && L.nivel(r) > ap)
          errs.unshift(
            'O nível ' +
              L.nivel(r) +
              ' está acima do apetite a risco definido pela CSGR (até ' +
              ap +
              '): escolha evitar, transferir ou mitigar.',
          );
        if (errs.length) throw bad(errs[0], { errors: errs });
        setFields(u, r, { status: 'ag_gestor' }, 'Enviou o PRR para o gestor');
        pushAprov(u, r, 'enviado');
        saveRisk(r);
        alertAdd('aprovacao', r, 'PRR "' + r.titulo + '" aguarda validação do gestor da ' + r.unit + '.', [
          'gestor',
        ]);
        break;
      }
      // Gestor valida e encaminha à Alta Gestão.
      case 'gestor-ok': {
        if (!L.canGes(u, r)) throw forbid();
        // O gestor completa responsável, prazo e custo na própria decisão, quando quem enviou não podia defini-los.
        const def = {};
        if (b.responsavelId !== undefined) {
          const rid = str(b.responsavelId, 60);
          def['prr.responsavelId'] = rid;
          def['prr.responsavel'] = respNome(r, rid);
        }
        if (b.prazo !== undefined)
          def['prr.prazo'] = /^\d{4}-\d{2}-\d{2}$/.test(String(b.prazo || '')) ? b.prazo : '';
        if (b.custo !== undefined) def['prr.custo'] = Math.max(0, Number(b.custo) || 0);
        if (Object.keys(def).length) setFields(u, r, def, 'Definiu responsável, prazo e custo do PRR');
        // Antes de encaminhar, o PRR tem que estar completo, inclusive responsável e prazo.
        const errs = L.prrErrors(r.prr);
        if (errs.length) throw bad(errs[0], { errors: errs });
        setFields(
          u,
          r,
          { status: 'ag_altagestao' },
          'Validou e encaminhou o PRR à Alta Gestão de Riscos',
          motivo,
        );
        pushAprov(u, r, 'encaminhado', motivo);
        saveRisk(r);
        alertAdd(
          'aprovacao',
          r,
          'PRR "' + r.titulo + '" (' + r.unit + ') aguarda aprovação da Alta Gestão de Riscos.',
          ['altagestao'],
        );
        break;
      }
      // Gestor ou Alta Gestão devolve ao cadastrador, com motivo.
      case 'gestor-dev':
      case 'altagestao-dev':
        if (a === 'gestor-dev' ? !L.canGes(u, r) : !L.canAlta(u, r)) throw forbid();
        needMotivo();
        // Ao devolver, a Alta Gestão pode indicar uma empresa terceirizada ativa como responsável pela ação.
        if (a === 'altagestao-dev' && b.responsavelId) {
          const emp = db()
            .prepare("SELECT id, nome FROM users WHERE id=? AND ativo=1 AND papel='terceirizado'")
            .get(str(b.responsavelId, 60));
          if (!emp) throw bad('Escolha uma empresa terceirizada ativa.');
          setFields(
            u,
            r,
            { 'prr.responsavelId': emp.id, 'prr.responsavel': emp.nome },
            'Indicou empresa terceirizada como responsável',
          );
        }
        setFields(u, r, { status: 'devolvido' }, 'Devolveu o PRR', motivo);
        pushAprov(u, r, 'devolvido', motivo);
        saveRisk(r);
        alertAdd('devolvido', r, 'O PRR de "' + r.titulo + '" foi devolvido: ' + motivo, [
          'cadastrador',
          'gestor',
        ]);
        break;
      // Alta Gestão aprova: começa o monitoramento.
      // Regra do MGR (p. 21): a CSGR emite parecer favorável ou não; aprovar sem parecer é recusado.
      case 'altagestao-ok':
        if (!L.canAlta(u, r)) throw forbid();
        if (motivo.length < 3) throw bad('Escreva o parecer da aprovação.');
        setFields(u, r, { status: 'em_tratamento' }, 'Aprovou o PRR', motivo);
        pushAprov(u, r, 'aprovado', motivo);
        saveRisk(r);
        alertAdd(
          'aprovado',
          r,
          'PRR "' + r.titulo + '" foi aprovado pela Alta Gestão de Riscos. Comece o monitoramento.',
          ['cadastrador', 'gestor'],
        );
        break;
      // Nova medição; avisa quando a métrica entra em alerta ou crítico.
      case 'add-med': {
        if (!L.canMon(u, r)) throw forbid();
        const v = Number(b.valor);
        if (b.valor === '' || b.valor == null || !Number.isFinite(v)) throw bad('Informe um valor numérico.');
        const before = L.metricSt(r);
        r.prr.medicoes.push({ ts: now(), valor: v, por: u.nome });
        audit(u, r, 'Registrou medição', [
          { campo: r.prr.metrica, de: '', para: v + ' ' + r.prr.unidadeMetrica },
        ]);
        const after = L.metricSt(r);
        if ((after === 'alerta' || after === 'critico') && after !== before)
          alertAdd(
            'metrica',
            r,
            'Métrica "' +
              r.prr.metrica +
              '" entrou em ' +
              (after === 'critico' ? 'nível crítico' : 'alerta') +
              ' (' +
              v +
              ' ' +
              r.prr.unidadeMetrica +
              ').',
            ['cadastrador', 'gestor', 'altagestao'],
          );
        saveRisk(r);
        break;
      }
      // Reavaliação do nível, com motivo; avisa gestor e Alta Gestão quando o nível sobe ou baixa.
      case 'reaval': {
        if (!L.canMon(u, r)) throw forbid();
        needMotivo();
        const prob = int15(b.prob),
          imp = int15(b.imp);
        if (!prob || !imp) throw bad('Escolha probabilidade e impacto (1 a 5).');
        if (prob === r.prob && imp === r.imp) throw bad('Probabilidade e impacto não mudaram.');
        const old = L.nivel(r);
        setFields(u, r, { prob, imp }, 'Reavaliou o nível', motivo);
        levelPush(r, motivo);
        saveRisk(r);
        // Regra do MGR (p. 22): mudança no nível de criticidade é motivo de reavaliação, nos dois sentidos.
        if (L.nivel(r) !== old)
          alertAdd(
            'nivel',
            r,
            'O nível de "' +
              r.titulo +
              '" ' +
              (L.nivel(r) > old ? 'subiu' : 'baixou') +
              ' de ' +
              old +
              ' para ' +
              L.nivel(r) +
              '. Confira se o PRR ainda serve para o nível novo.',
            ['gestor', 'altagestao'],
          );
        break;
      }
      // O evento do risco aconteceu; gestor e Alta Gestão são avisados.
      case 'evento':
        if (!L.canMon(u, r) || r.status !== 'em_tratamento') throw forbid();
        r.ocorridoEm = now(); // data usada nos relatórios por período
        setFields(u, r, { status: 'ocorrido' }, 'Registrou que o evento ocorreu');
        // O aviso traz o plano do PRR para o caso de o evento ocorrer, para que diga o que fazer agora.
        alertAdd(
          'evento',
          r,
          'O evento de "' +
            r.titulo +
            '" ocorreu. ' +
            (r.prr && r.prr.contingencia ? 'Faça agora: ' + r.prr.contingencia + ' ' : '') +
            'Depois reavalie o nível e o PRR.',
          ['gestor', 'altagestao'],
        );
        break;
      // Gestor da coordenadoria delega quem vai resolver o risco. Só pode ser cadastrador ou gestor ativo
      // da mesma coordenadoria; sem pessoa ("para" vazio), o risco fica sem responsável.
      case 'delegar': {
        if (!L.canDel(u, r)) throw forbid('Só o gestor da coordenadoria delega quem resolve o risco.');
        const para = str(b.para, 60),
          nota = str(b.nota, 300);
        const alvo = para
          ? db()
              .prepare(
                "SELECT id, nome FROM users WHERE id=? AND unit=? AND ativo=1 AND papel IN ('cadastrador','gestor')",
              )
              .get(para, r.unit)
          : null;
        if (para && !alvo) throw bad('Escolha uma pessoa ativa da coordenadoria.');
        const antes = r.delegado ? r.delegado.nome : '';
        if ((alvo ? alvo.nome : '') === antes && !nota) throw bad('Nada mudou na delegação.');
        r.delegado = alvo ? { id: alvo.id, nome: alvo.nome, por: u.nome, ts: now(), nota } : null;
        audit(
          u,
          r,
          alvo ? 'Delegou o risco' : 'Retirou o responsável pela resolução',
          [{ campo: 'Responsável pela resolução', de: antes, para: alvo ? alvo.nome : '' }],
          nota,
        );
        saveRisk(r);
        if (alvo)
          alertAdd(
            'delegado',
            r,
            '"' + r.titulo + '" foi delegado a ' + alvo.nome + ' para resolver' + (nota ? ': ' + nota : '.'),
            ['cadastrador', 'gestor'],
          );
        break;
      }
      // Depois do evento, o plano continua: o risco volta ao tratamento. Exige motivo.
      case 'retomar':
        if (!L.canMon(u, r) || r.status !== 'ocorrido') throw forbid();
        needMotivo();
        setFields(u, r, { status: 'em_tratamento' }, 'Retomou o tratamento depois do evento', motivo);
        break;
      // O PRR volta para edição (por exemplo, depois do evento) e precisa de novo das validações. Exige motivo.
      case 'revisar-prr':
        if (!L.canMon(u, r)) throw forbid();
        needMotivo();
        setFields(u, r, { status: 'avaliado' }, 'Reabriu o PRR para revisão', motivo);
        alertAdd('revisao', r, 'O PRR de "' + r.titulo + '" foi reaberto para revisão: ' + motivo, [
          'cadastrador',
          'gestor',
        ]);
        break;
      // A ação do PRR foi feita: o prazo deixa de gerar aviso e passa a mostrar a data da conclusão.
      case 'concluir-acao':
        if (!L.canMon(u, r) || !r.prr || r.prr.concluidaEm) throw forbid();
        r.prr.concluidaEm = now();
        setFields(u, r, {}, 'Concluiu a ação do PRR', motivo);
        break;
      // Gestor da coordenadoria encerra o risco.
      case 'encerrar':
        if (!(u.papel === 'gestor' && u.unit === r.unit && ['em_tratamento', 'ocorrido'].includes(r.status)))
          throw forbid();
        r.encerradoEm = now(); // data usada nos relatórios por período
        setFields(u, r, { status: 'encerrado' }, 'Encerrou o risco', motivo);
        break;
      default:
        throw bad('Ação desconhecida.');
    }
    return r;
  });
}

/* ===== Contexto da coordenadoria (fase 1) ===== */
const ctxGet = unit => {
  const row = db().prepare('SELECT data FROM ctx WHERE unit=?').get(unit);
  return row ? JSON.parse(row.data) : { escopo: '', marcos: [] };
};
// Grava o contexto (insere ou substitui).
const ctxPut = (unit, c) =>
  db()
    .prepare('INSERT INTO ctx(unit,data) VALUES (?,?) ON CONFLICT(unit) DO UPDATE SET data=excluded.data')
    .run(unit, JSON.stringify(c));
// Só o cadastrador edita o contexto da própria coordenadoria.
function ctxEdit(u, fn) {
  if (u.papel !== 'cadastrador' && u.papel !== 'gestor')
    throw forbid('Só o cadastrador ou o gestor da coordenadoria edita o contexto.');
  return tx(() => {
    const c = ctxGet(u.unit);
    fn(c);
    ctxPut(u.unit, c);
    return c;
  });
}
// Altera o escopo e registra na auditoria.
function ctxEscopo(u, b) {
  return ctxEdit(u, c => {
    const n = str(b.escopo, 2000);
    if (n !== c.escopo)
      audit(u, null, 'Alterou o escopo do contexto', [{ campo: 'Escopo', de: c.escopo, para: n }]);
    c.escopo = n;
  });
}
// Inclui, conclui/reabre ou remove um marco do cronograma.
function ctxMarco(u, b) {
  return ctxEdit(u, c => {
    if (b.op === 'add') {
      const marco = str(b.marco, 160),
        data = String(b.data || '');
      if (marco.length < 3) throw bad('Descreva o marco do cronograma.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw bad('Informe a data do marco.');
      c.marcos.push({ marco, data, feito: false });
      audit(u, null, 'Incluiu marco no cronograma', [{ campo: 'Marco', de: '', para: marco + ' · ' + data }]);
    } else {
      const m = c.marcos[Number(b.idx)];
      if (!m) throw notFound('Marco não encontrado.');
      if (b.op === 'toggle') {
        m.feito = !m.feito;
        audit(u, null, 'Atualizou o cronograma', [
          {
            campo: m.marco,
            de: m.feito ? 'Previsto' : 'Concluído',
            para: m.feito ? 'Concluído' : 'Previsto',
          },
        ]);
      } else if (b.op === 'remove') {
        c.marcos.splice(Number(b.idx), 1);
        audit(u, null, 'Removeu marco do cronograma', [{ campo: 'Marco', de: m.marco, para: '' }]);
      } else throw bad('Operação desconhecida.');
    }
  });
}

/* ===== Estado enviado ao navegador (já filtrado pelo perfil) ===== */
function readAlerts(u) {
  tx(() => {
    for (const row of db().prepare('SELECT id,data FROM alerts').all()) {
      const a = JSON.parse(row.data);
      if (L.visible(u, a) && !a.lido[u.id]) {
        a.lido[u.id] = true;
        db().prepare('UPDATE alerts SET data=? WHERE id=?').run(JSON.stringify(a), row.id);
      }
    }
  });
}
// Tudo o que o navegador recebe, já filtrado pelo perfil: cadastrador e gestor só recebem a própria
// coordenadoria; o administrador não recebe riscos e só vê na trilha o que ele mesmo fez;
// a lista de usuários com usuário de acesso e documento SEI só vai para o administrador.
function getState(u) {
  const own = u.papel === 'cadastrador' || u.papel === 'gestor' || u.papel === 'terceirizado',
    adm = u.papel === 'admin';
  const risks = adm
    ? []
    : (own
        ? db().prepare('SELECT data FROM risks WHERE unit=?').all(u.unit)
        : db().prepare('SELECT data FROM risks').all()
      ).map(r => JSON.parse(r.data));
  const audits = (
    own
      ? db().prepare('SELECT data FROM audit WHERE unit=? ORDER BY ts DESC, id DESC LIMIT 500').all(u.unit)
      : adm
        ? db()
            .prepare(
              "SELECT data FROM audit WHERE json_extract(data,'$.role')='admin' ORDER BY ts DESC, id DESC LIMIT 500",
            )
            .all()
        : db().prepare('SELECT data FROM audit ORDER BY ts DESC, id DESC LIMIT 500').all()
  ).map(r => auditNovo(JSON.parse(r.data)));
  const alerts = db()
    .prepare('SELECT data FROM alerts ORDER BY ts DESC LIMIT 400')
    .all()
    .map(r => JSON.parse(r.data))
    .filter(a => L.visible(u, a))
    .map(a => ({ ...a, lido: { [u.id]: !!a.lido[u.id] } }));
  const units = own ? unitList().filter(x => x.sigla === u.unit) : unitList();
  const ctx = {};
  if (!adm) for (const un of units) ctx[un.sigla] = ctxGet(un.sigla);
  const team = db()
    .prepare('SELECT id,nome,papel,unit FROM users WHERE ativo=1')
    .all()
    .filter(t => (COM_UNIDADE.includes(t.papel) ? L.sameUnit(u, t.unit) : false));
  // Cada pessoa com o relatório de pedido mais recente; cadastro antigo ou conta de teste pode vir sem pedido.
  const users = adm
    ? db()
        .prepare(
          `SELECT u.id, u.username, u.nome, u.papel, u.unit, u.ativo,
                  d.tipo seiTipo, d.sei_nome seiNome, d.sei_numero seiNumero, d.data seiData,
                  d.arquivo seiArquivo, d.tamanho seiTamanho, d.sha256 seiHash, d.criado_em seiEm, d.criado_por seiPor
           FROM users u LEFT JOIN user_docs d ON d.id = (
             SELECT id FROM user_docs WHERE user_id = u.id ORDER BY criado_em DESC LIMIT 1)
           ORDER BY u.papel, u.unit, u.nome`,
        )
        .all()
    : [];
  return { me: u, risks, audit: audits, alerts, ctx, team, users, units, config: configGet() };
}

/* ===== Decisões da CSGR (Etapa 2 do plano) ===== */
// Valores que a CSGR decide e o sistema só aplica: premissas financeiras, apetite a risco e priorização.
// Enquanto a CSGR não decide, valem os padrões abaixo, que são o comportamento de antes (nada é inventado).
const CONFIG_PADRAO = () => ({
  premissas: { pct: { ...L.PPCT }, aprovada: false, por: '', em: '' },
  apetite: { nivelMax: null, por: '', em: '' },
  priorizacao: { metodo: 'nivel', por: '', em: '' },
});
// Decisões em vigor: as gravadas sobre os padrões.
function configGet() {
  const c = CONFIG_PADRAO();
  for (const row of db().prepare('SELECT chave, data FROM config').all())
    if (c[row.chave]) c[row.chave] = { ...c[row.chave], ...JSON.parse(row.data) };
  return c;
}
// A CSGR (perfil interno altagestao) registra uma decisão. Cada alteração vai para a auditoria com o valor
// anterior e o novo, quem decidiu e quando. Regra da Portaria 41, art. 9º, itens 6 e 7: quem propõe é a CSGR.
function configSet(u, chave, b) {
  if (u.papel !== 'altagestao') throw forbid('Só a Alta Gestão de Riscos registra estas decisões.');
  const atual = configGet(),
    v = { por: u.nome, em: now() };
  let antes, depois;
  if (chave === 'premissas') {
    const pct = {};
    for (const n of [1, 2, 3, 4, 5]) {
      const x = Number(b.pct && b.pct[n]);
      if (!Number.isFinite(x) || x < 0 || x > 100) throw bad('Cada percentual deve ficar entre 0 e 100.');
      pct[n] = Math.round(x * 10) / 1000;
    }
    for (const n of [1, 2, 3, 4])
      if (pct[n] > pct[n + 1]) throw bad('Os percentuais devem crescer da nota 1 para a 5.');
    // Regra do sistema: a nota 5 (a única que chega ao nível 25, Extremo) nunca fica abaixo de 90%.
    if (pct[5] < 0.9) throw bad('O percentual da nota 5 não pode ficar abaixo de 90%.');
    Object.assign(v, { pct, aprovada: !!b.aprovada });
    antes = JSON.stringify(atual.premissas.pct) + (atual.premissas.aprovada ? ' (aprovada)' : ' (minuta)');
    depois = JSON.stringify(pct) + (v.aprovada ? ' (aprovada)' : ' (minuta)');
  } else if (chave === 'apetite') {
    const n = b.nivelMax === '' || b.nivelMax == null ? null : Number(b.nivelMax);
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 25)) throw bad('Escolha um nível de 1 a 25.');
    v.nivelMax = n;
    antes = atual.apetite.nivelMax == null ? 'não definido' : 'até ' + atual.apetite.nivelMax;
    depois = n == null ? 'não definido' : 'até ' + n;
  } else if (chave === 'priorizacao') {
    if (!L.PRIORIZACAO.some(x => x[0] === b.metodo)) throw bad('Escolha um método de priorização.');
    v.metodo = b.metodo;
    antes = atual.priorizacao.metodo;
    depois = b.metodo;
  } else throw bad('Decisão desconhecida.');
  tx(() => {
    db()
      .prepare(
        'INSERT INTO config(chave,data) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET data=excluded.data',
      )
      .run(chave, JSON.stringify(v));
    audit(u, null, 'Registrou decisão da CSGR: ' + chave, [{ campo: chave, de: antes, para: depois }]);
  });
  return configGet();
}

module.exports = {
  HttpError,
  bad,
  forbid,
  createAdmin,
  createUser,
  seiDoc,
  addPedido,
  createUnit,
  removeUnit,
  renameUnit,
  resetPassword,
  setAtivo,
  deleteUser,
  login,
  logout,
  userFromToken,
  getState,
  createRisk,
  updateIdent,
  updateAval,
  savePrr,
  riskAction,
  ctxEscopo,
  ctxMarco,
  readAlerts,
  configGet,
  configSet,
};
