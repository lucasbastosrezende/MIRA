'use strict';
// Cria a conta do administrador (perfil de implantação). Roda no servidor, nunca pelo navegador:
//   npm run admin -- <usuario>
// A senha é pedida no terminal, sem aparecer na tela. Também pode vir pela entrada padrão
// (primeira linha), para automação: echo "<senha>" | npm run admin -- <usuario>
// Usa o mesmo banco do sistema (MIRA_DATA_DIR ou ./data). Existe um único administrador:
// se ele já existe, o comando não muda nada.
const readline = require('node:readline');
const S = require('../lib/service.js');

// Lê uma linha do terminal sem mostrar o que é digitado.
function askHidden(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(prompt, v => {
      rl.close();
      process.stdout.write('\n');
      resolve(v);
    });
    rl._writeToOutput = s => {
      if (s.startsWith(prompt)) rl.output.write(prompt);
    };
  });
}
// Lê a primeira linha da entrada padrão (quando a senha vem por pipe).
function readStdinLine() {
  return new Promise(resolve => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => (d += c));
    process.stdin.on('end', () => resolve(d.split(/\r?\n/)[0]));
  });
}

(async () => {
  const username = String(process.argv[2] || '')
    .trim()
    .toLowerCase();
  if (!username) {
    console.error('Uso: npm run admin -- <usuario>');
    process.exit(2);
  }
  let password;
  if (process.stdin.isTTY) {
    password = await askHidden('Senha do administrador (mínimo de 8 caracteres): ');
    if ((await askHidden('Repita a senha: ')) !== password) {
      console.error('As senhas não conferem. Nada foi gravado.');
      process.exit(1);
    }
  } else password = await readStdinLine();
  try {
    const u = S.createAdmin({ username, password });
    console.log('Administrador "' + u.username + '" criado. Entre no MIRA com esse usuário.');
  } catch (e) {
    console.error((e.message || 'Não foi possível criar o administrador.') + ' Nada foi gravado.');
    process.exit(1);
  }
})();
