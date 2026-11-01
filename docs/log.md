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
| API | 121 verificações, todas passando |
| Interface (smoke) | todas passando, incluindo um risco Extremo (5 × 5) ainda sem PRR aprovado |
| Navegador | 49 de 49 cenários passando (última rodada em banco limpo) |
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

## Visual

- Cores, fontes (Sora nos títulos, IBM Plex Sans no texto), cantos e pesos seguem o canvas aprovado pelo usuário ("MIRA · cores e tipografia").
- A etiqueta de nível e a etiqueta de situação viraram componentes React (`app/pecas.js`), transformados em HTML com `renderToStaticMarkup`; o React escapa o texto sozinho.
- Contraste do texto sobre as cores dos níveis: todos acima de 4,5:1.

## Pendências

- Reiniciar a 3100 para a coluna `users.pode_definir` (item 10).
- Criar a conta de demonstração `empresateste` na 3100 depois que o usuário confirmar que o fluxo funciona.
- Passar outras peças repetidas para componentes React aos poucos (cartão, indicador, célula da matriz).
