# CLAUDE.md · MIRA

Regras deste repositório. Valem para toda sessão e não dependem de pedido repetido. Em caso de conflito, a instrução mais recente do usuário vence, mas as regras de Git e de dados abaixo só mudam se o usuário disser explicitamente.

## O projeto

MIRA · Monitoramento Integrado de Riscos e Ações (SETIC). Plataforma que conduz as coordenadorias pelas 5 fases do MGR (contexto, identificação, avaliação, tratamento com PRR, monitoramento) e entrega dois painéis: Operacional de TI e Alta Gestão.

- Stack: Next.js 15 (App Router), React 19, Node >= 22.13, SQLite nativo (`node:sqlite`). Sem dependências extras.
- Remoto: https://github.com/lucasbastosrezende/MIRA
- Estrutura: `app/` (interface; `mira-ui.js` monta toda a tela e `globals.css` tem os estilos), `lib/` (`logic.js` regras do MGR, `service.js` regras de negócio e auditoria, `api.js` roteador, `db.js` banco), `scripts/` (comandos de implantação), `tests/`, `docs/` (documentação), `.github/` (modelo de PR).
- Documentação nova vai em `docs/` e entra na tabela "Documentação" do `README.md`. Na raiz ficam só o `README.md` e este `CLAUDE.md`.
- Comandos: `npm run dev`, `npm test` (roda `npm run test:api` e `npm run test:ui`), `npm run admin -- <usuario>` (cria o administrador na implantação).

## Idioma

Tudo em português do Brasil: interface, mensagens de commit, descrição de PR, comentários e respostas ao usuário. Nomes de branch sem acento. Texto de tela em linguagem simples.

## Git: branches

Três branches fixas, nunca recebem commit direto:

| Branch | Papel |
|---|---|
| `main` | produção |
| `homologacao` | validação antes da produção |
| `desenvolvimento` | integração; é a base de todo trabalho |

Todo tópico novo é uma branch derivada de `desenvolvimento`, com prefixo e nome em minúsculas separado por hífen:

`feature/` funcionalidade · `fix/` correção · `chore/` configuração · `docs/` documentação · `test/` testes · `refactor/` reorganização sem mudar comportamento.

Exemplos: `feature/ui-tela-do-risco`, `fix/datas-sem-fuso`, `docs/claude-md`.

Promoção: `desenvolvimento` → `homologacao` → `main`, sempre por PR.

## Git: branches de trabalho e PRs

- Cada tópico tem a sua branch, derivada de `desenvolvimento`. Não misture assuntos sem necessidade.
- Pull request só quando o usuário pedir, e o menor número possível: um PR pode juntar vários commits e tópicos relacionados. O destino é sempre `desenvolvimento`.
- Se o trabalho depende de algo ainda não mesclado, a branch sai da branch de que depende (ou a incorpora com merge), e a dependência é dita na seção "Ordem de merge" do PR.
- Commit pequeno e coerente com o tópico. Commits não são amendados nem reescritos depois de enviados.
- Quem faz o merge é o usuário ou o dono do repositório. Claude não mescla PR nem força push.

## Git: formato do commit

Primeira linha: `tipo(escopo): resumo curto no presente`, até cerca de 70 caracteres. Tipos: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`. Escopo opcional (`ui`, `db`, `api`, `paineis`...).

O corpo explica o que mudou e por quê, em parágrafos curtos, e fecha com a linha de coautoria que a ferramenta indica na sessão:

```
feat(ui): redesenha a tela do risco

Cabeçalho com a frase do MGR e os fatos-chave. Histórico em linha
do tempo com valores legíveis no lugar de códigos.

Co-Authored-By: Claude <modelo> <noreply@anthropic.com>
```

## Git: formato do PR

Título igual ao do commit principal. Corpo, nesta ordem:

```
## Resumo
- o que muda, em tópicos

## Ordem de merge
Parte N de M. Fazer o merge depois de #X (ou "é a primeira da sequência").

## Como testar
- [ ] passos objetivos, com os comandos

Frase curta dizendo o que foi conferido de fato e como.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Só afirme no PR o que foi verificado. Se algo não foi testado, diga.

## Git: ferramentas nesta máquina

O `gh` não está instalado. PRs são abertos pela API REST do GitHub usando o token do Git Credential Manager (`git credential fill`). O token nunca é impresso, gravado em arquivo nem colocado em commit.

## Testes

Antes de commitar: `npm run test:api` e `node --no-warnings tests/ui.smoke.mjs` precisam passar. Se o usuário pedir para não rodar testes por enquanto, respeite e diga no PR que não foram rodados.

## Dados e privacidade

- O sistema começa vazio. Não coloque dados de exemplo, nomes de pessoas nem riscos inventados no código, no README ou em commits.
- Nunca use nomes de pessoas fictícias ou reais em dados de demonstração. Os únicos usuários de demonstração permitidos são `criadordeusuario` (administrador, cria coordenadorias e pessoas), `altagestao1` (perfil CSGR, alta gestão), `testeusuario` (cadastrador da Cosegi) e `supervisortesteusuario` (gestor de riscos da Cosegi, supervisor do `testeusuario`). O campo de usuário só aceita letras minúsculas sem acento, por isso `altagestao1`.
- Banco de demonstração e capturas de tela ficam fora do repositório (pasta temporária). Nunca commite `data/`, `.env.local`, chaves ou tokens.

## Código

- Todo JavaScript fica indentado para leitura humana, no padrão do Prettier 3.3.3: aspas simples, 110 colunas, ponto e vírgula, `arrowParens: avoid`. O Prettier é só ferramenta (rodado de fora do repositório); não entra no `package.json`.
- O código tem que ser auditável: cabeçalho no topo de cada arquivo dizendo o papel dele, um comentário acima de cada função ou constante dizendo o que faz, e a regra do MGR ou de segurança escrita onde ela é aplicada.
- Reorganização sem mudança de comportamento vai numa branch `refactor/`, e o PR diz como isso foi conferido (por exemplo, comparando a árvore sintática antes e depois).

## Interface

- Estilo existente: HTML em strings, funções curtas, nomes em português. Siga o que está ao redor.
- Cores e tipografia só pelos tokens de `globals.css` (`--accent`, `--l0..l4`, `--s0..s4`...). Tema escuro sai dos mesmos tokens.
- Estado nunca só por cor: use ícone e texto (`toneTag`).
- Reaproveite as peças: `pageHead`, `cardH`, `tile`, `toneTag`, `heat`, `.card`, `.tiles`, `.dash`.
- Todo texto que vem de dados passa por `esc()`; dicas flutuantes usam `data-tip` (texto puro).
- Datas sem hora ("2026-12-15") passam por `pd()`/`fd()`, nunca por `new Date()` direto.
- Confira em largura de computador e de celular (390px) e em tema claro e escuro.
- Não deixe valores brutos do sistema (`ag_csgr`, `2026-12-15`) na tela.
