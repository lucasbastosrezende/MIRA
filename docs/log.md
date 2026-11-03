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
| API | 210 verificações, todas passando |
| Interface (smoke) | 67 verificações, incluindo o perfil ASCF e a tela MGR, todas passando, incluindo a tela Problemas em cada perfil, incluindo um risco Extremo (5 × 5) ainda sem PRR aprovado |
| Navegador | 49 de 49 cenários passando (última rodada em banco limpo) |
| Navegador (roteiro extra) | 13 de 13 cenários das partes novas, fora do repositório (ver item 20) |
| Navegador (roteiro de UX) | 9 de 9 cenários das melhorias de uso, fora do repositório (ver item 21) |
| Navegador (problemas) | 27 de 27 conferências da tela Problemas, fora do repositório (ver item 30) |
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

### 21. Experiência de uso (branch `feature/ux-fluxos`, 31/10/2026)
O visual ficou congelado a pedido do usuário; só mudou o que facilita o uso. Um passeio por todas as telas de cada perfil (computador e 390 px) achou:

| Achado | Resolvido |
|---|---|
| O PRR é longo e era perdido sem aviso ao trocar de aba, de menu ou de risco antes de salvar | A tela marca quando há algo digitado e pergunta antes de sair; fechar ou recarregar também pergunta |
| O "o que falta" só aparecia depois de clicar em Enviar | O resumo do PRR lista o que falta enquanto se preenche, cada item leva ao campo |
| O erro "Informe a unidade da métrica" levava ao campo da métrica, não ao da unidade | A regra da unidade passou a vir antes da regra da métrica |
| Todo risco novo voltava à fase 1, mesmo com o contexto já salvo | Com contexto salvo, abre direto na identificação; sem contexto, continua começando por ele |
| A lista de riscos não tinha pesquisa | Pesquisa por código, título, causa, evento, impacto ou quem abriu, sem acento e sem tirar o cursor do campo |
| No celular, Pendências e Alertas ficavam fora da tela, no fim do menu | O menu quebra em linhas |
| No celular, "2 nível 12" não cabia na célula da matriz | A célula mostra só a contagem; o nível fica na dica |

Roteiro de UX (fora do repositório), 9 cenários:

| # | Cenário | Resultado |
|---|---|---|
| U01 | Novo risco abre na identificação quando o contexto já está salvo | ok |
| U02 | Sair com algo digitado pergunta; "Cancelar" mantém o texto | ok |
| U03 | Sem nada digitado, a navegação não pergunta | ok |
| U04 | Trocar de aba no PRR com texto pergunta; depois de salvar, não pergunta | ok |
| U05 | Recarregar a página com algo não salvo: o navegador pergunta | ok |
| U06 | Resumo do PRR lista o que falta, leva ao campo e diminui ao preencher | ok |
| U07 | Tudo preenchido: "Pronto para enviar ao gestor" | ok |
| U08 | Pesquisa sem acento, aviso de nada encontrado, mantida ao mudar outro filtro | ok |
| U09 | Celular: menu inteiro à vista, matriz só com a contagem, sem rolagem lateral | ok |

No roteiro principal, o cenário T08 esperava que todo risco novo começasse pelo contexto. Ele foi ajustado à regra nova; como o risco desse cenário é a base dos seguintes, a primeira rodada caiu em cascata (24 de 49) antes do ajuste. Depois do ajuste, 49 de 49.

No roteiro extra, o X02 falhou uma vez num banco recém-zerado: o botão de justificativa ao TCE só aparece para riscos avaliados, e o cenário dependia de riscos deixados por rodadas anteriores. O cenário passou a criar o seu risco, já com um PRR, porque o botão fica desativado de propósito enquanto o risco não tem PRR; na rodada seguinte, 13 de 13.

### 22. PRR devolvido pela Alta Gestão e reenviado pelo supervisor não voltava a ela
- **Achado:** teste manual do usuário. A Alta Gestão devolveu o PRR, o supervisor (gestor) ajustou e reenviou, e o PRR não apareceu de novo para a Alta Gestão. O envio do gestor levava o PRR para "aguardando gestor", ou seja, para a fila dele mesmo; o botão dizia "Enviar para validação do gestor".
- **Resolvido:** quando quem envia é o gestor da coordenadoria, o envio já é a validação dele: o PRR vai direto à Alta Gestão, com a mesma marca de alçada e o mesmo aviso da validação comum (`encaminhaAlta` em `lib/service.js`, usada pelas duas ações). Para o gestor, o botão diz "Validar e enviar à Alta Gestão de Riscos" e a pendência do devolvido diz "ajustar e enviar de novo à Alta Gestão de Riscos". O envio do cadastrador continua indo ao gestor.
- **Conferido:** teste de API (o gestor reenvia, a situação vira "aguardando Alta Gestão", a Alta Gestão vê o risco e recebe um segundo aviso) e o caminho no navegador: Alta Gestão devolve → supervisor reenvia pela tela → o PRR sai da fila do supervisor e aparece na fila e nos alertas da Alta Gestão.

### 23. Encolher blocos e pesquisa por data nos históricos
- **Pedido:** opção para reduzir o texto na tela, encolhendo blocos, e pesquisa por data nos históricos.
- **Feito:** botão "Encolher / Mostrar" em todo bloco com título, lembrado no navegador; filtro "De / Até" na tela Histórico e no histórico de cada risco. O estado entrega só os 500 registros mais recentes, por isso o período é buscado no servidor (`GET /api/audit?ini=&fim=`), com as mesmas regras de quem vê o quê e no máximo 2.000 registros.
- **Conferido:** 4 testes de API (o período traz o que aconteceu, outra coordenadoria não aparece, período vazio, datas invertidas recusadas) e 7 cenários no navegador (encolher, lembrar depois de recarregar, mostrar de novo, encolher o PRR sem perder o texto, pesquisa por dia, período vazio e "Limpar datas", histórico do risco, celular sem rolagem lateral). Um dos cenários falhou na primeira rodada por erro do próprio roteiro (procurava uma classe que o bloco não usa).

### 24. Atalho da mira só segurando
- **Pedido:** a troca de tema pela mira passa a ser segurando.
- **Feito:** clique simples não muda nada; segurar e soltar depois de 0,6 s troca o tema; segurar até 2 s troca só a cor da mira. No celular, segurar não abre o menu de toque.
- **Conferido:** no navegador, os quatro casos (clique, 0,9 s, 2,3 s, toque curto).

### 25. Explicação dos termos da tela Decisões
- **Pedido:** um FAQ ao lado, com um botão "?" que abre e fecha, para explicar termos como "alçada do gestor".
- **Feito:** botão "?" ao lado de premissas financeiras, apetite a risco, alçada do gestor, nível máximo, exposição máxima e priorização; o texto abre logo abaixo e fecha no mesmo botão. Ao lado (abaixo, no celular), o bloco "Dúvidas frequentes" com esses termos e a exposição esperada.
- **Conferido:** no navegador, no computador (claro) e a 390 px (escuro): 6 botões, abrir e fechar, `aria-expanded`, 7 perguntas no bloco ao lado. A primeira captura a 390 px mostrou rolagem lateral de 155 px: o bloco das premissas não encolhia dentro da coluna nova. A coluna passou a encolher e a rolagem sumiu. Roteiro extra: 13 de 13.

### 26. "Estou ciente" e leitura de um aviso por vez
- **Pedido:** poder marcar avisos como lidos um por um, e nos que exigem ação imediata um "estou ciente" que vá para o relatório sem tirar a ação da lista.
- **Feito:** botão "Marcar como lido" em cada aviso não lido (o servidor passou a mandar o identificador do aviso, e `alerts/read` aceita um `id`). Nos itens de "Exigem ação agora", "Estou ciente" grava a ciência no risco (quem, perfil, quando e o texto do alerta), registra "Registrou ciência do alerta" no histórico e entra no relatório por período (linha na seção 1 e seção 7). O item continua na lista e mostra "Ciente: …".
- **Conferido:** 7 testes de API (ciência registrada sem mudar a situação do risco, repetida não duplica, alerta de outro risco recusado, outra coordenadoria barrada, histórico, avisos com identificador, só um aviso lido) e no navegador: o item continua depois do clique, a marca "Você está ciente", 5 → 4 avisos não lidos, histórico e relatório com a ciência. Na primeira captura a 390 px, o texto do aviso ficou espremido ao lado do botão; o botão passou para a linha de baixo.

### 27. Dúvidas no monitoramento da métrica
- **Pedido:** FAQ no monitoramento da métrica.
- **Feito:** botão "?" ao lado de cada termo da aba de monitoramento (métrica, "quanto menor/maior, melhor", como ler o gráfico, registrar medição, medição em alerta ou crítico, reavaliação e "O evento ocorreu"), com a explicação logo abaixo; o bloco de dúvidas do fim da aba passou de 5 para 9 perguntas. A resposta sobre medição dizia que só o gestor recebe aviso; foi corrigida (cadastrador, gestor e Alta Gestão recebem, como faz o servidor).
- **Conferido:** no navegador, no computador (claro) e a 390 px (escuro): os 6 botões abrem a explicação, 9 perguntas no bloco, sem rolagem lateral e sem erro.

### 28. "Apetite a risco" com nome simples
- **Pedido:** outro nome para "apetite a risco".
- **Decisão do usuário:** nome simples com o termo oficial entre parênteses, "Limite para aceitar o risco (apetite a risco)", porque é o termo do MGR (p. 19) e da ISO 31000 que a CSGR e o TCE leem.
- **Feito:** título, coluna, botão, aviso, explicação do "?" e a mensagem do servidor quando um PRR com "Aceitar" passa do limite. No histórico, as decisões da CSGR saíam com a chave interna ("…: apetite") e valores em JSON; agora saem com o nome e os valores por extenso. Registros antigos do histórico não são reescritos.
- **Conferido:** teste de API ajustado ao nome novo e um teste novo de valores sem JSON (153 verificações). No navegador: título, botão "Registrar limite", aviso e as três decisões legíveis no histórico.

### 29. Número do risco com 4 dígitos, mês e ano
- **Pedido:** número do risco com 4 dígitos, mês e ano.
- **Decisão do usuário:** `R-0001-10-2026`, com hífen, e os 4 dígitos recomeçando a cada mês.
- **Feito:** o mês e o ano são os do cadastro, no horário de Brasília (`MIRA_TZ` muda o fuso). Os riscos já cadastrados mantêm o número antigo (`R-001`), porque o histórico nunca é reescrito; as rotas e as chaves do "Estou ciente" aceitam os dois formatos. A pesquisa da lista acha o número escrito com hífen, barra ou ponto. Nas tabelas, o número fica numa linha só (no celular quebrava nos hífens).
- **Conferido:** testes de API do primeiro e do segundo risco do mês e de um risco de número antigo, que continua editável e não entra na contagem.

### 30. Problemas: o que já está acontecendo
- **Pedido:** um plano para os problemas que estão acontecendo agora.
- **Decisão do usuário:** registrar o problema com o plano e também ligá-lo ao risco que já ocorreu.
- **Feito:** tela Problemas (ver `docs/sistema.md`, seção "Problemas"), tabela `problemas`, rotas `POST /api/problemas` e `POST /api/problemas/<número>/action` (andamento, plano, resolver, reabrir, ciente). O risco em tratamento ligado ao problema passa para "Evento ocorreu". O aviso "isso é um problema" do risco novo leva o texto para o registro. Depois de resolvido, o problema vira risco novo para não voltar a acontecer. Relatório com a seção 8.
- **Conferido:** 21 verificações novas na API (permissões, campos obrigatórios, data no futuro, responsável de fora, ligação com o risco, outra coordenadoria, orientação, ciência sem repetir, resolver, reabrir, risco a partir do problema). No navegador, com banco limpo: registro pela tela, alerta e "Estou ciente", orientação da Alta Gestão, resolver, risco a partir do problema, texto que vira problema, risco em tratamento cujo evento ocorreu, relatório e histórico; a 390 px nos temas claro e escuro, sem rolagem lateral e sem erro na página.

### 31. Tabela nova sem reiniciar o servidor
- **Achado:** o servidor guarda o banco aberto na memória. Com o código novo recarregado sem reinício (Next em modo de desenvolvimento), as tabelas e colunas novas (`config`, `users.pode_definir`, `problemas`) só eram criadas depois de reiniciar, e até lá as telas quebravam.
- **Feito:** `lib/db.js` marca a versão do esquema (`ESQUEMA`). Se o código traz uma versão mais nova, a conexão já aberta recebe o que falta; as criações já podiam rodar de novo sem efeito.
- **Conferido:** teste de API que tira a tabela de um banco já aberto e confere que ela volta. Na 3100, sem reiniciar, o banco ganhou `problemas`, `config` e `pode_definir`, só com uma chamada sem login.

### 32. Perfil ASCF e tela MGR
- **Pedido:** fazer o papel da ASCF (Assessoria de Conformidade), que elabora o MGR em articulação com a CSGR.
- **Feito:** perfil `ascf`, cadastrado pelo administrador, sem coordenadoria. Consulta tudo como o CGGE e não cadastra nem aprova. Tela MGR: versão em vigor, propostas de ajuste (a ASCF propõe, a CSGR responde com parecer, a ASCF corrige e reenvia) e as regras do MGR v1.0 aplicadas pelo sistema, com a página. Os perfis sem coordenadoria (CSGR, CGGE e ASCF) passaram a sair de uma regra só (`geral` em `lib/logic.js`).
- **Conferido:** 20 verificações novas na API (permissões, parecer obrigatório, reenvio, versão no futuro ou repetida, avisos, histórico, cadastrador sem acesso). No navegador: conta criada pelo administrador, proposta, pedido de ajuste da CSGR, aviso que abre a tela MGR, reenvio e versão registrada; a 390 px nos temas claro e escuro, sem rolagem lateral e sem erro.

### 33. Empresa terceirizada informa a execução e recomendações da CSGR
- **Origem:** comparação dos papéis do texto de governança com o MIRA. O responsável designado no PRR "executa as ações e fornece informações sobre a execução"; a CSGR "orienta e emite recomendações".
- **Feito:** a empresa terceirizada que é a responsável pela ação de um PRR registra medições e conclui a ação (regra `canExec` em `lib/logic.js`); não reavalia, não informa evento e não reabre o PRR. A Alta Gestão de Riscos emite recomendação para uma coordenadoria ou para todas, na tela Decisões; a coordenadoria recebe o aviso e vê no Contexto, e o gestor responde uma vez. Tudo no histórico.
- **Achado no caminho:** a tabela do cronograma no Contexto passava 3 px da tela a 390 px (já acontecia antes); passou a rolar dentro da própria área.
- **Conferido:** 10 verificações novas na API. No navegador: recomendação emitida, aviso que abre o Contexto, resposta do gestor que aparece em Decisões, a 390 px sem rolagem lateral. A execução pela empresa foi conferida só na API.

### 34. Gestor aprova o que está dentro da alçada
- **Pedido:** só os PRRs acima da alçada do gestor sobem à CSGR (decisão do usuário).
- **Feito:** dentro da alçada que a CSGR definiu para a coordenadoria, o gestor aprova o PRR com parecer obrigatório e o monitoramento começa; o cadastrador e a CSGR são avisados. Acima da alçada, ou sem alçada definida, o PRR sobe à CSGR como antes (`dentroAlcada` em `lib/logic.js`, usada em `encaminhaAlta`). Na tela, o gestor vê "Dentro da sua alçada" e o botão "Aprovar o PRR".
- **Conferido:** 2 verificações novas na API (sem parecer é recusado; com parecer aprova e avisa a CSGR). No navegador, a 390 px no tema escuro e no computador no tema claro: aviso, botão, recusa sem parecer, aprovação com parecer e aviso à CSGR, sem rolagem lateral.

## Visual

- Cores, fontes (Sora nos títulos, IBM Plex Sans no texto), cantos e pesos seguem o canvas aprovado pelo usuário ("MIRA · cores e tipografia").
- A etiqueta de nível e a etiqueta de situação viraram componentes React (`app/pecas.js`), transformados em HTML com `renderToStaticMarkup`; o React escapa o texto sozinho.
- Contraste do texto sobre as cores dos níveis: todos acima de 4,5:1.

## Pendências

- Criar a conta de demonstração `empresateste` na 3100 depois que o usuário confirmar que o fluxo funciona.
- Passar outras peças repetidas para componentes React aos poucos (cartão, indicador, célula da matriz).
