# Plano de ação · conformidade do MIRA com o MGR

Plano para levar o MIRA ao Modelo de Gestão de Riscos (MGR) da SETIC, edital v1.0 de 01/10/2025. Parte da análise "MIRA · Alterações sugeridas pelo Modelo de Gestão de Riscos" (30/10/2026), feita sobre `origin/desenvolvimento` no commit `37c5b34`. Este arquivo foi escrito para quem continuar o trabalho num chat novo, sem o histórico da conversa: cada item diz **o que deve ser feito**, **como pode ser feito** no código atual, **o que já existe**, **o que depende de decisão** e **como conferir**.

"p." é a página impressa do edital. Os caminhos são relativos à raiz do repositório e valem para a branch `docs/plano-conformidade-mgr`, que tem o mesmo código de `fix/evento-supervisor-prazo-e-alertas`. Números de linha mudam: procure pelo nome da função.

---

## 1. Estado atual (30/10/2026, noite)

### Branches e PRs

`desenvolvimento` já tem os PRs #1 a #29 (código inicial, painéis, interface e legibilidade). `homologacao` recebeu `desenvolvimento` pelo #32. `main` tem só LICENSE e README.

Trabalho pronto **fora** de `desenvolvimento`, empilhado, uma branch saindo da outra:

| Ordem | Branch | PR | O que traz |
|---|---|---|---|
| 1 | `feature/perfil-administrador` | #30 (aberto) | Administrador criado no servidor (`npm run admin -- <usuario>`), login só com usuário e senha, cadastro de pessoas com PDF do SEI, coordenadorias criadas na hora (sem lista fixa). Incorpora #10. |
| 2 | `feature/quadro-delegacao-pedido-e-downloads` | #31 (aberto) | Quadro de delegação, relatório de pedido (SEI ou pedido formal, contas `teste1` a `teste20` sem pedido), sigla e nome por extenso no cabeçalho, menu Baixar com 6 CSVs, relatório e justificativa do TCE em Markdown, exclusão de pessoas. |
| 3 | `feature/nome-alta-gestao-de-riscos` | sem PR | Troca de "CSGR" por "Alta Gestão de Riscos" (perfil interno `altagestao`, migração `user_version 2`); contexto primeiro no novo risco; Novo risco e Contexto dentro da aba Riscos; valores em reais no formato brasileiro; risco residual começando igual ao risco de hoje; relatório por semana, mês, semestre e ano. |
| 4 | `fix/evento-supervisor-prazo-e-alertas` | sem PR | Saída depois do evento (retomar o tratamento ou reabrir o PRR); gestor com as ações do cadastrador; prazo da ação em texto útil e "ação concluída"; avisos resolvidos saem da lista; sigla em maiúsculas. |
| 5 | `docs/plano-conformidade-mgr` | sem PR | Este plano. |

PR só quando o usuário pedir (ver seção 2). A ordem de merge é a da tabela.

### Ambiente local

- Pasta do projeto: `C:\Projetos\MIRA`. O localhost **3100 precisa ficar sempre no ar**. Se ele cair, suba de novo da pasta do projeto com o banco de demonstração:
  `MIRA_DATA_DIR="C:/Users/ASUS/AppData/Local/Temp/claude/c--Projetos-MIRA/4da9c562-c090-48ad-86f3-18e833d5245c/scratchpad/demo-data" npx next dev -H 127.0.0.1 -p 3100`
- Banco de demonstração (fora do repositório): a pasta `demo-data` acima. Hoje tem só `criadordeusuario` (administrador), `testeusuario` (cadastrador) e `supervisortesteusuario` (gestor), os dois últimos na coordenadoria TESTE. A senha foi combinada com o usuário e não fica no repositório. Cópia anterior à limpeza: `.../scratchpad/backups/mira-antes-da-limpeza.db`.
- Ferramentas fora do repositório, na mesma pasta `scratchpad`:
  - Prettier 3.3.3: `ferramentas/node_modules/.bin/prettier --config ferramentas/prettier.json --write <arquivos>`.
  - Roteiro de navegador: `e2e.mjs` (Playwright, 49 cenários), uso `node e2e.mjs <rodada> 3200`.
  - Cópia do projeto para testes: `mira-copia/` (com `node_modules` por junção). Copie `app/` e `lib/` para lá, apague `e2e-data/` e suba `next dev` na porta **3200** com `MIRA_DATA_DIR` apontando para `e2e-data`. Nunca pare a 3100 para testar.
  - Playwright: `C:/Users/ASUS/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright-core`.
- Antes de commitar: `npm run test:api` (105 verificações hoje) e `node --no-warnings tests/ui.smoke.mjs` (53).

---

## 2. O que não pode ser alterado

São regras do usuário e do `CLAUDE.md`. Só mudam se o usuário disser explicitamente.

**Git e PRs**
- `main`, `homologacao` e `desenvolvimento` nunca recebem commit direto. Todo trabalho vai numa branch com prefixo (`feature/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`), em minúsculas e sem acento.
- **Pull request só quando o usuário pedir**, e o menor número possível (um PR pode juntar tópicos relacionados). O destino é sempre `desenvolvimento`.
- Quem faz o merge é o usuário ou o dono do repositório. Não mesclar PR, não forçar push, não reescrever commits enviados.
- Commits e PRs em português, no formato do `CLAUDE.md` (`tipo(escopo): resumo`, corpo explicando o porquê, linha de coautoria). O PR tem Resumo, Ordem de merge, Como testar e o que foi conferido de fato.
- O `gh` não existe na máquina. PR pela API REST com o token de `git credential fill`. O token nunca é impresso nem gravado.

**Dados e segurança**
- O sistema começa vazio. Não colocar dados de exemplo, nomes de pessoas nem riscos inventados no código, no README ou em commits.
- Contas de demonstração permitidas: `criadordeusuario`, `altagestao1`, `testeusuario`, `supervisortesteusuario` e `teste1` a `teste20`. Só o `criadordeusuario` é fixo; o resto pode ser apagado quando o usuário pedir.
- Nunca commitar `data/`, `.env.local`, chaves, tokens ou senhas.
- A **trilha de auditoria só recebe inserções**. Nenhuma rota ou migração altera ou apaga registros dela; mudanças de nome são traduzidas na leitura (ver `auditNovo` em `lib/service.js`). A exceção foi a limpeza do banco de demonstração, feita a pedido.
- Toda permissão é conferida no servidor (`lib/logic.js` e `lib/service.js`). Esconder botão na tela é só conveniência.

**Decisões de produto já tomadas pelo usuário (manter)**
- Não há criação de conta pelo navegador. O administrador é criado no servidor; só ele cadastra pessoas, e cada cadastro exige o relatório de pedido (SEI com PDF, ou pedido formal com número SEI e data). As contas `teste1` a `teste20` são a exceção.
- Login só com usuário e senha, sem campo de nome: o usuário é o nome exibido. Usuário inexistente é recusado sem gravar nada no banco.
- Coordenadorias não são fixas no código: são criadas pelo administrador. O cabeçalho mostra a sigla em maiúsculas e o nome por extenso, lidos dos dados.
- O novo risco começa pelo contexto (o servidor recusa risco sem escopo salvo). "Novo risco" e "Contexto" ficam dentro da aba Riscos, não no menu de cima.
- Valores em reais aceitam o formato brasileiro (`parseBRL` em `app/mira-ui.js`).
- Na tela, os textos longos aparecem em Markdown; para baixar, oferecer as opções de formato (menu Baixar).
- O gestor (supervisor) pode fazer o que o cadastrador faz na própria coordenadoria.

**Código**
- Next.js 15, React 19, Node ≥ 22.13, `node:sqlite`. Sem dependências novas no `package.json`.
- JavaScript no padrão do Prettier 3.3.3 (rodado de fora do repositório), cabeçalho em cada arquivo, um comentário por função e a regra do MGR ou de segurança escrita onde é aplicada.
- Interface: HTML em strings, `esc()` em todo texto vindo de dados, `pd()`/`fd()` para datas sem hora, cores só pelos tokens de `globals.css`, estado nunca só por cor (`toneTag`). Conferir no computador e a 390 px, nos temas claro e escuro.
- Reorganização sem mudança de comportamento vai numa branch `refactor/`.

---

## 3. Passo 0 · Organizar o que já existe

Antes de código novo.

1. **Nome do perfil.** A análise mostrou que, no edital, "alta gestão" é o CGGE (p. 7) e a CSGR é a comissão da Portaria Setic 41. Por isso a troca para "Alta Gestão de Riscos" (`feature/nome-alta-gestao-de-riscos`, commit `2119b47`) mistura os dois.
   - **Deve ser feito:** voltar a exibir "CSGR", com o nome por extenso oficial que o usuário informar.
   - **Pode ser feito assim:** como a branch não foi mesclada, fazer um commit novo (sem reescrever o histórico) que restaura os textos de tela. Para o código interno há duas opções:
     - (a) manter `altagestao` no código e trocar só `PAPEL.altagestao` e os textos;
     - (b) voltar para `csgr`, com uma migração `user_version 3` em `lib/db.js` que faz o caminho inverso da versão 2 (pessoas, riscos e avisos) e com `auditNovo` traduzindo também `altagestao` para `csgr`.
   - A opção (a) é menor; a (b) deixa o código igual ao edital. **Decisão do usuário.**
2. **Mesclar na ordem da seção 1.** Se o usuário preferir menos PRs, as branches 3, 4 e 5 podem ir num PR só, depois do #31.
3. **Produção.** O `CLAUDE.md` diz que `main` é produção, mas ela está vazia. Confirmar com o usuário se `main` passa a receber `homologacao`.

---

## 4. Situação de cada item

Legenda: **Feito** (já existe numa branch da seção 1) · **Parcial** · **Pendente**.

| # | Item | Gravidade | Situação | Etapa |
|---|---|---|---|---|
| 1 | Faixas de nível erradas | Grave | Pendente | 1 |
| 2 | Descrições de probabilidade e impacto | Grave | Pendente (decisão) | 2 → 3 |
| 3 | Probabilidade sem linha do tempo | Média | Pendente | 3 |
| 4 | Controles existentes fora da criticidade | Média | Pendente (decisão) | 2 → 3 |
| 5 | Gestor sem as etapas do edital | Grave | Parcial | 2 → 3 |
| 6 | Monitoramento sem o gestor | Média | Feito (branch 4) | — |
| 7 | Apetite a risco e alçada | Grave | Pendente (decisão) | 2 → 3 |
| 8 | Papel do CGGE | Média | Pendente (decisão) | 2 → 3 |
| 9 | PRR travado depois da aprovação | Média | Parcial | 3 |
| 10 | Responsável da ação em texto livre | Baixa | Parcial | 3 |
| 11 | Comunicação restrita | Média | Pendente | 3 |
| 12 | Residual padrão 1 × 1 | Grave | Parcial | 1 |
| 13 | Percentuais e reais sem base | Grave | Pendente (decisão) | 2 → 3 |
| 14 | Relatório anual sem os PRRs | Média | Parcial | 3 |
| 15 | Critérios do tratamento | Baixa | Pendente | 3 |
| 16 | Exportação sem campos dos Apêndices C e D | Média | Parcial | 1 e 3 |
| 17 | Roadmap do Apêndice A | Média | Parcial | 3 |
| 18 | Priorização só pelo nível | Baixa | Pendente (decisão) | 2 → 3 |
| 19 | Reavaliação e descarte | Baixa | Pendente | 1 e 3 |
| 20 | Aprovação da CSGR sem parecer | Baixa | Pendente (decisão) | 2 → 3 |
| 21 | Detalhes de tela e cores da matriz | Baixa | Pendente | 1 |
| 22 | IA sem as definições do edital | Baixa | Pendente | 1 |
| 23 | Bloqueio de login burlável | Segurança | Pendente | 1 |
| 24 | CSV sem proteção contra fórmulas | Segurança | Pendente | 1 |
| 25 | Primeiro acesso e cookie | Segurança | Parcial | 1 |
| 26 | Texto de risco para API externa | Governança | Pendente (decisão) | 2 → 3 |
| 27 | Faixas repetidas e testes sem o edital | Média | Pendente | 1 |

---

## 5. Etapa 1 · Correções que não dependem de decisão

Uma branch (sugestão: `fix/conformidade-mgr-etapa-1`, saindo da última branch da seção 1) e **um PR quando o usuário pedir**.

### 1 e 27 · Faixas de nível

- **Deve:** seguir a Figura 5 (p. 18) e o exemplo do item 3.3 (p. 17): 1–2 Irrelevante; 3–4 Baixo; 5–9 Médio; 10–16 Alto; 20–25 Extremo. O exemplo 2 × 5 = 10 é **Alto**.
- **Pode ser feito assim:**
  - Em `lib/logic.js`, `band` passa a `n <= 2 ? 0 : n <= 4 ? 1 : n <= 9 ? 2 : n <= 16 ? 3 : 4`. Trocar o comentário "Faixas assumidas… Conferir com o MGR oficial" pela referência à Figura 5.
  - Criar em `lib/logic.js` `const altoOuExtremo = r => band(nivel(r)) >= 3`, exportar e usar no lugar de todo `nivel(r) >= 12` em `app/mira-ui.js` (7 pontos hoje: `renderOp`, `renderAlta`, `viewRiscos`, `reportMd`, `viewRel` e `porUnid`; procure por `>= 12`). Trocar também textos fixos como "nível 12 ou mais".
  - A legenda da matriz (`app/mira-ui.js`, perto de `['1–2', '3–5', '6–10', '12–16', '20–25']`) passa a ser gerada a partir de `band` (o intervalo de cada faixa calculado sobre os produtos possíveis 1 a 25).
  - Atualizar `docs/sistema.md` (tabela de faixas) e `README.md`.
- **Conferir:** teste em `tests/mgr.test.js` (arquivo novo, ver seção 8) com as 25 células P × I contra a Figura 5, mais o caso 2 × 5. Roteiro de navegador: cenário do nível 4 × 5 continua "Extremo · 20"; conferir a cor de uma célula 10.
- **Atenção:** riscos já gravados não mudam de nota, só de faixa. Os textos que citam "Médio · 10" no roteiro `e2e.mjs` (cenário T19) precisam mudar para "Alto · 10".

### 12 · Risco residual obrigatório

- **Deve:** não inventar redução. Sem residual preenchido, não há redução nem retorno.
- **Já existe (branch 3):** o PRR novo começa com o residual igual ao risco de hoje (`tabPrr` e `savePrr`), com atalhos e a conta explicada (`resConta`).
- **Falta:**
  - Em `lib/logic.js`, `emptyPrr` passa a `probRes: ''` e `impRes: ''`.
  - Em `lib/service.js`, `cleanPrr` deixa vazio quando não vier (hoje usa `|| 1`).
  - `prrErrors` passa a exigir os dois: "Informe a probabilidade e o impacto residuais.".
  - `econ` devolve `res`, `gain` e `ratio` como `null` quando o residual está vazio, e as telas (resumo do PRR, painéis, TCE, relatório e exportação) mostram "pendente".
  - Os atalhos e a opção "Igual a hoje" continuam como forma rápida de preencher.
  - PRRs antigos com 1 × 1 gravado: não mudar dados; a regra vale para o próximo envio.
- **Conferir:** teste da API (PRR sem residual não é enviado; `econ` sem residual dá `gain === null`) e o exemplo da análise (5 × 5, R$ 1 mi, custo R$ 50 mil, sem residual: nenhum "R$ 840 mil" nem "16,8×" na tela).

### 21 · Escala na reavaliação e cores

- **Deve:** a reavaliação mostra o nome da escala junto do número; as cores seguem a legenda da Figura 5.
- **Pode ser feito assim:**
  - Em `tabMon`, a função `sel` interna passa a montar as opções como `n · Nome` (igual à avaliação), e a tabela do histórico de níveis mostra `lvc`.
  - Em `app/globals.css`, ajustar os tokens `--l0` (Irrelevante, azul claro) e `--l4` (Extremo, vermelho forte), com `--f0` e `--f4` legíveis, nos três blocos (claro, escuro automático e escuro forçado). Conferir o contraste do texto sobre a cor.
- **Conferir:** capturas da matriz e da reavaliação em claro e escuro, no computador e a 390 px.

### 22 · IA com as definições do edital

- **Pode ser feito assim:** em `lib/api.js` (função `ai`), o prompt passa a incluir a descrição de cada nota (`L.PROB[i][1]` e `L.IMPS[i][1]`), não só o nome. Depois do item 2, essas descrições serão as do edital.
- **Conferir:** teste que monta o prompt sem chamar a API (separar a montagem numa função `promptIA`, exportada para teste).

### 23 · Bloqueio de login

- **Deve:** errar a senha 5 vezes bloqueia por 5 minutos, sem dar para escapar trocando o cabeçalho.
- **Pode ser feito assim:**
  - Em `lib/api.js`, só confiar em `X-Forwarded-For` quando `MIRA_TRUST_PROXY=1`. Sem proxy, o endereço é fixo (`local`), porque o servidor só escuta em 127.0.0.1.
  - Em `lib/service.js` (`login`), além da chave usuário + IP, manter um contador só por usuário com limite maior (por exemplo 10 em 15 minutos).
  - Documentar a variável no `.env.example` e em `docs/sistema.md`.
- **Conferir:** teste da API: 6 tentativas com `X-Forwarded-For` diferente em cada uma terminam bloqueadas.

### 24 · CSV sem fórmulas

- **Pode ser feito assim:** em `app/mira-ui.js`, `csvq` prefixa com `'` o texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno. Números de verdade (colunas `num`, `brl`, `x`, `dec`) não passam por isso, para continuar abrindo como número. O `.xlsx` não muda.
- **Conferir:** teste (smoke ou unitário) com o título `=1+1` e com o valor `-5` numa coluna numérica.

### 25 · Cookie seguro

- **Já existe (#30):** não há mais primeiro acesso pelo navegador.
- **Falta:** em `lib/api.js` (`cookie`), acrescentar `; Secure` quando `MIRA_HTTPS=1`, e documentar a variável.
- **Conferir:** teste do cabeçalho `set-cookie` com e sem a variável.

### 19a · Aviso quando o nível muda

- **Pode ser feito assim:** em `lib/service.js`, caso `reaval`, trocar `if (L.nivel(r) > old)` por `if (L.nivel(r) !== old)`, com a mensagem "subiu" ou "baixou".
- **Conferir:** teste da API nos dois sentidos.

### 16a · Colunas que faltam na exportação

- **Pode ser feito assim:** em `app/mira-ui.js`, `EXPORT` ganha as colunas Controles existentes, Parâmetro crítico, Parâmetro alerta, Parâmetro ideal, Unidade da métrica e Data de identificação (`criadoEm`). Como CSV e Excel usam a mesma lista, os dois mudam juntos.
- **Conferir:** cenário T26/T34 do roteiro abre o arquivo e procura os cabeçalhos novos.

---

## 6. Etapa 2 · Decisões da CSGR antes de codificar

Levar esta tabela à CSGR. O sistema aplica o que for decidido; não inventar regra.

| Decisão | Item | Opções | Recomendação |
|---|---|---|---|
| Nome do perfil | Passo 0 | "CSGR" ou "Alta Gestão de Riscos" | "CSGR", com o nome por extenso oficial |
| Texto das notas de probabilidade e impacto | 2 | Texto do edital como está, ou adaptado | Texto dos Quadros 2 (p. 15) e 3 (p. 16–17), validado pela CSGR |
| Nível usado nas faixas | 4 | Inerente, residual ou os dois | Mostrar os dois; faixas e painéis pelo inerente |
| Papel do gestor | 5 | Aprova a avaliação? Designa os cadastradores? | Sim aos dois (p. 8 e p. 10) |
| Apetite a risco e alçada | 7 | Valores por unidade | A CSGR define os valores |
| Premissas financeiras | 13 | Percentuais fixos, configuráveis ou retirados | Configuráveis e aprovados pela CSGR, com data e responsável; justificativa ao TCE como minuta até a aprovação |
| Papel do CGGE | 8 | Só recebe avisos, ou também aprova iniciativas | Começar com avisos e "dar conhecimento" |
| Priorização da fila | 18 | Método da CSGR | Nível, depois prazo vencido, depois situação |
| Parecer na aprovação | 20 | Obrigatório ou não | Obrigatório (p. 21) |
| IA externa | 26 | Permitir, permitir com aviso ou proibir | Decisão da Coordenadoria de Segurança da Informação; até lá, desligada por padrão |

---

## 7. Etapa 3 · Funções novas (depois das decisões)

Um ou dois PRs, conforme o tamanho, quando o usuário pedir. Cada item lista o que muda; os nomes são sugestões.

### 2 · Descrições do edital
`lib/logic.js`: `PROB` e `IMPS` com o texto aprovado. Sem frequências inventadas. Rever o prompt da IA (item 22) e os testes que leem as descrições.

### 3 · Horizonte da avaliação
- Campo obrigatório "Horizonte da avaliação" (texto curto, ex.: "últimos 12 meses") em `tabAval`.
- Gravado em `updateAval` (`lib/service.js`, validação e auditoria; rótulo em `FL` de `lib/logic.js`).
- Mostrado na frase da probabilidade e incluído em `EXPORT`.

### 4 · Controles existentes na avaliação
- Mover "Controles existentes" do PRR para a fase 3, antes das notas, salvo em `updateAval`.
- Riscos antigos: ler `r.controles || r.prr.controles`.
- Se a CSGR quiser os dois níveis, guardar também as notas depois dos controles.

### 5 · Gestor (o que falta)
- **Já existe (branch 4):** gestor edita o contexto, cadastra risco, elabora o PRR (`canEdit`) e monitora (`canMon`).
- **Falta:**
  - Aprovação da avaliação: nova situação `ag_gestor_aval` entre `avaliado` e o PRR, ou a ação `gestor-ok-avaliacao`. Ajustar `STAT`, `curPhase`, `ETAPAS` do Quadro, `pendingFor`, `resolvido` e o roteiro.
  - Designação dos cadastradores pelo gestor (dentro do limite de 2, com auditoria): hoje só o administrador cadastra pessoas e cada cadastro exige relatório de pedido. **Conflito com uma regra fixa (seção 2):** definir com o usuário se o gestor "designa" uma pessoa já cadastrada pelo administrador (o mais simples, sem quebrar a regra) ou se passa a cadastrar.
- **Atenção:** com o gestor elaborando o PRR, ele valida o próprio plano. Se a CSGR não aceitar isso, bloquear `gestor-ok` quando o PRR foi enviado pelo próprio gestor.

### 7 · Apetite a risco e alçada
- Tabela nova `config` em `lib/db.js` (chave, valor JSON, quem alterou, quando), com toda alteração na auditoria.
- Tela da CSGR para definir, por unidade, o nível aceitável e os limites de alçada (R$ e nível).
- Regras em `lib/service.js`:
  - "Aceitar" só dentro do apetite (`prrErrors` ou `send-prr`);
  - PRR acima da alçada do gestor vai direto à CSGR (`send-prr` muda o destino).
- Testes das duas regras.

### 8 · CGGE
- Incluir `'cgge'` nas listas `para` de `alertAdd` para nível alto ou extremo e evento ocorrido. `visible` em `lib/logic.js` já deixa o CGGE ver avisos de todas as unidades.
- Ação "Dar conhecimento ao CGGE" para a CSGR, com data registrada no risco e na auditoria.

### 9b · Prorrogar prazo
- **Já existe (branch 4):** reabrir o PRR para revisão (`revisar-prr`).
- **Falta:** ação `prorrogar-prazo` em `riskAction`: nova data maior que a atual e motivo obrigatório, sem reabrir o PRR; guardar o histórico de prazos no PRR e registrar na auditoria.

### 10 · Responsável da ação
- **Já existe:** "quem resolve" vinculado a usuário pela delegação do Quadro (#31) e "ação concluída" com data (branch 4).
- **Falta:**
  - Vincular o "Responsável pela ação" do PRR a um usuário (opcional; texto livre continua valendo para pessoas de fora do sistema). Com vínculo, o aviso de prazo chega a essa pessoa.
  - Registro de execução com data e descrição (ampliar `concluir-acao` com o campo "o que foi feito").

### 11 · Comunicação
- Avisar o gestor quando um risco é criado (`createRisk`) e quando a avaliação muda (`updateAval`), com `alertAdd`.
- Preparar o envio por e-mail atrás de uma interface (hoje simulado). O serviço de e-mail é decisão de infraestrutura e não deve entrar como dependência sem aprovação.

### 13 · Premissas financeiras
- Percentuais de probabilidade em `config` (item 7), aprovados pela CSGR, com data e responsável.
- `PPCT` em `lib/logic.js` passa a vir da configuração (o servidor envia em `getState`).
- Enquanto não houver aprovação: a justificativa ao TCE (`tceMd`) sai com "MINUTA · premissas não aprovadas" e toda tela com valores em reais mostra a situação da premissa.

### 14 · Relatório com os PRRs
- **Já existe (branch 3):** relatório por período com contagens tiradas das decisões guardadas em cada risco (`fatosPer`), não da trilha limitada a 500 registros.
- **Falta:**
  - Em `reportMd`, uma seção com cada PRR: risco, ação, responsável, prazo, métrica, parâmetros e situação.
  - As datas de evento e encerramento de riscos antigos ainda vêm da trilha (`quando` em `fatosPer`). Para relatórios longos, calcular no servidor sem o limite de 500 (rota nova, por exemplo `GET relatorio?ini=&fim=`).

### 15 · Critérios do tratamento
Campos "Restrições ou imposições legais" e "Recursos necessários (humanos e tecnológicos)" em `PRR_KEYS`, `FL`, `cleanPrr`, `tabPrr` (formulário e leitura) e `EXPORT`.

### 16b · Setorial e categorização
- Coluna "Setorial" e renomear "Coordenadoria" para "Categorização" na exportação (Apêndice C), mantendo a unidade como dado.
- Confirmar com o usuário o que é "Setorial" no modelo de coordenadorias criáveis.

### 17 · Roadmap do Apêndice A
- No contexto (`ctxEscopo`/`ctxMarco` em `lib/service.js`, `ctxCards` em `app/mira-ui.js`):
  - número do processo SEI da designação;
  - data da apresentação do MGR à equipe;
  - checklist das 8 ações do Apêndice A, com a situação de cada uma e auditoria.
- Reaproveitar a validação de número SEI (`SEI_NUMERO`) e, se quiserem PDF, a de PDF (`validPedido`).

### 18 · Priorização
Uma função `prioridade(r)` em `lib/logic.js`, usada por todas as filas e listas, com o método aprovado.

### 19b · Descartar risco
Ação `descartar` em `riskAction`, em `rascunho` e `avaliado`, com motivo obrigatório. Nova situação `descartado` (em `STAT`, `ETAPAS`, painéis e relatórios), sem apagar o risco.

### 20 · Parecer obrigatório
No caso de aprovação da CSGR em `riskAction`, chamar `needMotivo()`. Na tela, o campo `ap-motivo` passa a ser "Parecer (obrigatório)".

### 26 · IA externa
- Variável `MIRA_IA=0|1`, desligada por padrão.
- Aviso na tela do assistente: "o texto sai do servidor e vai para um serviço externo".
- Registro na auditoria de cada uso.

---

## 8. Como conferir cada entrega

- **Testes automáticos:** criar `tests/mgr.test.js` com as regras do edital, cada teste citando a página: faixas e matriz, residual obrigatório, permissões do gestor, parecer, apetite, relatório com os PRRs. Incluir no `npm test`.
- **Antes de cada commit:** `npm run test:api` e `node --no-warnings tests/ui.smoke.mjs` passando, e o Prettier sem diferenças.
- **Roteiro de navegador** na cópia da porta 3200 (seção 1), com os cenários afetados atualizados (o T19 muda com as faixas novas).
- **Documentação:** `docs/sistema.md`, `README.md` e `docs/testes.md` (nova rodada).
- **Tela:** conferir no computador e a 390 px, nos temas claro e escuro, sem rolagem lateral.
- **No PR:** afirmar só o que foi verificado e dizer o que não foi testado.

---

## 9. Ordem resumida

1. **Passo 0:** decidir o nome do perfil, mesclar as branches abertas na ordem, definir produção.
2. **Etapa 1:** itens 1, 27, 12, 21, 22, 23, 24, 25, 19a e 16a, num PR.
3. **Etapa 2:** reunião com a CSGR com a tabela da seção 6.
4. **Etapa 3:** itens 2, 3, 4, 5, 7, 8, 9b, 10, 11, 13, 14, 15, 16b, 17, 18, 19b, 20 e 26, em um ou dois PRs.

## 10. Observações da análise que continuam valendo

- O próprio edital repete ER.4 e ER.9 em duas células da Figura 6 (p. 19). Conferir antes de usar esse exemplo como referência.
- Os itens 5 e 6 podem ter sido escolhas de projeto (`docs/sistema.md` descrevia o fluxo antigo). O usuário já pediu que o gestor possa agir (branch 4); o restante do item 5 depende da CSGR.
