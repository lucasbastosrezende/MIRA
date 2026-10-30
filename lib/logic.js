/*
 * Regras do MGR compartilhadas entre servidor (Node) e navegador.
 * O servidor usa estas funções para permitir ou recusar cada ação; o navegador usa as mesmas
 * para decidir o que mostrar. Mudar uma regra aqui muda os dois lados ao mesmo tempo.
 */
'use strict';
const factory = function () {
  // Um dia em milissegundos.
  const DAY = 864e5;
  // As coordenadorias não ficam fixas no código: o administrador cria cada uma na hora (tabela units).
  // Perfis de acesso e o nome exibido de cada um.
  const PAPEL = {
    admin: 'Administrador · implantação',
    cadastrador: 'Cadastrador(a)',
    gestor: 'Gestor(a) de riscos',
    // Alta Gestão de Riscos (antes chamada CSGR): aprova os PRRs, faz o relatório anual e vê todas as coordenadorias.
    altagestao: 'Alta Gestão de Riscos',
    cgge: 'CGGE · consulta',
  };
  // Nome das faixas de nível, da mais baixa (0) para a mais alta (4).
  const LV = ['Irrelevante', 'Baixo', 'Médio', 'Alto', 'Extremo'];
  // Faixas assumidas: 1-2 irrelevante, 3-5 baixo, 6-10 médio, 12-16 alto, 20-25 extremo. Conferir com o MGR oficial.
  const band = n => (n <= 2 ? 0 : n <= 5 ? 1 : n <= 10 ? 2 : n <= 16 ? 3 : 4);
  // Notas de probabilidade de 1 a 5: [nome, descrição]. Índice 0 = nota 1.
  const PROB = [
    ['Raro', 'Só em situações excepcionais; menos de 1 vez a cada 5 anos.'],
    ['Pouco provável', 'Pode ocorrer, mas há poucos indícios; cerca de 1 vez a cada 2–5 anos.'],
    ['Provável', 'Já ocorreu em casos parecidos; cerca de 1 vez por ano.'],
    ['Muito provável', 'Ocorre com frequência; várias vezes ao ano.'],
    ['Praticamente certo', 'Deve ocorrer nos próximos meses se nada for feito.'],
  ];
  // Notas de impacto de 1 a 5: [nome, descrição]. Índice 0 = nota 1.
  const IMPS = [
    ['Muito baixo', 'Efeito mínimo, absorvido na rotina da unidade.'],
    ['Baixo', 'Atraso ou retrabalho localizado, sem afetar o usuário final.'],
    ['Médio', 'Degrada um serviço por algumas horas ou dias; impacto interno relevante.'],
    ['Alto', 'Interrompe serviço importante ou expõe a SETIC a questionamento de órgãos de controle.'],
    ['Muito alto', 'Paralisa serviços essenciais, expõe dados pessoais ou gera sanções.'],
  ];
  // Probabilidade convertida em percentual, usada na exposição esperada (econ).
  // Premissa do sistema: conferir com a tabela oficial do MGR.
  const PPCT = { 1: 0.05, 2: 0.15, 3: 0.35, 4: 0.6, 5: 0.85 };
  // Formas de tratamento do risco e o que cada uma significa.
  const TRAT = {
    evitar: 'Eliminar a causa ou deixar de realizar a atividade que gera o risco.',
    transferir: 'Compartilhar o risco com terceiros (seguro, contrato, fornecedor).',
    mitigar: 'Reduzir a probabilidade e/ou o impacto com controles e ações.',
    aceitar: 'Conviver com o risco, monitorando e justificando a decisão.',
  };
  // Situações do risco: [nome exibido, tom da etiqueta].
  const STAT = {
    rascunho: ['Rascunho', ''],
    avaliado: ['Avaliado', 'info'],
    ag_gestor: ['Aguardando gestor', 'warn'],
    ag_altagestao: ['Aguardando Alta Gestão', 'warn'],
    devolvido: ['Devolvido', 'bad'],
    em_tratamento: ['Em tratamento', 'ok'],
    ocorrido: ['Evento ocorreu', 'bad'],
    encerrado: ['Encerrado', ''],
  };
  // As 5 fases do MGR: [nome, resumo].
  const PHASES = [
    ['Contexto', 'Escopo, responsáveis e cronograma'],
    ['Identificação', 'Causa, evento, impacto e objetivo'],
    ['Avaliação', 'Probabilidade × impacto'],
    ['Tratamento', 'Plano de Respostas (PRR)'],
    ['Monitoramento', 'Métrica, parâmetros e reavaliação'],
  ];
  // Nome legível de cada campo, usado na trilha de auditoria ("campo: de → para").
  const FL = {
    titulo: 'Título',
    causa: 'Causa',
    evento: 'Evento',
    impacto: 'Impacto',
    objetivo: 'Objetivo afetado',
    prob: 'Probabilidade',
    imp: 'Nota de impacto',
    exposicao: 'Exposição financeira (R$)',
    status: 'Situação',
    'prr.tratamento': 'Forma de tratamento',
    'prr.controles': 'Controles existentes',
    'prr.acao': 'Ação proposta',
    'prr.responsavel': 'Responsável',
    'prr.prazo': 'Prazo',
    'prr.custo': 'Custo estimado (R$)',
    'prr.metrica': 'Métrica',
    'prr.unidadeMetrica': 'Unidade da métrica',
    'prr.sentido': 'Sentido da métrica',
    'prr.critico': 'Parâmetro crítico',
    'prr.alerta': 'Parâmetro de alerta',
    'prr.ideal': 'Parâmetro ideal',
    'prr.probRes': 'Probabilidade residual',
    'prr.impRes': 'Impacto residual',
    escopo: 'Escopo',
  };
  // Campos do PRR que o cadastrador preenche (os demais, aprov e medicoes, são do sistema).
  const PRR_KEYS = [
    'tratamento',
    'controles',
    'acao',
    'responsavel',
    'prazo',
    'custo',
    'metrica',
    'unidadeMetrica',
    'sentido',
    'critico',
    'alerta',
    'ideal',
    'probRes',
    'impRes',
  ];
  // Lê um campo por caminho com ponto ("prr.custo").
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  // Grava um campo por caminho com ponto, criando os objetos intermediários.
  const setP = (o, p, v) => {
    const ks = p.split('.');
    let c = o;
    ks.slice(0, -1).forEach(k => {
      if (c[k] == null) c[k] = {};
      c = c[k];
    });
    c[ks[ks.length - 1]] = v;
  };
  // Nível do risco = probabilidade × impacto (1 a 25); 0 enquanto não foi avaliado.
  const nivel = r => (r.prob && r.imp ? r.prob * r.imp : 0);
  // Fase do MGR em que o risco está, pela situação.
  const curPhase = r =>
    ({
      rascunho: 2,
      avaliado: 4,
      ag_gestor: 4,
      ag_altagestao: 4,
      devolvido: 4,
      em_tratamento: 5,
      ocorrido: 5,
      encerrado: 5,
    })[r.status];
  // Última medição da métrica do PRR, ou null.
  const lastMed = r => {
    const m = r.prr && r.prr.medicoes;
    return m && m.length ? m[m.length - 1] : null;
  };
  // Estado da última medição: "critico", "alerta", "ok" ou "sem" (sem métrica, limites ou medição).
  // Menor é melhor: crítico se valor ≥ crítico; alerta se valor ≥ alerta; senão ideal.
  // Maior é melhor: crítico se valor ≤ crítico; alerta se valor ≤ alerta; senão ideal.
  // O valor "ideal" é a meta e não entra na classificação.
  function metricSt(r) {
    const p = r.prr,
      m = lastMed(r);
    if (
      !p ||
      !p.metrica ||
      m == null ||
      p.critico === '' ||
      p.alerta === '' ||
      p.critico == null ||
      p.alerta == null
    )
      return 'sem';
    const v = Number(m.valor),
      c = Number(p.critico),
      a = Number(p.alerta);
    if (p.sentido === 'menor') return v >= c ? 'critico' : v >= a ? 'alerta' : 'ok';
    return v <= c ? 'critico' : v <= a ? 'alerta' : 'ok';
  }
  // Números financeiros do risco:
  // - cur: exposição esperada hoje = percentual da probabilidade × exposição estimada;
  // - res: exposição depois do PRR = percentual da probabilidade residual × exposição × (impacto residual ÷ impacto);
  //   com "aceitar" não há redução;
  // - cost: custo do PRR; gain: redução (nunca negativa); ratio: redução ÷ custo (null sem custo).
  function econ(r) {
    const e = r.exposicao || 0,
      cur = (PPCT[r.prob] || 0) * e,
      p = r.prr;
    let res = cur;
    if (p && p.tratamento !== 'aceitar')
      res = (PPCT[p.probRes] || 0) * e * ((p.impRes || r.imp) / (r.imp || 1));
    const cost = p ? Number(p.custo) || 0 : 0,
      gain = Math.max(0, cur - res);
    return { cur, res, cost, gain, ratio: cost > 0 ? gain / cost : null };
  }
  // PRR em branco, criado quando o cadastrador começa o tratamento.
  const emptyPrr = () => ({
    tratamento: 'mitigar',
    controles: '',
    acao: '',
    responsavel: '',
    prazo: '',
    custo: 0,
    metrica: '',
    unidadeMetrica: '',
    sentido: 'menor',
    critico: '',
    alerta: '',
    ideal: '',
    probRes: 1,
    impRes: 1,
    aprov: [],
    medicoes: [],
  });
  // Permissões (usadas pelo servidor para valer e pelo navegador para mostrar/esconder botões)
  // Cadastrador ou gestor (supervisor) da coordenadoria edita o risco antes da validação.
  const canEdit = (u, r) =>
    (u.papel === 'cadastrador' || u.papel === 'gestor') &&
    u.unit === r.unit &&
    ['rascunho', 'avaliado', 'devolvido'].includes(r.status);
  // Cadastrador ou gestor da coordenadoria acompanha o tratamento depois da aprovação: registra medições,
  // reavalia, informa o evento, retoma o tratamento, reabre o PRR e conclui a ação.
  const canMon = (u, r) =>
    (u.papel === 'cadastrador' || u.papel === 'gestor') &&
    u.unit === r.unit &&
    ['em_tratamento', 'ocorrido'].includes(r.status);
  // Gestor da coordenadoria decide quando o PRR aguarda o gestor.
  const canGes = (u, r) => u.papel === 'gestor' && u.unit === r.unit && r.status === 'ag_gestor';
  // Gestor da coordenadoria delega quem vai resolver o risco (quadro), enquanto o risco não foi encerrado.
  const canDel = (u, r) => u.papel === 'gestor' && u.unit === r.unit && r.status !== 'encerrado';
  // Alta Gestão decide quando o PRR aguarda a Alta Gestão.
  const canAlta = (u, r) => u.papel === 'altagestao' && r.status === 'ag_altagestao';
  // Alta Gestão e CGGE veem todas as coordenadorias; cadastrador e gestor, só a sua.
  // O administrador não tem coordenadoria (unit nula), então não vê nenhum risco.
  const sameUnit = (u, unit) => u.papel === 'altagestao' || u.papel === 'cgge' || u.unit === unit;
  // Um aviso é visto por quem tem o perfil destinatário e, para cadastrador e gestor, só da própria coordenadoria.
  const visible = (u, a) => {
    if (!a.para.includes(u.papel)) return false;
    if (u.papel === 'cadastrador' || u.papel === 'gestor') return a.unit === u.unit;
    return true;
  };
  // Qualidade da descrição (regras locais, sem IA)
  const PROB_WORDS =
    /(^|[\s,;.])(está|estamos|estão|ocorreu|aconteceu|caiu|falhou|parou|já está|já ocorre|já acontece|atualmente|hoje|todo dia)(?=$|[\s,;.])/i;
  // Avisos de qualidade da identificação: [campo, mensagem]. Não bloqueiam o cadastro.
  function checkRisk(f) {
    const w = [];
    if (f.causa && f.causa.trim().length < 12)
      w.push(['causa', 'A causa está curta. Diga o que dá origem ao risco.']);
    if (f.evento && PROB_WORDS.test(f.evento))
      w.push([
        'evento',
        'O evento parece algo que já está acontecendo. Isso é um problema, não um risco. Descreva o que poderia acontecer.',
      ]);
    if (f.evento && /^(poderá|poderia|pode)(\s|$)/i.test(f.evento.trim()))
      w.push(['evento', 'Não precisa começar com "poderá ocorrer". O texto já entra nessa frase.']);
    if (f.causa && /^devido\b/i.test(f.causa.trim()))
      w.push(['causa', 'Tire o "Devido a". O texto já entra nessa frase.']);
    if (f.impacto && f.impacto.trim().length < 8)
      w.push(['impacto', 'Explique a consequência para a SETIC ou para o cidadão.']);
    if (f.objetivo && f.objetivo.trim().length < 8)
      w.push(['objetivo', 'Indique qual objetivo da SETIC fica comprometido.']);
    return w;
  }
  // Validação do PRR no envio. Recebe o objeto prr (campos simples).
  function prrErrors(p) {
    const e = [];
    if (!String(p.acao || '').trim())
      e.push(p.tratamento === 'aceitar' ? 'Explique por que o risco é aceito.' : 'Descreva a ação proposta.');
    if (!String(p.responsavel || '').trim()) e.push('Informe o responsável pela ação.');
    if (!p.prazo) e.push('Defina o prazo.');
    if (!String(p.metrica || '').trim()) e.push('Defina a métrica de acompanhamento.');
    if (!String(p.unidadeMetrica || '').trim()) e.push('Informe a unidade da métrica.');
    const c = p.critico,
      a = p.alerta,
      i = p.ideal;
    if (c === '' || a === '' || i === '' || c == null || a == null || i == null)
      e.push('Preencha os três parâmetros: crítico, alerta e ideal.');
    else if (p.sentido === 'menor' ? !(i < a && a < c) : !(c < a && a < i))
      e.push(
        p.sentido === 'menor'
          ? 'Com "menor é melhor", use ideal < alerta < crítico.'
          : 'Com "maior é melhor", use crítico < alerta < ideal.',
      );
    return e;
  }
  return {
    DAY,
    PAPEL,
    LV,
    band,
    PROB,
    IMPS,
    PPCT,
    TRAT,
    STAT,
    PHASES,
    FL,
    PRR_KEYS,
    getP,
    setP,
    nivel,
    curPhase,
    lastMed,
    metricSt,
    econ,
    emptyPrr,
    canEdit,
    canMon,
    canGes,
    canAlta,
    canDel,
    sameUnit,
    visible,
    checkRisk,
    prrErrors,
  };
};
module.exports = factory();
