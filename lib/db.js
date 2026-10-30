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
  // audit (trilha), alerts (avisos guardados) e ctx (contexto de cada coordenadoria).
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
    CREATE INDEX IF NOT EXISTS audit_unit ON audit(unit, ts);
    CREATE INDEX IF NOT EXISTS audit_risk ON audit(risk_id);
  `);
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
