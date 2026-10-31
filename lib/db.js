'use strict';
// Banco SQLite local (módulo nativo do Node, sem dependências). O arquivo fica em ./data/mira.db.
// Começa vazio: sem riscos, sem pessoas e sem dados de exemplo.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// Abre o banco uma única vez por processo e cria as tabelas que faltarem.
function open() {
  if (globalThis.__miraDb) return globalThis.__miraDb;
  // getBuiltinModule evita que o empacotador do Next tente resolver "node:sqlite".
  const sqlite = process.getBuiltinModule('node:sqlite');
  const dir = process.env.MIRA_DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new sqlite.DatabaseSync(process.env.MIRA_DB_FILE || path.join(dir, 'mira.db'));
  // Tabelas: users (pessoas), sessions (logins abertos), risks (cada risco em JSON),
  // audit (trilha), alerts (avisos guardados), ctx (contexto de cada coordenadoria),
  // units (coordenadorias) e user_docs (relatório de pedido de cada cadastro: SEI ou pedido formal).
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nome TEXT NOT NULL,
      papel TEXT NOT NULL, unit TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS risks (id TEXT PRIMARY KEY, unit TEXT NOT NULL, data TEXT NOT NULL);
    -- Trilha de auditoria: o sistema só insere. Não há rota de edição nem de exclusão.
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, unit TEXT, risk_id TEXT, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, ts TEXT NOT NULL, unit TEXT, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ctx (unit TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_unit ON audit(unit, ts);
    CREATE INDEX IF NOT EXISTS audit_risk ON audit(risk_id);
    -- Coordenadorias criadas pelo administrador. O sistema começa sem nenhuma.
    CREATE TABLE IF NOT EXISTS units (sigla TEXT PRIMARY KEY, nome TEXT NOT NULL, criado_em TEXT NOT NULL);
    -- Relatório de pedido que autoriza o acesso de cada pessoa (SEI ou pedido formal), indexado pelo
    -- número SEI, com o PDF quando houver (vazio = sem PDF). Só há INSERT: um pedido novo não apaga o anterior.
    CREATE TABLE IF NOT EXISTS user_docs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sei_nome TEXT NOT NULL, sei_numero TEXT NOT NULL,
      arquivo TEXT NOT NULL, tamanho INTEGER NOT NULL, sha256 TEXT NOT NULL, pdf BLOB NOT NULL,
      criado_em TEXT NOT NULL, criado_por TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_docs_sei ON user_docs(sei_numero);
    CREATE INDEX IF NOT EXISTS user_docs_user ON user_docs(user_id);
  `);
  // Banco criado antes da tabela units: as coordenadorias que já têm pessoas, riscos ou contexto
  // entram na lista, para nada ficar sem dono. Roda uma única vez (marcada em user_version), para que
  // uma coordenadoria apagada depois não volte quando o servidor reinicia. Num banco novo não há o que copiar.
  if (db.prepare('PRAGMA user_version').get().user_version < 1) {
    if (db.prepare('SELECT COUNT(*) n FROM units').get().n === 0)
      db.prepare(
        `INSERT OR IGNORE INTO units(sigla,nome,criado_em)
         SELECT unit, '', ? FROM (SELECT unit FROM users UNION SELECT unit FROM risks UNION SELECT unit FROM ctx)
         WHERE unit IS NOT NULL AND unit <> ''`,
      ).run(new Date().toISOString());
    db.exec('PRAGMA user_version = 1');
  }
  // Colunas do relatório de pedido acrescentadas depois: tipo ("sei" ou "formal") e data do documento.
  const cols = db
    .prepare('PRAGMA table_info(user_docs)')
    .all()
    .map(c => c.name);
  if (!cols.includes('tipo')) db.exec("ALTER TABLE user_docs ADD COLUMN tipo TEXT NOT NULL DEFAULT 'sei'");
  if (!cols.includes('data')) db.exec("ALTER TABLE user_docs ADD COLUMN data TEXT NOT NULL DEFAULT ''");
  // Permissão do cadastrador para definir responsável, prazo e custo do PRR (liberada no cadastro).
  const ucols = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map(c => c.name);
  if (!ucols.includes('pode_definir'))
    db.exec('ALTER TABLE users ADD COLUMN pode_definir INTEGER NOT NULL DEFAULT 0');
  // O perfil "csgr" passou a se chamar "altagestao" (e a situação "ag_csgr", "ag_altagestao"). Roda uma vez
  // (user_version 2) e troca pessoas, riscos e avisos. A trilha de auditoria não é reescrita, porque só recebe
  // inserções: os registros antigos são traduzidos na leitura (lib/service.js, auditNovo).
  if (db.prepare('PRAGMA user_version').get().user_version < 2) {
    db.exec('BEGIN');
    db.prepare("UPDATE users SET papel='altagestao' WHERE papel='csgr'").run();
    for (const row of db.prepare('SELECT id, data FROM risks').all()) {
      const r = JSON.parse(row.data);
      if (r.status === 'ag_csgr') r.status = 'ag_altagestao';
      if (r.prr && r.prr.aprov) r.prr.aprov.forEach(a => a.papel === 'csgr' && (a.papel = 'altagestao'));
      const novo = JSON.stringify(r);
      if (novo !== row.data) db.prepare('UPDATE risks SET data=? WHERE id=?').run(novo, row.id);
    }
    for (const row of db.prepare('SELECT id, data FROM alerts').all()) {
      const a = JSON.parse(row.data);
      if (a.para && a.para.includes('csgr')) {
        a.para = a.para.map(p => (p === 'csgr' ? 'altagestao' : p));
        db.prepare('UPDATE alerts SET data=? WHERE id=?').run(JSON.stringify(a), row.id);
      }
    }
    db.exec('PRAGMA user_version = 2');
    db.exec('COMMIT');
  }
  globalThis.__miraDb = db;
  return db;
}

// Senha com scrypt e salt aleatório; nunca se guarda a senha em texto.
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
// Gera salt e hash para uma senha nova.
function newPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashPw(pw, salt) };
}
// Compara a senha digitada com o hash em tempo constante (não revela quanto acertou).
function checkPw(pw, salt, hash) {
  const a = Buffer.from(hashPw(pw, salt), 'hex'),
    b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { open, newPw, checkPw };
