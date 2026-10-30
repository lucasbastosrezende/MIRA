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
const pub = r => ({ id: r.id, username: r.username, nome: r.nome, papel: r.papel, unit: r.unit || null });
// Verdadeiro enquanto não existe nenhuma pessoa: o primeiro acesso cria a CSGR.
const needsSetup = () => db().prepare('SELECT COUNT(*) n FROM users').get().n === 0;
// Usuário: 3 a 40 caracteres, minúsculas sem acento, números, ponto, hífen ou sublinhado.
const USERNAME = /^[a-z0-9._-]{3,40}$/;

// Confere nome, usuário e senha de uma pessoa nova.
function validNewUser(b) {
  const nome = str(b.nome, 80),
    username = str(b.username, 40).toLowerCase(),
    password = String(b.password || '');
  if (nome.length < 3) throw bad('Informe o nome completo.');
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
// Primeiro acesso: cria a conta da CSGR. Bloqueado depois que existe alguém.
function setup(b) {
  return tx(() => {
    if (!needsSetup()) throw forbid('O sistema já foi configurado.');
    const v = validNewUser(b);
    const id = insertUser(v, 'csgr', null);
    const u = pub(db().prepare('SELECT * FROM users WHERE id=?').get(id));
    audit(u, null, 'Configurou o sistema e criou a conta da CSGR');
    return u;
  });
}
// CSGR cadastra uma pessoa. Limites: 2 cadastradores e 1 gestor ativos por coordenadoria.
function createUser(admin, b) {
  if (admin.papel !== 'csgr') throw forbid('Só a CSGR cadastra pessoas.');
  return tx(() => {
    const v = validNewUser(b),
      papel = str(b.papel, 20),
      unit = str(b.unit, 20) || null;
    if (!L.PAPEL[papel]) throw bad('Escolha o perfil.');
    if ((papel === 'cadastrador' || papel === 'gestor') && !L.UNITS.includes(unit))
      throw bad('Escolha a coordenadoria.');
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
    const id = insertUser(v, papel, papel === 'csgr' || papel === 'cgge' ? null : unit);
    audit(
      admin,
      null,
      'Cadastrou ' +
        v.nome +
        ' como ' +
        L.PAPEL[papel] +
        (unit && (papel === 'cadastrador' || papel === 'gestor') ? ' da ' + unit : ''),
    );
    return pub(db().prepare('SELECT * FROM users WHERE id=?').get(id));
  });
}
// CSGR redefine a senha de alguém e encerra as sessões abertas dessa pessoa.
function resetPassword(admin, id, password) {
  if (admin.papel !== 'csgr') throw forbid();
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
// CSGR desativa ou reativa uma pessoa, respeitando os limites por coordenadoria.
function setAtivo(admin, id, ativo) {
  if (admin.papel !== 'csgr') throw forbid();
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
// Tentativas de login erradas por usuário e endereço (guardadas na memória do processo).
const fails = () => (globalThis.__miraFails = globalThis.__miraFails || new Map());
// Login: 5 tentativas erradas bloqueiam por 5 minutos. A sessão vale 8 horas.
// Usuário inexistente e senha errada dão a mesma mensagem.
function login(username, password, ip) {
  const key = String(username).toLowerCase() + '|' + ip,
    f = fails().get(key);
  if (f && f.until > Date.now()) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const row = db()
    .prepare('SELECT * FROM users WHERE username=? AND ativo=1')
    .get(String(username).toLowerCase());
  if (!row || !checkPw(password, row.salt, row.hash)) {
    const n = ((f && f.n) || 0) + 1;
    fails().set(key, { n, until: n >= 5 ? Date.now() + 5 * 60e3 : 0 });
    throw new HttpError(401, 'Usuário ou senha incorretos.');
  }
  fails().delete(key);
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
// Cadastrador cria um risco na própria coordenadoria. ID sequencial: R-001, R-002...
function createRisk(u, b) {
  if (u.papel !== 'cadastrador')
    throw forbid('Só quem cadastra riscos na coordenadoria pode criar um risco.');
  const f = identFields(b);
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
      exp = Number(b.exposicao || 0);
    if (!prob || !imp) throw bad('Escolha a probabilidade e o impacto (1 a 5).');
    if (!Number.isFinite(exp) || exp < 0)
      throw bad('A exposição financeira deve ser um valor maior ou igual a zero.');
    const first = !r.prob,
      patch = { prob, imp, exposicao: exp };
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
  o.probRes = int15(p.probRes) || 1;
  o.impRes = int15(p.impRes) || 1;
  return o;
}
// Grava o PRR (fase 4) sem enviar. Exige o risco avaliado.
function savePrr(u, id, b) {
  return tx(() => {
    const r = loadRisk(u, id);
    if (!L.canEdit(u, r)) throw forbid('Este risco não pode ser editado agora.');
    if (!r.prob || !r.imp) throw bad('Avalie probabilidade e impacto antes de elaborar o PRR.');
    if (!r.prr) r.prr = L.emptyPrr();
    const clean = cleanPrr(b.prr || {}),
      patch = {};
    for (const k of L.PRR_KEYS) patch['prr.' + k] = clean[k];
    setFields(u, r, patch, 'Atualizou o PRR');
    return r;
  });
}
// Ações sobre um risco já cadastrado. Cada caso confere a permissão (lib/logic.js) antes de mudar algo.
// Fluxo do PRR: avaliado/devolvido → ag_gestor → ag_csgr → em_tratamento; devolver exige motivo.
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
        const errs = L.prrErrors(r.prr);
        if (errs.length) throw bad(errs[0], { errors: errs });
        setFields(u, r, { status: 'ag_gestor' }, 'Enviou o PRR para o gestor');
        pushAprov(u, r, 'enviado');
        saveRisk(r);
        alertAdd('aprovacao', r, 'PRR "' + r.titulo + '" aguarda validação do gestor da ' + r.unit + '.', [
          'gestor',
        ]);
        break;
      }
      // Gestor valida e encaminha à CSGR.
      case 'gestor-ok':
        if (!L.canGes(u, r)) throw forbid();
        setFields(u, r, { status: 'ag_csgr' }, 'Validou e encaminhou o PRR à CSGR', motivo);
        pushAprov(u, r, 'encaminhado', motivo);
        saveRisk(r);
        alertAdd('aprovacao', r, 'PRR "' + r.titulo + '" (' + r.unit + ') aguarda aprovação da CSGR.', [
          'csgr',
        ]);
        break;
      // Gestor ou CSGR devolve ao cadastrador, com motivo.
      case 'gestor-dev':
      case 'csgr-dev':
        if (a === 'gestor-dev' ? !L.canGes(u, r) : !L.canCsg(u, r)) throw forbid();
        needMotivo();
        setFields(u, r, { status: 'devolvido' }, 'Devolveu o PRR', motivo);
        pushAprov(u, r, 'devolvido', motivo);
        saveRisk(r);
        alertAdd('devolvido', r, 'O PRR de "' + r.titulo + '" foi devolvido: ' + motivo, [
          'cadastrador',
          'gestor',
        ]);
        break;
      // CSGR aprova: começa o monitoramento.
      case 'csgr-ok':
        if (!L.canCsg(u, r)) throw forbid();
        setFields(u, r, { status: 'em_tratamento' }, 'Aprovou o PRR', motivo);
        pushAprov(u, r, 'aprovado', motivo);
        saveRisk(r);
        alertAdd('aprovado', r, 'PRR "' + r.titulo + '" foi aprovado pela CSGR. Comece o monitoramento.', [
          'cadastrador',
          'gestor',
        ]);
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
            ['cadastrador', 'gestor', 'csgr'],
          );
        saveRisk(r);
        break;
      }
      // Reavaliação do nível, com motivo; avisa gestor e CSGR se o nível subiu.
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
        if (L.nivel(r) > old)
          alertAdd(
            'nivel',
            r,
            'O nível de "' + r.titulo + '" subiu de ' + old + ' para ' + L.nivel(r) + '.',
            ['gestor', 'csgr'],
          );
        break;
      }
      // O evento do risco aconteceu; gestor e CSGR são avisados.
      case 'evento':
        if (!L.canMon(u, r) || r.status !== 'em_tratamento') throw forbid();
        setFields(u, r, { status: 'ocorrido' }, 'Registrou que o evento ocorreu');
        alertAdd('evento', r, 'O evento de "' + r.titulo + '" ocorreu. Reavalie o nível e o PRR.', [
          'gestor',
          'csgr',
        ]);
        break;
      // Gestor da coordenadoria encerra o risco.
      case 'encerrar':
        if (!(u.papel === 'gestor' && u.unit === r.unit && ['em_tratamento', 'ocorrido'].includes(r.status)))
          throw forbid();
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
  if (u.papel !== 'cadastrador') throw forbid('Só quem cadastra riscos na coordenadoria edita o contexto.');
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
// coordenadoria; a lista de usuários com usuário de acesso só vai para a CSGR.
function getState(u) {
  const own = u.papel === 'cadastrador' || u.papel === 'gestor';
  const risks = (
    own
      ? db().prepare('SELECT data FROM risks WHERE unit=?').all(u.unit)
      : db().prepare('SELECT data FROM risks').all()
  ).map(r => JSON.parse(r.data));
  const audits = (
    own
      ? db().prepare('SELECT data FROM audit WHERE unit=? ORDER BY ts DESC, id DESC LIMIT 500').all(u.unit)
      : db().prepare('SELECT data FROM audit ORDER BY ts DESC, id DESC LIMIT 500').all()
  ).map(r => JSON.parse(r.data));
  const alerts = db()
    .prepare('SELECT data FROM alerts ORDER BY ts DESC LIMIT 400')
    .all()
    .map(r => JSON.parse(r.data))
    .filter(a => L.visible(u, a))
    .map(a => ({ ...a, lido: { [u.id]: !!a.lido[u.id] } }));
  const units = own ? [u.unit] : L.UNITS;
  const ctx = {};
  for (const un of units) ctx[un] = ctxGet(un);
  const team = db()
    .prepare('SELECT nome,papel,unit FROM users WHERE ativo=1')
    .all()
    .filter(t => (t.papel !== 'csgr' && t.papel !== 'cgge' ? L.sameUnit(u, t.unit) : false));
  const users =
    u.papel === 'csgr'
      ? db().prepare('SELECT id,username,nome,papel,unit,ativo FROM users ORDER BY papel, unit, nome').all()
      : [];
  return { me: u, risks, audit: audits, alerts, ctx, team, users };
}

module.exports = {
  HttpError,
  bad,
  forbid,
  needsSetup,
  setup,
  createUser,
  resetPassword,
  setAtivo,
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
};
