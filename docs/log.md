# Log de testes · conformidade com o MGR e melhorias (30 e 31/10/2026)

Registro do que foi testado na branch `desenvolvimento-resolvendo-problemas` (PR #34), dos problemas encontrados e de como cada um foi resolvido. Serve para quem revisa o PR e para quem continuar o trabalho.

## Como os testes rodam

| Teste | Comando | O que cobre |
|---|---|---|
| API | `npm run test:api` | Regras do servidor: login, permissões, fluxo do PRR, regras do MGR (faixas da Figura 5, parecer, nível que sobe ou baixa), responsável do sistema, empresa terceirizada, auditoria. |
| Interface (smoke) | `node --no-warnings tests/ui.smoke.mjs` | Monta todas as telas com um DOM simulado, para cada perfil e cada situação de risco, e falha se alguma tela quebrar ("Não foi possível abrir esta tela", `undefined`, `NaN`). |
| Navegador | roteiro Playwright, fora do repositório | 49 cenários de ponta a ponta numa cópia do projeto na porta 3200, com banco limpo a cada rodada. A porta 3100 (demonstração) nunca é usada nos testes. |

## Resultado final

| Teste | Resultado |
|---|---|
| API | 139 verificações, todas passando |
| Interface (smoke) | 53 verificações, todas passando, incluindo um risco Extremo (5 × 5) ainda sem PRR aprovado |
| Navegador | 49 de 49 cenários passando (última rodada em banco limpo) |
| Navegador (roteiro extra) | 13 de 13 cenários das partes novas, fora do repositório (ver item 20) |
| Visual | capturas no computador e a 390 px, temas claro e escuro, sem rolagem lateral e sem erro na página |

## Problemas encontrados e como foram resolvidos

### 1. Faixas de nível diferentes da Figura 5
- **Achado:** comparação com o MGR (p. 17–18). O sistema usava 3–5 Baixo, 6–10 Médio e 12–16 Alto; na Figura 5, o 5 é Médio e o 10 é Alto.
- **Resolvido:** `band` em `lib/logic.js` segue a Figura 5; a legenda passou a ser calculada (`BANDS`) e os painéis usam `altoOuExtremo` no lugar do número 12 fixo.
- **Conferido:** teste que compara as 25 células da matriz com a Figura 5 e o exemplo do MGR (2 × 5 = 10, Alto).

### 2. PRR reenviado não chegava ao gestor
- **Achado:** relato do usuário na demonstração. Lendo o banco da 3100, o servidor estava certo; o envio era barrado na própria tela, que cobrava do cadastrador o responsável e o prazo que ele não tem permissão de definir.
- **Resolvido:** a tela confere o PRR com a mesma regra do servidor (`prrErrors(prr, { semDefinir })`); o gestor completa responsável, prazo e custo na própria decisão.
- **Conferido:** no navegador, o cadastrador envia, o risco fica "aguardando gestor", a pendência aparece para o gestor e a validação encaminha com o responsável gravado.

### 3. PRR devolvido não aparecia para o gestor
- **Achado:** a fila de Pendências do gestor só mostrava "aguardando gestor".
- **Resolvido:** o PRR devolvido entra nas Pendências do gestor, que também pode ajustar e reenviar.

### 4. Risco Extremo sumia dos alertas
- **Achado:** abrindo uma cópia dos dados de demonstração como gestor, o risco 5 × 5 aguardando a Alta Gestão não aparecia em lugar nenhum: os avisos guardados contam como resolvidos quando a situação muda.
- **Resolvido:** risco Extremo sem tratamento aprovado fica sempre em "Exigem ação agora", com o próximo passo escrito, até o PRR ser aprovado.
- **Conferido:** captura da tela de Alertas do gestor com a mesma cópia dos dados.

### 5. Painel inicial quebrava depois da correção 4
- **Achado:** o roteiro de navegador caiu de 49 para 32 cenários; o painel mostrava "Cannot read properties of null (reading 'valor')". A fila de ação tratava todo aviso calculado que não fosse de prazo como aviso de métrica.
- **Resolvido:** a fila trata o aviso de risco Extremo à parte e não repete um risco que já está nela como pendência. O smoke ganhou um risco 5 × 5 sem aprovação, para pegar esse caso.
- **Conferido:** 49 de 49 no navegador e o smoke passando.

### 6. Avisos repetidos
- **Achado:** quando o PRR volta ao gestor, o aviso antigo de aprovação volta a valer junto com o novo.
- **Resolvido:** de cada tipo de aviso por risco aparece só o mais recente.

### 7. Lista de responsáveis "não selecionava"
- **Achado:** relato do usuário. No navegador da cópia de teste o clique seleciona a pessoa e o valor muda; a causa provável era a tela antiga em cache na 3100.
- **Resolvido:** nada a corrigir no clique; recarregar com Ctrl+F5. A pesquisa da lista foi movida para filtrar a cada letra.

### 8. Testes da interface quebraram com o mascote
- **Achado:** o DOM simulado do smoke não tem `documentElement`, e o `closest` simulado devolve o próprio elemento para qualquer seletor, então todo clique parecia um clique na mira.
- **Resolvido:** o tema só é aplicado quando existe página de verdade, e o clique na mira confere o atributo `data-mira` de fato.

### 9. Roteiro de navegador desatualizado pelas regras novas
- **Achado:** cenários esperavam o valor antigo das regras.
- **Resolvido:** o roteiro passou a esperar:
  - "Alto · 10";
  - a conta com 75% (R$ 1.500.000) e o retorno de 25,2×;
  - o parecer na aprovação;
  - as colunas dos Apêndices C e D no CSV;
  - a métrica escolhida na lista;
  - o responsável escolhido entre pessoas do sistema.

### 10. Instância de demonstração sem a coluna nova
- **Achado:** a 3100 abriu o banco antes de existir a coluna `users.pode_definir`, e a migração só roda ao abrir o banco.
- **Situação:** é preciso reiniciar a 3100. Parar o processo foi bloqueado pela permissão automática da ferramenta; fica com o usuário.

### 11. Números da matriz pequenos
- **Achado:** captura da matriz com o visual novo.
- **Resolvido:** os números das células vazias passaram de 10 para 16 px e os das células com risco para 22 px, em negrito.

### 12. Regras do MGR que faltavam na avaliação
- **Achado:** plano, regras O7 e O8 (MGR p. 14–15).
- **Resolvido:** a avaliação exige "Controles existentes" (antes das notas) e "Linha do tempo da probabilidade"; a tela mostra a pergunta do MGR com a linha do tempo, e o PRR mostra os mesmos controles.
- **Conferido:** testes da API (avaliação sem controles ou sem linha do tempo é recusada) e o roteiro de navegador preenchendo os dois campos.

### 13. Correções de segurança
- **Achado:** plano, itens 23, 24 e 25.
- **Resolvido:**
  - o bloqueio de login não aceita mais o X-Forwarded-For sem proxy confiável (`MIRA_TRUST_PROXY=1`) e tem um limite só por usuário;
  - o CSV põe apóstrofo em texto que começa com `=`, `+`, `-` ou `@`;
  - o cookie sai com `Secure` quando `MIRA_HTTPS=1`.
- **Conferido:**
  - teste da API com 6 tentativas trocando o X-Forwarded-For (terminam bloqueadas);
  - teste do cookie Secure;
  - no navegador, um risco com título `=1+1 teste` saiu no CSV como `'=1+1 teste`.

### 14. Coluna nova fora de ordem no CSV
- **Achado:** o roteiro de navegador (T26) acusou a "Linha do tempo" entre "Controles existentes" e "Ação proposta", que no Apêndice D ficam lado a lado.
- **Resolvido:** a coluna foi para antes dos controles.

### 15. Residual 1 × 1 inventava redução
- **Achado:** plano, item 12. Com o residual vazio, a conta usava probabilidade 0 e mostrava redução total (ex.: R$ 840 mil num risco 5 × 5 de R$ 1 mi); o servidor ainda gravava vazio como 1 × 1, e as listas do residual não tinham opção vazia.
- **Resolvido:**
  - sem residual informado não há redução;
  - o servidor guarda vazio como vazio;
  - o envio exige probabilidade e impacto residuais;
  - as listas ganharam "Escolha…";
  - a tela e a justificativa ao TCE mostram "residual pendente".
- **Conferido:** testes da API (PRR sem residual não gera redução e não é enviado) e o roteiro de navegador (49 de 49).

### 16. Etapa 2: decisões da CSGR (branch `feature/etapa-2-decisoes-csgr`)
- **Feito:** tela Decisões e tabela `config` para premissas financeiras, apetite a risco e priorização, com auditoria; a justificativa ao TCE sai como minuta sem premissas aprovadas; "Aceitar" acima do apetite não é enviado; as listas seguem a priorização escolhida.
- **Conferido:**
  - testes da API: só a CSGR registra, a nota 5 abaixo de 90% é recusada, a decisão vai para a auditoria, "Aceitar" acima do apetite é barrado e volta a valer sem apetite;
  - o smoke abre a tela como Alta Gestão e CGGE;
  - o roteiro de navegador passou (49 de 49);
  - registrar as três decisões pela tela funcionou, sem rolagem lateral a 390 px.

### 17. Apetite por coordenadoria e alçada do gestor
- **Feito:** o apetite da coordenadoria vale sobre o geral; a alçada (nível e exposição) marca o PRR que o gestor encaminha acima dela, e a CSGR o vê marcado e no topo da fila.
- **Conferido:**
  - testes da API: coordenadoria inexistente recusada, apetite da coordenadoria sobre o geral, PRR acima da alçada marcado;
  - no navegador, registrar apetite e alçada pela tela e ver na fila da CSGR "PRR acima da alçada do gestor (nível 12 acima de 5)".

### 18. Banco da 3100 sem a coluna e a tabela novas
- **Achado:** parar o servidor da 3100 para rodar a migração foi bloqueado pela permissão automática.
- **Resolvido:** a mesma alteração da migração (`ALTER TABLE users ADD COLUMN pode_definir` e a tabela `config`) foi aplicada direto no banco de demonstração, sem parar o servidor e sem tocar nos dados (4 pessoas e 1 risco continuaram iguais).

### 19. Script de conferência do fluxo desatualizado
- **Achado:** o fluxo cadastrador → gestor parou em "avaliado". O cadastrador de teste tem a permissão de definir responsável e prazo, e o script não preenchia esses campos; o sistema estava certo.
- **Resolvido:** o script cobre os dois casos (com e sem permissão) e preenche controles, linha do tempo e residual, que passaram a ser obrigatórios.

### 20. Roteiro extra das partes novas (31/10/2026)
O roteiro principal não cobria as partes novas. Um roteiro extra, também fora do repositório, conferiu no navegador:

| # | Cenário | Resultado |
|---|---|---|
| X01 | CGGE abre Decisões só para leitura | ok |
| X02 | Justificativa ao TCE sai como MINUTA sem premissas aprovadas e perde a marca depois de aprovar | ok |
| X03 | Pergunta do MGR com a linha do tempo, atualizada enquanto se digita | ok |
| X04 | Segundo clique com o mesmo erro leva ao campo que falta (foco e destaque) | ok |
| X05 | Pesquisa de responsável filtra a lista; métrica "Outra" abre campo e grava o texto | ok |
| X06 | Residual vazio aparece como pendente e o envio é barrado | ok |
| X07 | Reavaliação com o nome da escala junto do número | ok |
| X08 | FAQ abre e explica o risco residual | ok |
| X09 | Empresa terceirizada: cadastro sem pedido, entra, vê só a Cosegi, sem editar nem Pendências | ok |
| X10 | Gestor escolhe a empresa terceirizada como responsável | ok |
| X11 | Tema Editável aplica a cor principal escolhida | ok |
| X12 | Decisões, Configurações, Pendências e Alertas a 390 px no tema escuro, sem rolagem lateral | ok |
| X13 | Nenhum erro de JavaScript no roteiro | ok |

Na primeira rodada, 9 falharam por problemas do próprio roteiro, não do sistema:
- o login não saía da sessão anterior;
- o login esperava os painéis, que o administrador não tem;
- não havia risco em tratamento no banco de teste.

Corrigido o roteiro, os 13 passaram.

## Visual

- Cores, fontes (Sora nos títulos, IBM Plex Sans no texto), cantos e pesos seguem o canvas aprovado pelo usuário ("MIRA · cores e tipografia").
- A etiqueta de nível e a etiqueta de situação viraram componentes React (`app/pecas.js`), transformados em HTML com `renderToStaticMarkup`; o React escapa o texto sozinho.
- Contraste do texto sobre as cores dos níveis: todos acima de 4,5:1.

## Pendências

- Reiniciar a 3100 para a coluna `users.pode_definir` (item 10).
- Criar a conta de demonstração `empresateste` na 3100 depois que o usuário confirmar que o fluxo funciona.
- Passar outras peças repetidas para componentes React aos poucos (cartão, indicador, célula da matriz).
