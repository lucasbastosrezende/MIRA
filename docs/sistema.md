# MIRA · o sistema

**MIRA** (Monitoramento Integrado de Riscos e Ações) é a plataforma de gestão de riscos de TIC da SETIC. Ela conduz cada coordenadoria pelas 5 fases do Modelo de Gestão de Riscos (MGR), registra toda alteração com autor, data e valor anterior, e transforma os riscos em dois painéis: um para quem opera a TI e outro para quem decide o investimento.

## O que o sistema resolve

- **Riscos descritos de jeitos diferentes.** O formulário guiado obriga a escrever no formato do MGR ("Devido a… poderá ocorrer… levando a… afetando…") e avisa quando o texto descreve um problema que já acontece, e não um risco.
- **Plano de resposta aprovado fora do sistema.** O Plano de Respostas a Riscos (PRR) tramita dentro do MIRA: cadastrador elabora, gestor da coordenadoria valida e a Alta Gestão de Riscos aprova, com devolução e motivo registrados.
- **Monitoramento sem limites definidos.** Cada PRR tem uma métrica com valores crítico, alerta e ideal; cada medição é comparada a esses limites e gera aviso quando sai do ideal.
- **Alta gestão sem visão de custo.** O painel de Alta Gestão converte probabilidade em percentual e mostra quanto cada risco expõe em reais, quanto custa tratá-lo e quanto a exposição cai com o tratamento.
- **Prestação de contas.** A trilha de auditoria não pode ser editada nem apagada, e o sistema gera a justificativa de despesa e o relatório anual em texto.

## Quem usa

As coordenadorias não vêm prontas: o administrador cria cada uma na hora, com sigla e nome. Cada coordenadoria indica até 2 cadastradores e 1 gestor de riscos.

| Perfil | O que faz |
|---|---|
| Administrador · implantação | Conta criada na implantação, no servidor (`npm run admin -- <usuario>`). Cria e renomeia as coordenadorias e é o único que cadastra pessoas, sempre com o relatório de pedido (SEI ou pedido formal, com número SEI e data). Redefine senhas, desativa e apaga contas; a conta dele não pode ser apagada. Não tem coordenadoria e não vê riscos; no histórico vê só o que ele fez. |
| Cadastrador(a) | Registra e edita os riscos da própria coordenadoria, elabora o PRR, registra medições, reavalia o nível e informa quando o evento ocorreu. |
| Gestor(a) de riscos | Titular (supervisor) da coordenadoria. Valida o PRR e o encaminha à Alta Gestão de Riscos, ou devolve com motivo. Delega no Quadro quem resolve cada risco. Também pode fazer o que o cadastrador faz na própria coordenadoria: cadastrar riscos, editar o contexto e acompanhar o tratamento. Encerra riscos. |
| Alta Gestão de Riscos | É a CSGR. Aprova ou devolve PRRs, registra as decisões da CSGR, orienta nos problemas, emite recomendações às coordenadorias (tela Decisões; o gestor responde no Contexto) e responde às propostas de ajuste ao MGR da ASCF, sempre com parecer. Gera o relatório. Vê todas as coordenadorias. No código e no banco, o perfil é `altagestao` (antes se chamava CSGR; bancos antigos são migrados sozinhos). |
| Empresa terceirizada | Contratada por uma coordenadoria. Acompanha os riscos dela sem editar. Quando é a responsável pela ação de um PRR, informa a execução: registra as medições e marca a ação como concluída (não reavalia o nível). |
| CGGE | Só consulta, em todas as coordenadorias. Acompanha as propostas de ajuste ao MGR. |
| ASCF · Assessoria de Conformidade | Elabora o MGR em articulação com a CSGR (tela MGR): propõe ajustes, corrige e reenvia o que a CSGR pedir e registra a versão em vigor. Sem coordenadoria: consulta riscos, problemas, painéis, histórico, relatório e decisões de todas, sem cadastrar nem aprovar. |

Quem é de uma coordenadoria não enxerga nem acessa por endereço os riscos de outra. A regra é conferida no servidor, não só escondida na tela.

## As 5 fases do MGR

| Fase | O que acontece no MIRA |
|---|---|
| 1 · Contexto | A coordenadoria registra o escopo da gestão de riscos, as pessoas designadas e um cronograma de marcos com data e situação (previsto, concluído, atrasado). É o primeiro passo do **Novo risco**: sem escopo salvo, o servidor não aceita o cadastro do risco. |
| 2 · Identificação | Título, causa, evento, impacto e objetivo afetado. Enquanto se digita, uma pré-visualização mostra a frase completa do MGR, os campos recebem avisos de qualidade e o sistema aponta riscos parecidos já cadastrados. |
| 3 · Avaliação | Primeiro os controles existentes e a linha do tempo da probabilidade (ex.: últimos 12 meses), obrigatórios (MGR p. 14–15); a tela mostra a pergunta do MGR com essa linha do tempo. Depois, probabilidade e impacto de 1 a 5, cada nota com o texto dos Quadros 2 e 3 do MGR. O nível é probabilidade × impacto, na matriz 5 × 5. Informa-se também a exposição financeira estimada em reais, no formato brasileiro (4.000.000 ou 4.000.000,50); embaixo do campo aparece como o valor foi entendido e a conta da exposição esperada (valor cheio × percentual da probabilidade). |
| 4 · Tratamento (PRR) | Forma de tratamento (mitigar, evitar, transferir, aceitar), controles existentes, ação, responsável, prazo, custo, métrica com limites crítico, alerta e ideal, e o risco residual esperado. O residual começa igual ao nível de hoje, com atalhos para reduzir 1 na probabilidade, no impacto ou nos dois, e mostra a conta da exposição residual. Um resumo ao lado recalcula enquanto se preenche. |
| 5 · Monitoramento | Medições da métrica em gráfico, sobre as faixas dos limites; reavaliação do nível com motivo; registro de que o evento ocorreu; depois do evento, retomar o tratamento ou reabrir o PRR para revisão (com motivo); marcar a ação do PRR como concluída; encerramento pelo gestor. |

## Situações de um risco

```
rascunho → avaliado → aguardando gestor → aguardando Alta Gestão → em tratamento → encerrado
                          │                    │                  │
                          └──── devolvido ◄────┘                  └→ evento ocorreu → encerrado
                                  │
                                  ├→ (cadastrador corrige e reenvia ao gestor)
                                  └→ (gestor corrige e envia direto à Alta Gestão)
```

- **Rascunho:** identificado, ainda sem avaliação.
- **Avaliado:** tem probabilidade e impacto; falta o PRR.
- **Aguardando gestor / aguardando Alta Gestão:** PRR em validação. Ninguém edita o risco nessa etapa.
- **Devolvido:** gestor ou Alta Gestão de Riscos devolveu com motivo obrigatório; o motivo aparece no topo do PRR para quem vai corrigir. Se quem corrige e envia é o cadastrador, o PRR volta ao gestor. Se é o próprio gestor (supervisor), o envio já é a validação dele e o PRR vai direto à Alta Gestão de Riscos, que recebe o aviso de novo. O mesmo vale para um PRR que o gestor elabora.
- **Em tratamento:** PRR aprovado; começa o monitoramento da métrica.
- **Evento ocorreu:** o risco se materializou; gestor e Alta Gestão de Riscos são avisados para reavaliar. Dali o risco volta ao tratamento ("Retomar o tratamento") ou o PRR é reaberto para revisão e passa de novo pelas validações.
- **Encerrado:** fechado pelo gestor; sai dos riscos ativos e dos painéis.

## Como os números são calculados

| Conceito | Regra |
|---|---|
| Nível | Probabilidade (1 a 5) × impacto (1 a 5), de 1 a 25, na matriz 5 × 5 |
| Faixas (MGR, Figura 5) | 1–2 irrelevante · 3–4 baixo · 5–9 médio · 10–16 alto · 20–25 extremo |
| Probabilidade em percentual | 1 = 5% · 2 = 20% · 3 = 45% · 4 = 75% · 5 = 95% (meio de cada faixa da escala baseada na ISO 31000: menos de 10%, 10–30%, 31–60%, 61–90%, mais de 90%; a nota 5 nunca abaixo de 90%) |
| Exposição esperada | Percentual da probabilidade × exposição financeira estimada |
| Exposição depois do PRR | Percentual da probabilidade residual × exposição × (impacto residual ÷ impacto atual). Se o tratamento é "aceitar", não há redução. |
| Redução esperada | Exposição esperada − exposição depois do PRR |
| Retorno por real investido | Redução esperada ÷ custo do PRR |
| Estado da métrica | Com "menor é melhor": crítico se o valor ≥ crítico, alerta se ≥ alerta, senão ideal. Com "maior é melhor", o contrário. |

As faixas de nível, as descrições das notas e os percentuais são premissas que estão em `lib/logic.js` e devem ser conferidas com a tabela oficial do MGR. Os valores em reais servem para comparar opções, não para prever perdas.

## Avisos

Há dois tipos de aviso, reunidos na aba Alertas:

- **Prazo da ação**, em texto: "faltam N dias", "vence amanhã", "vence hoje", "vencido há N dias" ou "concluída em". Antes da aprovação aparece como "proposto". Ação concluída não gera aviso de prazo.
- **Avisos guardados**, que saem da lista principal (e do contador) quando a situação que os gerou foi resolvida e ficam em "Resolvidos". São gerados por um acontecimento: PRR enviado (para o gestor), PRR encaminhado (para a Alta Gestão de Riscos), PRR devolvido e aprovado (para cadastrador e gestor), métrica que entrou em alerta ou crítico (para cadastrador, gestor e Alta Gestão de Riscos), nível que subiu e evento ocorrido (para gestor e Alta Gestão de Riscos). Cada pessoa marca os seus como lidos, um por um ("Marcar como lido") ou todos de uma vez.
- **Avisos do momento**, calculados a cada acesso: risco Extremo sem tratamento aprovado, prazo da ação em até 15 dias ou vencido, e métrica em alerta ou crítico. Aparecem em "Exigem ação agora" e na fila de ação do painel Operacional. Não podem ser marcados como lidos, porque só saem quando a situação é resolvida; cada pessoa pode registrar **"Estou ciente"**, que guarda quem e quando, aparece no próprio aviso ("Ciente: …"), no histórico do risco e na seção 7 do relatório, e o aviso continua na lista.

No protótipo os e-mails são simulados: o aviso aparece no sistema, mas nada sai por e-mail.

## Painéis

**Operacional (TI):** o que exige ação agora.
- Indicadores de riscos ativos, nível alto ou extremo, métricas em alerta, prazos em até 15 dias e pendências do perfil, cada um com estado (crítico, atenção, em dia).
- Mapa de calor probabilidade × impacto; clicar numa célula filtra a lista.
- Fila de ação ordenada por gravidade.
- Distribuição por nível e por etapa do fluxo do PRR.
- Métricas fora do ideal desenhadas sobre os limites, com a variação desde a medição anterior.
- Lista de riscos com nível, fase, situação, métrica e prazo.

**Alta Gestão:** custo do risco e retorno do tratamento.
- Exposição esperada hoje, o valor cheio (sem aplicar a probabilidade), a comparação com a exposição depois dos PRRs e um resumo em texto para a decisão.
- Investimento aprovado e aguardando decisão, retorno por real investido, riscos altos ou extremos ainda sem tratamento aprovado.
- Exposição por coordenadoria, hoje e depois dos PRRs.
- Prioridade de investimento: PRRs aguardando decisão, ordenados pelo retorno.
- Maiores exposições, com a justificativa de despesa pronta para o TCE.
- Respostas por forma de tratamento e as premissas usadas nos cálculos.

Todos os perfis alternam entre os dois painéis. Alta Gestão de Riscos e CGGE abrem na Alta Gestão; os demais, no Operacional.

## Demais telas

| Tela | Para quê | Quem vê |
|---|---|---|
| Riscos | Lista com pesquisa (código, título, causa, evento, impacto ou quem abriu; acentos não importam; o código aceita `R-0001-10-2026`, `R-0001/10/2026` ou só `10/2026`) e filtros por coordenadoria, nível e situação; menu Baixar com Excel e os CSVs | Todos |
| Problemas | O que já está acontecendo (não é risco, pelo MGR), com o plano de agora: o que fazer, responsável e prazo para resolver. Ver a seção "Problemas" | Todos menos o administrador; registra e conduz o cadastrador ou o gestor da coordenadoria; a Alta Gestão de Riscos orienta |
| Quadro | Colunas pelas etapas do processo (identificar e avaliar, elaborar o PRR, em validação, em tratamento, evento ocorreu, encerrado), com quem resolve cada risco e filtro por responsável. O gestor da coordenadoria delega a um cadastrador ou a si mesmo, com uma observação; a delegação vai para o histórico e gera um aviso | Todos menos o administrador; delega o gestor |
| Matriz | Matriz 5 × 5 com a distribuição por nível e a lista da célula escolhida | Todos |
| Pendências | O que depende do perfil: rascunhos e devoluções (cadastrador), validações (gestor), aprovações com custo e retorno (Alta Gestão de Riscos) | Todos, menos CGGE |
| Contexto | Fase 1 da coordenadoria; abre pelo botão Contexto na aba Riscos. É o primeiro passo do Novo risco enquanto a coordenadoria não tem contexto salvo; depois disso, o Novo risco abre direto na identificação e o contexto continua na fase 1 | Todos; edita o cadastrador |
| Histórico | Linha do tempo de todas as alterações, com valor anterior e novo. Pesquisa por data (de / até): o período é buscado no servidor, inteiro, e não só entre os registros mais recentes. A mesma pesquisa existe no histórico de cada risco | Todos, filtrado pela coordenadoria |
| Alertas | Avisos do momento e avisos guardados | Todos |
| Relatório | Relatório da Alta Gestão de Riscos por período: semanal, mensal (o padrão), semestral ou anual, com setas para os períodos anteriores. Mostra o que aconteceu no período (riscos cadastrados, PRRs aprovados e devolvidos, investimento aprovado, medições, eventos e encerramentos, pelas datas guardadas em cada risco), os problemas registrados e resolvidos no período e a situação de hoje. Lido na tela em Markdown e baixado em .md, .txt, CSV ou Excel | Gestor, Alta Gestão de Riscos e CGGE |
| Usuários | Cadastro de pessoas com o relatório de pedido (SEI ou pedido formal, número SEI, data e PDF), registro de pedido de quem já tem conta, busca por nome ou número SEI, download do PDF e do relatório de pedido (.md ou .txt), redefinição de senha, desativação, exclusão e cobertura de cada coordenadoria | Administrador |
| Coordenadorias | Criação das coordenadorias, edição do nome por extenso e remoção enquanto não têm pessoas, riscos nem contexto | Administrador |

Quem é de uma coordenadoria vê no cabeçalho a sigla em maiúsculas e o nome por extenso dela (por exemplo, "COSEGI · nome por extenso"). Os dois vêm do cadastro feito pelo administrador; nenhuma coordenadoria é fixa no código.

**Downloads.** Na tela, os textos longos (relatório anual e justificativa para o TCE) aparecem em Markdown formatado. O botão **Baixar** abre as opções de formato: Excel; CSV de riscos, por coordenadoria, por coordenadoria e faixa, de medições, do quadro e do histórico; e Markdown ou texto puro para o relatório e a justificativa. Os CSVs usam ";", vírgula decimal e acentos preservados, para abrir direto no Excel.

## Facilidades de uso

- **Número do risco com mês e ano:** cada risco novo recebe `R-` + 4 dígitos + mês + ano do cadastro (ex.: `R-0001-10-2026`), no horário de Brasília (`MIRA_TZ` muda o fuso). Os 4 dígitos recomeçam a cada mês, até 9.999 por mês. Os riscos cadastrados antes desse formato mantêm o número antigo (`R-001`), porque o histórico nunca é reescrito.
- **Nada digitado se perde sem aviso:** quem digitou algo e tenta sair da tela antes de salvar (outro menu, outra aba do risco, outro risco, Configurações ou Sair) recebe uma pergunta; "Cancelar" mantém tudo como estava. Fechar ou recarregar a página também pergunta. Filtros e pesquisas não contam como algo a salvar.
- **O que falta para enviar o PRR:** o resumo ao lado do PRR lista, enquanto se preenche, o que ainda impede o envio, pela mesma regra do servidor. Cada item leva ao campo. Com tudo preenchido, aparece "Pronto para enviar ao gestor".
- **Encolher blocos:** cada bloco com título tem o botão "Encolher / Mostrar". Encolher só esconde o conteúdo (o que foi digitado continua no lugar) e a escolha fica guardada no navegador de quem usa.
- **Erro repetido:** se o mesmo erro aparece duas vezes seguidas, a tela vai até o campo que falta e o destaca.
- **Celular:** o menu quebra em linhas para Pendências e Alertas ficarem sempre à vista; na matriz, cada célula mostra só a contagem (o nível fica na dica).

## Problemas: o que já está acontecendo

Pelo MGR, risco é um evento futuro e incerto. O que já está acontecendo é **problema**: não entra na matriz nem no PRR, mas também não fica sem caminho. A tela **Problemas** registra cada um com o número `P-0001-10-2026` (mesma regra do número do risco) e o **plano de agora**.

- **Registrar:** cadastrador ou gestor da coordenadoria, sem depender do contexto (o problema não espera). Campos: título, o que está acontecendo, o que está sendo afetado, desde quando (não pode ser no futuro) e o plano de agora: o que fazer, responsável (pessoa ativa da coordenadoria, inclusive empresa terceirizada) e prazo para resolver. Quem registra já define responsável e prazo.
- **Aviso na hora:** cadastrador, gestor e Alta Gestão de Riscos recebem o aviso, e o problema fica em "Exigem ação agora" (com "Estou ciente") até ser resolvido.
- **Risco que já ocorreu:** o problema pode ser ligado a um risco já cadastrado da coordenadoria. Se o risco estava em tratamento, passa para "Evento ocorreu" e o que o PRR manda fazer nesse caso aparece no plano. No risco que já está em "Evento ocorreu", o botão "Registrar o problema e o plano de agora" abre o registro já ligado.
- **Texto que descreve um problema:** no risco novo, o aviso "isso é um problema, não um risco" (e o do assistente de IA) traz o botão "Registrar como problema", que leva o texto para o registro.
- **Andamento:** a coordenadoria registra o que já foi feito; a Alta Gestão de Riscos escreve orientações, que chegam como aviso à coordenadoria.
- **Mudar o plano, resolver e reabrir:** pela coordenadoria. Resolver pede o que resolveu; reabrir pede o motivo e avisa de novo.
- **Para não voltar a acontecer:** "Cadastrar risco a partir do problema" abre o risco novo ligado ao problema; ele segue as 5 fases do MGR.
- Tudo vai para o histórico, e o relatório da Alta Gestão traz os problemas do período.

## MGR: versão em vigor e ajustes (ASCF e CSGR)

A ASCF elabora o Modelo de Gestão de Riscos em articulação com a CSGR. A tela **MGR** (ASCF, Alta Gestão de Riscos e CGGE) mostra:

- **Versão em vigor:** a última registrada pela ASCF (versão, data de aprovação, documento e o que mudou), com as anteriores. Sem registro, vale o MGR v1.0, que é o que o sistema aplica.
- **Propostas de ajuste:** a ASCF propõe (título, o que muda, por quê e onde no MGR). A CSGR responde "de acordo" ou "pedir ajuste", sempre com parecer; o que volta para ajuste a ASCF corrige e reenvia. Cada passo gera aviso para quem responde e vai para o histórico.
- **Regras do MGR v1.0 aplicadas pelo sistema**, com a página do MGR, para conferir a conformidade.

As regras ficam no código: uma versão nova do MGR que mude uma regra também pede mudança no sistema.

## Decisões da CSGR

Tela **Decisões** (a Alta Gestão registra; o CGGE consulta). Cada termo tem um botão **?** que abre a explicação ali mesmo, e ao lado fica o bloco de dúvidas frequentes com os mesmos termos. Cada decisão guarda quem decidiu e quando e vai para o histórico. Sem decisão, vale o comportamento padrão.

- **Premissas financeiras:** percentual de cada nota de probabilidade na exposição esperada (padrão: 5%, 20%, 45%, 75% e 95%). Sem aprovação da CSGR, a justificativa ao TCE sai como minuta. A nota 5 nunca fica abaixo de 90%.
- **Limite para aceitar o risco (apetite a risco):** maior nível que pode ser aceito sem tratamento. Na tela aparece com o nome simples e, entre parênteses, o termo do MGR (p. 19) e da ISO 31000. Com ele definido, um PRR com "Aceitar" acima desse nível não é enviado.
- **Priorização:** ordem das filas e listas: pelo nível; nível e prazo; ou nível, prazo e situação.
- **Limite por coordenadoria:** pode ser definido para cada coordenadoria e vale sobre o geral.

No histórico, cada decisão aparece com o nome legível e os valores por extenso (por exemplo, "Cosegi: até nível 5, até R$ 500.000,00").
- **Alçada do gestor:** nível e exposição máximos por coordenadoria; o PRR acima deles chega à CSGR marcado como fora da alçada do gestor e no topo da fila (MGR p. 8). Todo PRR continua passando pela CSGR.

## Configurações, temas e mascote

- **Configurações:** clicar no próprio nome, no topo, abre a tela de Configurações. A escolha vale só para o navegador de quem usa.
- **Temas:** SETIC (padrão, nas cores da SETIC, claro ou escuro conforme o computador), Noturno, Suave (meio-termo entre claro e escuro), Conforto dos olhos (creme e tons quentes) e Editável (cor principal e base clara ou escura à escolha). As cores dos níveis de risco seguem sempre a Figura 5 do MGR, em qualquer tema.
- **Mascote:** a mira do topo gira para o lado do mouse e o ponto central segue o mouse.
- **Easter egg (só segurando):** um clique simples na mira não muda nada. Segurar a mira e soltar depois de um instante (0,6 s) passa para o próximo tema (o mesmo da tela de Configurações). Continuar segurando até 2 segundos troca a cor da mira, e o tema fica como estava. A cor da mira só muda por esse gesto; trocar de tema não muda a mira.

## Assistente de IA (opcional)

Com a variável `ANTHROPIC_API_KEY` definida em `.env.local`, o cadastrador pode escrever o risco com as próprias palavras e pedir ao assistente que:
- organize o texto no formato do MGR;
- avise quando o texto descreve um problema, e não um risco;
- sugira notas de probabilidade e impacto com justificativa;
- proponha até 3 ações de tratamento;
- aponte riscos parecidos já cadastrados.

A chamada sai do servidor e a chave nunca vai para o navegador. Sem a chave, o sistema funciona normalmente, sem o assistente. A restrição de não usar os dados para treinar modelos depende do contrato da API usada.

## Segurança e auditoria

- **Senhas:** guardadas com scrypt e salt aleatório, comparadas em tempo constante.
- **Sessão:** cookie `HttpOnly` com `SameSite=Strict`, válida por 8 horas. Com `MIRA_HTTPS=1` (instância atrás de HTTPS), o cookie também é `Secure`.
- **Tentativas de login:** 5 tentativas erradas do mesmo usuário e endereço bloqueiam por 5 minutos; 10 erros do mesmo usuário em 15 minutos bloqueiam por 15 minutos, de qualquer endereço. O endereço só vem do cabeçalho `X-Forwarded-For` com `MIRA_TRUST_PROXY=1` (proxy confiável na frente); sem isso, o cabeçalho é ignorado.
- **Exportação CSV:** texto que começa com `=`, `+`, `-` ou `@` ganha um apóstrofo, para não virar fórmula ao abrir no Excel.
- **Requisições:** toda requisição que não é leitura precisa de um cabeçalho próprio do MIRA, o que barra envios feitos por outros sites.
- **Permissões:** conferidas no servidor em cada ação. O navegador recebe só os riscos que o perfil pode ver.
- **Auditoria:** a tabela de auditoria só recebe inserções; não existe rota para editar ou apagar o histórico.
- **Rede:** o servidor escuta só em 127.0.0.1.

## Arquitetura

```
Navegador ── app/page.js → MiraClient.js → mira-ui.js (interface)
   │                                           │ fetch /api/...
   ▼                                           ▼
Next.js ── app/api/[...path]/route.js → lib/api.js (rotas, sessão, assistente de IA)
                                           → lib/service.js (regras de negócio, permissões, auditoria, avisos)
                                           → lib/db.js (SQLite nativo do Node)
lib/logic.js: regras do MGR usadas tanto no servidor quanto no navegador
```

- **Next.js 15 (App Router) e React 19**, com Node 22.13 ou mais novo. O banco é o `node:sqlite`, que já vem no Node, sem dependências extras.
- **Interface:** `mira-ui.js` monta todas as telas como HTML e conversa só com a API. O mesmo arquivo de regras (`logic.js`) decide no navegador o que mostrar e no servidor o que permitir.
- **Banco:** um arquivo `./data/mira.db` (a pasta muda com `MIRA_DATA_DIR`). As tabelas são `users`, `sessions`, `risks` (cada risco em JSON), `audit`, `alerts` , `ctx` (contexto por coordenadoria), `units` (coordenadorias criadas), `config` (decisões da CSGR), `problemas` (cada problema em JSON; a tabela `config` guarda também as versões e propostas do MGR, na chave `mgr`) e `user_docs` (relatório de pedido de cada cadastro: tipo, documento, número SEI, data e o PDF quando houver, indexado pelo número SEI). O backup é a cópia desse arquivo.
- **Começa vazio:** sem pessoas, sem coordenadorias e sem dados de exemplo. A conta do administrador é criada na implantação com `npm run admin -- <usuario>`; não existe rota da API que crie conta sem login. Num banco anterior a este perfil, as coordenadorias que já têm dados entram na lista e as pessoas continuam entrando; basta criar o administrador com o mesmo comando.
- **Conta só pelo usuário:** não há campo de nome. O usuário de acesso é o que aparece nas telas e na trilha de auditoria.

## Como rodar e testar

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # testes da API e da interface
```

A tabela de testes e os resultados estão em [testes.md](testes.md).

## Limites conhecidos

- E-mails são simulados.
- Faixas de nível e notas seguem o MGR (Figura 5 e Quadros 2 e 3). Os percentuais de probabilidade são premissa do sistema, não do MGR.
- Um único arquivo SQLite, pensado para uso interno em uma instalação; não há réplica nem acesso de fora da máquina.
- Testado no Chromium; outros navegadores e o build de produção ainda não foram testados (veja [testes.md](testes.md)).
