# Plano de ação · conformidade do MIRA com o MGR

Plano para levar o MIRA ao Modelo de Gestão de Riscos (MGR) da SETIC, edital v1.0 de 01/10/2025. Parte da análise "MIRA · Alterações sugeridas pelo Modelo de Gestão de Riscos" (30/10/2026), feita sobre `origin/desenvolvimento` no commit `37c5b34`. Este arquivo foi escrito para quem continuar o trabalho num chat novo, sem o histórico da conversa: cada item diz **o que deve ser feito**, **como pode ser feito** no código atual, **o que já existe**, **o que depende de decisão** e **como conferir**.

Revisto em 30/10/2026 com o próprio MGR (PDF de 2025) e com o edital do Hackathon SETIC (Desafio 3). **A seção 3 separa o que os documentos obrigam do que é melhoria**; comece por ela.

"p." é a página impressa do MGR. Os caminhos são relativos à raiz do repositório e valem para a branch `desenvolvimento-resolvendo-problemas`, que saiu de `docs/plano-conformidade-mgr` e já contém as branches 1 a 5 da seção 1. Números de linha mudam: procure pelo nome da função.

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

## 3. O que é obrigatório (texto expresso, sem interpretação)

Fontes: o MGR v1.0 (PDF "Modelo de Gestão de Riscos", 2025) e o edital do Hackathon SETIC, Desafio 3 (p. 6–7), que diz: "campos, escalas, níveis, categorias e tratamento seguem o MGR". Esta seção lista só o que um dos dois documentos diz de forma expressa. O que depende de leitura ou de escolha ficou fora daqui e está na seção 7 ou nas melhorias.

"MGR p." é a página impressa do MGR; "Hack. p." é a página do edital do hackathon.

| # | Regra (o que o documento diz) | Fonte | Situação no código | O que fazer |
|---|---|---|---|---|
| O1 | O perfil que aprova os PRRs e faz o relatório anual é a **CSGR**. "Alta gestão" é quem o CGGE subsidia, e não a CSGR. | MGR p. 4, 7 (Quadro 1), 20–23; Hack. p. 6–7 | Errado na branch 3: o perfil aparece como "Alta Gestão de Riscos" (`PAPEL.altagestao`, `STAT.ag_altagestao` "Aguardando Alta Gestão"). | Voltar a exibir "CSGR" em toda a tela, nos avisos, no relatório e na documentação. O código interno fica para o Passo 0 (seção 4). |
| O2 | Faixas da Figura 5: **1–2 Irrelevante, 3–4 Baixo, 5–9 Médio, 10–16 Alto, 20–25 Extremo**. O exemplo 2 × 5 = 10 é Alto. | MGR p. 17–18 | Errado: `band` usa 3–5 / 6–10 / 12–16. | Item 1 e 27 (Etapa 1). |
| O3 | Cores da legenda: Extremo **vermelho**, Alto **laranja**, Médio **amarelo**, Baixo **verde**, Irrelevante **azul claro**. | MGR p. 18 | Parcial: `--l0` é cinza-azulado (`#DDE3EA`). | Item 21 (Etapa 1): `--l0` azul claro e `--l4` vermelho nos três blocos de `globals.css`. |
| O4 | Descrição de cada nota de **probabilidade** é a do Quadro 2, literal (ver abaixo). | MGR p. 15; Hack. p. 7 ("com a descrição de cada nota") | Errado: `PROB` tem frequências inventadas ("menos de 1 vez a cada 5 anos"). | Trocar o texto de `PROB` pelo Quadro 2. Sai da Etapa 2: não depende mais de decisão. |
| O5 | Descrição de cada nota de **impacto** é a do Quadro 3, literal (ver abaixo). | MGR p. 16–17 | Errado: `IMPS` tem textos próprios. | Trocar o texto de `IMPS` pelo Quadro 3. |
| O6 | Formas de tratamento: evitar, transferir, mitigar, aceitar, **com o sentido do MGR** (ver abaixo). | MGR p. 20–21; Hack. p. 7 | Parcial: os quatro nomes existem, mas `TRAT` tem textos próprios (ex.: "aceitar" sem a condição de custo ou nível reduzido). | Trocar o texto de `TRAT`. |
| O7 | A probabilidade é dada "na **linha do tempo definida**" (ex.: "considerando os últimos 12 meses"). | MGR p. 14–15 | Falta. | Item 3: campo obrigatório "Linha do tempo" na avaliação, mostrado na pergunta da probabilidade e na exportação. |
| O8 | O nível de criticidade "deve **considerar as ações de controle já existentes**". O nível que vai para a matriz e o mapa é esse. | MGR p. 14 | Falta: "Controles existentes" só aparece no PRR, depois da nota. | Item 4: "Controles existentes" passa para a avaliação, **antes** das notas. Isso responde a dúvida "inerente ou residual": as faixas e o mapa usam o nível avaliado com os controles existentes. |
| O9 | Categorização do risco pelas setoriais: **CAGD, Coge, Code, Cosegi, Caf e Coinfra** (decisão já tomada pela CSGR). | MGR p. 27 (Apêndice B); Hack. p. 7 | Falta: não existe campo de categorização; a coordenadoria é criada livre pelo administrador. | Todo risco tem uma das 6 categorias. Como ligar isso às coordenadorias criáveis é pergunta ao usuário (seção 7). |
| O10 | A planilha de identificação e avaliação tem: Setorial, Data, ID, **Categorização**, Causa, Risco (evento), Impacto, Probabilidade, Impacto (nota), Nível de risco. | MGR p. 28 (Apêndice C) | Parcial. | Item 16: a exportação ganha essas colunas, com esses nomes. |
| O11 | O PRR tem: Setorial, Data, ID, Categorização, Risco (evento), **Controles existentes**, Ação proposta, Métrica, Responsável, Parâmetros **Crítico, Alerta e Ideal**. | MGR p. 29 (Apêndice D); Hack. p. 7 | Parcial: os campos existem, mas a exportação não traz todos. | Item 16a e 16b. |
| O12 | A CSGR "emitirá **parecer** favorável ou não, apresentando as correções necessárias ou sugerindo melhorias". | MGR p. 21 | Parcial: o motivo é opcional na aprovação. | Item 20: parecer obrigatório na aprovação e na devolução. Sai da Etapa 2. |
| O13 | Os PRRs são reunidos num **relatório anual** feito pela CSGR. | MGR p. 23; Hack. p. 6–7 | Parcial: o relatório não lista os PRRs. | Item 14: seção com cada PRR. |
| O14 | Contexto tem como entregáveis: escopo, designação dos responsáveis, roadmap (cronograma) e **apresentação do MGR à equipe**, com a linha do tempo. | MGR p. 10–11; Hack. p. 7 ("escopo, responsáveis designados e cronograma") | Parcial: escopo e marcos existem; a designação existe pelo cadastro com SEI; a apresentação do MGR à equipe não é registrada. | Item 17: registrar a data da apresentação do MGR à equipe. O checklist das 8 ações do Apêndice A **não** é obrigatório (o MGR o chama de "exemplo", p. 11). |
| O15 | Os riscos podem ser reavaliados em 5 situações: novos riscos, **mudança no nível**, ocorrência do evento, mudança no PRR, mudança no processo. | MGR p. 22 | Parcial: o aviso só sai quando o nível sobe. | Item 19a: aviso quando o nível muda, para cima ou para baixo. |
| O16 | Comunicação em todas as fases, com aviso a cada passo: **designação**, aprovação, devolução, métrica no alerta, prazo vencendo. | MGR p. 22; Hack. p. 7 | Parcial: existem os avisos de aprovação, devolução, evento, revisão, medição e prazo; **falta o de designação**. | Item 11: aviso ao gestor e à pessoa quando alguém é designado na coordenadoria. |
| O17 | A IA "pode ler os dados, mas eles **não podem ser usados para treinar o modelo**". | Hack. p. 6–7 | Sem registro: o sistema não diz isso nem garante. | Item 26: escrever a regra no código e na tela do assistente, e só ligar a IA com um provedor que garanta isso por contrato. |
| O18 | O CGGE **consulta**. | Hack. p. 7; MGR p. 7 | Feito: `cgge: 'CGGE · consulta'`, só leitura. | Nada. A dúvida "o CGGE aprova iniciativas?" sai da Etapa 2: a resposta é não. |
| O19 | O gestor (titular da coordenadoria) **aprova**, elabora o PRR, define o escopo e acompanha o monitoramento. | MGR p. 8, 10, 20, 22; Hack. p. 7 | Feito: `gestor-ok`, `canEdit`, `ctxEdit` e `canMon` aceitam o gestor (branch 4). | Nada obrigatório. |
| O20 | Duas pessoas indicadas por unidade cadastram e editam os riscos da unidade. | Hack. p. 6–7 | Feito: limite de 2 cadastradores ativos por coordenadoria (`lib/service.js`). | Nada. |
| O21 | Histórico de cada alteração: quem, quando e o quê. | Hack. p. 7 | Feito: trilha de auditoria. | Nada. |

### Textos literais do MGR

Usar estes textos sem mudar palavras. No MGR, o cabeçalho dos Quadros 2 e 3 está escrito como "Papel / Responsável / Responsabilidades" por engano de diagramação: na tela, use "Nota / Nome / Descrição".

**Quadro 2 · Probabilidade (MGR p. 15)**

| Nota | Nome | Descrição |
|---|---|---|
| 5 | Praticamente certo | Evento repetitivo e constante, se reproduz muitas vezes, seguidamente, de maneira assídua, numerosa e não raro de modo acelerado. |
| 4 | Muito provável | Evento usual, corriqueiro. Devido à sua ocorrência habitual, seu histórico é amplamente conhecido por parte dos gestores e operadores do processo. |
| 3 | Provável | Evento esperado, de frequência reduzida, e com histórico de ocorrência parcialmente conhecido pelos gestores e operadores do processo. |
| 2 | Pouco provável | Evento inesperado, casual. Muito embora raro, há histórico de ocorrência parcialmente conhecido por parte dos gestores e operadores do processo. |
| 1 | Raro | Evento extraordinário para os padrões conhecidos da gestão e operação do processo. Não há histórico disponível para sua ocorrência. |

**Quadro 3 · Impacto (MGR p. 16–17)**

| Nota | Nome | Descrição |
|---|---|---|
| 5 | Muito alto | Impacto máximo e de extrema relevância nos objetivos, de forma geralmente irreversível. Impede o alcance dos objetivos. |
| 4 | Alto | Impacto de alta relevância nos objetivos, com possibilidade remota de recuperação ou de difícil reversão. Torna improvável o alcance dos objetivos. |
| 3 | Médio | Impacto relevante nos objetivos, porém recuperável. Torna incerto o alcance dos objetivos. |
| 2 | Baixo | Impacto pouco relevante nos objetivos, há degradação na operação do processo, mas provavelmente os objetivos serão alcançados. |
| 1 | Muito baixo | Impacto muito baixo nos objetivos, insignificante, em que há certa degradação na operação do processo, mas mesmo assim os objetivos serão alcançados. |

**Formas de tratamento (MGR p. 20–21)**

- **Evitar:** promover ações para eliminar o risco.
- **Transferir:** promover ações que transfiram a consequência ou impacto de um risco para uma terceira parte, como no caso de uma apólice de seguro para veículos.
- **Mitigar:** promover ações que reduzam a probabilidade ou o impacto a um nível aceitável de criticidade.
- **Aceitar:** não promover ações para tratar o risco, sendo que o custo é inviável ou muito alto em relação ao benefício, ou o nível do risco (probabilidade × impacto) é reduzido, atentando-se às definições do apetite a risco.

**Frases-modelo (MGR p. 13–17)**

- Risco: "Devido a <CAUSA>, poderá ocorrer <EVENTO/RISCO>, levando ao <IMPACTO> afetando o <OBJETIVO INSTITUCIONAL>."
- Probabilidade: "Qual a probabilidade da <CAUSA> desencadear o <EVENTO/RISCO>, na <LINHA DO TEMPO DEFINIDA>?"
- Impacto: "Ocorrendo a <CAUSA> que originou o <EVENTO/RISCO>, qual impacto no alcance do <OBJETIVO>?"
- Nível: "O <EVENTO/RISCO> tem <PROBABILIDADE> e <IMPACTO>. Logo, o nível do risco é igual a <PROBABILIDADE x IMPACTO>."

### O que os documentos **não** obrigam (melhoria, não conformidade)

- **Apetite a risco e alçada (item 7):** o MGR diz que a Setic "poderá regulamentar" (p. 19). Enquanto não houver regulamento, não há regra para aplicar.
- **Percentuais e valores em reais (item 13), risco residual e retorno por real:** não existem no MGR. São acréscimos do MIRA. O item 12 continua na Etapa 1 porque hoje o número mostrado está errado, não por exigência do MGR.
- **Checklist das 8 ações do Apêndice A (item 17):** o MGR o apresenta como exemplo.
- **Aprovação separada da avaliação pelo gestor (item 5):** o Quadro 1 pede que o gestor aprove "a identificação, análise e tratamento", e o `gestor-ok` já aprova os três juntos no envio do PRR. Uma etapa a mais é escolha, não exigência.
- **Ação "dar conhecimento ao CGGE" (item 8):** é competência da CSGR na Portaria 41, mas o CGGE só consulta no sistema.
- **Critérios de tratamento (item 15):** o MGR manda considerar restrições legais e recursos (p. 21), mas o modelo de PRR (Apêndice D) não tem colunas para isso. Campos próprios são melhoria.
- **Priorização (item 18), descartar risco (19b), prorrogar prazo (9b), responsável vinculado a usuário (10):** úteis, mas sem regra expressa que diga como fazer.
- **Itens de segurança 23, 24 e 25:** fora do MGR, mas continuam na Etapa 1 por serem falhas.

---

## 4. Passo 0 · Organizar o que já existe

Antes de código novo.

1. **Nome do perfil (obrigatório, O1).** No MGR, a CSGR aprova os PRRs e faz o relatório; o CGGE subsidia "a alta gestão" (p. 7). A troca para "Alta Gestão de Riscos" (`feature/nome-alta-gestao-de-riscos`, commit `2119b47`) mistura os dois e precisa ser desfeita.
   - **Deve ser feito:** voltar a exibir "CSGR" em toda a tela.
   - **Nome por extenso (respondido): Comissão de Supervisão de Gestão de Riscos.** O MGR usa duas formas. "Comissão de Supervisão **de** Gestão de Riscos" aparece no Quadro 1 (p. 7), nas fases 3.4 a 3.6 (p. 20–23), no Apêndice B, na folha de equipe e no edital do hackathon. "Comissão de Supervisão **e** Gestão de Riscos" aparece no item 2.1 (p. 4), que cita a Portaria 41, e no Apêndice A (p. 25). O usuário escolheu a primeira.
   - **Pode ser feito assim:** como a branch não foi mesclada, fazer um commit novo (sem reescrever o histórico) que restaura os textos de tela. Para o código interno há duas opções:
     - (a) manter `altagestao` no código e trocar só `PAPEL.altagestao` e os textos;
     - (b) voltar para `csgr`, com uma migração `user_version 3` em `lib/db.js` que faz o caminho inverso da versão 2 (pessoas, riscos e avisos) e com `auditNovo` traduzindo também `altagestao` para `csgr`.
   - A opção (a) é menor; a (b) deixa o código igual ao edital. **O usuário escolheu a (b).**
2. **Mesclar na ordem da seção 1.** Se o usuário preferir menos PRs, as branches 3, 4 e 5 podem ir num PR só, depois do #31.
3. **Produção (respondido).** A `main` passa a receber a `homologacao` por PR, só quando o usuário pedir.

---

## 5. Situação de cada item

Legenda: **Feito** (já existe numa branch da seção 1) · **Parcial** · **Pendente**.

A coluna "Obrigatório" aponta a regra da seção 3. "Melhoria" quer dizer que nenhum dos documentos exige.

| # | Item | Obrigatório | Situação | Etapa |
|---|---|---|---|---|
| 1 | Faixas de nível erradas | O2 | Pendente | 1 |
| 2 | Descrições de probabilidade e impacto | O4, O5 | Pendente (texto já definido) | 1 |
| 3 | Linha do tempo da probabilidade | O7 | Pendente | 1 |
| 4 | Controles existentes antes das notas | O8 | Pendente (já definido) | 1 |
| 5 | Gestor sem as etapas do edital | O19 | Feito no que é obrigatório (branch 4) | — |
| 6 | Monitoramento sem o gestor | O19 | Feito (branch 4) | — |
| 7 | Apetite a risco e alçada | Melhoria ("poderá") | Pendente (decisão) | 3 |
| 8 | Papel do CGGE | O18 | Feito (só consulta) | — |
| 9 | PRR travado depois da aprovação | Melhoria | Parcial | 3 |
| 10 | Responsável da ação em texto livre | Melhoria | Parcial | 3 |
| 11 | Comunicação: aviso de designação | O16 | Parcial | 1 |
| 12 | Residual padrão 1 × 1 | Correção (número errado) | Parcial | 1 |
| 13 | Percentuais e reais sem base | Melhoria (fora do MGR) | Pendente (decisão) | 3 |
| 14 | Relatório anual sem os PRRs | O13 | Parcial | 1 |
| 15 | Critérios do tratamento | Melhoria | Pendente | 3 |
| 16 | Exportação com os Apêndices C e D e a categorização | O9, O10, O11 | Parcial | 1 |
| 17 | Apresentação do MGR à equipe | O14 | Parcial | 1 |
| 18 | Priorização só pelo nível | Melhoria | Pendente (decisão) | 3 |
| 19 | Aviso de mudança de nível (19a) e descarte (19b) | O15 (19a); melhoria (19b) | Pendente | 1 e 3 |
| 20 | Parecer da CSGR | O12 | Pendente | 1 |
| 21 | Escala na reavaliação e cores da matriz | O3 | Pendente | 1 |
| 22 | IA sem as definições do edital | O4, O5 | Pendente | 1 |
| 23 | Bloqueio de login burlável | Correção (segurança) | Pendente | 1 |
| 24 | CSV sem proteção contra fórmulas | Correção (segurança) | Pendente | 1 |
| 25 | Primeiro acesso e cookie | Correção (segurança) | Parcial | 1 |
| 26 | IA sem treino com os dados | O17 | Pendente | 1 |
| 27 | Faixas repetidas e testes sem o edital | O2 | Pendente | 1 |
| 28 | Nome do perfil CSGR | O1 | Pendente | Passo 0 |
| 29 | Textos das formas de tratamento | O6 | Pendente | 1 |

---

## 6. Etapa 1 · O que é obrigatório e as correções

Tudo o que a seção 3 marca como obrigatório, mais as correções de número e de segurança. Nada aqui depende da CSGR: o texto já está nos documentos. Trabalho na branch `desenvolvimento-resolvendo-problemas` (nome pedido pelo usuário) e **um PR quando o usuário pedir**.

Ordem sugerida dentro da etapa: 28 (nome CSGR) → 1 e 27 (faixas) → 2, 29 e 22 (textos do MGR) → 3 e 4 (avaliação) → categorização → 16 (exportação) → 20, 14, 17, 11, 19a → 12, 21 → 26 → 23, 24, 25.

### 1 e 27 · Faixas de nível

- **Deve:** seguir a Figura 5 (p. 18) e o exemplo do item 3.3 (p. 17): 1–2 Irrelevante; 3–4 Baixo; 5–9 Médio; 10–16 Alto; 20–25 Extremo. O exemplo 2 × 5 = 10 é **Alto**.
- **Pode ser feito assim:**
  - Em `lib/logic.js`, `band` passa a `n <= 2 ? 0 : n <= 4 ? 1 : n <= 9 ? 2 : n <= 16 ? 3 : 4`. Trocar o comentário "Faixas assumidas… Conferir com o MGR oficial" pela referência à Figura 5.
  - Criar em `lib/logic.js` `const altoOuExtremo = r => band(nivel(r)) >= 3`, exportar e usar no lugar de todo `nivel(r) >= 12` em `app/mira-ui.js` (7 pontos hoje: `renderOp`, `renderAlta`, `viewRiscos`, `reportMd`, `viewRel` e `porUnid`; procure por `>= 12`). Trocar também textos fixos como "nível 12 ou mais".
  - A legenda da matriz (`app/mira-ui.js`, perto de `['1–2', '3–5', '6–10', '12–16', '20–25']`) passa a ser gerada a partir de `band` (o intervalo de cada faixa calculado sobre os produtos possíveis 1 a 25).
  - Atualizar `docs/sistema.md` (tabela de faixas) e `README.md`.
- **Conferir:** teste em `tests/mgr.test.js` (arquivo novo, ver seção 9) com as 25 células P × I contra a Figura 5, mais o caso 2 × 5. Roteiro de navegador: cenário do nível 4 × 5 continua "Extremo · 20"; conferir a cor de uma célula 10.
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

### 2, 29 e 22 · Textos do MGR (O4, O5, O6)

- **Deve:** as notas e as formas de tratamento usam os textos literais da seção 3.
- **Pode ser feito assim:** em `lib/logic.js`, trocar a segunda posição de cada linha de `PROB` e `IMPS` pelo Quadro 2 e pelo Quadro 3, e os valores de `TRAT` pelos textos do MGR. Os nomes das notas já batem com o MGR. A IA (item 22) passa a levar essas descrições no prompt.
- **Conferir:** teste que compara `PROB`, `IMPS` e `TRAT` com os textos da seção 3; procurar na tela por "vez a cada" e "por ano" (não pode sobrar nenhum).

### 3 · Linha do tempo da probabilidade (O7)

- **Pode ser feito assim:** campo obrigatório "Linha do tempo" (texto curto, ex.: "últimos 12 meses") em `tabAval`, gravado em `updateAval` (validação, auditoria e rótulo em `FL`), mostrado na pergunta do MGR ("Qual a probabilidade de … na <linha do tempo>?") e incluído em `EXPORT`. Riscos antigos sem o campo aparecem como "não informada" até a próxima avaliação.
- **Conferir:** teste da API (avaliação sem linha do tempo é recusada).

### 4 · Controles existentes antes das notas (O8)

- **Pode ser feito assim:** mover "Controles existentes" do PRR para a avaliação, antes das notas, gravado em `updateAval`. Riscos antigos: ler `r.controles || r.prr.controles`. O PRR e a exportação (Apêndice D) mostram o mesmo campo. As faixas, o mapa e os painéis usam o nível dado com os controles existentes, que é o nível que já existe hoje.
- **Conferir:** teste da API e a tela da avaliação mostrando o campo antes das notas.

### Categorização (O9)

- **Deve:** todo risco tem uma das 6 categorias do MGR: CAGD, Coge, Code, Cosegi, Caf, Coinfra.
- **Como fazer (resposta do usuário, seção 7):** lista `CATEG` em `lib/logic.js` com as 6 setoriais (sigla e nome por extenso), usada como modelo no formulário de criar coordenadoria, sem impedir outros nomes. A categorização do risco é a sigla da coordenadoria, e a exportação traz a coluna "Categorização".

### 16 · Exportação nos Apêndices C e D (O10, O11)

- Além do 16a acima: colunas "Setorial", "Categorização" e "Linha do tempo", e os cabeçalhos com os nomes do MGR ("Risco (evento)", "Ação proposta", "Nível de risco", "Crítico", "Alerta", "Ideal").

### 20 · Parecer da CSGR (O12)

- **Pode ser feito assim:** no caso de aprovação da CSGR em `riskAction`, chamar `needMotivo()`, como já acontece na devolução. Na tela, o campo `ap-motivo` passa a ser "Parecer (obrigatório)". O parecer aparece no histórico do risco e no relatório.
- **Conferir:** teste da API (aprovação sem parecer é recusada).

### 14 · Relatório anual com os PRRs (O13)

- **Já existe (branch 3):** relatório por período com contagens das decisões guardadas em cada risco (`fatosPer`).
- **Falta:** em `reportMd`, uma seção com cada PRR (risco, categorização, controles existentes, ação, responsável, prazo, métrica, parâmetros, parecer e situação).

### 17 · Apresentação do MGR à equipe (O14)

- **Pode ser feito assim:** no contexto (`ctxEscopo`/`ctxMarco` em `lib/service.js`, `ctxCards` em `app/mira-ui.js`), registrar a data da apresentação do MGR à equipe, com auditoria. O cronograma já existe nos marcos.

### 11 · Aviso de designação (O16)

- **Pode ser feito assim:** quando o administrador cadastra ou reativa um cadastrador ou gestor numa coordenadoria, `alertAdd('designacao', …)` para o gestor da coordenadoria e para a própria pessoa.
- **Conferir:** teste da API (cadastrar pessoa gera o aviso).

### 26 · IA sem treino com os dados (O17)

- **Deve:** os dados lidos pela IA não podem ser usados para treinar o modelo.
- **Pode ser feito assim:** escrever a regra em `lib/api.js`, onde a chamada é feita; mostrar na tela do assistente que o texto vai para um serviço externo que não usa os dados para treino; variável `MIRA_IA=0|1` para desligar; registrar cada uso na auditoria. A garantia de não treino tem de vir do contrato do provedor e deve ser citada em `docs/sistema.md`.

---

## 7. Perguntas e decisões

### Respondidas pelo usuário (30/10/2026)

| Pergunta | Item | Resposta |
|---|---|---|
| Nome por extenso da CSGR | O1 | **Comissão de Supervisão de Gestão de Riscos** (forma do Quadro 1, p. 7). |
| Código interno do perfil | O1 | **Voltar para `csgr`** (opção b do Passo 0): migração `user_version 3` em `lib/db.js` que desfaz a versão 2 (`altagestao` → `csgr` no papel das pessoas, nas aprovações do PRR e nos destinatários dos avisos; situação `ag_altagestao` → `ag_csgr`). As ações `altagestao-ok`/`-dev` voltam a `csgr-ok`/`-dev` no código, e `auditNovo` traduz os nomes antigos na leitura. A trilha de auditoria não é alterada. |
| Categorização × coordenadorias criáveis | O9 | **As 6 setoriais do MGR viram modelos prontos**, mas o administrador continua podendo criar outras. Na tela de criar coordenadoria, oferecer CAGD, Coge, Code, Cosegi, Caf e Coinfra (sigla e nome por extenso) para preencher com um clique; o campo continua livre. A categorização do risco é a coordenadoria dele. Os modelos são opções do formulário, não registros gravados: o sistema continua começando vazio. |
| Produção | Passo 0 | A `main` recebe a `homologacao` por PR, **só quando o usuário pedir**. |

### Para a CSGR (melhorias; o sistema não inventa regra)

| Decisão | Item | Recomendação |
|---|---|---|
| Apetite a risco e alçada | 7 | Só depois que a Setic regulamentar (MGR p. 19, "poderá"). |
| Premissas financeiras (percentuais e reais) | 13 | Configuráveis e aprovadas pela CSGR; justificativa ao TCE como minuta até a aprovação. |
| Priorização da fila | 18 | Nível, depois prazo vencido, depois situação. |

### Decisões que os documentos já resolveram (não perguntar de novo)

- Nome do perfil: CSGR (O1). Texto das notas: Quadros 2 e 3 (O4, O5). Nível usado nas faixas: o avaliado com os controles existentes (O8). Papel do CGGE: consulta (O18). Parecer na aprovação: obrigatório (O12). IA externa: permitida, sem treino com os dados (O17).

---

## 8. Etapa 3 · Melhorias (nenhum documento exige)

Um ou dois PRs, conforme o tamanho, quando o usuário pedir. Os itens obrigatórios saíram daqui e estão na Etapa 1. Cada item lista o que muda; os nomes são sugestões.

### 5 · Gestor (além do obrigatório)
- **Já existe (branch 4), e cobre o que o MGR exige:** gestor edita o contexto, cadastra risco, elabora o PRR (`canEdit`), aprova a identificação, a avaliação e o PRR juntos (`gestor-ok`) e monitora (`canMon`).
- **Melhorias possíveis:**
  - Aprovação separada da avaliação: nova situação `ag_gestor_aval` entre `avaliado` e o PRR, ou a ação `gestor-ok-avaliacao`. Ajustar `STAT`, `curPhase`, `ETAPAS` do Quadro, `pendingFor`, `resolvido` e o roteiro.
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
- O CGGE só consulta (O18), e isso já existe. Opcional:
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

### 11 · Comunicação (além do aviso de designação)
- Avisar o gestor quando um risco é criado (`createRisk`) e quando a avaliação muda (`updateAval`), com `alertAdd`.
- Preparar o envio por e-mail atrás de uma interface (hoje simulado). O serviço de e-mail é decisão de infraestrutura e não deve entrar como dependência sem aprovação.

### 13 · Premissas financeiras
- Percentuais de probabilidade em `config` (item 7), aprovados pela CSGR, com data e responsável.
- `PPCT` em `lib/logic.js` passa a vir da configuração (o servidor envia em `getState`).
- Enquanto não houver aprovação: a justificativa ao TCE (`tceMd`) sai com "MINUTA · premissas não aprovadas" e toda tela com valores em reais mostra a situação da premissa.

### 15 · Critérios do tratamento
Campos "Restrições ou imposições legais" e "Recursos necessários (humanos e tecnológicos)" em `PRR_KEYS`, `FL`, `cleanPrr`, `tabPrr` (formulário e leitura) e `EXPORT`.

### 17 · Roadmap do Apêndice A (além da apresentação do MGR)
- No contexto (`ctxEscopo`/`ctxMarco` em `lib/service.js`, `ctxCards` em `app/mira-ui.js`):
  - número do processo SEI da designação;
  - checklist das 8 ações do Apêndice A, com a situação de cada uma e auditoria.
- Reaproveitar a validação de número SEI (`SEI_NUMERO`) e, se quiserem PDF, a de PDF (`validPedido`).

### 18 · Priorização
Uma função `prioridade(r)` em `lib/logic.js`, usada por todas as filas e listas, com o método aprovado.

### 19b · Descartar risco
Ação `descartar` em `riskAction`, em `rascunho` e `avaliado`, com motivo obrigatório. Nova situação `descartado` (em `STAT`, `ETAPAS`, painéis e relatórios), sem apagar o risco.

---

## 9. Como conferir cada entrega

- **Testes automáticos:** criar `tests/mgr.test.js` com uma verificação para cada regra O1 a O21 da seção 3, citando a página do MGR ou do edital do hackathon, mais o residual obrigatório. Incluir no `npm test`.
- **Antes de cada commit:** `npm run test:api` e `node --no-warnings tests/ui.smoke.mjs` passando, e o Prettier sem diferenças.
- **Roteiro de navegador** na cópia da porta 3200 (seção 1), com os cenários afetados atualizados (o T19 muda com as faixas novas).
- **Documentação:** `docs/sistema.md`, `README.md` e `docs/testes.md` (nova rodada).
- **Tela:** conferir no computador e a 390 px, nos temas claro e escuro, sem rolagem lateral.
- **No PR:** afirmar só o que foi verificado e dizer o que não foi testado.

---

## 10. Ordem resumida

1. **Passo 0:** perguntas respondidas (seção 7); falta voltar o perfil para `csgr` (item 28).
2. **Etapa 1 (obrigatório e correções):** itens 28, 1, 27, 2, 29, 22, 3, 4, categorização, 16, 20, 14, 17, 11, 19a, 12, 21, 26, 23, 24 e 25, num PR, na branch `desenvolvimento-resolvendo-problemas`.
3. **Etapa 2:** levar à CSGR só as três decisões que sobraram (seção 7).
4. **Etapa 3 (melhorias):** itens 5, 7, 8, 9b, 10, 11, 13, 15, 17, 18 e 19b, em um ou dois PRs.

## 11. Observações da análise que continuam valendo

- O próprio edital repete ER.4 e ER.9 em duas células da Figura 6 (p. 19). Conferir antes de usar esse exemplo como referência.
- O MGR não fala em risco residual, retorno por real nem valores em reais. Esses números são do MIRA e não podem aparecer como se fossem do MGR.
- O MGR lista 8 setoriais na composição da CSGR (p. 5), mas só 6 categorias de risco (p. 27): Assessoria de Conformidade e Gerência de Projetos ficam fora da categorização.
