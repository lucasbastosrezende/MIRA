# Tabela de testes

Registro dos testes do MIRA em três rodadas: a rodada 1 sobre a interface redesenhada, a rodada 2 depois das melhorias que a rodada 1 apontou e a rodada 3 com o perfil de administrador (cadastro com PDF do SEI e coordenadorias criadas na hora).

## Como os testes foram feitos

| Camada | O que roda | Como rodar |
|---|---|---|
| API | `tests/api.test.js`: o fluxo inteiro pela API com um banco temporário | `npm run test:api` |
| Interface (smoke) | `tests/ui.smoke.mjs`: o código real da interface contra a API real, com um DOM mínimo, entrando com 5 perfis e abrindo todas as telas e as 5 fases de cada risco | `npm run test:ui` |
| Navegador (ponta a ponta) | Roteiro com Playwright no Chromium, clicando na interface real em um servidor `next dev` com banco temporário | Manual, seguindo a tabela abaixo |

`npm test` roda as duas primeiras camadas em sequência.

O roteiro de navegador cria, num banco temporário apagado ao final, só contas de teste: `altagestao1` (CSGR), `testeusuario` (cadastrador da Cosegi), `gestorteste` (gestor da Cosegi), `consultateste` (CGGE) e `testeduplo` (usada no teste de duplo envio). Nenhum dado de pessoa real ou fictícia é usado.

**Ambiente:** Windows 11, Node 24.16, Next.js 15.5, Chromium do Playwright, em 30/10/2026.

## Resultado geral

| Rodada | API | Interface (smoke) | Navegador | Situação |
|---|---|---|---|---|
| 1 · interface redesenhada | 44/44 | 32/32 | 31/31 | Sem defeito no sistema; 3 melhorias apontadas |
| 2 · depois das melhorias | 44/44 | 32/32 | 33/33 | Melhorias confirmadas; nada novo encontrado |
| 3 · perfil de administrador | 71/71 | 39/39 | 41/41 | Os cenários de pessoas passaram a ser do administrador; 7 cenários novos |

Na primeira execução da rodada 1, quatro cenários falharam por erro do próprio roteiro, não do sistema. Dois enviavam o formulário seguinte antes de o anterior terminar de salvar; um dependia de uma conta que, por isso, não foi criada; e um contava como erro de JavaScript os avisos de rede 429 e 422 que o próprio teste provoca. O roteiro foi corrigido e a rodada 1 foi refeita do zero, num banco limpo.

## Cenários no navegador

| # | Área | Cenário | Perfil | Rodada 1 | Rodada 2 |
|---|---|---|---|---|---|
| T01 | Acesso | Primeiro acesso cria a conta da CSGR e abre o painel Alta Gestão | Sem conta | ✅ | ✅ |
| T02 | Pessoas | CSGR cadastra cadastrador, gestor e consulta pela tela Usuários | CSGR | ✅ | ✅ |
| T03 | Pessoas | Segundo gestor na mesma coordenadoria é recusado com mensagem clara | CSGR | ✅ | ✅ |
| T32 | Gravação | Segundo envio durante uma gravação avisa para aguardar e não duplica o cadastro | CSGR | — | ✅ |
| T04 | Pessoas | Cobertura mostra a Cosegi completa e as demais coordenadorias em atenção | CSGR | ✅ | ✅ |
| T05 | Acesso | Senha errada mostra "Usuário ou senha incorretos" | Qualquer | ✅ | ✅ |
| T06 | Acesso | Seis tentativas erradas seguidas bloqueiam o usuário por alguns minutos | Qualquer | ✅ | ✅ |
| T07 | Contexto | Escopo salvo e marco incluído; a data aparece no dia certo | Cadastrador | ✅ | ✅ |
| T08 | Identificação | Evento que descreve algo que já acontece recebe o aviso "é um problema, não um risco" | Cadastrador | ✅ | ✅ |
| T09 | Identificação | Pré-visualização do MGR acompanha o texto digitado e o risco é cadastrado | Cadastrador | ✅ | ✅ |
| T10 | Avaliação | Probabilidade 4 e impacto 5 mostram Extremo · 20 e salvam com a exposição | Cadastrador | ✅ | ✅ |
| T11 | PRR | Enviar o PRR incompleto lista o que falta | Cadastrador | ✅ | ✅ |
| T12 | PRR | Resumo ao vivo recalcula (retorno 20,4×) e avisa limites fora de ordem | Cadastrador | ✅ | ✅ |
| T13 | PRR | PRR completo é enviado ao gestor | Cadastrador | ✅ | ✅ |
| T14 | Aprovação | Gestor vê a pendência; devolver sem motivo é recusado | Gestor | ✅ | ✅ |
| T15 | Aprovação | Gestor devolve com motivo e o cadastrador vê o motivo no topo do PRR | Gestor e cadastrador | ✅ | ✅ |
| T16 | Aprovação | Gestor valida e encaminha à CSGR | Gestor | ✅ | ✅ |
| T17 | Aprovação | CSGR vê custo e retorno no cartão de decisão e aprova | CSGR | ✅ | ✅ |
| T18 | Monitoramento | Medição acima do crítico aparece no gráfico como crítica | Cadastrador | ✅ | ✅ |
| T19 | Monitoramento | Reavaliar o nível exige motivo e atualiza o cabeçalho (20 → 10) | Cadastrador | ✅ | ✅ |
| T20 | Painel Operacional | Indicadores e fila de ação mostram a métrica crítica e o prazo próximo, com a data certa | Cadastrador | ✅ | ✅ |
| T21 | Painel Operacional | Clicar numa célula do mapa filtra a lista; clicar de novo limpa | Cadastrador | ✅ | ✅ |
| T22 | Painel Alta Gestão | Exposição esperada e justificativa de despesa para o TCE | CSGR | ✅ | ✅ |
| T33 | Alertas | Aviso de métrica crítica aparece com o tom crítico (ícone vermelho) | Cadastrador | — | ✅ |
| T23 | Alertas | Alertas separam "exigem ação" e "avisos"; marcar como lidos some com o botão | Cadastrador | ✅ | ✅ |
| T24 | Histórico | Histórico sem códigos internos (`ag_gestor`, `em_tratamento`...) | CSGR | ✅ | ✅ |
| T25 | Relatório | Relatório anual gera o texto e baixa o .txt | CSGR | ✅ | ✅ |
| T26 | Riscos | Exportar CSV baixa a planilha com cabeçalho | CSGR | ✅ | ✅ |
| T27 | Permissões | CGGE só consulta: sem Novo risco, sem Pendências e sem botões de edição | CGGE | ✅ | ✅ |
| T28 | Encerramento | Gestor encerra o risco e ele sai dos riscos ativos | Gestor | ✅ | ✅ |
| T29 | Responsivo | Nenhuma tela tem rolagem horizontal em 390 px (CSGR e cadastrador, todas as telas e as 5 fases) | CSGR e cadastrador | ✅ | ✅ |
| T30 | Tema escuro | Todas as telas abrem no tema escuro sem erro | CSGR | ✅ | ✅ |
| T31 | Qualidade | Nenhum erro de JavaScript no console durante todo o roteiro | Todos | ✅ | ✅ |

## Rodada 3: perfil de administrador

Desde esta rodada, o roteiro cria a conta `adminteste` pelo comando `npm run admin` e é ela que cadastra as demais contas de teste, cada uma com um PDF de teste. As coordenadorias `Cosegi` e `Coinfra` são criadas pela tela. T01 a T04 e T32 passaram a ser feitos pelo administrador; os demais cenários seguem iguais e passaram.

| # | Área | Cenário | Perfil | Rodada 3 |
|---|---|---|---|---|
| T41 | Acesso | A tela de entrada só tem usuário e senha; um usuário que não existe é recusado | Sem conta | ✅ |
| T01 | Acesso | Administrador criado pelo comando de implantação entra e abre Usuários, sem painéis | Administrador | ✅ |
| T35 | Coordenadorias | O sistema começa sem coordenadorias; o administrador cria Cosegi e Coinfra e remove uma vazia | Administrador | ✅ |
| T02 | Pessoas | Administrador cadastra CSGR, cadastrador, gestor e consulta, cada um com o PDF do SEI | Administrador | ✅ |
| T36 | Pessoas | Arquivo que não é PDF é recusado, mesmo com nome .pdf | Administrador | ✅ |
| T37 | Pessoas | Administrador baixa o PDF do SEI de uma pessoa | Administrador | ✅ |
| T38 | Pessoas | A busca da lista acha a pessoa pelo número SEI | Administrador | ✅ |
| T39 | Permissões | CSGR não tem mais a tela Usuários e vê só as coordenadorias criadas | CSGR | ✅ |
| T40 | Administrador | Telas do administrador em 390 px e no tema escuro, sem rolagem lateral nem erro | Administrador | ✅ |

## O que as suítes automáticas cobrem

Os números abaixo são da rodada 2. Na rodada 3 a API passou a ter 71 verificações: não há rota que crie conta sem login; usuário inexistente ou fora do formato é recusado sem gravar nada no banco; um único administrador, criado pelo comando; coordenadorias criadas, repetidas, inválidas e removidas; cadastro sem PDF, com número SEI inválido, com arquivo que não é PDF e em coordenadoria inexistente é barrado; o PDF é baixado só pelo administrador; a CSGR não cadastra pessoas nem cria coordenadorias; o administrador não recebe riscos. A interface passou a ter 39 verificações, incluindo a entrada só com usuário e senha, a criação de coordenadoria e o cadastro com o PDF pela tela.

**API (`npm run test:api`, 44 verificações):** começa sem usuários; o primeiro acesso cria a CSGR e depois fica bloqueado; cadastro de pessoas e limite de um gestor por coordenadoria; senha errada; identificação incompleta barrada; CGGE não cadastra; uma coordenadoria não vê nem acessa por ID o risco de outra; avaliação; PRR vazio e limites incoerentes barrados; envio ao gestor; cadastrador e CSGR não aprovam fora da vez; devolução exige motivo; ciclo de devolução e reenvio; aprovação; medição crítica gera alerta; reavaliação registra histórico; auditoria guarda quem, quando, valor anterior e novo; contexto da coordenadoria; assistente de IA sem chave responde 503 com mensagem clara; marcar avisos como lidos; sem sessão não há acesso; POST sem o cabeçalho de segurança é barrado; logout encerra a sessão.

**Interface (`npm run test:ui`, 32 verificações):** tela de primeiro acesso; painéis vazios sem `NaN`; cadastro de pessoa pela tela; para CSGR, cadastrador, gestor, CGGE e um cadastrador de outra coordenadoria, abre todas as telas do menu, os dois painéis, a justificativa para o TCE e cada risco em todas as 5 fases, sem `undefined`, `NaN` nem erro de tela; medição registrada pela tela chega ao banco; senha errada mostra o aviso.

## Melhorias que saíram da rodada 1

| Achado | Melhoria | PR |
|---|---|---|
| Aviso de métrica crítica aparecia com o ícone azul de informação | Tom do aviso segue a gravidade (crítico, atenção, em dia, informativo) | #14 |
| Segundo envio durante uma gravação era ignorado sem aviso e a tela apagava o que estava digitado | Tela marcada como ocupada durante a gravação; novo envio avisa para aguardar | #14 |
| O botão de desenvolvimento do Next cobria o canto da tela nas demonstrações; faltava um comando único de testes | `devIndicators: false` e `npm test` | #15 |

## O que ainda não foi testado

- Assistente de IA com chave configurada: só o caso sem chave (resposta 503) está coberto.
- Envio real de e-mails: no protótipo os avisos são simulados e aparecem na aba Alertas.
- Navegadores além do Chromium (Firefox e Safari).
- Build de produção (`npm run build && npm start`): os testes rodaram no servidor de desenvolvimento.
- Uso simultâneo por várias pessoas e volume grande de riscos.
