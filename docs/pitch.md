# Pitch do MIRA

Roteiro para apresentar o projeto em cerca de 5 minutos: o que falar, o que mostrar na tela e como responder às perguntas mais prováveis.

## A mensagem em uma frase

> O MIRA leva cada coordenadoria pelas 5 fases do MGR sem planilha, com rastro de toda alteração, e mostra à alta gestão quanto cada risco custa e quanto cada real investido reduz da exposição.

## Estrutura (5 minutos)

| Tempo | Bloco | Ideia central |
|---|---|---|
| 0:00–0:40 | Problema | Risco registrado de formas diferentes, PRR aprovado fora do sistema, gestão sem visão de custo |
| 0:40–1:20 | Solução | Um fluxo único do MGR, do contexto ao monitoramento, com dois painéis |
| 1:20–3:50 | Demonstração | Cadastrar um risco ao vivo e mostrar os dois painéis |
| 3:50–4:30 | Diferenciais | Guia do MGR, aprovação com números, auditoria que não se apaga |
| 4:30–5:00 | Fechamento | O que muda para a SETIC e próximos passos |

## O que falar

**Problema (40 s).**
"Gerir risco de TIC no governo costuma ser uma planilha por coordenadoria. Cada pessoa descreve o risco de um jeito, muitas vezes descreve um problema que já está acontecendo, e o plano de resposta é aprovado por e-mail. Quando a alta gestão precisa decidir onde investir, não tem como comparar: quanto esse risco custa? Quanto o tratamento reduz?"

**Solução (40 s).**
"O MIRA conduz as 5 fases do MGR: contexto, identificação, avaliação, tratamento e monitoramento. O cadastrador escreve o risco guiado pelo formato do MGR; o gestor valida; a Alta Gestão de Riscos aprova; a métrica é acompanhada contra limites definidos. Tudo fica registrado: quem, quando e o que mudou. E os dados viram dois painéis, um para a TI agir e outro para a alta gestão decidir."

**Diferenciais (40 s).**
- "O formulário avisa na hora quando o texto descreve um problema e não um risco."
- "Quem aprova vê o custo, a redução de exposição e o retorno por real investido antes de clicar em aprovar."
- "O histórico não pode ser editado nem apagado: é a prestação de contas pronta. A justificativa de despesa para o TCE sai em um clique."
- "As permissões são conferidas no servidor: uma coordenadoria não vê os riscos da outra."

**Fechamento (30 s).**
"Com o MIRA, a SETIC sai da planilha para um processo único e auditável, e a alta gestão passa a priorizar investimento pelo que cada real devolve em redução de risco. Os próximos passos são o envio real dos e-mails e a validação das faixas e premissas com a tabela oficial do MGR."

## Demonstração (2 min 30 s)

Contas de demonstração: `criadordeusuario` (administrador), `altagestao1` (Alta Gestão de Riscos), `testeusuario` (cadastrador da Cosegi) e `supervisortesteusuario` (gestor da Cosegi). A senha é a definida na instalação de demonstração.

| # | Conta | O que fazer | O que dizer |
|---|---|---|---|
| 1 | — | Abrir a tela de entrada | "Esta é a porta de entrada, com as 5 fases do MGR." |
| 2 | `testeusuario` | Entrar e clicar em **Novo risco** | "O cadastrador registra o risco da própria coordenadoria." |
| 3 | `testeusuario` | No campo Evento, digitar algo que já acontece, por exemplo "o sistema já está fora do ar" | "Repare no aviso: isso é um problema, não um risco." |
| 4 | `testeusuario` | Reescrever como algo que pode acontecer e preencher os demais campos | "A frase do MGR se monta sozinha ao lado." |
| 5 | `testeusuario` | Avaliar com probabilidade 4 e impacto 5 e informar a exposição | "Nível 20, extremo, e a exposição em reais que a alta gestão vai usar." |
| 6 | `testeusuario` | No PRR, preencher ação, custo, métrica e limites; trocar o custo e ver o resumo mudar | "Enquanto preenche, o sistema mostra o risco residual, a redução e o retorno por real." |
| 7 | `testeusuario` | Enviar para o gestor | "O plano segue para validação, sem e-mail." |
| 8 | `altagestao1` | Entrar, abrir **Alta gestão** | "A alta gestão vê a exposição em reais e o que os planos reduzem." |
| 9 | `altagestao1` | Abrir **Histórico** | "Toda alteração fica aqui: quem, quando e o valor anterior." |
| 10 | `criadordeusuario` | Abrir **Usuários** | "O administrador vê quais coordenadorias ainda não indicaram as pessoas e o relatório de pedido de cada acesso." |

**A aprovação não aparece neste roteiro.** Validar o PRR é papel do gestor de riscos da coordenadoria. Para mostrar, entre os passos 7 e 8 entram: o `supervisortesteusuario` abre **Pendências** e valida o PRR; a Alta Gestão de Riscos abre **Pendências**, vê o cartão de decisão com custo, redução e retorno e aprova; o cadastrador registra uma medição e mostra o gráfico com as faixas.

### Antes de subir no palco

- [ ] `npm install` já feito; o servidor no ar (`npm run dev` ou `npm run build && npm start`) e a tela aberta.
- [ ] Banco começando do zero ou com os riscos que a equipe quer mostrar já cadastrados. Sem riscos, os painéis aparecem vazios: cadastre 2 ou 3 antes para o painel ter o que mostrar.
- [ ] Testar as duas contas no computador da apresentação.
- [ ] Zoom do navegador em 110% a 125% para a plateia ler.
- [ ] Sem internet, as fontes caem para as fontes do sistema e o assistente de IA não funciona; o resto funciona normalmente.
- [ ] Ter um risco já com PRR preenchido como plano B, caso o tempo aperte.

## Perguntas prováveis

| Pergunta | Resposta |
|---|---|
| Os dados vão para fora? | Não. O banco é um arquivo SQLite local e o servidor só escuta na própria máquina. Só o assistente de IA, que é opcional e desligado por padrão, chama uma API externa. |
| A IA treina com os nossos dados? | O MIRA não usa os dados para treinar nada. A restrição na API externa depende do contrato do fornecedor; por isso o assistente é opcional e o sistema funciona sem ele. |
| Dá para apagar um registro do histórico? | Não. A tabela de auditoria só recebe inserções e não existe rota para editar ou apagar. |
| Uma coordenadoria vê os riscos da outra? | Não. A regra é conferida no servidor: o navegador nem recebe os riscos de outra coordenadoria. |
| De onde vêm os valores em reais? | Da exposição financeira que a coordenadoria estima e da probabilidade convertida em percentual (5% a 85%). São premissas para comparar opções, não previsão de perda. |
| As faixas de nível são as oficiais? | São premissas configuradas no sistema (1–2 irrelevante até 20–25 extremo) e precisam ser conferidas com a tabela oficial do MGR. |
| E os e-mails? | No protótipo os avisos aparecem no sistema e o envio de e-mail é simulado. É o próximo passo. |
| Funciona no celular? | Sim. As telas foram testadas em 390 px de largura, em tema claro e escuro. |
| Como vocês testaram? | Testes automáticos da API e da interface, mais um roteiro de 33 cenários no navegador com todos os perfis. Está em `docs/testes.md`. |
| Quanto custa para rodar? | Roda em Node com SQLite, sem banco externo nem dependências pagas. O assistente de IA, se ligado, tem o custo da API usada. |

## O que não prometer

- Envio real de e-mails: ainda é simulado.
- Faixas e percentuais oficiais: dependem da validação com o MGR.
- Uso por muitas pessoas ao mesmo tempo e grandes volumes: não foram testados.
