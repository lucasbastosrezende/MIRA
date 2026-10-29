# MIRA · Monitoramento Integrado de Riscos e Ações

Plataforma de gestão de riscos da SETIC que conduz as coordenadorias pelas 5 fases do MGR:
contexto, identificação, avaliação (matriz 5×5), tratamento (PRR com aprovação) e monitoramento,
com histórico de toda alteração, alertas e dois painéis (Operacional de TI e Alta Gestão).

O sistema começa **vazio**: sem riscos, sem pessoas e sem dados de exemplo.

## Como rodar (localhost)

Requisitos: Node.js 22.13 ou mais novo (o banco usa o módulo `node:sqlite`, que já vem no Node).

```bash
npm install
npm run dev
```

Abra http://localhost:3000. O servidor só escuta em 127.0.0.1.

1. **Primeiro acesso:** a tela pede nome, usuário e senha para criar a conta da **CSGR**.
2. Entre como CSGR e abra **Usuários** para cadastrar as pessoas:
   até 2 *cadastradores* e 1 *gestor de riscos* (titular) por coordenadoria, além de CSGR e CGGE.
3. Cada cadastrador entra, preenche o **Contexto** da coordenadoria e começa a registrar riscos.

Para uso em produção: `npm run build && npm start`.

## Perfis

| Perfil | O que faz |
|---|---|
| Cadastrador | Registra e edita riscos da própria coordenadoria, elabora o PRR, registra medições e reavalia. |
| Gestor de riscos | Titular da coordenadoria. Valida o PRR e o encaminha à CSGR (ou devolve). Encerra riscos. |
| CSGR | Aprova ou devolve PRRs, gera o relatório anual e cadastra as pessoas. |
| CGGE | Só consulta. |

O acesso é conferido no servidor: quem é de uma coordenadoria não enxerga nem acessa riscos de outra.

## Assistente de IA (opcional)

Sem configuração, o sistema funciona normalmente, só sem o assistente. Para ativar, copie
`.env.example` para `.env.local` e preencha `ANTHROPIC_API_KEY`. O assistente reescreve o texto no
formato do MGR, avisa quando é um problema e não um risco, sugere notas e ações e aponta riscos parecidos.
A chamada sai do servidor; a chave nunca vai para o navegador. A restrição de não usar os dados para
treinar modelos depende do contrato da API usada. Confirme antes de colocar dados reais.

## Banco de dados e auditoria

Arquivo SQLite em `./data/mira.db` (mude com `MIRA_DATA_DIR`). Faça cópia desse arquivo para backup.
A tabela `audit` só recebe inserções: cada alteração guarda quem, quando e o quê (valor anterior e novo).
Não existe rota para editar ou apagar a trilha.

## Testes

```bash
npm run test:api          # fluxo completo pela API, com banco temporário
node --no-warnings tests/ui.smoke.mjs   # executa o código da interface contra a API com um DOM mínimo
```

## Premissas para conferir com o MGR oficial

Estão em `lib/logic.js`:

- **Faixas de nível:** 1–2 irrelevante, 3–5 baixo, 6–10 médio, 12–16 alto, 20–25 extremo.
- **Descrição das notas 1 a 5** de probabilidade e impacto.
- **Probabilidade em percentual** (5%, 15%, 35%, 60%, 85%) usada só no painel de Alta Gestão para estimar
  exposição em reais. É uma premissa para comparar opções, não uma previsão de perda.
- **Alertas por e-mail** ainda não saem do sistema: os avisos aparecem na aba Alertas.

## Estrutura

```
app/                 Next.js (App Router)
  api/[...path]/     rota que entrega as requisições para lib/api.js
  mira-ui.js         interface (cliente)
lib/logic.js         regras do MGR (escalas, níveis, permissões, validações)
lib/service.js       regras de negócio e auditoria no servidor
lib/api.js           roteador da API
lib/db.js            SQLite e senhas (scrypt)
tests/               testes
```
