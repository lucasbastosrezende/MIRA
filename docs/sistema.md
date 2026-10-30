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
| Gestor(a) de riscos | Titular da coordenadoria. Valida o PRR e o encaminha à Alta Gestão de Riscos, ou devolve com motivo. Delega no Quadro quem resolve cada risco. Encerra riscos. |
| Alta Gestão de Riscos | Aprova ou devolve PRRs e gera o relatório anual. Vê todas as coordenadorias. No código e no banco, o perfil é `altagestao` (antes se chamava CSGR; bancos antigos são migrados sozinhos). |
| CGGE | Só consulta, em todas as coordenadorias. |

Quem é de uma coordenadoria não enxerga nem acessa por endereço os riscos de outra. A regra é conferida no servidor, não só escondida na tela.

## As 5 fases do MGR

| Fase | O que acontece no MIRA |
|---|---|
| 1 · Contexto | A coordenadoria registra o escopo da gestão de riscos, as pessoas designadas e um cronograma de marcos com data e situação (previsto, concluído, atrasado). É o primeiro passo do **Novo risco**: sem escopo salvo, o servidor não aceita o cadastro do risco. |
| 2 · Identificação | Título, causa, evento, impacto e objetivo afetado. Enquanto se digita, uma pré-visualização mostra a frase completa do MGR, os campos recebem avisos de qualidade e o sistema aponta riscos parecidos já cadastrados. |
| 3 · Avaliação | Probabilidade e impacto de 1 a 5, cada nota com descrição. O nível é probabilidade × impacto, na matriz 5 × 5. Informa-se também a exposição financeira estimada em reais, no formato brasileiro (4.000.000 ou 4.000.000,50); embaixo do campo aparece como o valor foi entendido e a conta da exposição esperada (valor cheio × percentual da probabilidade). |
| 4 · Tratamento (PRR) | Forma de tratamento (mitigar, evitar, transferir, aceitar), controles existentes, ação, responsável, prazo, custo, métrica com limites crítico, alerta e ideal, e o risco residual esperado. O residual começa igual ao nível de hoje, com atalhos para reduzir 1 na probabilidade, no impacto ou nos dois, e mostra a conta da exposição residual. Um resumo ao lado recalcula enquanto se preenche. |
| 5 · Monitoramento | Medições da métrica em gráfico, sobre as faixas dos limites; reavaliação do nível com motivo; registro de que o evento ocorreu; encerramento pelo gestor. |

## Situações de um risco

```
rascunho → avaliado → aguardando gestor → aguardando Alta Gestão → em tratamento → encerrado
                          │                    │                  │
                          └──── devolvido ◄────┘                  └→ evento ocorreu → encerrado
                                  │
                                  └→ (cadastrador corrige e reenvia ao gestor)
```

- **Rascunho:** identificado, ainda sem avaliação.
- **Avaliado:** tem probabilidade e impacto; falta o PRR.
- **Aguardando gestor / aguardando Alta Gestão:** PRR em validação. Ninguém edita o risco nessa etapa.
- **Devolvido:** gestor ou Alta Gestão de Riscos devolveu com motivo obrigatório; o motivo aparece no topo do PRR para quem vai corrigir.
- **Em tratamento:** PRR aprovado; começa o monitoramento da métrica.
- **Evento ocorreu:** o risco se materializou; gestor e Alta Gestão de Riscos são avisados para reavaliar.
- **Encerrado:** fechado pelo gestor; sai dos riscos ativos e dos painéis.

## Como os números são calculados

| Conceito | Regra |
|---|---|
| Nível | Probabilidade × impacto, de 1 a 25 |
| Faixas | 1–2 irrelevante · 3–5 baixo · 6–10 médio · 12–16 alto · 20–25 extremo |
| Probabilidade em percentual | 1 = 5% · 2 = 15% · 3 = 35% · 4 = 60% · 5 = 85% |
| Exposição esperada | Percentual da probabilidade × exposição financeira estimada |
| Exposição depois do PRR | Percentual da probabilidade residual × exposição × (impacto residual ÷ impacto atual). Se o tratamento é "aceitar", não há redução. |
| Redução esperada | Exposição esperada − exposição depois do PRR |
| Retorno por real investido | Redução esperada ÷ custo do PRR |
| Estado da métrica | Com "menor é melhor": crítico se o valor ≥ crítico, alerta se ≥ alerta, senão ideal. Com "maior é melhor", o contrário. |

As faixas de nível, as descrições das notas e os percentuais são premissas que estão em `lib/logic.js` e devem ser conferidas com a tabela oficial do MGR. Os valores em reais servem para comparar opções, não para prever perdas.

## Avisos

Há dois tipos de aviso, reunidos na aba Alertas:

- **Avisos guardados**, gerados por um acontecimento: PRR enviado (para o gestor), PRR encaminhado (para a Alta Gestão de Riscos), PRR devolvido e aprovado (para cadastrador e gestor), métrica que entrou em alerta ou crítico (para cadastrador, gestor e Alta Gestão de Riscos), nível que subiu e evento ocorrido (para gestor e Alta Gestão de Riscos). Cada pessoa marca os seus como lidos.
- **Avisos do momento**, calculados a cada acesso: prazo da ação em até 15 dias ou vencido, e métrica em alerta ou crítico. Aparecem em "Exigem ação agora" e na fila de ação do painel Operacional.

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
| Riscos | Lista com filtros por coordenadoria, nível e situação; menu Baixar com Excel e os CSVs | Todos |
| Quadro | Colunas pelas etapas do processo (identificar e avaliar, elaborar o PRR, em validação, em tratamento, evento ocorreu, encerrado), com quem resolve cada risco e filtro por responsável. O gestor da coordenadoria delega a um cadastrador ou a si mesmo, com uma observação; a delegação vai para o histórico e gera um aviso | Todos menos o administrador; delega o gestor |
| Matriz | Matriz 5 × 5 com a distribuição por nível e a lista da célula escolhida | Todos |
| Pendências | O que depende do perfil: rascunhos e devoluções (cadastrador), validações (gestor), aprovações com custo e retorno (Alta Gestão de Riscos) | Todos, menos CGGE |
| Contexto | Fase 1 da coordenadoria; abre pelo botão Contexto na aba Riscos e é o primeiro passo do Novo risco | Todos; edita o cadastrador |
| Histórico | Linha do tempo de todas as alterações, com valor anterior e novo | Todos, filtrado pela coordenadoria |
| Alertas | Avisos do momento e avisos guardados | Todos |
| Relatório | Relatório da Alta Gestão de Riscos por período: semanal, mensal (o padrão), semestral ou anual, com setas para os períodos anteriores. Mostra o que aconteceu no período (riscos cadastrados, PRRs aprovados e devolvidos, investimento aprovado, medições, eventos e encerramentos, pelas datas guardadas em cada risco) e a situação de hoje. Lido na tela em Markdown e baixado em .md, .txt, CSV ou Excel | Gestor, Alta Gestão de Riscos e CGGE |
| Usuários | Cadastro de pessoas com o relatório de pedido (SEI ou pedido formal, número SEI, data e PDF), registro de pedido de quem já tem conta, busca por nome ou número SEI, download do PDF e do relatório de pedido (.md ou .txt), redefinição de senha, desativação, exclusão e cobertura de cada coordenadoria | Administrador |
| Coordenadorias | Criação das coordenadorias, edição do nome por extenso e remoção enquanto não têm pessoas, riscos nem contexto | Administrador |

Quem é de uma coordenadoria vê no cabeçalho a sigla em maiúsculas e o nome por extenso dela (por exemplo, "COSEGI · nome por extenso"). Os dois vêm do cadastro feito pelo administrador; nenhuma coordenadoria é fixa no código.

**Downloads.** Na tela, os textos longos (relatório anual e justificativa para o TCE) aparecem em Markdown formatado. O botão **Baixar** abre as opções de formato: Excel; CSV de riscos, por coordenadoria, por coordenadoria e faixa, de medições, do quadro e do histórico; e Markdown ou texto puro para o relatório e a justificativa. Os CSVs usam ";", vírgula decimal e acentos preservados, para abrir direto no Excel.

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
- **Sessão:** cookie `HttpOnly` com `SameSite=Strict`, válida por 8 horas.
- **Tentativas de login:** depois de 5 tentativas erradas, o usuário fica bloqueado por 5 minutos.
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
- **Banco:** um arquivo `./data/mira.db` (a pasta muda com `MIRA_DATA_DIR`). As tabelas são `users`, `sessions`, `risks` (cada risco em JSON), `audit`, `alerts` , `ctx` (contexto por coordenadoria), `units` (coordenadorias criadas) e `user_docs` (relatório de pedido de cada cadastro: tipo, documento, número SEI, data e o PDF quando houver, indexado pelo número SEI). O backup é a cópia desse arquivo.
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
- Faixas de nível, notas e percentuais precisam ser conferidos com o MGR oficial.
- Um único arquivo SQLite, pensado para uso interno em uma instalação; não há réplica nem acesso de fora da máquina.
- Testado no Chromium; outros navegadores e o build de produção ainda não foram testados (veja [testes.md](testes.md)).
