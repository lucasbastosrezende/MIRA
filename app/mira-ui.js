'use strict';
// Interface do MIRA (cliente). Monta a aplicação dentro do elemento recebido e fala com /api.
//
// Como ler este arquivo:
// - S guarda os dados que o servidor entregou (GET /api/state), já filtrados pelo perfil de quem entrou.
// - UI guarda o estado da tela (o que está aberto, filtros, rascunhos). Não vai ao servidor.
// - render() monta a tela inteira como HTML a partir de S e UI. Os eventos são tratados por delegação
//   no elemento raiz (onClick, onChange, onInput, onSubmit) e as ações dos botões passam por act()/doAct().
// - Toda gravação é uma chamada à API; o servidor (lib/service.js) confere de novo as permissões e grava
//   a auditoria. Esconder um botão aqui é só conveniência, não segurança.
// - Texto vindo de dados entra no HTML sempre por esc(). Datas sem hora passam por pd()/fd().
// - As regras do MGR (nível, faixas, econ, permissões) vêm de lib/logic.js, as mesmas usadas no servidor.

import MIRA from '../lib/logic.js';
import { xlsx } from './planilha.js';

export function mountMira(root) {
  /* ===== Núcleo: estado, utilidades e chamadas à API ===== */
  const {
    PAPEL,
    LV,
    band,
    PROB,
    IMPS,
    PPCT,
    TRAT,
    STAT,
    PHASES,
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
    visible,
    checkRisk,
  } = MIRA;
  // Um dia em milissegundos.
  const DAY = 864e5;
  // Escapa texto vindo de dados antes de entrar no HTML. Todo conteúdo digitado por usuários passa por aqui.
  const esc = s =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  // Data sem hora ("2026-12-15") vira meia-noite local; sem isso o fuso do Brasil mostra o dia anterior.
  const pd = s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(s + 'T00:00:00') : new Date(s));
  // Data para exibição (dd/mm/aaaa); "—" quando não há data.
  const fd = s => (s ? pd(s).toLocaleDateString('pt-BR') : '—');
  // Data e hora de um registro (auditoria, medições, avisos) para exibição.
  const fdt = s =>
    s
      ? new Date(s).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  // Valor em reais sem centavos (R$ 1.234).
  const brl = n =>
    (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  // Valor em reais digitado no formato brasileiro: "4.000.000", "4.000.000,50", "R$ 4000000" ou "4000000.5".
  // Ponto seguido de três algarismos é milhar; a vírgula é a casa decimal. Vazio ou fora do formato: NaN.
  // O campo numérico do navegador lia "4.000.000" como vazio e "4.000" como 4, e o valor caía.
  function parseBRL(v) {
    let t = String(v == null ? '' : v).replace(/R\$|\s/g, '');
    if (!t) return NaN;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }
  // Valor em reais para preencher um campo ("4.000.000" ou "85.000,5").
  const brlIn = v => (v || v === 0 ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '');
  // Como o valor digitado foi entendido, mostrado embaixo do campo.
  const brlLido = v => {
    if (!String(v || '').trim()) return '';
    const n = parseBRL(v);
    return Number.isFinite(n)
      ? 'Entendido como ' + n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '.'
      : 'Valor não entendido. Use, por exemplo, 4.000.000 ou 4.000.000,50.';
  };
  // Valor em reais abreviado para painéis (R$ 1,2 mi, R$ 300 mil).
  const brlc = n => {
    n = n || 0;
    const a = Math.abs(n);
    return a >= 1e6
      ? 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
      : a >= 1e3
        ? 'R$ ' + Math.round(n / 1e3).toLocaleString('pt-BR') + ' mil'
        : brl(n);
  };
  // Zera as horas de uma data, para contar dias inteiros.
  const dayOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Dias que faltam até a data (negativo = vencida); null sem data.
  const daysTo = s => (s ? Math.round((dayOf(pd(s)) - dayOf(new Date())) / DAY) : null);
  // Iniciais do nome para o avatar.
  const initials = n =>
    String(n || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(x => x[0])
      .join('')
      .toUpperCase();
  // Etiqueta do nível (número e faixa) com a cor da faixa.
  const lvc = n =>
    n
      ? '<span class="lv lv' + band(n) + '">' + LV[band(n)] + ' · ' + n + '</span>'
      : '<span class="st">Sem avaliação</span>';
  // Falso depois que a interface é desmontada; impede renderizar numa tela que já saiu.
  let alive = true;
  // Dados vindos do servidor (GET /api/state). O servidor já filtra pelo perfil: o navegador só recebe o que pode ver.
  let S = { me: null, risks: [], audit: [], alerts: [], ctx: {}, team: [], users: [], units: [] };
  // Estado da tela: o que está aberto, filtros, rascunhos e sinais de carregamento. Nunca é enviado ao servidor.
  const UI = {
    view: 'paineis',
    panel: 'op',
    rid: null,
    tab: 2,
    filt: { unit: '', nv: '', st: '', cell: null },
    ia: null,
    draft: null,
    warnAck: false,
    tce: null,
    ready: false,
    sampleOk: false,
    authErr: '',
    busy: false,
    ctxPeek: false,
  };
  // Pessoa com sessão aberta.
  const me = () => S.me;
  // Busca um risco pelo ID nos dados carregados.
  const rk = id => S.risks.find(r => r.id === id);
  // Riscos que o perfil pode ver.
  const scope = () => S.risks; // o servidor já entrega só o que o perfil pode ver
  // Siglas das coordenadorias que o perfil pode ver. Não há lista fixa: o administrador cria cada uma.
  const units = () => (S.units || []).map(x => x.sigla);
  // Coordenadoria pela sigla, nos dados que o servidor entregou ({ sigla, nome }), ou null.
  const unitOf = sigla => (S.units || []).find(x => x.sigla === sigla) || null;
  // Sigla em letras maiúsculas, para o cabeçalho ("Cosegi" vira "COSEGI").
  const siglaUp = sigla => String(sigla || '').toLocaleUpperCase('pt-BR');
  // Nome da coordenadoria de quem entrou, para o cabeçalho: sigla em maiúsculas e o nome por extenso
  // que o administrador cadastrou. Nada é fixo no código: tudo vem dos dados. Sem coordenadoria, ''.
  const unitLabel = sigla => {
    if (!sigla) return '';
    const x = unitOf(sigla);
    return siglaUp(sigla) + (x && x.nome ? ' · ' + x.nome : '');
  };
  // Nomes dos cadastradores de uma coordenadoria.
  const respOf = unit => S.team.filter(t => t.unit === unit && t.papel === 'cadastrador').map(t => t.nome);
  // Nome do gestor de riscos de uma coordenadoria.
  const gestorOf = unit => (S.team.find(t => t.unit === unit && t.papel === 'gestor') || {}).nome;
  // Avisos do momento, calculados a cada tela: prazo do PRR em até 15 dias ou vencido e métrica em alerta ou crítica.
  // Valem só para riscos em tratamento; a CGGE não recebe aviso de prazo.
  function derived(u) {
    const out = [];
    scope(u).forEach(r => {
      if (!['em_tratamento', 'ocorrido'].includes(r.status) || !r.prr) return;
      const d = daysTo(r.prr.prazo);
      if (d != null && r.prr.prazo && d <= 15 && u.papel !== 'cgge')
        out.push({
          k: 'prazo-' + r.id,
          tipo: 'prazo',
          riskId: r.id,
          crit: d < 0,
          msg:
            d < 0
              ? 'Prazo vencido há ' + -d + ' dia(s): ' + r.titulo
              : d === 0
                ? 'Prazo da ação vence hoje: ' + r.titulo
                : 'Prazo da ação em ' + d + ' dia(s): ' + r.titulo,
        });
      const ms = metricSt(r);
      if (ms === 'alerta' || ms === 'critico')
        out.push({
          k: 'met-' + r.id,
          tipo: 'metrica',
          riskId: r.id,
          crit: ms === 'critico',
          msg:
            'Métrica "' +
            r.prr.metrica +
            '" em ' +
            (ms === 'critico' ? 'nível crítico' : 'alerta') +
            ' (' +
            lastMed(r).valor +
            ' ' +
            r.prr.unidadeMetrica +
            '): ' +
            r.titulo,
        });
    });
    return out;
  }
  // Quantidade de avisos guardados que a pessoa ainda não leu.
  const unreadCount = u => S.alerts.filter(a => !a.lido[u.id]).length + derived(u).length;
  // Palavras de um texto, sem acento e sem palavras curtas, para comparar riscos.
  const tok = s =>
    new Set(
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(x => x.length > 3),
    );
  // Riscos parecidos com o que está sendo escrito: proporção de palavras em comum (mínimo 30%).
  // Devolve até 3, do mais parecido para o menos parecido.
  function similar(f, exceptId) {
    const a = tok([f.causa, f.evento, f.impacto, f.titulo].join(' '));
    if (a.size < 3) return [];
    return S.risks
      .filter(r => r.id !== exceptId)
      .map(r => {
        const b = tok([r.causa, r.evento, r.impacto, r.titulo].join(' '));
        let i = 0;
        a.forEach(x => {
          if (b.has(x)) i++;
        });
        return { r, s: i / Math.max(1, Math.min(a.size, b.size)) };
      })
      .filter(x => x.s >= 0.3)
      .sort((x, y) => y.s - x.s)
      .slice(0, 3);
  }
  // Chamada à API do MIRA. Envia o cabeçalho x-requested-with exigido pelo servidor e lança erro com a mensagem dele.
  async function api(method, path, body) {
    const res = await fetch('/api/' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'mira' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = {};
    try {
      j = await res.json();
    } catch (e) {
      /* resposta sem corpo */
    }
    if (!res.ok) {
      if (res.status === 401 && S.me && path !== 'login') {
        S = { me: null, risks: [], audit: [], alerts: [], ctx: {}, team: [], users: [], units: [] };
        render();
      }
      const e = new Error(j.error || 'Não foi possível concluir a ação.');
      e.status = res.status;
      e.data = j;
      throw e;
    }
    return j;
  }
  // Recarrega todos os dados do servidor.
  async function load() {
    S = await api('GET', 'state');
    UI.loadedAt = Date.now();
  }

  /* ===== Componentes de tela ===== */
  const stChip = r => {
    const s = STAT[r.status];
    return '<span class="st ' + s[1] + '">' + s[0] + '</span>';
  };
  // Etiqueta do estado da última medição da métrica.
  const metChip = r => {
    const m = metricSt(r);
    return m === 'ok'
      ? '<span class="st ok">Ideal</span>'
      : m === 'alerta'
        ? '<span class="st warn">Alerta</span>'
        : m === 'critico'
          ? '<span class="st bad">Crítico</span>'
          : '<span class="muted">—</span>';
  };
  // Célula do prazo do PRR na lista, com aviso quando está perto de vencer ou vencido.
  const prazoCell = r => {
    if (!r.prr || !r.prr.prazo) return '<span class="muted">—</span>';
    const d = daysTo(r.prr.prazo);
    const t =
      ['em_tratamento', 'ocorrido'].includes(r.status) && d <= 15
        ? d < 0
          ? ' <span class="st bad">vencido</span>'
          : ' <span class="st warn">' + d + ' d</span>'
        : '';
    return fd(r.prr.prazo) + t;
  };
  // Matriz 5 × 5 de probabilidade × impacto da tela Matriz; cada célula lista os riscos dela.
  function matrix(mode, counts, sel) {
    let h = '<div class="matrix"><div class="ax"></div>';
    h = '<div class="matrix">';
    for (let i = 5; i >= 1; i--) {
      h += '<div class="ax">' + i + '<br>' + IMPS[i - 1][0] + '</div>';
      for (let p = 1; p <= 5; p++) {
        const n = p * i,
          b = band(n),
          c = counts ? counts[p + '-' + i] || 0 : 0;
        const isSel =
          mode === 'score' ? sel && sel.p === p && sel.i === i : sel && sel.p === p && sel.i === i;
        let inner;
        if (mode === 'count')
          inner = c ? '<b>' + c + '</b><small>nível ' + n + '</small>' : '<small>' + n + '</small>';
        else inner = '<b>' + n + '</b>';
        h +=
          '<div class="cell' +
          (isSel ? ' sel' : '') +
          '" style="background:var(--l' +
          b +
          ');color:var(--f' +
          b +
          ')"' +
          (mode === 'count' && c ? ' data-cell="' + p + '-' + i + '"' : '') +
          ' title="Probabilidade ' +
          p +
          ' × impacto ' +
          i +
          ' = ' +
          n +
          ' (' +
          LV[b] +
          ')">' +
          inner +
          '</div>';
      }
    }
    h += '<div class="ax"></div>';
    for (let p = 1; p <= 5; p++) h += '<div class="ax">' + p + '<br>' + PROB[p - 1][0] + '</div>';
    return (
      h +
      '</div><p class="hint" style="text-align:center">Impacto (vertical) × probabilidade (horizontal)</p>'
    );
  }
  // Aplica os filtros da lista de riscos (coordenadoria, faixa, situação e célula do mapa).
  function filtered(list) {
    const f = UI.filt;
    return list.filter(
      r =>
        (!f.unit || r.unit === f.unit) &&
        (f.nv === '' || (nivel(r) && band(nivel(r)) === Number(f.nv))) &&
        (!f.st || r.status === f.st) &&
        (!f.cell || (r.prob === f.cell.p && r.imp === f.cell.i)),
    );
  }
  // Barra de filtros da lista de riscos.
  function filterBar(u) {
    const uopt =
      u.papel === 'altagestao' || u.papel === 'cgge'
        ? '<select data-filter="unit" aria-label="Coordenadoria"><option value="">Todas as coordenadorias</option>' +
          units()
            .map(x => '<option' + (UI.filt.unit === x ? ' selected' : '') + '>' + esc(x) + '</option>')
            .join('') +
          '</select>'
        : '';
    return (
      '<div class="row" style="align-items:center">' +
      uopt +
      '<select data-filter="nv" aria-label="Nível"><option value="">Todos os níveis</option>' +
      LV.map(
        (l, i) =>
          '<option value="' +
          i +
          '"' +
          (String(UI.filt.nv) === String(i) ? ' selected' : '') +
          '>' +
          l +
          '</option>',
      ).join('') +
      '</select><select data-filter="st" aria-label="Situação"><option value="">Todas as situações</option>' +
      Object.keys(STAT)
        .map(
          k =>
            '<option value="' +
            k +
            '"' +
            (UI.filt.st === k ? ' selected' : '') +
            '>' +
            STAT[k][0] +
            '</option>',
        )
        .join('') +
      '</select>' +
      (UI.filt.cell
        ? '<span class="st info">Célula ' + UI.filt.cell.p + '×' + UI.filt.cell.i + '</span>'
        : '') +
      (UI.filt.unit || UI.filt.nv !== '' || UI.filt.st || UI.filt.cell
        ? '<button class="btn sm" data-act="clearfilt">Limpar filtros</button>'
        : '') +
      '</div>'
    );
  }
  // Fase atual do risco (1 a 5) em forma de trilha, com dica do nome da fase.
  const phaseCell = r => {
    const c = curPhase(r),
      done = r.status === 'encerrado';
    return (
      '<div class="ph" data-tip="' +
      esc('Fase ' + c + ' de 5 · ' + PHASES[c - 1][0] + ': ' + PHASES[c - 1][1]) +
      '"><span class="ph-bar">' +
      [1, 2, 3, 4, 5]
        .map(k => '<i class="' + (k < c || done ? 'on' : k === c ? 'cur' : '') + '"></i>')
        .join('') +
      '</span><span class="small">' +
      PHASES[c - 1][0] +
      '</span></div>'
    );
  };
  // Tabela de riscos usada no painel Operacional e na tela Riscos.
  function tableRisks(list) {
    if (!list.length) return '<div class="empty">Nenhum risco com esses filtros.</div>';
    const rows = list
      .slice()
      .sort((a, b) => nivel(b) - nivel(a))
      .map(
        r =>
          '<tr class="click" data-open="' +
          r.id +
          '"><td class="mono">' +
          r.id +
          '</td><td><b>' +
          esc(r.titulo) +
          '</b><div class="muted small">' +
          r.unit +
          ' · ' +
          esc(r.criadoPor) +
          '</div></td><td>' +
          lvc(nivel(r)) +
          '</td><td>' +
          phaseCell(r) +
          '</td><td>' +
          stChip(r) +
          '</td><td>' +
          metChip(r) +
          '</td><td>' +
          prazoCell(r) +
          '</td></tr>',
      )
      .join('');
    return (
      '<div class="scroll"><table class="tbl"><thead><tr><th>ID</th><th>Risco</th><th>Nível</th><th>Fase</th><th>Situação</th><th>Métrica</th><th>Prazo da ação</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>'
    );
  }
  // O que depende da pessoa agora: rascunhos e devoluções (cadastrador), validações (gestor), aprovações (Alta Gestão).
  function pendingFor(u) {
    const l = scope(u);
    if (u.papel === 'cadastrador')
      return l
        .filter(r => ['devolvido', 'rascunho', 'avaliado'].includes(r.status))
        .map(r => ({
          r,
          txt:
            r.status === 'devolvido'
              ? 'PRR devolvido pela Alta Gestão de Riscos: ajustar e reenviar'
              : r.status === 'rascunho'
                ? 'Rascunho: complete a avaliação e o PRR'
                : 'Avaliado: falta elaborar o PRR',
          crit: r.status === 'devolvido',
        }));
    if (u.papel === 'gestor')
      return l
        .filter(r => r.status === 'ag_gestor')
        .map(r => ({ r, txt: 'PRR aguardando sua validação', crit: false }));
    if (u.papel === 'altagestao')
      return l
        .filter(r => r.status === 'ag_altagestao')
        .map(r => ({ r, txt: 'PRR aguardando aprovação da Alta Gestão de Riscos', crit: false }));
    return [];
  }
  /* ===== Painéis: peças comuns ===== */
  // Ícones de estado: a cor nunca aparece sozinha, sempre com ícone e texto.
  const ICO = {
    crit: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7"/><path class="k" d="M8 4.6v4.2M8 11.4v.1"/></svg>',
    warn: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.4 15.3 14.3H.7z"/><path class="k" d="M8 6.1v3.6M8 12.1v.1"/></svg>',
    ok: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7"/><path class="k" d="m4.9 8.2 2.1 2.1 4.2-4.4"/></svg>',
    info: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7"/><path class="k" d="M8 7.4v4M8 4.7v.1"/></svg>',
  };
  // Nome de cada tom, usado como texto alternativo do ícone.
  const TONE = { crit: 'Crítico', warn: 'Atenção', ok: 'Em dia', info: 'Ação' };
  // Número no formato brasileiro.
  const fnum = n => Number(n).toLocaleString('pt-BR');
  // Percentual inteiro de a sobre b, sem dividir por zero.
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  // Primeira letra maiúscula.
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // Retorno por real no formato "2,4×".
  const ratioTxt = x => x.toFixed(1).replace('.', ',') + '×';
  // Etiqueta de estado com ícone e texto (crítico, atenção, em dia, informativo).
  const toneTag = (t, txt) => '<span class="tone t-' + t + '">' + ICO[t] + (txt || TONE[t]) + '</span>';
  // Barra de magnitude dentro da tabela, com o valor na ponta.
  const inbar = (v, max) =>
    '<div class="inbar"><span class="inbar-t"><i style="width:' +
    pct(v, max) +
    '%"></i></span><span class="inbar-v">' +
    brlc(v) +
    '</span></div>';
  // Cabeçalho de cartão: título, apoio e ações à direita.
  const cardH = (title, sub, extra) =>
    '<div class="card-h"><div><h3>' +
    title +
    '</h3>' +
    (sub ? '<p>' + sub + '</p>' : '') +
    '</div>' +
    (extra || '') +
    '</div>';
  // Indicador do painel: rótulo, valor, rodapé e, se houver, estado e medidor.
  function tile(label, value, foot, tone, meter, toneTxt) {
    return (
      '<div class="tile"><div class="tile-h"><span>' +
      label +
      '</span>' +
      (tone ? toneTag(tone, toneTxt) : '') +
      '</div><b class="tile-v">' +
      value +
      '</b>' +
      (meter != null
        ? '<div class="meter t-' + (tone || 'info') + '"><i style="width:' + meter + '%"></i></div>'
        : '') +
      '<span class="tile-f">' +
      foot +
      '</span></div>'
    );
  }
  // Cabeçalho padrão de página: sobretítulo, título, apoio e ações à direita.
  const pageHead = (t, sub, act, eye) =>
    '<div class="dash-head"><div class="dash-title">' +
    (eye ? '<span class="eyebrow">' + eye + '</span>' : '') +
    '<h2>' +
    t +
    '</h2>' +
    (sub ? '<p class="muted">' + sub + '</p>' : '') +
    '</div>' +
    (act ? '<div class="dash-tools">' + act + '</div>' : '') +
    '</div>';
  // Cabeçalho dos painéis, com exportação e a troca entre Operacional e Alta Gestão.
  function panelHead(u) {
    const op = UI.panel === 'op',
      when = UI.loadedAt
        ? new Date(UI.loadedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
    return pageHead(
      op ? 'Painel Operacional' : 'Painel Alta Gestão',
      op ? 'O que exige ação agora.' : 'Quanto os riscos custam e quanto os tratamentos reduzem.',
      (when ? '<span class="small muted">Dados de ' + when + '</span>' : '') +
        dlMenu(DL_RISCOS, true) +
        '<div class="seg" role="group" aria-label="Escolher painel"><button data-panel="op" aria-pressed="' +
        op +
        '">Operacional · TI</button><button data-panel="alta" aria-pressed="' +
        !op +
        '">Alta gestão</button></div>',
      u.unit ? 'Coordenadoria ' + u.unit : 'SETIC · todas as coordenadorias',
    );
  }
  /* ===== Painel Operacional (profissional de TI) ===== */
  function heat(counts, ids, sel) {
    let h =
      '<div class="heat" role="group" aria-label="Mapa de calor: impacto por probabilidade"><div class="heat-y" aria-hidden="true">Impacto</div><div class="heat-grid">';
    for (let i = 5; i >= 1; i--) {
      h += '<div class="hy"><b>' + i + '</b><span>' + IMPS[i - 1][0] + '</span></div>';
      for (let p = 1; p <= 5; p++) {
        const n = p * i,
          b = band(n),
          k = p + '-' + i,
          c = counts[k] || 0,
          on = !!(sel && sel.p === p && sel.i === i),
          st = 'style="--hb:var(--l' + b + ');--hf:var(--f' + b + ')"';
        const tip =
          'Probabilidade ' +
          p +
          ' (' +
          PROB[p - 1][0] +
          ') × impacto ' +
          i +
          ' (' +
          IMPS[i - 1][0] +
          ')\nNível ' +
          n +
          ' · ' +
          LV[b] +
          '\n' +
          (c
            ? c + (c > 1 ? ' riscos: ' : ' risco: ') + ids[k].map(r => r.id).join(', ')
            : 'Nenhum risco nesta célula');
        h += c
          ? '<button class="hc on' +
            (on ? ' sel' : '') +
            '" ' +
            st +
            ' data-cell="' +
            k +
            '" data-tip="' +
            esc(tip) +
            '" aria-pressed="' +
            on +
            '" aria-label="' +
            esc(tip.replace(/\n/g, '. ')) +
            '"><b>' +
            c +
            '</b><small>nível ' +
            n +
            '</small></button>'
          : '<div class="hc" ' + st + ' data-tip="' + esc(tip) + '"><small>' + n + '</small></div>';
      }
    }
    h += '<div></div>';
    for (let p = 1; p <= 5; p++)
      h += '<div class="hx"><b>' + p + '</b><span>' + PROB[p - 1][0] + '</span></div>';
    return (
      h +
      '</div><div class="heat-x" aria-hidden="true">Probabilidade</div></div>' +
      '<ul class="legend">' +
      LV.map(
        (l, i) =>
          '<li><i style="background:var(--l' +
          i +
          ')"></i>' +
          l +
          ' <span class="muted">' +
          ['1–2', '3–5', '6–10', '12–16', '20–25'][i] +
          '</span></li>',
      ).join('') +
      '</ul>'
    );
  }
  // Barra empilhada com a distribuição dos riscos por faixa de nível.
  function levelStack(aval, semAval) {
    const parts = [4, 3, 2, 1, 0].map(b => ({ b, n: aval.filter(r => band(nivel(r)) === b).length }));
    const bar = aval.length
      ? parts
          .filter(p => p.n)
          .map(
            p =>
              '<i style="flex:' +
              p.n +
              ';background:var(--s' +
              p.b +
              ')" data-tip="' +
              esc(
                LV[p.b] +
                  ': ' +
                  p.n +
                  ' de ' +
                  aval.length +
                  ' riscos avaliados (' +
                  pct(p.n, aval.length) +
                  '%)',
              ) +
              '"></i>',
          )
          .join('')
      : '<i style="flex:1;background:var(--surface2)"></i>';
    return (
      '<div class="stack">' +
      bar +
      '</div><ul class="legend">' +
      parts
        .map(p => '<li><i style="background:var(--s' + p.b + ')"></i>' + LV[p.b] + ' <b>' + p.n + '</b></li>')
        .join('') +
      (semAval ? '<li class="muted">Sem avaliação <b>' + semAval + '</b></li>' : '') +
      '</ul>'
    );
  }
  // Quantidade de riscos em cada etapa do fluxo do PRR; cada etapa filtra a lista.
  function flow(all) {
    const n = s => all.filter(r => r.status === s).length,
      main = ['rascunho', 'avaliado', 'ag_gestor', 'ag_altagestao', 'em_tratamento'],
      mx = Math.max(1, ...main.map(n));
    const pr = s => ' data-stfilt="' + s + '" aria-pressed="' + (UI.filt.st === s) + '"';
    return (
      '<div class="flow">' +
      main
        .map(
          (s, i) =>
            '<button class="fstep' +
            (UI.filt.st === s ? ' on' : '') +
            '"' +
            pr(s) +
            ' data-tip="' +
            esc(STAT[s][0] + ': ' + n(s) + ' risco(s). Clique para filtrar a lista.') +
            '"><span class="fstep-n">' +
            (i + 1) +
            '</span><b>' +
            n(s) +
            '</b><span>' +
            STAT[s][0] +
            '</span><i style="width:' +
            pct(n(s), mx) +
            '%"></i></button>',
        )
        .join('') +
      '</div>' +
      '<div class="flow-side"><span class="small muted">Fora do fluxo</span>' +
      ['devolvido', 'ocorrido', 'encerrado']
        .map(s => '<button class="chip"' + pr(s) + '>' + STAT[s][0] + ' <b>' + n(s) + '</b></button>')
        .join('') +
      '</div>'
    );
  }
  // Fila de ação do painel Operacional: pendências e avisos do momento, do mais grave para o menos grave.
  function actionQueue(u, list) {
    const items = pendingFor(u).map(p => ({
      r: p.r,
      kind: 'Pendência',
      tone: p.crit ? 'crit' : 'info',
      txt: p.txt,
    }));
    derived(u).forEach(d => {
      const r = rk(d.riskId);
      if (!r) return;
      if (d.tipo === 'prazo') {
        const dd = daysTo(r.prr.prazo);
        items.push({
          r,
          kind: 'Prazo',
          tone: d.crit ? 'crit' : 'warn',
          txt:
            dd < 0
              ? 'Prazo da ação vencido há ' + -dd + ' dia(s)'
              : dd === 0
                ? 'Prazo da ação vence hoje'
                : 'Prazo da ação vence em ' + dd + ' dia(s)',
        });
      } else
        items.push({
          r,
          kind: 'Métrica',
          tone: d.crit ? 'crit' : 'warn',
          txt:
            '"' +
            r.prr.metrica +
            '" em ' +
            (d.crit ? 'nível crítico' : 'alerta') +
            ': ' +
            fnum(lastMed(r).valor) +
            ' ' +
            r.prr.unidadeMetrica,
        });
    });
    const rank = { crit: 0, warn: 1, info: 2 };
    items.sort((a, b) => rank[a.tone] - rank[b.tone]);
    const shown = items.slice(0, 6),
      more = items.length - shown.length;
    const body = shown.length
      ? '<ul class="queue">' +
        shown
          .map(
            q =>
              '<li><button class="qi" data-open="' +
              q.r.id +
              '"><span class="qi-ico t-' +
              q.tone +
              '" title="' +
              TONE[q.tone] +
              '">' +
              ICO[q.tone] +
              '</span><span class="qi-b"><span class="qi-k">' +
              q.kind +
              ' · ' +
              q.r.id +
              ' · ' +
              q.r.unit +
              '</span><b>' +
              esc(q.r.titulo) +
              '</b><span class="qi-t">' +
              esc(q.txt) +
              '</span></span><span class="qi-go" aria-hidden="true">›</span></button></li>',
          )
          .join('') +
        '</ul>' +
        (more
          ? '<button class="btn sm link" data-nav="alertas">Ver mais ' +
            more +
            ' item(ns) em Alertas</button>'
          : '')
      : '<div class="empty">' + ICO.ok + '<p>Nada pendente agora.</p></div>';
    return (
      '<section class="card span-7">' +
      cardH(
        'Fila de ação',
        'Da mais grave para a menos grave.',
        '<span class="count">' + items.length + '</span>',
      ) +
      body +
      '</section>'
    );
  }
  // Linha de uma métrica fora do ideal: última medição sobre os limites e variação desde a anterior.
  function metricRow(r) {
    const p = r.prr,
      m = lastMed(r),
      ms = metricSt(r),
      v = Number(m.valor),
      c = Number(p.critico),
      a = Number(p.alerta),
      i = Number(p.ideal),
      menor = p.sentido === 'menor';
    // Eixo orientado de "pior" (esquerda) para "melhor" (direita), com as faixas nos limites reais do PRR.
    const worst = menor ? Math.max(v, c + (c - a)) : Math.min(v, c - (a - c)),
      best = menor ? Math.min(v, i) : Math.max(v, i),
      span = Math.abs(worst - best);
    const x = n => (span ? Math.max(0, Math.min(100, (Math.abs(n - worst) / span) * 100)) : 50),
      xc = x(c),
      xa = x(a),
      xv = Math.max(1.5, Math.min(98.5, x(v)));
    const meds = p.medicoes,
      prev = meds.length > 1 ? Number(meds[meds.length - 2].valor) : null,
      un = esc(p.unidadeMetrica);
    let trend = '';
    if (prev != null) {
      const d = v - prev,
        worse = menor ? d > 0 : d < 0;
      trend =
        d === 0
          ? '<span class="trend">Sem variação desde a medição anterior</span>'
          : '<span class="trend ' +
            (worse ? 't-crit' : 't-ok') +
            '">' +
            (d > 0 ? '▲ +' : '▼ ') +
            fnum(d) +
            ' ' +
            un +
            ' desde a medição anterior · ' +
            (worse ? 'piorou' : 'melhorou') +
            '</span>';
    }
    const sig = menor ? ['≥', '≥', '≤'] : ['≤', '≤', '≥'];
    return (
      '<div class="mrow"><div class="mrow-h"><div class="mrow-t"><b>' +
      esc(p.metrica) +
      '</b><span class="small muted">' +
      r.id +
      ' · ' +
      esc(r.titulo) +
      '</span></div><div class="mrow-v"><b>' +
      fnum(v) +
      ' <small>' +
      un +
      '</small></b>' +
      toneTag(ms === 'critico' ? 'crit' : 'warn', ms === 'critico' ? 'Crítico' : 'Alerta') +
      '</div></div>' +
      '<div class="mbar" data-tip="' +
      esc(
        'Última medição: ' +
          fnum(v) +
          ' ' +
          p.unidadeMetrica +
          ' em ' +
          fd(m.ts) +
          '\nCrítico ' +
          sig[0] +
          ' ' +
          fnum(c) +
          ' · alerta ' +
          sig[1] +
          ' ' +
          fnum(a) +
          ' · ideal ' +
          sig[2] +
          ' ' +
          fnum(i),
      ) +
      '">' +
      '<i class="z z-crit' +
      (ms === 'critico' ? ' act' : '') +
      '" style="left:0;width:' +
      xc +
      '%"></i><i class="z z-warn' +
      (ms === 'alerta' ? ' act' : '') +
      '" style="left:' +
      xc +
      '%;width:' +
      (xa - xc) +
      '%"></i><i class="z z-ok" style="left:' +
      xa +
      '%;right:0"></i><i class="mk" style="left:' +
      xv +
      '%"></i></div>' +
      '<div class="mscale small muted"><span>Crítico ' +
      sig[0] +
      ' ' +
      fnum(c) +
      '</span><span>Alerta ' +
      sig[1] +
      ' ' +
      fnum(a) +
      '</span><span>Ideal ' +
      sig[2] +
      ' ' +
      fnum(i) +
      '</span></div>' +
      trend +
      '</div>'
    );
  }
  // Painel Operacional (profissional de TI).
  function renderOp(u) {
    const all = scope(u),
      list = all.filter(r => r.status !== 'encerrado'),
      aval = list.filter(r => nivel(r));
    const counts = {},
      ids = {};
    aval.forEach(r => {
      const k = r.prob + '-' + r.imp;
      counts[k] = (counts[k] || 0) + 1;
      (ids[k] = ids[k] || []).push(r);
    });
    const alto = aval.filter(r => nivel(r) >= 12).length;
    const monit = list.filter(r => metricSt(r) !== 'sem'),
      crit = monit.filter(r => metricSt(r) === 'critico').length,
      fora = monit.filter(r => metricSt(r) === 'alerta').length + crit;
    const comPrazo = list.filter(
        r => ['em_tratamento', 'ocorrido'].includes(r.status) && r.prr && r.prr.prazo,
      ),
      prz = comPrazo.filter(r => daysTo(r.prr.prazo) <= 15),
      venc = prz.filter(r => daysTo(r.prr.prazo) < 0).length;
    const pend = pendingFor(u).length;
    const kpis =
      '<div class="tiles">' +
      tile(
        'Riscos ativos',
        list.length,
        (u.unit || 'Todas as coordenadorias') +
          (list.length - aval.length ? ' · ' + (list.length - aval.length) + ' sem avaliação' : ''),
      ) +
      tile(
        'Nível alto ou extremo',
        alto,
        alto
          ? alto + ' de ' + aval.length + ' avaliados · nível 12 ou mais'
          : 'Nenhum risco com nível 12 ou mais',
        alto ? 'crit' : 'ok',
        aval.length ? pct(alto, aval.length) : null,
      ) +
      tile(
        'Métricas em alerta',
        fora,
        monit.length
          ? fora + ' de ' + monit.length + ' monitoradas' + (crit ? ' · ' + crit + ' crítica(s)' : '')
          : 'Nenhuma métrica com medição ainda',
        crit ? 'crit' : fora ? 'warn' : 'ok',
        monit.length ? pct(fora, monit.length) : null,
      ) +
      tile(
        'Prazos em até 15 dias',
        prz.length,
        prz.length
          ? (venc ? venc + ' vencido(s) · ' : '') +
              prz.length +
              ' de ' +
              comPrazo.length +
              ' ações em andamento'
          : 'Nenhuma ação perto do prazo',
        venc ? 'crit' : prz.length ? 'warn' : 'ok',
        comPrazo.length ? pct(prz.length, comPrazo.length) : null,
      ) +
      tile(
        'Pendências com você',
        pend,
        pend
          ? PAPEL[u.papel] + ' · itens que dependem do seu perfil'
          : PAPEL[u.papel] + ' · nada aguardando você',
        pend ? 'info' : 'ok',
      ) +
      '</div>';
    const mon = monit
      .filter(r => metricSt(r) !== 'ok')
      .sort((a, b) => (metricSt(b) === 'critico') - (metricSt(a) === 'critico'));
    const mh = mon.length
      ? '<div class="mgrid">' + mon.map(metricRow).join('') + '</div>'
      : '<div class="empty">' + ICO.ok + '<p>Todas as métricas medidas estão dentro do ideal.</p></div>';
    const rows = filtered(UI.filt.st === 'encerrado' ? all : list);
    return (
      kpis +
      '<div class="dash">' +
      '<section class="card span-5">' +
      cardH('Mapa de riscos', 'Clique numa célula para filtrar a lista.') +
      heat(counts, ids, UI.filt.cell) +
      '</section>' +
      actionQueue(u, list) +
      '<section class="card span-12">' +
      cardH('Situação dos riscos', 'Por nível e por etapa do PRR. Clique para filtrar.') +
      '<div class="sit"><div><span class="eyebrow">Por nível</span>' +
      levelStack(aval, list.length - aval.length) +
      '</div><div><span class="eyebrow">Por etapa do PRR</span>' +
      flow(all) +
      '</div></div></section>' +
      '<section class="card span-12">' +
      cardH(
        'Métricas fora do ideal',
        'Última medição contra os limites.',
        '<span class="count">' + mon.length + '</span>',
      ) +
      mh +
      '</section>' +
      '<section class="card span-12">' +
      cardH(
        'Riscos',
        'Do nível mais alto para o mais baixo.',
        '<span class="count">' + rows.length + '</span>',
      ) +
      '<div class="table-tools">' +
      filterBar(u) +
      '</div>' +
      tableRisks(rows) +
      '</section></div>'
    );
  }
  /* ===== Painel Alta Gestão (decisão de custo e prestação de contas) ===== */
  function unitBars(E) {
    const U = units()
      .map(un => {
        const xs = E.filter(x => x.r.unit === un);
        return {
          un,
          n: xs.length,
          c: xs.reduce((a, x) => a + x.e.cur, 0),
          p: xs.reduce((a, x) => a + x.e.res, 0),
        };
      })
      .sort((a, b) => b.c - a.c || b.n - a.n);
    const mx = Math.max(1, ...U.map(x => Math.max(x.c, x.p))),
      w = v => 'width:calc((100% - 76px) * ' + (v / mx).toFixed(4) + ')';
    return (
      '<ul class="legend top"><li><i class="sw-now"></i>Hoje</li><li><i class="sw-after"></i>Após os PRRs</li></ul><div class="gbars">' +
      U.map(x =>
        x.n
          ? '<div class="gb" tabindex="0" data-tip="' +
            esc(
              x.un +
                ' · ' +
                x.n +
                ' risco(s) avaliado(s)\nHoje: ' +
                brl(x.c) +
                '\nApós os PRRs: ' +
                brl(x.p) +
                '\nRedução: ' +
                brl(x.c - x.p) +
                ' (' +
                pct(x.c - x.p, x.c) +
                '%)',
            ) +
            '"><span class="gb-l">' +
            x.un +
            '<small>' +
            x.n +
            ' risco(s)</small></span><div class="gb-bars"><div class="gb-b"><i class="now" style="' +
            w(x.c) +
            '"></i><em>' +
            brlc(x.c) +
            '</em></div><div class="gb-b"><i class="after" style="' +
            w(x.p) +
            '"></i><em>' +
            brlc(x.p) +
            '</em></div></div></div>'
          : '<div class="gb empty-row"><span class="gb-l">' +
            x.un +
            '<small>0 riscos</small></span><span class="small muted">Sem riscos avaliados</span></div>',
      ).join('') +
      '</div>'
    );
  }
  // PRRs aguardando decisão, ordenados pelo retorno por real investido.
  function prioList(pend) {
    const prio = pend.filter(x => x.e.cost > 0).sort((a, b) => (b.e.ratio || 0) - (a.e.ratio || 0)),
      mx = Math.max(1e-9, ...prio.map(x => x.e.ratio || 0));
    if (!prio.length)
      return '<div class="empty">' + ICO.ok + '<p>Nenhum PRR com custo aguardando decisão.</p></div>';
    return (
      '<ol class="rank">' +
      prio
        .map(
          (x, i) =>
            '<li><button class="rk" data-open="' +
            x.r.id +
            '"><span class="rk-n">' +
            (i + 1) +
            '</span><span class="rk-b"><b>' +
            esc(x.r.titulo) +
            '</b><span class="small muted">' +
            x.r.id +
            ' · ' +
            x.r.unit +
            ' · ' +
            STAT[x.r.status][0] +
            '</span><span class="rk-bar"><i style="width:' +
            pct(x.e.ratio || 0, mx) +
            '%"></i></span><span class="small muted">Custo <b>' +
            brlc(x.e.cost) +
            '</b> · redução <b>' +
            brlc(x.e.gain) +
            '</b></span></span><span class="rk-r"><b>' +
            (x.e.ratio != null ? ratioTxt(x.e.ratio) : '—') +
            '</b><small>retorno</small></span></button></li>',
        )
        .join('') +
      '</ol>'
    );
  }
  // Painel Alta Gestão. Exposição esperada = percentual da probabilidade × exposição estimada (econ em lib/logic.js).
  // Soma só riscos ativos e avaliados.
  function renderAlta(u) {
    const list = S.risks.filter(r => r.status !== 'encerrado' && r.prob && r.imp);
    const E = list.map(r => ({ r, e: econ(r) }));
    const tot = E.reduce((a, x) => a + x.e.cur, 0),
      res = E.reduce((a, x) => a + x.e.res, 0),
      red = tot - res,
      nPrr = E.filter(x => x.r.prr).length,
      cheio = list.reduce((a, r) => a + (r.exposicao || 0), 0);
    const aprov = E.filter(x => ['em_tratamento', 'ocorrido'].includes(x.r.status)),
      pend = E.filter(x => ['ag_gestor', 'ag_altagestao'].includes(x.r.status));
    const invA = aprov.reduce((a, x) => a + x.e.cost, 0),
      invP = pend.reduce((a, x) => a + x.e.cost, 0);
    const withC = E.filter(x => x.e.cost > 0),
      costC = withC.reduce((a, x) => a + x.e.cost, 0),
      bc = costC ? withC.reduce((a, x) => a + x.e.gain, 0) / costC : 0;
    const semPrr = list.filter(
      r => nivel(r) >= 12 && !['em_tratamento', 'ocorrido'].includes(r.status),
    ).length;
    const sum = !tot
      ? 'Ainda não há riscos avaliados com exposição financeira.'
      : (nPrr
          ? 'Se os ' +
            nPrr +
            ' planos de resposta registrados forem executados, a exposição esperada ' +
            (red >= 0 ? 'cai' : 'sobe') +
            ' de <b>' +
            brlc(tot) +
            '</b> para <b>' +
            brlc(res) +
            '</b>, ' +
            (red >= 0 ? 'uma redução' : 'um aumento') +
            ' de ' +
            pct(Math.abs(red), tot) +
            '%. '
          : 'Nenhum risco avaliado tem plano de resposta registrado ainda. ') +
        'O investimento aprovado soma <b>' +
        brlc(invA) +
        '</b>' +
        (invP ? ' e outros <b>' + brlc(invP) + '</b> aguardam decisão' : '') +
        '. ' +
        (withC.length
          ? 'Em média, cada real investido reduz ' +
            bc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) +
            ' de exposição. '
          : '') +
        (semPrr
          ? '<b>' + semPrr + ' risco(s) de nível alto ou extremo</b> ainda não têm tratamento aprovado.'
          : 'Todos os riscos de nível alto ou extremo têm tratamento aprovado.');
    const hero =
      '<section class="card hero span-12"><div class="hero-main"><span class="eyebrow">Exposição esperada hoje</span><b class="hero-v">' +
      brlc(tot) +
      '</b><span class="small muted">' +
      list.length +
      ' risco(s) avaliado(s)</span>' +
      (cheio
        ? '<span class="small muted" data-tip="' +
          esc(
            'Soma das exposições estimadas, sem aplicar a probabilidade: ' +
              brl(cheio) +
              '. A exposição esperada multiplica cada valor pelo percentual da probabilidade do risco (5% a 85%).',
          ) +
          '">Valor cheio, sem a probabilidade: <b>' +
          brlc(cheio) +
          '</b></span>'
        : '') +
      '</div>' +
      '<div class="hero-cmp" data-tip="' +
      esc(
        'Hoje: ' +
          brl(tot) +
          '\nApós os PRRs: ' +
          brl(res) +
          '\n' +
          (red >= 0 ? 'Redução: ' : 'Aumento: ') +
          brl(Math.abs(red)),
      ) +
      '"><div class="cmp"><span>Hoje</span><div class="cmp-t"><i class="now" style="width:' +
      pct(tot, Math.max(tot, res)) +
      '%"></i></div><b>' +
      brlc(tot) +
      '</b></div><div class="cmp"><span>Após os PRRs</span><div class="cmp-t"><i class="after" style="width:' +
      pct(res, Math.max(tot, res)) +
      '%"></i></div><b>' +
      brlc(res) +
      '</b></div>' +
      (red > 0
        ? '<p class="cmp-d">' +
          toneTag('ok', 'Redução de ' + brlc(red) + ' (' + pct(red, tot) + '%)') +
          '</p>'
        : '') +
      '</div>' +
      '<div class="hero-sum"><span class="eyebrow">Resumo para decisão</span><p>' +
      sum +
      '</p></div></section>';
    const kpis =
      '<div class="tiles">' +
      tile(
        'Investimento aprovado',
        brlc(invA),
        invP ? '+ ' + brlc(invP) + ' aguardando decisão' : 'Nada aguardando decisão',
      ) +
      tile(
        'Retorno por real investido',
        withC.length ? ratioTxt(bc) : '—',
        'Redução de exposição ÷ custo dos PRRs',
      ) +
      tile(
        'Alto/extremo sem tratamento aprovado',
        semPrr,
        semPrr ? 'Riscos sem resposta em andamento' : 'Todos com resposta em andamento',
        semPrr ? 'crit' : 'ok',
      ) +
      tile(
        'PRRs aguardando decisão',
        pend.length,
        pend.length ? 'Com o gestor ou com a Alta Gestão de Riscos' : 'Nenhum PRR em análise',
        pend.length ? 'info' : 'ok',
      ) +
      '</div>';
    const maxE = Math.max(1, ...E.map(x => x.e.cur)),
      top = E.slice()
        .sort((a, b) => b.e.cur - a.e.cur)
        .slice(0, 6);
    const th = top.length
      ? top
          .map(x => {
            const r = x.r;
            return (
              '<tr><td><b>' +
              esc(r.titulo) +
              '</b><div class="muted small">' +
              r.id +
              ' · ' +
              r.unit +
              '</div></td><td>' +
              lvc(nivel(r)) +
              '</td><td>' +
              inbar(x.e.cur, maxE) +
              '</td><td>' +
              (r.prr ? cap(r.prr.tratamento) : '<span class="muted">Sem PRR</span>') +
              '</td><td class="num">' +
              (x.e.cost ? brlc(x.e.cost) : '—') +
              '</td><td class="num">' +
              (x.e.gain ? brlc(x.e.gain) : '—') +
              '</td><td>' +
              stChip(r) +
              '</td><td class="num"><button class="btn sm" data-tce="' +
              r.id +
              '"' +
              (r.prr ? '' : ' disabled') +
              '>Justificativa</button></td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" class="muted">Nenhum risco avaliado ainda.</td></tr>';
    const redAll = Math.max(
      1,
      E.reduce((a, x) => a + x.e.gain, 0),
    );
    const forms = ['mitigar', 'evitar', 'transferir', 'aceitar']
      .map(f => {
        const xs = E.filter(x => x.r.prr && x.r.prr.tratamento === f),
          g = xs.reduce((a, x) => a + x.e.gain, 0);
        return (
          '<tr><td><b>' +
          cap(f) +
          '</b><div class="muted small">' +
          TRAT[f] +
          '</div></td><td class="num">' +
          xs.length +
          '</td><td class="num">' +
          brlc(xs.reduce((a, x) => a + x.e.cost, 0)) +
          '</td><td>' +
          inbar(g, redAll) +
          '</td></tr>'
        );
      })
      .join('');
    const tce =
      UI.tce && rk(UI.tce)
        ? '<section class="card span-12">' +
          cardH(
            'Justificativa de despesa · ' + UI.tce,
            'Pronto para a contratação e a prestação de contas.',
            '<div class="row"><button class="btn sm" data-act="copytce">Copiar Markdown</button>' +
              dlMenu(DL_TCE, true) +
              '<button class="btn sm" data-act="closetce">Fechar</button></div>',
          ) +
          '<div id="tcetext">' +
          mdHtml(tceMd(rk(UI.tce))) +
          '</div></section>'
        : '';
    return (
      '<div class="dash">' +
      hero +
      '</div>' +
      kpis +
      '<div class="dash">' +
      '<section class="card span-7">' +
      cardH('Exposição por coordenadoria', 'Hoje e depois dos PRRs.') +
      unitBars(E) +
      '</section>' +
      '<section class="card span-5">' +
      cardH(
        'Prioridade de investimento',
        'PRRs aguardando decisão, pelo retorno.',
        '<span class="count">' + pend.filter(x => x.e.cost > 0).length + '</span>',
      ) +
      prioList(pend) +
      '</section>' +
      '<section class="card span-12">' +
      cardH('Maiores exposições', 'Os seis riscos de maior exposição.') +
      '<div class="scroll"><table class="tbl"><thead><tr><th>Risco</th><th>Nível</th><th>Exposição esperada</th><th>Tratamento</th><th class="num">Custo</th><th class="num">Redução</th><th>Situação</th><th></th></tr></thead><tbody>' +
      th +
      '</tbody></table></div></section>' +
      tce +
      '<section class="card span-7">' +
      cardH('Respostas por forma de tratamento', 'PRRs, custo e redução por forma.') +
      '<div class="scroll"><table class="tbl"><thead><tr><th>Forma</th><th class="num">PRRs</th><th class="num">Custo</th><th>Redução</th></tr></thead><tbody>' +
      forms +
      '</tbody></table></div></section>' +
      '<section class="card span-5">' +
      cardH('Como ler estes números') +
      '<p class="small muted">Exposição esperada = probabilidade (%) × exposição estimada. Depois do PRR, valem as notas residuais. Serve para comparar, não prevê perdas.</p>' +
      '<table class="tbl compact"><thead><tr><th>Probabilidade</th><th class="num">Percentual</th></tr></thead><tbody>' +
      PROB.map(
        (x, i) =>
          '<tr><td>' +
          (i + 1) +
          ' · ' +
          x[0] +
          '</td><td class="num">' +
          Math.round(PPCT[i + 1] * 100) +
          '%</td></tr>',
      ).join('') +
      '</tbody></table></section></div>'
    );
  }
  // Justificativa de despesa de um risco em Markdown, para o processo de contratação e o TCE.
  // Na tela vira HTML (mdHtml); para baixar, sai em .md ou em texto puro (mdTxt).
  function tceMd(r) {
    const e = econ(r),
      p = r.prr || emptyPrr(),
      n = nivel(r),
      nr = (p.probRes || 1) * (p.impRes || 1);
    const ap = (p.aprov || [])
      .map(
        a =>
          '- ' +
          fd(a.ts) +
          ' · ' +
          mdc(a.por) +
          ' (' +
          PAPEL[a.papel] +
          '): ' +
          a.decisao +
          (a.motivo ? ' — ' + mdc(a.motivo) : ''),
      )
      .join('\n');
    return [
      '# Justificativa de despesa · gestão de riscos de TIC',
      '**Risco ' + r.id + ' · ' + mdc(r.unit) + ' · ' + mdc(r.titulo) + '**',
      '',
      '## Descrição',
      'Devido a ' +
        mdc(r.causa) +
        ', poderá ocorrer ' +
        mdc(r.evento) +
        ', levando a ' +
        mdc(r.impacto) +
        ', afetando ' +
        mdc(r.objetivo) +
        '.',
      '',
      '## Situação do risco',
      '- Nível ' + n + ' (' + LV[band(n)] + '): probabilidade ' + r.prob + ' × impacto ' + r.imp + '.',
      '- Exposição financeira estimada: ' + brl(r.exposicao) + '.',
      '- Exposição esperada: ' + brl(e.cur) + '.',
      '',
      '## Resposta adotada',
      '- Forma de tratamento: ' + cap(p.tratamento) + '. ' + mdc(p.acao),
      '- Custo estimado: ' + brl(e.cost) + '.',
      '- Responsável: ' + mdc(p.responsavel || '—') + '. Prazo: ' + fd(p.prazo) + '.',
      '- Risco residual esperado: nível ' +
        nr +
        ' (' +
        LV[band(nr)] +
        '). Exposição residual: ' +
        brl(e.res) +
        '.',
      '- Redução esperada: ' +
        brl(e.gain) +
        (e.ratio != null
          ? ' (' + e.ratio.toFixed(1).replace('.', ',') + ' reais de redução para cada real investido)'
          : '') +
        '.',
      '- Acompanhamento: ' +
        (p.metrica
          ? mdc(p.metrica) +
            ' (' +
            mdc(p.unidadeMetrica) +
            '), crítico ' +
            p.critico +
            ', alerta ' +
            p.alerta +
            ', ideal ' +
            p.ideal +
            '.'
          : 'métrica ainda não definida.'),
      '',
      '## Tramitação do PRR',
      ap || '- sem registros',
      '',
      'Premissas: probabilidades convertidas em 5%, 15%, 35%, 60% e 85%. Todas as alterações deste risco estão registradas no histórico do MIRA (quem, quando e o quê).',
    ].join('\n');
  }

  /* ===== Tela do risco: 5 fases ===== */
  const ph = s => (s && String(s).trim() ? esc(s) : '…');
  // Frase do MGR montada com o que foi digitado: Devido a… poderá ocorrer… levando a… afetando…
  const previewHTML = f =>
    'Devido a <mark>' +
    ph(f.causa) +
    '</mark>, poderá ocorrer <mark>' +
    ph(f.evento) +
    '</mark>, levando a <mark>' +
    ph(f.impacto) +
    '</mark>, afetando <mark>' +
    ph(f.objetivo) +
    '</mark>.';
  // Estado de um valor contra os limites do PRR, com a mesma regra de metricSt em lib/logic.js.
  const valSt = (p, v) => {
    v = Number(v);
    const c = Number(p.critico),
      a = Number(p.alerta);
    return p.sentido === 'menor'
      ? v >= c
        ? 'critico'
        : v >= a
          ? 'alerta'
          : 'ok'
      : v <= c
        ? 'critico'
        : v <= a
          ? 'alerta'
          : 'ok';
  };
  // Etiqueta do estado de uma medição (crítico, alerta, ideal).
  const stTone = s =>
    s === 'critico'
      ? toneTag('crit', 'Crítico')
      : s === 'alerta'
        ? toneTag('warn', 'Alerta')
        : toneTag('ok', 'Ideal');
  // Ícone de concluído usado nas etapas.
  const TICK =
    '<svg class="ico-t" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-6.5"/></svg>';
  // Hora e minuto de um registro.
  const fhm = s => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  // O histórico guarda valores brutos (ag_altagestao, 2026-12-15, 85000). Aqui viram o texto que a pessoa lê.
  const FMTV = {
    Situação: v => (STAT[v] || [v])[0],
    Prazo: fd,
    'Custo estimado (R$)': v => brl(Number(v)),
    'Exposição financeira (R$)': v => brl(Number(v)),
    'Forma de tratamento': v => cap(String(v)),
    'Sentido da métrica': v => (v === 'menor' ? 'menor é melhor' : 'maior é melhor'),
    Probabilidade: v => (PROB[v - 1] ? v + ' · ' + PROB[v - 1][0] : v),
    'Probabilidade residual': v => (PROB[v - 1] ? v + ' · ' + PROB[v - 1][0] : v),
    'Nota de impacto': v => (IMPS[v - 1] ? v + ' · ' + IMPS[v - 1][0] : v),
    'Impacto residual': v => (IMPS[v - 1] ? v + ' · ' + IMPS[v - 1][0] : v),
  };
  // Valor do histórico em texto legível (usa FMTV quando o campo é conhecido).
  const fmtV = (c, v) => (v === '' || v == null ? '' : FMTV[c] ? FMTV[c](v) : String(v));
  // Linha do tempo do histórico, agrupada por dia, com valor anterior e novo.
  function historyList(list, showRisk) {
    if (!list.length) return '<div class="empty">Sem registros.</div>';
    let day = '';
    const chg = c =>
      '<div class="small"><span class="muted">' +
      esc(c.campo) +
      ':</span> ' +
      (c.de !== '' && c.de != null ? '<span class="del">' + esc(fmtV(c.campo, c.de)) + '</span> ' : '') +
      '<span class="add">' +
      esc(c.para === '' || c.para == null ? '(vazio)' : fmtV(c.campo, c.para)) +
      '</span></div>';
    return (
      '<ul class="tl-list">' +
      list
        .map(a => {
          const d = fd(a.ts),
            head = d !== day ? '<li class="tl-day">' + (day = d) + '</li>' : '',
            ch = a.changes || [];
          return (
            head +
            '<li class="tl"><span class="tl-dot" aria-hidden="true"></span><div class="tl-b"><div class="tl-h"><span><b>' +
            esc(a.user) +
            '</b> <span class="muted">(' +
            PAPEL[a.role] +
            (a.unit ? ' · ' + a.unit : '') +
            ')</span> ' +
            esc(a.action) +
            (showRisk && a.riskId ? ' <a href="#" data-open="' + a.riskId + '">' + a.riskId + '</a>' : '') +
            '</span><span class="when">' +
            fhm(a.ts) +
            '</span></div>' +
            ch.slice(0, 4).map(chg).join('') +
            (ch.length > 4
              ? '<details class="more"><summary>+' +
                (ch.length - 4) +
                ' campo(s)</summary>' +
                ch.slice(4).map(chg).join('') +
                '</details>'
              : '') +
            (a.note ? '<div class="small muted">“' + esc(a.note) + '”</div>' : '') +
            '</div></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }
  // Gráfico de medições em HTML/CSS: os textos mantêm o tamanho em qualquer largura e só a linha é um SVG esticado.
  function chartHTML(r) {
    const p = r.prr,
      m = p.medicoes,
      un = esc(p.unidadeMetrica);
    if (!m.length) return '<div class="empty">Sem medições. Registre a primeira abaixo.</div>';
    const c = Number(p.critico),
      a = Number(p.alerta),
      id = Number(p.ideal),
      menor = p.sentido === 'menor',
      H = 200;
    const table =
      '<details class="tv"><summary>Ver como tabela</summary><div class="scroll"><table class="tbl compact"><thead><tr><th>#</th><th>Data</th><th class="num">Valor</th><th>Situação</th><th>Registrado por</th></tr></thead><tbody>' +
      m
        .map((q, i) => ({ q, i }))
        .reverse()
        .map(
          o =>
            '<tr><td>' +
            (o.i + 1) +
            '</td><td>' +
            fdt(o.q.ts) +
            '</td><td class="num">' +
            fnum(o.q.valor) +
            ' ' +
            un +
            '</td><td>' +
            stTone(valSt(p, o.q.valor)) +
            '</td><td>' +
            esc(o.q.por || '—') +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></div></details>';
    if (![c, a, id].every(Number.isFinite)) return table;
    const vals = m.map(q => Number(q.valor)).concat([c, a, id]);
    let lo = Math.min(...vals),
      hi = Math.max(...vals);
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const y = v => Math.round((1 - (Number(v) - lo) / (hi - lo)) * H * 10) / 10;
    const ts = m.map(q => new Date(q.ts).getTime()),
      span = ts[ts.length - 1] - ts[0],
      byTime = m.length > 1 && span >= 36 * 36e5;
    const x = i =>
      m.length === 1
        ? 50
        : Math.round((4 + 92 * (byTime ? (ts[i] - ts[0]) / span : i / (m.length - 1))) * 10) / 10;
    const yc = y(c),
      ya = y(a),
      Z = menor
        ? [
            ['crit', 0, yc],
            ['warn', yc, ya],
            ['ok', ya, H],
          ]
        : [
            ['ok', 0, ya],
            ['warn', ya, yc],
            ['crit', yc, H],
          ];
    const zones =
      '<div class="mzones">' +
      Z.map(
        z =>
          '<i class="mz mz-' +
          z[0] +
          '" style="top:' +
          z[1] +
          'px;height:' +
          Math.max(0, z[2] - z[1]) +
          'px"></i>',
      ).join('') +
      '</div>';
    // Rótulos dos limites na margem direita, sem sobreposição quando os valores são próximos.
    const L = [
        ['crit', 'Crítico', c],
        ['warn', 'Alerta', a],
        ['ok', 'Ideal', id],
      ]
        .map(t => ({ t: t[0], n: t[1], v: t[2], y: y(t[2]) }))
        .sort((u1, u2) => u1.y - u2.y),
      pos = L.map(l => Math.max(8, l.y));
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + 17);
    for (let i = pos.length - 1; i >= 0; i--) pos[i] = Math.min(pos[i], H - 8 - 17 * (pos.length - 1 - i));
    const lines = L.map(l => '<i class="mth t-' + l.t + '" style="top:' + l.y + 'px"></i>').join(''),
      labs = L.map(
        (l, i) =>
          '<span class="mlab" style="top:' +
          (pos[i] - 8) +
          'px"><i class="t-' +
          l.t +
          '"></i>' +
          l.n +
          ' <b>' +
          fnum(l.v) +
          '</b></span>',
      ).join('');
    const line =
      m.length > 1
        ? '<svg class="mline" viewBox="0 0 100 ' +
          H +
          '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' +
          m.map((q, i) => x(i) + ',' + y(q.valor)).join(' ') +
          '"/></svg>'
        : '';
    const dots = m
      .map((q, i) => {
        const tip =
          'Medição ' +
          (i + 1) +
          ' de ' +
          m.length +
          '\n' +
          fnum(q.valor) +
          ' ' +
          p.unidadeMetrica +
          ' · ' +
          { ok: 'Ideal', alerta: 'Alerta', critico: 'Crítico' }[valSt(p, q.valor)] +
          '\n' +
          fdt(q.ts) +
          (q.por ? ' · ' + q.por : '');
        return (
          '<button type="button" class="mp' +
          (i === m.length - 1 ? ' last' : '') +
          '" style="left:' +
          x(i) +
          '%;top:' +
          y(q.valor) +
          'px" data-tip="' +
          esc(tip) +
          '" aria-label="' +
          esc(tip.replace(/\n/g, '. ')) +
          '"></button>'
        );
      })
      .join('');
    const lm = m[m.length - 1],
      ly = y(lm.valor),
      val =
        '<span class="mval' +
        (ly < 30 ? ' below' : '') +
        '" style="left:' +
        x(m.length - 1) +
        '%;top:' +
        ly +
        'px">' +
        fnum(lm.valor) +
        ' ' +
        un +
        '</span>';
    const ax = m
      .map((q, i) =>
        (byTime || m.length > 10 ? i === 0 || i === m.length - 1 : true)
          ? '<span style="left:' +
            x(i) +
            '%">' +
            (byTime
              ? new Date(q.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
              : '#' + (i + 1)) +
            '</span>'
          : '',
      )
      .join('');
    return (
      '<div class="mchart" role="group" aria-label="Série de medições da métrica ' +
      esc(p.metrica) +
      '. Última: ' +
      fnum(lm.valor) +
      ' ' +
      un +
      '"><div class="mplot" style="height:' +
      H +
      'px">' +
      zones +
      lines +
      line +
      dots +
      val +
      labs +
      '</div><div class="maxis">' +
      ax +
      '</div></div>' +
      table
    );
  }
  // Campo só para leitura. Mostra o zero; "—" só quando não há valor.
  function roField(label, val, wide) {
    const has = val != null && String(val).trim() !== '';
    return (
      '<div class="kv' +
      (wide ? ' wide' : '') +
      '"><span class="kv-l">' +
      label +
      '</span><div class="kv-v">' +
      (has ? esc(val) : '<span class="muted">—</span>') +
      '</div></div>'
    );
  }
  // Resultado do assistente de IA para o risco aberto (avisos, sugestões e riscos parecidos).
  function iaBox(r) {
    const k = UI.rid;
    const ia = UI.ia && UI.ia[k];
    if (!ia) return '';
    return (
      '<div class="info-box" style="margin-top:10px"><b>Assistente de IA</b><div style="margin-top:4px">' +
      (ia.ehRisco === false
        ? '<div class="warn-box">Isto parece um problema, não um risco. ' + esc(ia.motivo || '') + '</div>'
        : '<div>' +
          esc(ia.motivo || 'Descrição reescrita no formato do MGR. Confira e ajuste os campos.') +
          '</div>') +
      '</div></div>'
    );
  }
  // Fase 1 dentro da tela do risco: contexto da coordenadoria, só leitura.
  function tabContexto(u, r) {
    const un = r ? r.unit : u.unit,
      c = S.ctx[un] || { escopo: '', marcos: [] },
      resp = respOf(un),
      ges = gestorOf(un);
    return (
      '<div class="card"><h3>Fase 1 · Contexto da ' +
      un +
      '</h3>' +
      roField('Escopo', c.escopo) +
      '<div class="field"><label>Responsáveis designados</label><div>' +
      (resp.length || ges
        ? resp.map(x => '<span class="st info">' + esc(x) + '</span>').join(' ') +
          (ges ? ' <span class="st info">' + esc(ges) + ' · gestor</span>' : '')
        : '<span class="muted">—</span>') +
      '</div></div><label>Cronograma de implementação</label>' +
      (c.marcos.length
        ? '<table class="tbl"><tbody>' +
          c.marcos
            .map(
              m =>
                '<tr><td>' +
                esc(m.marco) +
                '</td><td class="mono">' +
                fd(m.data) +
                '</td><td>' +
                (m.feito ? '<span class="st ok">Concluído</span>' : '<span class="st">Previsto</span>') +
                '</td></tr>',
            )
            .join('') +
          '</tbody></table>'
        : '<div class="muted">Nenhum marco cadastrado.</div>') +
      '<p style="margin-top:12px"><button class="btn" data-nav="contexto">Abrir contexto da coordenadoria</button></p></div>'
    );
  }
  // Contexto da coordenadoria à mão enquanto se escreve o risco, sem sair do formulário.
  function ctxPeek(un) {
    const c = S.ctx[un] || { escopo: '', marcos: [] },
      resp = respOf(un),
      ges = gestorOf(un);
    const prox = c.marcos
      .filter(m => !m.feito)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .slice(0, 3);
    const marco = m =>
      '<li><span>' +
      esc(m.marco) +
      '</span><span class="small muted">' +
      fd(m.data) +
      '</span>' +
      (daysTo(m.data) < 0 ? toneTag('warn', 'Atrasado') : toneTag('info', 'Previsto')) +
      '</li>';
    const pessoas = resp.concat(ges ? [ges + ' (gestor)'] : []);
    return (
      '<details class="ctx-peek"' +
      (UI.ctxPeek ? ' open' : '') +
      '><summary data-peek="1">' +
      ICO.info +
      '<span><b>Contexto da ' +
      un +
      '</b><small>Escopo, responsáveis e próximos marcos</small></span></summary><div class="ctx-peek-b">' +
      '<div><span class="eyebrow">Escopo</span>' +
      (c.escopo ? '<p>' + esc(c.escopo) + '</p>' : '<p class="muted">Escopo ainda não registrado.</p>') +
      '</div>' +
      '<div><span class="eyebrow">Responsáveis</span><p>' +
      (pessoas.length ? esc(pessoas.join(', ')) : '<span class="muted">Ninguém designado.</span>') +
      '</p></div>' +
      '<div><span class="eyebrow">Próximos marcos</span>' +
      (prox.length
        ? '<ul class="ctx-marcos">' + prox.map(marco).join('') + '</ul>'
        : '<p class="muted">Nenhum marco pendente.</p>') +
      '</div>' +
      '<p class="hint">Confira se o risco está dentro do escopo. Para editar, use a aba Contexto.</p></div></details>'
    );
  }
  // Fase 2 · Identificação: formulário guiado do MGR com pré-visualização ao lado.
  function tabIdent(u, r, isNew) {
    const ed = isNew ? u.papel === 'cadastrador' : canEdit(u, r);
    const f = UI.draft && UI.draft._rid === UI.rid ? UI.draft : isNew ? {} : r;
    const fld = (id, lab, hint, ex, rows) =>
      ed
        ? '<div class="field"><label for="f-' +
          id +
          '">' +
          lab +
          '</label><textarea id="f-' +
          id +
          '" rows="' +
          (rows || 2) +
          '" data-live="1" placeholder="Ex.: ' +
          esc(ex) +
          '">' +
          esc(f[id] || '') +
          '</textarea><div class="hint">' +
          hint +
          '</div><div id="w-' +
          id +
          '"></div></div>'
        : roField(lab, f[id], true);
    const ai =
      ed && UI.sampleOk
        ? '<div class="card flat" style="margin-bottom:14px;background:var(--surface2)"><h3>Descreva com suas palavras</h3><textarea id="ia-text" rows="3" placeholder="Escreva com suas palavras o que preocupa você. O assistente organiza no formato do MGR."></textarea><p style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="ia">Estruturar com IA</button><button class="btn" data-act="ia-review">Revisar o que já escrevi</button><span id="ia-status" class="small muted" aria-live="polite"></span></p><p class="hint">Reescreve no formato do MGR e sugere notas e ações. O MIRA não usa os dados para treinar modelos.</p>' +
          iaBox(r) +
          '</div>'
        : ed
          ? '<p class="hint" style="margin-bottom:12px">Assistente de IA indisponível. O formulário funciona normalmente.</p>'
          : '';
    const main =
      (ed
        ? '<div class="field"><label for="f-titulo">Título curto</label><input id="f-titulo" value="' +
          esc(f.titulo || '') +
          '" style="width:100%" data-live="1" placeholder="Ex.: Exploração de vulnerabilidades no Sistema X"></div>'
        : roField('Título', f.titulo, true)) +
      fld(
        'causa',
        'Causa — Devido a…',
        'O que dá origem ao risco. Uma situação que existe hoje.',
        'exploração de vulnerabilidades no Sistema X',
      ) +
      fld(
        'evento',
        'Evento — poderá ocorrer…',
        'O que pode acontecer no futuro. Se já está acontecendo, é problema e não risco.',
        'vazamento de dados pessoais',
      ) +
      fld('impacto', 'Impacto — levando a…', 'A consequência se o evento ocorrer.', 'sanções ao Estado') +
      fld(
        'objetivo',
        'Objetivo afetado — afetando…',
        'Qual objetivo da SETIC fica comprometido.',
        'a segurança dos sistemas da Setic',
      );
    const side =
      '<aside class="ident-side"><div class="side-card"><span class="eyebrow">Como o MGR lê esse risco</span><div class="preview" id="pv">' +
      previewHTML(f) +
      '</div><div id="sim"></div>' +
      (ed
        ? '<button class="btn primary" data-act="save-ident" style="width:100%;margin-top:14px">' +
          (isNew ? 'Cadastrar e avaliar' : 'Salvar identificação') +
          '</button>'
        : '') +
      '<div class="info-box callout" style="margin-top:12px">' +
      ICO.info +
      '<span>Risco é um evento <b>futuro e incerto</b>. Se já está acontecendo, é problema, não risco.</span></div></div></aside>';
    return (
      '<div class="card"><h3>Fase 2 · Identificação do risco</h3>' +
      (ed ? ctxPeek(isNew ? u.unit : r.unit) : '') +
      ai +
      '<div class="ident"><div class="ident-main">' +
      main +
      '</div>' +
      side +
      '</div></div>'
    );
  }
  // Resultado da avaliação: nível = probabilidade × impacto e a faixa correspondente.
  function avRes(p, i, r) {
    const n = p && i ? p * i : 0;
    return (
      (n
        ? '<p style="margin-bottom:8px">' + lvc(n) + '</p>'
        : '<p class="muted">Escolha a probabilidade e o impacto.</p>') +
      matrix('score', null, n ? { p, i } : null)
    );
  }
  // Conta da exposição esperada, explicada: valor cheio × percentual da probabilidade.
  // Mostra por que o valor diminui (o evento pode não acontecer) sem esconder o valor cheio.
  function expConta(p, e) {
    if (!p || !(e > 0)) return '';
    const pc = PPCT[p] || 0;
    return (
      '<div class="exp-conta"><span class="eyebrow">Exposição esperada</span><b>' +
      brl(pc * e) +
      '</b><span>' +
      brl(e) +
      ' (valor cheio) × ' +
      Math.round(pc * 100) +
      '% (probabilidade ' +
      p +
      ' · ' +
      PROB[p - 1][0] +
      ')</span><span class="hint">A probabilidade reduz o valor porque o evento pode não acontecer. Se acontecer, o custo é o valor cheio. Os painéis somam a exposição esperada para comparar riscos e mostram também o total cheio.</span></div>'
    );
  }
  // Fase 3 · Avaliação: notas de probabilidade e impacto e exposição financeira estimada.
  function tabAval(u, r) {
    const ed = canEdit(u, r),
      ia = UI.ia && UI.ia[r.id];
    const radios = (name, arr, val) =>
      '<div class="scale">' +
      arr
        .map(
          (x, k) =>
            '<label><input type="radio" name="' +
            name +
            '" value="' +
            (k + 1) +
            '"' +
            (val === k + 1 ? ' checked' : '') +
            (ed ? '' : ' disabled') +
            '><span><b>' +
            (k + 1) +
            '</b> · ' +
            x[0] +
            '<div class="small muted">' +
            x[1] +
            '</div></span></label>',
        )
        .join('') +
      '</div>';
    const sug =
      ed && ia && ia.probabilidade
        ? '<div class="info-box" style="margin-bottom:12px"><b>Sugestão da IA:</b> probabilidade ' +
          ia.probabilidade +
          ' (' +
          esc(ia.justificativaProbabilidade || '') +
          '); impacto ' +
          ia.impactoNota +
          ' (' +
          esc(ia.justificativaImpacto || '') +
          ') <button class="btn sm" data-act="ia-notas">Aplicar</button></div>'
        : '';
    return (
      '<div class="card"><h3>Fase 3 · Avaliação</h3>' +
      sug +
      '<div class="row"><div class="grow"><label>Probabilidade</label>' +
      radios('prob', PROB, r.prob) +
      '</div><div class="grow"><label>Impacto</label>' +
      radios('imp', IMPS, r.imp) +
      '</div><div class="grow" style="max-width:380px"><label>Nível = probabilidade × impacto</label><div id="av-res">' +
      avRes(r.prob, r.imp, r) +
      '</div><div class="field" style="margin-top:12px"><label for="f-exp">Exposição financeira estimada (R$)</label>' +
      (ed
        ? '<input id="f-exp" type="text" inputmode="decimal" data-brl placeholder="Ex.: 4.000.000" value="' +
          esc(brlIn(r.exposicao)) +
          '" style="width:100%"><div class="hint" id="f-exp-v">' +
          brlLido(brlIn(r.exposicao)) +
          '</div>'
        : '<div>' + brl(r.exposicao) + '</div>') +
      '<div class="hint">Quanto custaria se o evento ocorresse (valor cheio).</div></div>' +
      '<div id="exp-conta">' +
      expConta(r.prob, r.exposicao) +
      '</div>' +
      (ed
        ? '<button class="btn primary" data-act="save-aval" style="width:100%">Salvar avaliação</button>'
        : '') +
      '</div></div></div>'
    );
  }
  // Trilha de tramitação do PRR e, para quem decide neste momento, as ações.
  function prrTrail(r) {
    const p = r.prr;
    return p && p.aprov.length
      ? '<ul class="tl-list">' +
          p.aprov
            .map(
              a =>
                '<li class="tl"><span class="tl-dot" aria-hidden="true"></span><div class="tl-b"><div class="tl-h"><span><b>' +
                esc(a.por) +
                '</b> <span class="muted">(' +
                PAPEL[a.papel] +
                ')</span> ' +
                {
                  enviado: 'enviou para validação do gestor',
                  encaminhado: 'validou e encaminhou à Alta Gestão de Riscos',
                  aprovado: 'aprovou o PRR',
                  devolvido: 'devolveu o PRR',
                }[a.decisao] +
                '</span><span class="when">' +
                fdt(a.ts) +
                '</span></div>' +
                (a.motivo ? '<div class="small muted">“' + esc(a.motivo) + '”</div>' : '') +
                '</div></li>',
            )
            .join('') +
          '</ul>'
      : '<p class="muted">O PRR ainda não foi enviado.</p>';
  }
  // Botões de decisão do PRR para quem decide agora: gestor (validar ou devolver) e Alta Gestão (aprovar ou devolver).
  function prrActions(u, r) {
    const mot =
      '<div class="field"><label for="ap-motivo">Observação (obrigatória para devolver)</label><textarea id="ap-motivo" rows="3"></textarea></div>';
    if (canGes(u, r))
      return (
        mot +
        '<div class="actions"><button class="btn primary" data-act="gestor-ok">Validar e encaminhar à Alta Gestão</button><button class="btn danger" data-act="gestor-dev">Devolver ao cadastrador</button></div>'
      );
    if (canAlta(u, r))
      return (
        mot +
        '<div class="actions"><button class="btn primary" data-act="altagestao-ok">Aprovar PRR</button><button class="btn danger" data-act="altagestao-dev">Devolver</button></div>'
      );
    return '';
  }
  // Números do PRR salvo, para quem lê ou decide.
  function prrSummary(r) {
    const p = r.prr;
    if (!p || !r.prob || !r.imp) return '';
    const e = econ(r),
      n = nivel(r),
      nr = (p.probRes || 1) * (p.impRes || 1);
    return (
      '<div class="tiles sum"><div class="tile"><div class="tile-h"><span>Risco atual → residual</span></div><div class="tile-chips">' +
      lvc(n) +
      '<span class="arr" aria-hidden="true">→</span>' +
      lvc(nr) +
      '</div><span class="tile-f">' +
      (p.tratamento === 'aceitar' ? 'Risco aceito: sem redução' : 'Depois do tratamento') +
      '</span></div>' +
      tile('Custo do PRR', brlc(e.cost), 'Responsável: ' + esc(p.responsavel || '—')) +
      tile('Redução de exposição', brlc(e.gain), brlc(e.cur) + ' → ' + brlc(e.res)) +
      tile(
        'Retorno por real',
        e.ratio != null ? ratioTxt(e.ratio) : '—',
        'Prazo: ' + fd(p.prazo),
        e.ratio != null && e.ratio < 1 ? 'warn' : '',
        null,
        'Abaixo de 1×',
      ) +
      '</div>'
    );
  }
  // Guia dos limites da métrica: muda com "Melhor quando…" e, com os números preenchidos, mostra como cada medição será classificada.
  function limGuia(p) {
    const menor = p.sentido !== 'maior',
      u = p.unidadeMetrica ? ' ' + esc(p.unidadeMetrica) : '',
      lt = ' <span class="lim-lt" aria-label="menor que">&lt;</span> ';
    const ord = (
      menor
        ? [
            ['ok', 'Ideal'],
            ['warn', 'Alerta'],
            ['crit', 'Crítico'],
          ]
        : [
            ['crit', 'Crítico'],
            ['warn', 'Alerta'],
            ['ok', 'Ideal'],
          ]
    )
      .map(t => toneTag(t[0], t[1]))
      .join(lt);
    const txt = menor
      ? '<b>Menor é melhor</b> (ex.: horas fora do ar). Ideal é a meta e o menor número; crítico é o maior. Ex.: ideal 2, alerta 5, crítico 8.'
      : '<b>Maior é melhor</b> (ex.: disponibilidade em %). Crítico é o menor número; ideal é a meta e o maior. Ex.: crítico 95, alerta 98, ideal 99,5.';
    const c = Number(p.critico),
      a = Number(p.alerta),
      ok =
        [p.critico, p.alerta].every(v => v !== '' && v != null && Number.isFinite(Number(v))) &&
        (menor ? a < c : c < a);
    const lei = !ok
      ? ''
      : '<p class="small">Cada medição será: ' +
        (menor
          ? 'abaixo de ' +
            fnum(a) +
            u +
            ' → <b>Ideal</b> · de ' +
            fnum(a) +
            ' até abaixo de ' +
            fnum(c) +
            u +
            ' → <b>Alerta</b> · ' +
            fnum(c) +
            u +
            ' ou mais → <b>Crítico</b>.'
          : 'acima de ' +
            fnum(a) +
            u +
            ' → <b>Ideal</b> · acima de ' +
            fnum(c) +
            ' até ' +
            fnum(a) +
            u +
            ' → <b>Alerta</b> · ' +
            fnum(c) +
            u +
            ' ou menos → <b>Crítico</b>.') +
        '</p>';
    return '<div class="lim-ord">' + ord + '</div><p class="small">' + txt + '</p>' + lei;
  }
  // Resumo de quem está editando o PRR: usa os valores digitados e é recalculado a cada alteração.
  function prrLiveHTML(r, p) {
    const x = Object.assign({}, r, { prr: Object.assign({}, r.prr || emptyPrr(), p) }),
      e = econ(x),
      n = nivel(r),
      nr = (Number(p.probRes) || 1) * (Number(p.impRes) || 1);
    const c = Number(p.critico),
      a = Number(p.alerta),
      i = Number(p.ideal),
      menor = p.sentido === 'menor',
      sig = menor ? ['≥', '≥', '≤'] : ['≤', '≤', '≥'];
    const has = [p.critico, p.alerta, p.ideal].every(
        v => v !== '' && v != null && Number.isFinite(Number(v)),
      ),
      ord = has && (menor ? i < a && a < c : c < a && a < i),
      w = Math.abs(c - a);
    const thr = ord
      ? '<div class="thr"><i class="t-crit" style="flex:' +
        w +
        '"></i><i class="t-warn" style="flex:' +
        w +
        '"></i><i class="t-ok" style="flex:' +
        Math.abs(i - a) +
        '"></i></div><div class="thr-l small muted"><span>Crítico ' +
        sig[0] +
        ' ' +
        fnum(c) +
        '</span><span>Alerta ' +
        sig[1] +
        ' ' +
        fnum(a) +
        '</span><span>Ideal ' +
        sig[2] +
        ' ' +
        fnum(i) +
        '</span></div>'
      : '';
    const chk = !has
      ? '<span class="muted small">Preencha crítico, alerta e ideal para ver as faixas.</span>'
      : ord
        ? toneTag('ok', 'Limites coerentes')
        : toneTag('warn', 'Ordem dos limites incorreta');
    const row = (l, v) => '<div class="kvl"><span>' + l + '</span><b>' + v + '</b></div>';
    return (
      '<span class="eyebrow">Resumo do PRR</span><p class="hint" style="margin:2px 0 10px">Atualiza enquanto você preenche.</p>' +
      '<div class="kvl"><span>Risco atual → residual</span><div class="chips2">' +
      lvc(n) +
      '<span class="arr" aria-hidden="true">→</span>' +
      lvc(nr) +
      '</div></div>' +
      row('Exposição esperada', brlc(e.cur) + ' → ' + brlc(e.res)) +
      row(
        '<span data-tip="Exposição esperada hoje menos a exposição esperada depois do PRR. Hoje: valor cheio × percentual da probabilidade. Depois: valor cheio × percentual da probabilidade residual × (impacto residual ÷ impacto de hoje). Nunca fica negativa; com aceitar, é zero.">Redução esperada ⓘ</span>',
        brlc(e.gain),
      ) +
      row('Custo', brlc(e.cost)) +
      row('Retorno por real', e.ratio != null ? ratioTxt(e.ratio) : '—') +
      '<div class="sep-line"></div><span class="eyebrow">Limites da métrica</span><div style="margin:8px 0">' +
      chk +
      '</div>' +
      thr
    );
  }
  // Conta do risco residual, explicada: nível de hoje e depois do PRR, e a exposição residual
  // (valor cheio × percentual da probabilidade residual × impacto residual ÷ impacto de hoje).
  function resConta(r, p) {
    const pr = Number(p.probRes) || 1,
      ir = Number(p.impRes) || 1,
      n = nivel(r),
      nr = pr * ir,
      e = r.exposicao || 0;
    const linhaNivel =
      '<span>Hoje: ' +
      r.prob +
      ' × ' +
      r.imp +
      ' = ' +
      lvc(n) +
      ' · Depois do PRR: ' +
      pr +
      ' × ' +
      ir +
      ' = ' +
      lvc(nr) +
      '</span>';
    if (p.tratamento === 'aceitar')
      return (
        '<div class="exp-conta">' +
        linhaNivel +
        '<span class="hint">Com "aceitar", não há redução: a exposição continua a de hoje.</span></div>'
      );
    const res = (PPCT[pr] || 0) * e * (ir / (r.imp || 1));
    return (
      '<div class="exp-conta">' +
      linhaNivel +
      (e
        ? '<span class="eyebrow">Exposição residual</span><b>' +
          brl(res) +
          '</b><span>' +
          brl(e) +
          ' (valor cheio) × ' +
          Math.round((PPCT[pr] || 0) * 100) +
          '% (probabilidade ' +
          pr +
          ')' +
          (ir !== r.imp ? ' × ' + ir + '/' + r.imp + ' (impacto)' : '') +
          '</span>'
        : '<span class="hint">Informe a exposição financeira na avaliação para ver o valor residual.</span>') +
      '</div>'
    );
  }
  // Fase 4 · Tratamento (PRR): formulário em 4 seções, ou leitura e decisão para gestor e Alta Gestão.
  function tabPrr(u, r) {
    if (!r.prob || !r.imp)
      return '<div class="card"><h3>Fase 4 · Tratamento</h3><div class="empty">Avalie probabilidade e impacto antes de elaborar o PRR.</div></div>';
    const ed = canEdit(u, r),
      p = r.prr || Object.assign(emptyPrr(), { probRes: r.prob, impRes: r.imp }),
      ia = UI.ia && UI.ia[r.id],
      dec = canGes(u, r) || canAlta(u, r);
    if (!ed && !r.prr)
      return '<div class="card"><h3>Fase 4 · Tratamento</h3><div class="empty">O PRR ainda não foi elaborado.</div></div>';
    const inp = (id, lab, val, type, extra) =>
      '<div class="field"><label for="' +
      id +
      '">' +
      lab +
      '</label><input id="' +
      id +
      '" type="' +
      (type || 'text') +
      '" value="' +
      esc(val == null ? '' : val) +
      '" style="width:100%" ' +
      (extra || '') +
      '></div>';
    const sel = (id, lab, opts, val) =>
      '<div class="field"><label for="' +
      id +
      '">' +
      lab +
      '</label><select id="' +
      id +
      '" style="width:100%">' +
      opts
        .map(
          o =>
            '<option value="' +
            o[0] +
            '"' +
            (String(o[0]) === String(val) ? ' selected' : '') +
            '>' +
            o[1] +
            '</option>',
        )
        .join('') +
      '</select></div>';
    const iaAc =
      ed && ia && ia.acoes && ia.acoes.length
        ? '<div class="info-box" style="margin-bottom:12px"><b>Ações sugeridas pela IA</b>' +
          ia.acoes
            .map(
              (a, i) =>
                '<div style="margin-top:6px;display:flex;gap:8px;align-items:flex-start"><span style="flex:1">' +
                esc(a) +
                '</span><button class="btn sm" data-act="ia-acao" data-i="' +
                i +
                '">Usar</button></div>',
            )
            .join('') +
          '</div>'
        : '';
    const back =
      r.status === 'devolvido' ? p.aprov.filter(a => a.decisao === 'devolvido').slice(-1)[0] : null;
    const backBox = back
      ? '<div class="warn-box callout" style="margin-bottom:14px">' +
        ICO.warn +
        '<span><b>Devolvido por ' +
        esc(back.por) +
        ' (' +
        PAPEL[back.papel] +
        '):</b> ' +
        esc(back.motivo || 'sem observação') +
        '</span></div>'
      : '';
    const sec = (n, t, body) =>
      '<section class="fs"><h4><span>' + n + '</span>' + t + '</h4>' + body + '</section>';
    const form =
      '<div class="prr-grid"><div class="prr-main">' +
      sec(
        1,
        'Resposta ao risco',
        sel(
          'p-trat',
          'Forma de tratamento',
          Object.keys(TRAT).map(k => [k, cap(k) + ' — ' + TRAT[k]]),
          p.tratamento,
        ) +
          '<div class="field"><label for="p-controles">Controles existentes</label><textarea id="p-controles" rows="2">' +
          esc(p.controles) +
          '</textarea><div class="hint">O que já existe hoje para reduzir esse risco.</div></div><div class="field"><label for="p-acao">Ação proposta</label><textarea id="p-acao" rows="3">' +
          esc(p.acao) +
          '</textarea><div class="hint">Mitigar, evitar ou transferir: o que será feito. Aceitar: por que o risco é aceito.</div></div>',
      ) +
      sec(
        2,
        'Responsável, prazo e custo',
        '<div class="g3">' +
          inp('p-resp', 'Responsável pela ação', p.responsavel) +
          inp('p-prazo', 'Prazo', p.prazo ? String(p.prazo).slice(0, 10) : '', 'date') +
          // Campo em reais com a leitura do valor embaixo, dentro da mesma coluna.
          '<div class="field"><label for="p-custo">Custo estimado (R$)</label><input id="p-custo" type="text" inputmode="decimal" data-brl placeholder="Ex.: 85.000" value="' +
          esc(brlIn(p.custo)) +
          '" style="width:100%"><div class="hint" id="p-custo-v">' +
          brlLido(brlIn(p.custo)) +
          '</div></div>' +
          '</div>',
      ) +
      sec(
        3,
        'Acompanhamento da métrica',
        inp('p-metrica', 'Métrica de acompanhamento', p.metrica) +
          '<div class="g2">' +
          inp('p-unid', 'Unidade', p.unidadeMetrica) +
          sel(
            'p-sent',
            'Melhor quando…',
            [
              ['menor', 'o valor é menor'],
              ['maior', 'o valor é maior'],
            ],
            p.sentido,
          ) +
          '</div><div class="g3">' +
          inp('p-crit', 'Crítico', p.critico, 'number', 'step="any"') +
          inp('p-alerta', 'Alerta', p.alerta, 'number', 'step="any"') +
          inp('p-ideal', 'Ideal', p.ideal, 'number', 'step="any"') +
          '</div><div class="lim-guia" id="lim-guia" aria-live="polite">' +
          limGuia(p) +
          '</div>',
      ) +
      sec(
        4,
        'Risco residual',
        '<p class="hint" style="margin-top:0">Como o risco fica depois do tratamento. Comece pelo nível de hoje e reduza o que a ação muda.</p>' +
          '<div class="res-atalhos" role="group" aria-label="Atalhos do risco residual">' +
          [
            ['0,0', 'Igual a hoje'],
            ['-1,0', '−1 na probabilidade'],
            ['0,-1', '−1 no impacto'],
            ['-1,-1', '−1 nos dois'],
          ]
            .map(x => '<button type="button" class="btn sm" data-res="' + x[0] + '">' + x[1] + '</button>')
            .join('') +
          '</div><div class="g2">' +
          sel(
            'p-probres',
            'Probabilidade residual',
            PROB.map((x, i) => [i + 1, i + 1 + ' · ' + x[0] + ' (' + Math.round(PPCT[i + 1] * 100) + '%)']),
            p.probRes,
          ) +
          sel(
            'p-impres',
            'Impacto residual',
            IMPS.map((x, i) => [i + 1, i + 1 + ' · ' + x[0]]),
            p.impRes,
          ) +
          '</div><div id="res-conta">' +
          resConta(r, p) +
          '</div>',
      ) +
      '</div><aside class="prr-side"><div class="side-card" id="prr-live">' +
      prrLiveHTML(r, p) +
      '</div></aside></div><div id="p-err"></div><div class="actions"><button class="btn" data-act="save-prr">Salvar rascunho</button><button class="btn primary" data-act="send-prr">Enviar para validação do gestor</button></div>';
    const ro =
      '<div class="kvgrid">' +
      roField('Forma de tratamento', cap(p.tratamento) + ' — ' + TRAT[p.tratamento], true) +
      roField('Controles existentes', p.controles, true) +
      roField('Ação proposta', p.acao, true) +
      roField('Responsável pela ação', p.responsavel) +
      roField('Prazo', p.prazo ? fd(p.prazo) : '') +
      roField('Custo estimado', brl(p.custo)) +
      roField('Métrica de acompanhamento', p.metrica, true) +
      roField('Unidade', p.unidadeMetrica) +
      roField('Melhor quando…', p.sentido === 'menor' ? 'o valor é menor' : 'o valor é maior') +
      roField('Crítico', p.critico) +
      roField('Alerta', p.alerta) +
      roField('Ideal', p.ideal) +
      roField('Probabilidade residual', (p.probRes || 1) + ' · ' + PROB[(p.probRes || 1) - 1][0]) +
      roField('Impacto residual', (p.impRes || 1) + ' · ' + IMPS[(p.impRes || 1) - 1][0]) +
      '</div>';
    const stat = stChip(r);
    const decide =
      '<div class="card decide"><div class="card-h"><div><h3>Decisão do PRR</h3><p>' +
      (canGes(u, r)
        ? 'Valide e encaminhe à Alta Gestão de Riscos, ou devolva com o motivo.'
        : 'Aprove para iniciar o monitoramento, ou devolva com o motivo.') +
      '</p></div>' +
      stat +
      '</div>' +
      prrSummary(r) +
      '<div class="decide-grid"><div><span class="eyebrow">Tramitação</span>' +
      prrTrail(r) +
      '</div><div><span class="eyebrow">Sua decisão</span>' +
      prrActions(u, r) +
      '</div></div></div>';
    const trail =
      '<div class="card"><div class="card-h"><div><h3>Tramitação do PRR</h3></div>' +
      stat +
      '</div>' +
      prrTrail(r) +
      '</div>';
    const detail =
      '<div class="card"><h3>Fase 4 · Plano de Respostas a Riscos (PRR)</h3><p class="muted" style="margin:2px 0 12px">Risco atual: ' +
      lvc(nivel(r)) +
      '. ' +
      (ed ? 'Preencha o plano e envie ao gestor da coordenadoria.' : '') +
      '</p>' +
      backBox +
      (ed ? iaAc + form : (dec ? '' : prrSummary(r)) + ro) +
      '</div>';
    return (dec ? decide : '') + detail + (dec ? '' : trail);
  }
  // Fase 5 · Monitoramento: gráfico das medições, nova medição, reavaliação, evento ocorrido e encerramento.
  function tabMon(u, r) {
    if (!['em_tratamento', 'ocorrido', 'encerrado'].includes(r.status))
      return '<div class="card"><h3>Fase 5 · Monitoramento e reavaliação</h3><div class="empty">Disponível depois que a Alta Gestão de Riscos aprovar o PRR.</div></div>';
    const p = r.prr,
      m = lastMed(r),
      ms = metricSt(r),
      mon = canMon(u, r);
    const lh = r.niveis
      .slice()
      .reverse()
      .map(
        n =>
          '<tr><td>' +
          fd(n.ts) +
          '</td><td class="mono">' +
          n.prob +
          ' × ' +
          n.imp +
          '</td><td>' +
          lvc(n.nivel) +
          '</td><td>' +
          esc(n.motivo) +
          '</td></tr>',
      )
      .join('');
    const sel = (id, v) =>
      '<select id="' +
      id +
      '">' +
      [1, 2, 3, 4, 5]
        .map(k => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + k + '</option>')
        .join('') +
      '</select>';
    const now = m
      ? '<div class="mon-now"><b>' +
        fnum(m.valor) +
        ' <small>' +
        esc(p.unidadeMetrica) +
        '</small></b>' +
        (ms === 'sem' ? '' : stTone(ms)) +
        '</div>'
      : '';
    return (
      '<div class="card"><div class="card-h"><div><h3>Fase 5 · Monitoramento da métrica</h3><p>' +
      esc(p.metrica) +
      ' · ' +
      (p.sentido === 'menor' ? 'quanto menor, melhor' : 'quanto maior, melhor') +
      '</p></div>' +
      now +
      '</div>' +
      chartHTML(r) +
      (mon
        ? '<div class="row" style="align-items:flex-end;margin-top:12px"><div><label for="m-valor">Nova medição (' +
          esc(p.unidadeMetrica) +
          ')</label><input id="m-valor" type="number" step="any" style="width:140px"></div><button class="btn primary" data-act="add-med">Registrar medição</button></div>'
        : '') +
      '</div>' +
      '<div class="card"><h3>Reavaliação do nível</h3><div class="scroll"><table class="tbl"><thead><tr><th>Data</th><th>P × I</th><th>Nível</th><th>Motivo</th></tr></thead><tbody>' +
      lh +
      '</tbody></table></div>' +
      (mon
        ? '<div class="g2" style="margin-top:12px"><div><label for="r-prob">Probabilidade</label>' +
          sel('r-prob', r.prob) +
          '</div><div><label for="r-imp">Impacto</label>' +
          sel('r-imp', r.imp) +
          '</div></div><div class="field" style="margin-top:8px"><label for="r-motivo">Motivo da reavaliação</label><input id="r-motivo" style="width:100%"></div><div class="actions"><button class="btn primary" data-act="reaval">Reavaliar nível</button>' +
          (r.status === 'em_tratamento'
            ? '<button class="btn danger" data-act="evento">O evento ocorreu</button>'
            : '') +
          '</div>'
        : '') +
      (u.papel === 'gestor' && u.unit === r.unit && r.status !== 'encerrado'
        ? '<div class="actions"><button class="btn" data-act="encerrar">Encerrar risco</button></div>'
        : '') +
      '</div>'
    );
  }
  // Cabeçalho da tela do risco: frase do MGR, situação, nível e fatos principais.
  function riskHead(u, r) {
    const n = nivel(r),
      e = econ(r),
      p = r.prr,
      has = !!(p && (p.acao || p.custo));
    const fact = (l, v) => '<div class="fact"><span>' + l + '</span><b>' + v + '</b></div>';
    const facts =
      fact(
        'Nível',
        n
          ? lvc(n) + ' <small class="muted">' + r.prob + ' × ' + r.imp + '</small>'
          : '<span class="muted">Sem avaliação</span>',
      ) +
      fact('Exposição esperada', n && r.exposicao ? brlc(e.cur) : '—') +
      fact('Custo do PRR', has ? brlc(p.custo) : '—') +
      fact('Prazo da ação', p && p.prazo ? prazoCell(r) : '—') +
      fact('Responsável', p && p.responsavel ? esc(p.responsavel) : '—') +
      fact('Resolve', r.delegado ? esc(r.delegado.nome) : '—') +
      fact('Aberto por', esc(r.criadoPor) + ' · ' + fd(r.criadoEm));
    return (
      '<div class="card rhead"><div class="rhead-top"><button class="btn sm" data-nav="riscos">← Riscos</button><span class="mono muted">' +
      r.id +
      '</span><span class="unit">' +
      r.unit +
      '</span><span class="spacer"></span>' +
      stChip(r) +
      '</div><h2>' +
      esc(r.titulo) +
      '</h2>' +
      (UI.tab === 2 && canEdit(u, r) ? '' : '<p class="preview">' + previewHTML(r) + '</p>') +
      '<div class="facts">' +
      facts +
      '</div></div>'
    );
  }
  // Tela de um risco (ou de um novo risco), com as etapas das 5 fases e o histórico.
  function viewRisk(u) {
    const isNew = UI.rid === 'new',
      r = isNew ? null : rk(UI.rid);
    if (!isNew && !r) {
      UI.view = 'riscos';
      return viewRiscos(u);
    }
    if (r && (u.papel === 'cadastrador' || u.papel === 'gestor') && u.unit !== r.unit)
      return '<div class="card"><div class="empty">Este risco é de outra coordenadoria.</div></div>';
    const ctxOk = isNew && !!(S.ctx[u.unit] || {}).escopo;
    const cur = isNew ? (ctxOk ? 2 : 1) : curPhase(r),
      fin = !!r && r.status === 'encerrado';
    const step =
      '<div class="card stepper-card"><ol class="steps" aria-label="Fases do MGR">' +
      PHASES.map((x, i) => {
        const n = i + 1,
          done = n < cur || fin;
        return (
          '<li class="' +
          (done ? 'done ' : '') +
          (n === cur ? 'cur ' : '') +
          (n === UI.tab ? 'sel' : '') +
          '"><button data-tab="' +
          n +
          '" aria-current="' +
          (n === UI.tab) +
          '" title="' +
          esc(x[1]) +
          '"><span class="step-n">' +
          (done ? TICK : n) +
          '</span><span class="step-t"><b>' +
          x[0] +
          '</b><small>' +
          (done ? 'Concluída' : n === cur ? 'Fase atual' : '') +
          '</small></span></button></li>'
        );
      }).join('') +
      '</ol><p class="comm">' +
      ICO.info +
      'Comunicação em todas as fases: avisos de designação, aprovação, devolução, métrica em alerta e prazo vencendo.</p></div>';
    let body;
    if (UI.tab === 1) body = isNew ? ctxNovo(u) : tabContexto(u, r);
    else if (UI.tab === 2 && isNew && !ctxOk)
      body =
        '<div class="card"><div class="empty"><p>Salve o contexto da coordenadoria antes de identificar o risco.</p><button class="btn primary" data-tab="1">Ir para o contexto</button></div></div>';
    else if (UI.tab === 2) body = tabIdent(u, r, isNew);
    else if (isNew)
      body = '<div class="card"><div class="empty">Cadastre a identificação do risco primeiro.</div></div>';
    else body = UI.tab === 3 ? tabAval(u, r) : UI.tab === 4 ? tabPrr(u, r) : tabMon(u, r);
    const head = isNew
      ? '<div class="card rhead"><div class="rhead-top"><button class="btn sm" data-nav="riscos">← Riscos</button><span class="unit">' +
        u.unit +
        '</span></div><h2>Novo risco</h2><p class="muted">Primeiro salve o contexto da coordenadoria; depois descreva o risco no formato do MGR.</p></div>'
      : riskHead(u, r);
    const hist = isNew
      ? ''
      : '<div class="card"><h3>Histórico deste risco</h3>' +
        historyList(S.audit.filter(a => a.riskId === r.id).slice(0, 30)) +
        '</div>';
    return head + step + body + hist;
  }
  /* ===== Demais telas ===== */
  function viewRiscos(u) {
    const all = scope(u),
      list = filtered(all),
      alto = all.filter(r => r.status !== 'encerrado' && nivel(r) >= 12).length;
    return (
      pageHead(
        'Riscos ' + (u.unit ? 'da ' + u.unit : 'da SETIC'),
        all.length + ' risco(s) cadastrado(s) · ' + alto + ' de nível alto ou extremo',
        (u.papel === 'cadastrador'
          ? '<button class="btn primary" data-act="novo">+ Novo risco</button>'
          : '') +
          '<button class="btn" data-nav="contexto">Contexto' +
          (u.unit ? ' da ' + esc(u.unit) : ' das coordenadorias') +
          '</button>' +
          dlMenu(DL_RISCOS),
      ) +
      '<div class="card"><div class="table-tools">' +
      filterBar(u) +
      '</div>' +
      tableRisks(list) +
      '</div>'
    );
  }
  // Tela Matriz: distribuição por nível e riscos da célula escolhida.
  function viewMatriz(u) {
    const base = scope(u).filter(r => r.status !== 'encerrado' && r.prob && r.imp),
      counts = {},
      ids = {};
    base.forEach(r => {
      const k = r.prob + '-' + r.imp;
      counts[k] = (counts[k] || 0) + 1;
      (ids[k] = ids[k] || []).push(r);
    });
    const cell = UI.filt.cell,
      rows = filtered(base);
    return (
      pageHead('Matriz de riscos 5 × 5', 'Probabilidade × impacto dos riscos ativos.') +
      '<div class="dash"><section class="card span-7">' +
      cardH('Mapa de riscos', 'Clique numa célula para listar os riscos dela.') +
      heat(counts, ids, cell) +
      '</section>' +
      '<section class="card span-5">' +
      cardH('Distribuição por nível', base.length + ' risco(s) avaliado(s)') +
      levelStack(base, 0) +
      '</section>' +
      '<section class="card span-12">' +
      cardH(
        'Riscos' + (cell ? ' na célula ' + cell.p + ' × ' + cell.i : ''),
        'Do nível mais alto para o mais baixo.',
        cell
          ? '<button class="btn sm" data-act="clearfilt">Limpar filtro</button>'
          : '<span class="count">' + rows.length + '</span>',
      ) +
      tableRisks(rows) +
      '</section></div>'
    );
  }
  // Tela Pendências: o que depende do perfil.
  function viewAprov(u) {
    const pend = pendingFor(u).sort((a, b) => (b.crit ? 1 : 0) - (a.crit ? 1 : 0) || nivel(b.r) - nivel(a.r));
    const t = {
      cadastrador: 'Suas pendências',
      gestor: 'PRRs para você validar',
      altagestao: 'PRRs para a Alta Gestão de Riscos decidir',
      cgge: 'Consulta',
    }[u.papel];
    const money = r =>
      (u.papel === 'gestor' || u.papel === 'altagestao') && r.prr && r.prob && r.imp
        ? '<span class="qi-m"><b>' +
          brlc(r.prr.custo) +
          '</b><small>custo</small></span><span class="qi-m"><b>' +
          brlc(econ(r).gain) +
          '</b><small>redução</small></span>'
        : '';
    const body = pend.length
      ? '<ul class="queue">' +
        pend
          .map(p => {
            const r = p.r,
              tn = p.crit ? 'crit' : 'info';
            return (
              '<li><button class="qi" data-open="' +
              r.id +
              '"><span class="qi-ico t-' +
              tn +
              '" title="' +
              TONE[tn] +
              '">' +
              ICO[tn] +
              '</span><span class="qi-b"><span class="qi-k">' +
              r.id +
              ' · ' +
              r.unit +
              '</span><b>' +
              esc(r.titulo) +
              '</b><span class="qi-t">' +
              esc(p.txt) +
              '</span></span><span class="qi-lv">' +
              lvc(nivel(r)) +
              '</span>' +
              money(r) +
              '<span class="qi-go" aria-hidden="true">›</span></button></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<div class="empty">' + ICO.ok + '<p>Nada pendente com você.</p></div>';
    return (
      pageHead(
        t,
        pend.length
          ? pend.length + ' item(ns) aguardando você, os devolvidos primeiro.'
          : u.papel === 'cgge'
            ? 'O perfil CGGE é só de consulta: não cadastra nem aprova.'
            : 'Tudo em dia.',
      ) +
      '<div class="card">' +
      body +
      '</div>'
    );
  }
  // Tela Histórico: toda a trilha de auditoria visível para o perfil.
  function viewHist(u) {
    const list = S.audit
      .filter(a => u.papel === 'altagestao' || u.papel === 'cgge' || a.unit === u.unit)
      .slice(0, 80);
    return (
      pageHead('Histórico de alterações', 'Quem alterou, quando e o quê. Nada é apagado.') +
      '<div class="card">' +
      historyList(list, true) +
      '</div>'
    );
  }
  /* ===== Quadro: etapas do processo e quem resolve cada risco ===== */
  // Colunas do quadro, na ordem do processo: [chave, nome, situações do risco que entram nela].
  const ETAPAS = [
    ['identificar', 'Identificar e avaliar', ['rascunho']],
    ['prr', 'Elaborar o PRR', ['avaliado', 'devolvido']],
    ['validacao', 'Em validação', ['ag_gestor', 'ag_altagestao']],
    ['tratamento', 'Em tratamento', ['em_tratamento']],
    ['ocorrido', 'Evento ocorreu', ['ocorrido']],
    ['encerrado', 'Encerrado', ['encerrado']],
  ];
  // Coluna do quadro em que o risco está, pela situação.
  const etapaOf = r => ETAPAS.find(e => e[2].includes(r.status)) || ETAPAS[0];
  // Pessoas da coordenadoria que podem receber a delegação: cadastradores e o gestor, ativos.
  const delegaveis = unit =>
    S.team.filter(t => t.unit === unit && (t.papel === 'cadastrador' || t.papel === 'gestor'));
  // Cartão de um risco no quadro. O gestor da coordenadoria delega ali mesmo, sem sair do quadro.
  function qCard(u, r) {
    const d = r.delegado,
      n = nivel(r);
    const quem = d
      ? '<span class="q-quem"><span class="avatar sm" aria-hidden="true">' +
        esc(initials(d.nome)) +
        '</span><span><b>' +
        esc(d.nome) +
        '</b><small>delegado por ' +
        esc(d.por) +
        ' · ' +
        fd(d.ts) +
        '</small></span></span>' +
        (d.nota ? '<p class="q-nota">' + esc(d.nota) + '</p>' : '')
      : '<span class="q-quem muted small">Sem responsável pela resolução</span>';
    const form =
      UI.delegFor === r.id
        ? '<div class="q-form"><label for="dg-para">Quem vai resolver</label><select id="dg-para" style="width:100%"><option value="">Ninguém (retirar)</option>' +
          delegaveis(r.unit)
            .map(
              t =>
                '<option value="' +
                esc(t.id) +
                '"' +
                (d && d.id === t.id ? ' selected' : '') +
                '>' +
                esc(t.nome) +
                ' · ' +
                PAPEL[t.papel] +
                '</option>',
            )
            .join('') +
          '</select><label for="dg-nota">O que resolver (opcional)</label><textarea id="dg-nota" rows="2" maxlength="300" style="width:100%"></textarea><div class="row"><button class="btn sm primary" data-act="deleg-save" data-id="' +
          r.id +
          '">Salvar</button><button class="btn sm" data-act="deleg-cancel">Cancelar</button></div></div>'
        : canDel(u, r)
          ? '<button class="btn sm" data-act="deleg-ask" data-id="' +
            r.id +
            '">' +
            (d ? 'Trocar' : 'Delegar') +
            '</button>'
          : '';
    return (
      '<li class="q-card"><div class="q-top"><span class="mono muted small">' +
      r.id +
      '</span>' +
      (n ? lvc(n) : '') +
      '</div><button class="q-tit" data-open="' +
      r.id +
      '">' +
      esc(r.titulo) +
      '</button><div class="q-meta">' +
      stChip(r) +
      (r.prr && r.prr.prazo ? ' ' + prazoCell(r) : '') +
      (u.unit ? '' : ' <span class="unit">' + esc(r.unit) + '</span>') +
      '</div>' +
      quem +
      form +
      '</li>'
    );
  }
  // Tela Quadro: os riscos em colunas pelas etapas do processo, com quem vai resolver cada um.
  // O gestor (supervisor da coordenadoria) delega; os demais perfis só acompanham.
  function viewQuadro(u) {
    const f = UI.qfilt || '';
    const L = scope().filter(r =>
      !f
        ? true
        : f === 'sem'
          ? !r.delegado
          : f === 'meus'
            ? r.delegado && r.delegado.id === u.id
            : r.delegado && r.delegado.id === f,
    );
    const pessoas = u.unit ? delegaveis(u.unit) : [];
    const filtro =
      '<select data-qfilt aria-label="Filtrar por responsável"><option value="">Todos os responsáveis</option>' +
      '<option value="sem"' +
      (f === 'sem' ? ' selected' : '') +
      '>Sem responsável</option>' +
      (u.unit ? '<option value="meus"' + (f === 'meus' ? ' selected' : '') + '>Comigo</option>' : '') +
      pessoas
        .map(
          t =>
            '<option value="' +
            esc(t.id) +
            '"' +
            (f === t.id ? ' selected' : '') +
            '>' +
            esc(t.nome) +
            '</option>',
        )
        .join('') +
      '</select>';
    const cols = ETAPAS.map(e => {
      const xs = L.filter(r => e[2].includes(r.status)).sort((a, b) => nivel(b) - nivel(a));
      return (
        '<section class="q-col" aria-label="' +
        e[1] +
        '"><h3>' +
        e[1] +
        '<span class="count">' +
        xs.length +
        '</span></h3><ul>' +
        (xs.length ? xs.map(r => qCard(u, r)).join('') : '<li class="q-vazio">Nada nesta etapa.</li>') +
        '</ul></section>'
      );
    }).join('');
    return (
      pageHead(
        'Quadro',
        u.papel === 'gestor'
          ? 'Cada risco na etapa do processo. Delegue quem vai resolver cada um.'
          : 'Cada risco na etapa do processo e quem vai resolver.',
        filtro + dlMenu([DL_RISCOS.find(o => o[0] === 'dl-csv-quadro')]),
      ) +
      '<div class="quadro">' +
      cols +
      '</div>'
    );
  }
  // Tela Alertas: avisos do momento e avisos guardados.
  function viewAlertas(u) {
    const st = S.alerts,
      dv = derived(u),
      unread = st.filter(a => !a.lido[u.id]).length;
    const KIND = {
      devolvido: 'Devolução',
      aprovacao: 'Aprovação',
      aprovado: 'Aprovado',
      metrica: 'Métrica',
      prazo: 'Prazo',
      nivel: 'Nível',
      evento: 'Evento',
      delegado: 'Delegação',
    };
    const row = (tn, kind, msg, meta, id, isNew) =>
      '<li><button class="qi" data-open="' +
      id +
      '"><span class="qi-ico t-' +
      tn +
      '" title="' +
      TONE[tn] +
      '">' +
      ICO[tn] +
      '</span><span class="qi-b"><span class="qi-k">' +
      kind +
      (isNew ? ' · <span class="new-tag">novo</span>' : '') +
      '</span><span class="qi-msg">' +
      esc(msg) +
      '</span>' +
      (meta ? '<span class="qi-t">' + meta + '</span>' : '') +
      '</span><span class="qi-go" aria-hidden="true">›</span></button></li>';
    const act = dv
      .map(d => row(d.crit ? 'crit' : 'warn', KIND[d.tipo] || d.tipo, d.msg, '', d.riskId, false))
      .join('');
    // O tom segue a gravidade do aviso: métrica crítica e evento ocorrido são críticos; devolução, alerta e nível que subiu pedem atenção.
    const toneOf = a =>
      a.tipo === 'metrica'
        ? /crítico/.test(a.msg)
          ? 'crit'
          : 'warn'
        : a.tipo === 'evento'
          ? 'crit'
          : a.tipo === 'devolvido' || a.tipo === 'nivel'
            ? 'warn'
            : a.tipo === 'aprovado'
              ? 'ok'
              : 'info';
    const inf = st
      .map(a => row(toneOf(a), KIND[a.tipo] || a.tipo, a.msg, fdt(a.ts), a.riskId, !a.lido[u.id]))
      .join('');
    const sec = (t, sub, n, body, empty) =>
      '<div class="card">' +
      cardH(t, sub, '<span class="count">' + n + '</span>') +
      (n
        ? '<ul class="queue">' + body + '</ul>'
        : '<div class="empty">' + ICO.ok + '<p>' + empty + '</p></div>') +
      '</div>';
    return (
      pageHead(
        'Alertas e avisos',
        dv.length + unread
          ? dv.length + ' exige(m) ação agora · ' + unread + ' aviso(s) não lido(s)'
          : 'Nenhum alerta novo.',
        unread ? '<button class="btn" data-act="lidos">Marcar como lidos (' + unread + ')</button>' : '',
      ) +
      sec(
        'Exigem ação agora',
        'Prazos próximos ou vencidos e métricas em alerta ou críticas.',
        dv.length,
        act,
        'Nenhum prazo ou métrica exige ação agora.',
      ) +
      sec('Avisos', 'Do mais recente para o mais antigo.', st.length, inf, 'Sem avisos.') +
      '<p class="hint">No protótipo, os e-mails são simulados.</p>'
    );
  }
  // Relatório anual da Alta Gestão de Riscos em Markdown. Na tela vira HTML (mdHtml); para baixar, sai em .md ou em texto puro.
  function reportMd() {
    const L = S.risks.filter(r => r.status !== 'encerrado' && r.prob && r.imp);
    const ap = S.audit.filter(a => a.action === 'Aprovou o PRR').length,
      dv = S.audit.filter(a => a.action === 'Devolveu o PRR').length;
    const inv = L.filter(r => ['em_tratamento', 'ocorrido'].includes(r.status)).reduce(
      (a, r) => a + econ(r).cost,
      0,
    );
    const pnd = L.filter(r => ['ag_gestor', 'ag_altagestao'].includes(r.status)).reduce(
      (a, r) => a + econ(r).cost,
      0,
    );
    const gain = L.reduce((a, r) => a + econ(r).gain, 0);
    const faixa = LV.map((l, i) => l + ': ' + L.filter(r => band(nivel(r)) === i).length).join(' · ');
    const un = units().length
      ? [
          '| Coordenadoria | Riscos | Alto ou extremo |',
          '|---|---|---|',
          ...units().map(
            x =>
              '| ' +
              mdc(x) +
              ' | ' +
              L.filter(r => r.unit === x).length +
              ' | ' +
              L.filter(r => r.unit === x && nivel(r) >= 12).length +
              ' |',
          ),
        ].join('\n')
      : '- nenhuma coordenadoria criada';
    const altos =
      L.filter(r => nivel(r) >= 12)
        .sort((a, b) => nivel(b) - nivel(a))
        .map(
          r =>
            '- **' +
            r.id +
            '** ' +
            mdc(r.titulo) +
            ' (' +
            mdc(r.unit) +
            ') · nível ' +
            nivel(r) +
            ' · ' +
            STAT[r.status][0],
        )
        .join('\n') || '- nenhum';
    const oc =
      L.filter(r => r.status === 'ocorrido')
        .map(r => '- **' + r.id + '** ' + mdc(r.titulo) + ' (' + mdc(r.unit) + ')')
        .join('\n') || '- nenhum';
    const mt =
      L.filter(r => ['alerta', 'critico'].includes(metricSt(r)))
        .map(
          r =>
            '- **' +
            r.id +
            '** ' +
            mdc(r.prr.metrica) +
            ': ' +
            lastMed(r).valor +
            ' ' +
            mdc(r.prr.unidadeMetrica) +
            ' (' +
            MST[metricSt(r)] +
            ')',
        )
        .join('\n') || '- nenhuma';
    return [
      '# Relatório anual da Alta Gestão de Riscos · TIC · ' + new Date().getFullYear(),
      'Gerado pelo MIRA em ' + fd(new Date().toISOString()) + '.',
      '',
      '## 1. Panorama',
      '**' + L.length + ' riscos ativos.** ' + faixa,
      '',
      '## 2. Por coordenadoria',
      un,
      '',
      '## 3. Planos de resposta (PRR)',
      '- Aprovados: ' +
        ap +
        ' · Devolvidos: ' +
        dv +
        ' · Em análise: ' +
        L.filter(r => ['ag_gestor', 'ag_altagestao'].includes(r.status)).length,
      '- Investimento aprovado: ' + brl(inv) + ' · aguardando decisão: ' + brl(pnd),
      '- Reduções esperadas de exposição: ' + brl(gain),
      '',
      '## 4. Riscos de nível alto e extremo',
      altos,
      '',
      '## 5. Eventos que ocorreram',
      oc,
      '',
      '## 6. Métricas em alerta ou críticas',
      mt,
      '',
      'Todas as alterações estão no histórico do MIRA.',
    ].join('\n');
  }
  // Tela Relatório: indicadores, tabela por coordenadoria e faixa e o texto do relatório.
  function viewRel(u) {
    const L = S.risks.filter(r => r.status !== 'encerrado' && r.prob && r.imp),
      E = L.map(r => ({ r, e: econ(r) }));
    const ap = S.audit.filter(a => a.action === 'Aprovou o PRR').length,
      dv = S.audit.filter(a => a.action === 'Devolveu o PRR').length;
    const inv = E.filter(x => ['em_tratamento', 'ocorrido'].includes(x.r.status)).reduce(
        (a, x) => a + x.e.cost,
        0,
      ),
      gain = E.reduce((a, x) => a + x.e.gain, 0),
      alto = L.filter(r => nivel(r) >= 12).length;
    const cnt = (x, i) => L.filter(r => r.unit === x && band(nivel(r)) === i).length,
      mx = Math.max(1, ...units().flatMap(x => LV.map((l, i) => cnt(x, i))));
    const tiles =
      '<div class="tiles">' +
      tile('Riscos ativos', L.length, 'Avaliados e em andamento') +
      tile(
        'Nível alto ou extremo',
        alto,
        alto ? 'Entram no relatório com situação e responsável' : 'Nenhum risco com nível 12 ou mais',
        alto ? 'crit' : 'ok',
      ) +
      tile('PRRs decididos', ap + dv, ap + ' aprovado(s) · ' + dv + ' devolvido(s)') +
      tile('Investimento aprovado', brlc(inv), 'PRRs em tratamento') +
      tile('Redução esperada', brlc(gain), 'Exposição que os PRRs removem') +
      '</div>';
    const grid =
      '<div class="scroll"><table class="tbl hm"><thead><tr><th>Coordenadoria</th>' +
      LV.map(l => '<th class="num">' + l + '</th>').join('') +
      '<th class="num">Total</th></tr></thead><tbody>' +
      units()
        .map(
          x =>
            '<tr><td><b>' +
            x +
            '</b></td>' +
            LV.map((l, i) => {
              const n = cnt(x, i);
              return (
                '<td class="num hmcell"' +
                (n
                  ? ' style="background:color-mix(in srgb,var(--l' +
                    i +
                    ') ' +
                    Math.round(35 + (65 * n) / mx) +
                    '%,transparent);color:var(--f' +
                    i +
                    ')"'
                  : '') +
                '>' +
                (n ? '<b>' + n + '</b>' : '<span class="muted">0</span>') +
                '</td>'
              );
            }).join('') +
            '<td class="num"><b>' +
            L.filter(r => r.unit === x).length +
            '</b></td></tr>',
        )
        .join('') +
      '</tbody></table></div>';
    return (
      pageHead(
        'Relatório anual da Alta Gestão de Riscos',
        'Riscos, planos de resposta e métricas.',
        '<button class="btn" data-act="copyrep">Copiar Markdown</button>' + dlMenu(DL_REL),
      ) +
      tiles +
      '<div class="card">' +
      cardH('Riscos por coordenadoria e faixa', 'Mais escuro, mais riscos.') +
      grid +
      '</div><div class="card">' +
      cardH('Texto do relatório', 'Para ler aqui, em Markdown. Para baixar, escolha o formato em Baixar.') +
      '<div id="reptext">' +
      mdHtml(reportMd()) +
      '</div></div>'
    );
  }
  /* ===== Contexto (fase 1), usuários, login e estrutura da página ===== */
  // Tabela do cronograma de um contexto; com ed, cada marco pode ser concluído ou removido.
  const ctxMarcos = (c, ed) =>
    c.marcos.length
      ? '<table class="tbl"><tbody>' +
        c.marcos
          .map(
            (m, i) =>
              '<tr><td>' +
              (ed
                ? '<label style="font-weight:400;margin:0"><input type="checkbox" data-marco="' +
                  i +
                  '"' +
                  (m.feito ? ' checked' : '') +
                  '> ' +
                  esc(m.marco) +
                  '</label>'
                : esc(m.marco)) +
              '</td><td class="mono">' +
              fd(m.data) +
              '</td><td>' +
              (m.feito
                ? '<span class="st ok">Concluído</span>'
                : daysTo(m.data) < 0
                  ? '<span class="st bad">Atrasado</span>'
                  : '<span class="st">Previsto</span>') +
              '</td>' +
              (ed
                ? '<td><button class="btn sm" data-act="rm-marco" data-i="' + i + '">Remover</button></td>'
                : '') +
              '</tr>',
          )
          .join('') +
        '</tbody></table>'
      : '<div class="empty">Nenhum marco no cronograma ainda.</div>';
  // Passo 1 do novo risco: o contexto da coordenadoria, que precisa estar salvo antes da identificação.
  const ctxNovo = u =>
    '<div class="card"><h3>Fase 1 · Contexto da ' +
    esc(u.unit) +
    '</h3><p class="muted">Confira ou registre o escopo e o cronograma da coordenadoria. O risco é identificado no passo seguinte.</p></div>' +
    ctxCards(u, u.unit, true);
  // Tela Contexto (aberta pela aba Riscos): o contexto da própria coordenadoria, ou de qualquer uma para Alta Gestão e CGGE.
  function viewCtx(u) {
    const un = u.unit || UI.ctxUnit || units()[0];
    if (!un)
      return (
        pageHead('Contexto', 'Escopo, responsáveis e cronograma.', '', 'Fase 1') +
        '<div class="card"><div class="empty"><p>Nenhuma coordenadoria criada ainda. O administrador cria as coordenadorias na hora.</p></div></div>'
      );
    return (
      pageHead(
        'Contexto da ' + un,
        'Escopo, responsáveis e cronograma.',
        u.papel === 'altagestao' || u.papel === 'cgge'
          ? '<select data-ctxunit aria-label="Coordenadoria">' +
              units()
                .map(x => '<option' + (x === un ? ' selected' : '') + '>' + esc(x) + '</option>')
                .join('') +
              '</select>'
          : '',
        'Fase 1',
      ) + ctxCards(u, un)
    );
  }
  // Cartões do contexto de uma coordenadoria: escopo, responsáveis e cronograma. Editáveis pelo cadastrador
  // da própria coordenadoria. No passo 1 do novo risco (novo = true), o botão salva e segue para a identificação.
  function ctxCards(u, un, novo) {
    const c = S.ctx[un] || { escopo: '', marcos: [] };
    const ed = u.papel === 'cadastrador' && u.unit === un;
    const resp = respOf(un),
      ges = gestorOf(un);
    const chips =
      resp.map(x => '<span class="st info">' + esc(x) + ' · cadastra</span>').join(' ') +
      (ges ? ' <span class="st info">' + esc(ges) + ' · gestor</span>' : '');
    const marcos = ctxMarcos(c, ed);
    return (
      '<div class="row"><div class="card grow"><h3>Escopo</h3>' +
      (ed
        ? '<textarea id="c-escopo" rows="4" placeholder="Quais processos, sistemas e serviços da coordenadoria entram na gestão de riscos?">' +
          esc(c.escopo) +
          '</textarea><p style="margin-top:8px">' +
          (novo
            ? '<button class="btn primary" data-act="ctx-seguir">Salvar contexto e seguir para a identificação</button>'
            : '<button class="btn primary" data-act="save-ctx">Salvar escopo</button>') +
          '</p>'
        : c.escopo
          ? '<p>' + esc(c.escopo) + '</p>'
          : '<p class="muted">Escopo ainda não registrado.</p>') +
      '<h3 style="margin-top:16px">Responsáveis designados</h3>' +
      (chips
        ? '<p>' + chips + '</p>'
        : '<p class="muted">Nenhuma pessoa designada. O administrador cadastra as pessoas na tela Usuários.</p>') +
      '<p class="hint">Até 2 cadastradores; o titular aprova.</p></div>' +
      '<div class="card grow"><h3>Cronograma de implementação</h3>' +
      marcos +
      (ed
        ? '<div class="row" style="align-items:flex-end;margin-top:12px"><div style="flex:1 1 180px"><label for="c-marco">Novo marco</label><input id="c-marco" style="width:100%" placeholder="Ex.: Identificação dos riscos"></div><div><label for="c-data">Data</label><input id="c-data" type="date"></div><button class="btn primary" data-act="add-marco">Incluir</button></div>'
        : '') +
      '</div></div>'
    );
  }
  // Telas do administrador. Ele não tem coordenadoria e não vê riscos.
  const ADMIN_VIEWS = ['usuarios', 'unidades', 'historico'];
  // Tipos do relatório de pedido, como aparecem na tela.
  const TIPO_PEDIDO = { sei: 'SEI', formal: 'Pedido formal' };
  // Contas de teste teste1 a teste20 (a mesma regra do servidor): podem existir sem relatório de pedido.
  const CONTA_TESTE = /^teste([1-9]|1\d|20)$/;
  // Opções de download do relatório de pedido de uma pessoa.
  const DL_PEDIDO = [
    ['ped-md', 'Markdown (.md)', 'Tipo, documento, número SEI, data e quem registrou'],
    ['ped-txt', 'Texto (.txt)', 'O mesmo, sem marcação'],
  ];
  // Campos do relatório de pedido num formulário (px = prefixo dos ids). O servidor confere as regras:
  // número SEI e data sempre; PDF obrigatório no tipo SEI e opcional no pedido formal.
  const pedidoFields = (px, hint) =>
    '<fieldset class="sei-box"><legend>Relatório de pedido que autoriza o acesso</legend>' +
    '<div class="field"><label for="' +
    px +
    '-ped-tipo">Tipo</label><select id="' +
    px +
    '-ped-tipo" style="width:100%"><option value="sei">SEI</option><option value="formal">Pedido formal</option></select></div>' +
    '<div class="field"><label for="' +
    px +
    '-ped-nome">Nome do documento</label><input id="' +
    px +
    '-ped-nome" style="width:100%" maxlength="200" placeholder="Ex.: Portaria de designação"></div>' +
    '<div class="field"><label for="' +
    px +
    '-ped-num">Número SEI</label><input id="' +
    px +
    '-ped-num" style="width:100%" maxlength="30" inputmode="numeric" placeholder="Ex.: 0045123456"></div>' +
    '<div class="field"><label for="' +
    px +
    '-ped-data">Data do documento</label><input id="' +
    px +
    '-ped-data" type="date" style="width:100%"></div>' +
    '<div class="field"><label for="' +
    px +
    '-ped-pdf">PDF do documento</label><input id="' +
    px +
    '-ped-pdf" type="file" accept="application/pdf,.pdf" style="width:100%"><div class="hint">Obrigatório no tipo SEI e opcional no pedido formal. Só PDF, até 10 MB.</div></div>' +
    (hint ? '<div class="hint">' + hint + '</div>' : '') +
    '</fieldset>';
  // Relatório de pedido de uma pessoa em Markdown, para baixar.
  const pedidoMd = x =>
    [
      '# Relatório de pedido · ' + mdc(x.username),
      '- Tipo: ' + (TIPO_PEDIDO[x.seiTipo] || 'SEI'),
      '- Documento: ' + mdc(x.seiNome),
      '- Número SEI: ' + mdc(x.seiNumero),
      '- Data do documento: ' + (x.seiData ? fd(x.seiData) : 'não informada'),
      '- Perfil: ' + PAPEL[x.papel] + (x.unit ? ' · Coordenadoria: ' + mdc(x.unit) : ''),
      '- PDF anexado: ' +
        (x.seiTamanho
          ? mdc(x.seiArquivo) +
            ' (' +
            Math.max(1, Math.round(x.seiTamanho / 1024)) +
            ' KB) · SHA-256 ' +
            x.seiHash
          : 'sem PDF'),
      '- Registrado por ' +
        mdc(x.seiPor) +
        ' em ' +
        (x.seiEm ? new Date(x.seiEm).toLocaleString('pt-BR') : '—'),
    ].join('\n');
  // Relatório de pedido de uma pessoa na lista: tipo, documento, número SEI, data, PDF e o relatório para baixar.
  function pedidoCell(x) {
    if (x.papel === 'admin') return '<span class="muted small">Conta criada na implantação</span>';
    const novo =
      '<button class="btn sm" data-act="ped-ask" data-id="' +
      x.id +
      '">' +
      (x.seiNumero ? 'Novo pedido' : 'Registrar pedido') +
      '</button>';
    if (!x.seiNumero)
      return (
        '<div class="sei-doc"><span class="muted small">' +
        (CONTA_TESTE.test(x.username) ? 'Conta de teste, sem pedido' : 'Sem relatório de pedido') +
        '</span>' +
        novo +
        '</div>'
      );
    return (
      '<div class="sei-doc"><span class="st info">' +
      (TIPO_PEDIDO[x.seiTipo] || 'SEI') +
      '</span><b>' +
      esc(x.seiNome) +
      '</b><span class="muted small mono">SEI nº ' +
      esc(x.seiNumero) +
      (x.seiData ? ' · ' + fd(x.seiData) : '') +
      '</span><div class="row sei-acts">' +
      (x.seiTamanho
        ? '<a class="btn sm" href="/api/users/' +
          x.id +
          '/sei" download data-tip="' +
          esc(x.seiArquivo) +
          '">PDF</a>'
        : '<span class="muted small">Sem PDF</span>') +
      dlMenu(DL_PEDIDO, true, ' data-id="' + x.id + '"', 'Relatório') +
      novo +
      '</div></div>'
    );
  }
  // Cartão para registrar o relatório de pedido de quem já tem conta; aparece acima da lista.
  function pedidoCard() {
    const x = UI.pedFor && S.users.find(p => p.id === UI.pedFor);
    if (!x) return '';
    return (
      '<div class="card"><h3>Registrar relatório de pedido · ' +
      esc(x.username) +
      '</h3><form id="ped-form" autocomplete="off" style="max-width:440px">' +
      pedidoFields('p') +
      '<div class="row"><button class="btn primary" type="submit">Registrar</button><button class="btn" type="button" data-act="ped-cancel">Cancelar</button></div></form></div>'
    );
  }
  // Tela Usuários (só administrador): cobertura das coordenadorias, cadastro com o relatório de pedido e lista de pessoas.
  function viewUsers(u) {
    if (u.papel !== 'admin')
      return '<div class="card"><div class="empty">Só o administrador cadastra pessoas.</div></div>';
    const us = units();
    const cover = us.length
      ? '<div class="covers">' +
        us
          .map(x => {
            const n = S.users.filter(p => p.ativo && p.unit === x);
            const c = n.filter(p => p.papel === 'cadastrador').length,
              g = n.filter(p => p.papel === 'gestor').length;
            return (
              '<div class="cover"><b>' +
              esc(x) +
              '</b>' +
              toneTag(c ? 'ok' : 'warn', c + ' de 2 cadastradores') +
              toneTag(g ? 'ok' : 'warn', g ? 'Com gestor' : 'Sem gestor') +
              '</div>'
            );
          })
          .join('') +
        '</div>'
      : '<div class="empty"><p>Nenhuma coordenadoria criada.</p><button class="btn" data-nav="unidades">Criar coordenadoria</button></div>';
    // Texto de busca de cada linha: nome, usuário, perfil, coordenadoria e documento SEI.
    const busca = x =>
      esc([x.nome, x.username, PAPEL[x.papel], x.unit, x.seiNome, x.seiNumero].join(' ').toLowerCase());
    const rows = S.users
      .map(
        x =>
          '<tr data-busca="' +
          busca(x) +
          '"><td><div class="usr"><span class="avatar" aria-hidden="true">' +
          esc(initials(x.nome)) +
          '</span><span><b>' +
          esc(x.nome) +
          '</b><div class="muted small mono">' +
          esc(x.username) +
          '</div></span></div></td><td>' +
          PAPEL[x.papel] +
          '</td><td>' +
          (x.unit ? esc(x.unit) : '—') +
          '</td><td>' +
          pedidoCell(x) +
          '</td><td>' +
          (x.ativo ? toneTag('ok', 'Ativo') : '<span class="st">Desativado</span>') +
          '</td><td class="num">' +
          (UI.pwFor === x.id
            ? '<input id="pw-new" type="password" placeholder="Nova senha (8+)" style="width:150px"> <button class="btn sm primary" data-act="reset-pw" data-id="' +
              x.id +
              '">Salvar</button> <button class="btn sm" data-act="pw-cancel">Cancelar</button>'
            : '<button class="btn sm" data-act="pw-ask" data-id="' +
              x.id +
              '">Redefinir senha</button> ' +
              (x.id !== S.me.id
                ? '<button class="btn sm ' +
                  (x.ativo ? 'danger' : '') +
                  '" data-act="toggle-ativo" data-id="' +
                  x.id +
                  '" data-v="' +
                  (x.ativo ? 0 : 1) +
                  '">' +
                  (x.ativo ? 'Desativar' : 'Reativar') +
                  '</button> ' +
                  (UI.delFor === x.id
                    ? '<button class="btn sm danger" data-act="user-del" data-id="' +
                      x.id +
                      '">Confirmar: apagar</button> <button class="btn sm" data-act="user-del-cancel">Cancelar</button>'
                    : '<button class="btn sm danger" data-act="user-del-ask" data-id="' +
                      x.id +
                      '">Apagar</button>')
                : '')) +
          '</td></tr>',
      )
      .join('');
    // Sem coordenadoria criada, só dá para cadastrar Alta Gestão e CGGE (que não têm coordenadoria).
    const unitSel = us.length
      ? '<select id="n-unit" style="width:100%">' +
        us.map(x => '<option>' + esc(x) + '</option>').join('') +
        '</select><div class="hint">Até 2 cadastradores e 1 gestor por coordenadoria.</div>'
      : '<select id="n-unit" style="width:100%" disabled><option value="">Nenhuma coordenadoria criada</option></select><div class="hint">Crie a coordenadoria em Coordenadorias antes de cadastrar quem trabalha nela.</div>';
    return (
      pageHead(
        'Usuários',
        S.users.length +
          ' pessoa(s) com acesso. Todo cadastro exige o relatório de pedido (SEI ou pedido formal).',
      ) +
      pedidoCard() +
      '<div class="row"><div class="card grow" style="max-width:440px"><h3>Cadastrar pessoa</h3><form id="user-form" autocomplete="off">' +
      '<div class="field"><label for="n-user">Usuário de acesso</label><input id="n-user" style="width:100%" required><div class="hint">Minúsculas, números, ponto, hífen ou sublinhado.</div></div>' +
      '<div class="field"><label for="n-papel">Perfil</label><select id="n-papel" style="width:100%"><option value="cadastrador">Cadastrador(a) · registra riscos da coordenadoria</option><option value="gestor">Gestor(a) de riscos · titular da coordenadoria</option><option value="altagestao">Alta Gestão de Riscos · aprova PRRs e gera o relatório</option><option value="cgge">CGGE · só consulta</option></select></div>' +
      '<div class="field" id="n-unit-wrap"><label for="n-unit">Coordenadoria</label>' +
      unitSel +
      '</div>' +
      '<div class="field"><label for="n-pw">Senha inicial</label><input id="n-pw" type="password" style="width:100%" required minlength="8"><div class="hint">Mínimo de 8 caracteres.</div></div>' +
      pedidoFields('n', 'Contas de teste (teste1 a teste20) podem ser criadas sem o relatório de pedido.') +
      '<button class="btn primary" type="submit">Cadastrar</button></form></div>' +
      '<div class="card grow">' +
      cardH('Pessoas por coordenadoria', 'Cada uma indica até 2 cadastradores e 1 gestor.') +
      cover +
      '</div></div>' +
      '<div class="card">' +
      cardH(
        'Pessoas com acesso',
        '',
        '<input type="search" data-ubusca aria-label="Buscar pessoa" placeholder="Nome, usuário ou nº SEI" class="ubusca">',
      ) +
      '<div class="scroll"><table class="tbl"><thead><tr><th>Pessoa</th><th>Perfil</th><th>Coordenadoria</th><th>Relatório de pedido</th><th>Situação</th><th></th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    );
  }
  // Tela Coordenadorias (só administrador): o MIRA começa sem nenhuma e o administrador cria cada uma na hora.
  // Uma coordenadoria só pode ser removida enquanto não tem pessoas, riscos nem contexto (o servidor confere).
  function viewUnits(u) {
    if (u.papel !== 'admin')
      return '<div class="card"><div class="empty">Só o administrador cria coordenadorias.</div></div>';
    const rows = S.units
      .map(x => {
        const n = S.users.filter(p => p.unit === x.sigla).length;
        return (
          '<tr><td><b>' +
          esc(x.sigla) +
          '</b></td><td>' +
          (UI.unitEdit === x.sigla
            ? '<input id="ue-nome" maxlength="120" style="width:100%" value="' +
              esc(x.nome) +
              '"> <button class="btn sm primary" data-act="unit-edit-save" data-sigla="' +
              esc(x.sigla) +
              '">Salvar</button> <button class="btn sm" data-act="unit-edit-cancel">Cancelar</button>'
            : (x.nome ? esc(x.nome) : '<span class="muted">Sem nome por extenso</span>') +
              ' <button class="btn sm" data-act="unit-edit" data-sigla="' +
              esc(x.sigla) +
              '">Editar nome</button>') +
          '</td><td class="num">' +
          n +
          '</td><td class="num">' +
          (n
            ? '<span class="muted small">Tem pessoas cadastradas</span>'
            : '<button class="btn sm danger" data-act="unit-remove" data-sigla="' +
              esc(x.sigla) +
              '">Remover</button>') +
          '</td></tr>'
        );
      })
      .join('');
    return (
      pageHead(
        'Coordenadorias',
        S.units.length
          ? S.units.length + ' coordenadoria(s) no MIRA.'
          : 'O MIRA começa sem coordenadorias. Crie as que vão usar o sistema.',
      ) +
      '<div class="row"><div class="card grow" style="max-width:440px"><h3>Nova coordenadoria</h3><form id="unit-form" autocomplete="off">' +
      '<div class="field"><label for="u-sigla">Sigla</label><input id="u-sigla" style="width:100%" required maxlength="20" placeholder="Ex.: Coinfra"><div class="hint">Aparece em todas as telas. Letras, números ou hífen.</div></div>' +
      '<div class="field"><label for="u-nome">Nome por extenso</label><input id="u-nome" style="width:100%" maxlength="120" placeholder="Opcional"></div>' +
      '<button class="btn primary" type="submit">Criar coordenadoria</button></form></div>' +
      '<div class="card grow"><h3>Coordenadorias criadas</h3>' +
      (S.units.length
        ? '<div class="scroll"><table class="tbl"><thead><tr><th>Sigla</th><th>Nome</th><th class="num">Pessoas</th><th></th></tr></thead><tbody>' +
          rows +
          '</tbody></table></div>'
        : '<div class="empty"><p>Nenhuma coordenadoria criada ainda.</p></div>') +
      '</div></div>'
    );
  }
  // Marca do MIRA.
  const LOGO =
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="3.2" fill="currentColor" stroke="none"/><path d="M16 2v7M16 23v7M2 16h7M23 16h7"/></svg>';
  // Tela de entrada: usuário e senha. Não há criação de conta por aqui: o administrador é criado na
  // implantação (npm run admin) e cadastra as demais pessoas.
  function viewAuth() {
    const rail = PHASES.map(
      (x, i) =>
        '<li><span class="rail-n">' +
        (i + 1) +
        '</span><span><b>' +
        x[0] +
        '</b><small>' +
        x[1] +
        '</small></span></li>',
    ).join('');
    const proofs = [
      'Cada alteração fica registrada: quem, quando e o quê.',
      'Acesso conferido no servidor por perfil e coordenadoria.',
      'Dois painéis: Operacional de TI e Alta Gestão.',
    ]
      .map(t => '<li>' + ICO.ok + t + '</li>')
      .join('');
    return (
      '<div class="login"><section class="login-brand"><div class="logo">' +
      LOGO +
      '<div>MIRA<small>Monitoramento Integrado de Riscos e Ações · SETIC</small></div></div>' +
      '<div class="login-pitch"><h1>Gestão de riscos de TIC, do contexto ao monitoramento.</h1><p>O MIRA conduz cada coordenadoria pelas 5 fases do MGR e mostra à alta gestão quanto cada risco custa e o que cada resposta devolve.</p></div>' +
      '<ol class="rail" aria-label="As 5 fases do MGR">' +
      rail +
      '</ol><ul class="proofs">' +
      proofs +
      '</ul>' +
      '<svg class="login-bg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width=".5" aria-hidden="true"><circle cx="16" cy="16" r="15"/><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="5"/><path d="M16 0v32M0 16h32"/></svg></section>' +
      '<section class="login-side"><div class="login-card"><h2>' +
      'Entrar</h2>' +
      '<p class="muted">Use o usuário e a senha cadastrados pelo administrador.</p>' +
      '<form id="auth-form">' +
      '<div class="field"><label for="a-user">Usuário</label><input id="a-user" style="width:100%" autocomplete="username" required></div><div class="field"><label for="a-pw">Senha</label><input id="a-pw" type="password" style="width:100%" autocomplete="current-password" required></div>' +
      (UI.authErr
        ? '<div class="warn-box" role="alert" style="margin-bottom:10px">' + esc(UI.authErr) + '</div>'
        : '') +
      '<button class="btn primary" type="submit" style="width:100%">Entrar</button></form></div></section></div>'
    );
  }
  // Monta a tela inteira a partir de S e UI. keep = manter a rolagem.
  // Toda alteração de estado termina aqui; não há atualização parcial além dos resumos ao vivo.
  function render(keep) {
    if (!alive) return;
    hideTip();
    const sy = window.scrollY;
    if (!UI.ready) {
      root.innerHTML = '<div class="auth"><div class="card"><p class="muted">Carregando…</p></div></div>';
      return;
    }
    if (!S.me) {
      root.innerHTML = viewAuth();
      const f = root.querySelector('input');
      if (f) f.focus();
      return;
    }
    const u = me();
    // O administrador não vê riscos: o menu dele é só pessoas, coordenadorias e o histórico do que fez.
    if (u.papel === 'admin' && !ADMIN_VIEWS.includes(UI.view)) UI.view = 'usuarios';
    const nav =
      u.papel === 'admin'
        ? [
            ['usuarios', 'Usuários'],
            ['unidades', 'Coordenadorias'],
            ['historico', 'Histórico'],
          ]
        : [
            ['paineis', 'Painéis'],
            ['riscos', 'Riscos'],
          ];
    if (u.papel !== 'admin') {
      nav.push(['quadro', 'Quadro'], ['matriz', 'Matriz']);
      if (u.papel !== 'cgge') nav.push(['aprov', 'Pendências', pendingFor(u).length]);
      nav.push(['historico', 'Histórico'], ['alertas', 'Alertas', unreadCount(u)]);
      if (u.papel !== 'cadastrador') nav.push(['relatorio', 'Relatório']);
    }
    // O risco aberto e o contexto da coordenadoria fazem parte de Riscos no menu.
    const cur = UI.view === 'risco' || UI.view === 'contexto' ? 'riscos' : UI.view;
    let v;
    try {
      if (UI.view === 'paineis') v = panelHead(u) + (UI.panel === 'op' ? renderOp(u) : renderAlta(u));
      else if (UI.view === 'riscos') v = viewRiscos(u);
      else if (UI.view === 'risco') v = viewRisk(u);
      else if (UI.view === 'matriz') v = viewMatriz(u);
      else if (UI.view === 'quadro') v = viewQuadro(u);
      else if (UI.view === 'aprov') v = viewAprov(u);
      else if (UI.view === 'contexto') v = viewCtx(u);
      else if (UI.view === 'historico') v = viewHist(u);
      else if (UI.view === 'alertas') v = viewAlertas(u);
      else if (UI.view === 'usuarios') v = viewUsers(u);
      else if (UI.view === 'unidades') v = viewUnits(u);
      else v = viewRel(u);
    } catch (e) {
      v =
        '<div class="card"><h3>Não foi possível abrir esta tela</h3><p class="muted">' +
        esc(e.message) +
        '</p></div>';
    }
    root.innerHTML =
      '<header class="top"><div class="bar"><div class="logo">' +
      LOGO +
      '<div>MIRA<small>' +
      esc(unitLabel(u.unit) || 'Monitoramento Integrado de Riscos e Ações · SETIC') +
      '</small></div></div><span class="spacer"></span><span class="who"><span class="avatar" aria-hidden="true">' +
      esc(initials(u.nome)) +
      '</span><span class="who-t"><b>' +
      esc(u.nome) +
      '</b><span>' +
      PAPEL[u.papel] +
      (u.unit ? ' · ' + esc(siglaUp(u.unit)) : '') +
      '</span></span></span><button class="btn sm" data-act="logout">Sair</button></div><nav class="nav" aria-label="Seções">' +
      nav
        .map(
          n =>
            '<button data-nav="' +
            n[0] +
            '"' +
            (n[0] !== 'novo' && cur === n[0] ? ' aria-current="page"' : '') +
            '>' +
            n[1] +
            (n[2] ? '<span class="badge">' + n[2] + '</span>' : '') +
            '</button>',
        )
        .join('') +
      '</nav></header><div class="wrap"><main>' +
      v +
      '</main></div>';
    if (UI.view === 'risco' && UI.tab === 2) refreshIdent(true);
    window.scrollTo(0, keep ? sy : 0);
  }

  /* ===== Interação e chamadas à API ===== */
  // Tamanho máximo do PDF do SEI (o servidor confere de novo).
  const SEI_MAX = 10 * 1024 * 1024;
  // Primeiro arquivo escolhido num campo de arquivo, ou null.
  const fileOf = id => {
    const el = document.getElementById(id);
    return el && el.files && el.files[0] ? el.files[0] : null;
  };
  // Conteúdo binário em base64, em blocos para não estourar a pilha com arquivos grandes.
  const toB64 = buf => {
    const a = new Uint8Array(buf);
    let t = '';
    for (let i = 0; i < a.length; i += 0x8000)
      t += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(t);
  };
  const val = id => {
    const e = document.getElementById(id);
    return e ? e.value : '';
  };
  // Mensagem curta no canto da tela.
  function toast(m) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = m;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }
  // Baixa um arquivo gerado no navegador.
  function download(name, data, mime) {
    const b = new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  // Lê os campos da identificação.
  function readIdent() {
    return {
      titulo: val('f-titulo').trim(),
      causa: val('f-causa').trim(),
      evento: val('f-evento').trim(),
      impacto: val('f-impacto').trim(),
      objetivo: val('f-objetivo').trim(),
    };
  }
  // Atualiza a pré-visualização, os avisos de qualidade e os riscos parecidos enquanto se digita.
  function refreshIdent(initial) {
    if (!document.getElementById('pv')) return;
    const f = readIdent();
    if (document.getElementById('f-causa')) {
      if (!initial) UI.draft = Object.assign({ _rid: UI.rid }, f);
      document.getElementById('pv').innerHTML = previewHTML(f);
      ['causa', 'evento', 'impacto', 'objetivo'].forEach(k => {
        const w = document.getElementById('w-' + k);
        if (w) w.innerHTML = '';
      });
      checkRisk(f).forEach(x => {
        const w = document.getElementById('w-' + x[0]);
        if (w) w.innerHTML = '<div class="warn-box">' + esc(x[1]) + '</div>';
      });
      const sm = similar(f, UI.rid === 'new' ? null : UI.rid);
      document.getElementById('sim').innerHTML = sm.length
        ? '<div class="info-box" style="margin-top:10px"><b>Riscos parecidos já cadastrados</b>' +
          sm
            .map(
              x =>
                '<div style="margin-top:4px"><a href="#" data-open="' +
                x.r.id +
                '">' +
                x.r.id +
                '</a> · ' +
                esc(x.r.titulo) +
                ' <span class="muted small">(' +
                x.r.unit +
                ')</span></div>',
            )
            .join('') +
          '</div>'
        : '';
    }
  }
  // Lê os campos do PRR; números vazios ficam "" para a validação apontar o que falta.
  function readPrr() {
    const n = id => {
      const v = val(id);
      return v === '' ? '' : Number(v);
    };
    return {
      tratamento: val('p-trat'),
      controles: val('p-controles').trim(),
      acao: val('p-acao').trim(),
      responsavel: val('p-resp').trim(),
      prazo: val('p-prazo'),
      custo: parseBRL(val('p-custo')) || 0,
      metrica: val('p-metrica').trim(),
      unidadeMetrica: val('p-unid').trim(),
      sentido: val('p-sent'),
      critico: n('p-crit'),
      alerta: n('p-alerta'),
      ideal: n('p-ideal'),
      probRes: Number(val('p-probres')),
      impRes: Number(val('p-impres')),
    };
  }
  // Copia o texto de um elemento; usa seleção manual se a área de transferência não estiver disponível.
  // Copia o texto informado (ou, sem ele, o texto do elemento); sem permissão, seleciona o elemento.
  function copyText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    const t = text != null ? text : el.textContent;
    const fb = () => {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(rg);
      toast('Texto selecionado. Use Ctrl+C para copiar.');
    };
    try {
      navigator.clipboard
        .writeText(t)
        .then(() => toast('Texto copiado.'))
        .catch(fb);
    } catch (e) {
      fb();
    }
  }
  // Abre um risco na fase em que ele está (no mínimo a identificação).
  function openRisk(id) {
    const r = rk(id);
    if (!r) return;
    UI.view = 'risco';
    UI.rid = id;
    UI.tab = Math.max(2, curPhase(r));
    UI.draft = null;
    UI.warnAck = false;
    render();
  }
  // Nome do estado da métrica na exportação.
  const MST = { critico: 'Crítico', alerta: 'Alerta', ok: 'Ideal' };
  // Colunas da exportação, iguais no CSV e no Excel: título, tipo (txt, num, brl, x, data), largura máxima no Excel e como ler o valor.
  const EXPORT = [
    ['ID', 'txt', 10, r => r.id],
    ['Coordenadoria', 'txt', 14, r => r.unit],
    ['Título', 'txt', 40, r => r.titulo],
    ['Causa', 'txt', 50, r => r.causa],
    ['Evento', 'txt', 50, r => r.evento],
    ['Impacto', 'txt', 50, r => r.impacto],
    ['Objetivo afetado', 'txt', 40, r => r.objetivo],
    ['Probabilidade', 'num', 0, r => r.prob],
    ['Nota de impacto', 'num', 0, r => r.imp],
    ['Nível', 'num', 0, r => nivel(r) || ''],
    ['Faixa', 'txt', 12, r => (nivel(r) ? LV[band(nivel(r))] : '')],
    ['Situação', 'txt', 20, r => STAT[r.status][0]],
    ['Exposição estimada', 'brl', 0, r => r.exposicao],
    ['Exposição esperada', 'brl', 0, r => (nivel(r) ? econ(r).cur : '')],
    ['Tratamento', 'txt', 12, r => (r.prr ? cap(r.prr.tratamento) : '')],
    ['Ação', 'txt', 50, r => r.prr && r.prr.acao],
    ['Responsável', 'txt', 30, r => r.prr && r.prr.responsavel],
    ['Prazo', 'data', 0, r => r.prr && r.prr.prazo],
    ['Custo do PRR', 'brl', 0, r => r.prr && r.prr.custo],
    ['Exposição depois do PRR', 'brl', 0, r => (r.prr && nivel(r) ? econ(r).res : '')],
    ['Redução esperada', 'brl', 0, r => (r.prr && nivel(r) ? econ(r).gain : '')],
    ['Retorno por real', 'x', 0, r => (r.prr && nivel(r) && econ(r).ratio != null ? econ(r).ratio : '')],
    ['Métrica', 'txt', 40, r => r.prr && r.prr.metrica],
    ['Última medição', 'num', 0, r => (lastMed(r) ? lastMed(r).valor : '')],
    ['Estado da métrica', 'txt', 12, r => MST[metricSt(r)] || ''],
    ['Responsável pela resolução', 'txt', 24, r => (r.delegado ? r.delegado.nome : '')],
  ];
  // Linhas da exportação, do nível mais alto para o mais baixo.
  const expRows = () =>
    scope()
      .slice()
      .sort((a, b) => nivel(b) - nivel(a))
      .map(r => EXPORT.map(c => c[3](r)));
  // Botão "Baixar" que abre as opções de formato. Cada opção é uma ação (data-act) tratada em doAct.
  // extra: atributos acrescentados a cada opção (por exemplo, data-id da pessoa); label: texto do botão.
  const dlMenu = (opts, sm, extra, label) =>
    '<details class="dl-menu"><summary class="btn' +
    (sm ? ' sm' : '') +
    '">' +
    (label || 'Baixar') +
    '</summary><div class="dl-opts">' +
    opts
      .map(
        o =>
          '<button class="dl-opt" data-act="' +
          o[0] +
          '"' +
          (extra || '') +
          '><b>' +
          o[1] +
          '</b><small>' +
          o[2] +
          '</small></button>',
      )
      .join('') +
    '</div></details>';
  // Opções de download das listas de riscos e dos painéis.
  const DL_RISCOS = [
    ['dl-xlsx', 'Excel (.xlsx)', 'Colunas ajustadas, valores em reais e aba por coordenadoria'],
    ['dl-csv', 'CSV · riscos', 'Uma linha por risco, com todas as colunas'],
    ['dl-csv-unid', 'CSV · por coordenadoria', 'Totais de riscos e valores de cada coordenadoria'],
    ['dl-csv-med', 'CSV · medições', 'Cada medição das métricas dos PRRs'],
    ['dl-csv-quadro', 'CSV · quadro', 'Etapa do processo e quem resolve cada risco'],
    ['dl-csv-hist', 'CSV · histórico', 'Cada alteração: quem, quando, campo, de e para'],
  ];
  // Opções de download do relatório anual.
  const DL_REL = [
    ['dl-rep-md', 'Markdown (.md)', 'O relatório com títulos e tabelas'],
    ['dl-rep-txt', 'Texto (.txt)', 'O mesmo texto, sem marcação'],
    ['dl-csv-faixa', 'CSV · por coordenadoria e faixa', 'A tabela de riscos por faixa de nível'],
    ['dl-csv-unid', 'CSV · por coordenadoria', 'Totais de riscos e valores de cada coordenadoria'],
    ['dl-xlsx', 'Excel (.xlsx)', 'Riscos e totais por coordenadoria'],
  ];
  // Opções de download da justificativa de despesa.
  const DL_TCE = [
    ['dl-tce-md', 'Markdown (.md)', 'Com títulos e listas'],
    ['dl-tce-txt', 'Texto (.txt)', 'Sem marcação, para colar no processo'],
  ];
  // Colunas dos totais por coordenadoria (CSV e aba do Excel).
  const UCOLS = [
    ['Coordenadoria', 'txt'],
    ['Riscos ativos', 'num'],
    ['Alto ou extremo', 'num'],
    ['Exposição esperada', 'brl'],
    ['Depois dos PRRs', 'brl'],
    ['Redução esperada', 'brl'],
    ['Custo dos PRRs', 'brl'],
  ];
  // Totais por coordenadoria dos riscos avaliados e não encerrados; coordenadoria sem risco fica de fora.
  function porUnid() {
    const E = scope()
      .filter(r => r.status !== 'encerrado' && nivel(r))
      .map(r => ({ r, e: econ(r) }));
    return units()
      .map(un => {
        const xs = E.filter(q => q.r.unit === un),
          s = k => xs.reduce((a, q) => a + q.e[k], 0);
        return [
          un,
          xs.length,
          xs.filter(q => nivel(q.r) >= 12).length,
          s('cur'),
          s('res'),
          s('gain'),
          s('cost'),
        ];
      })
      .filter(l => l[1]);
  }
  // Colunas do CSV por coordenadoria e faixa: uma coluna por faixa de nível e o total.
  const FCOLS = () =>
    [['Coordenadoria', 'txt']].concat(
      LV.map(l => [l, 'num']),
      [['Total', 'num']],
    );
  // Riscos avaliados e não encerrados por coordenadoria e faixa (a mesma tabela da tela Relatório).
  function porFaixa() {
    const L = scope().filter(r => r.status !== 'encerrado' && nivel(r));
    return units().map(x =>
      [x].concat(
        LV.map((l, i) => L.filter(r => r.unit === x && band(nivel(r)) === i).length),
        [L.filter(r => r.unit === x).length],
      ),
    );
  }
  // Colunas do CSV de medições.
  const MCOLS = [
    ['ID', 'txt'],
    ['Coordenadoria', 'txt'],
    ['Título', 'txt'],
    ['Métrica', 'txt'],
    ['Unidade', 'txt'],
    ['Data', 'data'],
    ['Valor', 'dec'],
    ['Estado', 'txt'],
    ['Registrado por', 'txt'],
  ];
  // Uma linha por medição, com o estado que aquele valor teve nos limites do PRR (mesma regra de metricSt).
  function medRows() {
    const out = [];
    scope().forEach(r => {
      const p = r.prr;
      if (!p || !p.medicoes) return;
      p.medicoes.forEach(m =>
        out.push([
          r.id,
          r.unit,
          r.titulo,
          p.metrica,
          p.unidadeMetrica,
          m.ts,
          m.valor,
          MST[metricSt({ prr: Object.assign({}, p, { medicoes: [m] }) })] || '',
          m.por,
        ]),
      );
    });
    return out;
  }
  // Colunas do CSV do quadro.
  const QCOLS = [
    ['ID', 'txt'],
    ['Coordenadoria', 'txt'],
    ['Título', 'txt'],
    ['Etapa', 'txt'],
    ['Situação', 'txt'],
    ['Nível', 'num'],
    ['Responsável pela resolução', 'txt'],
    ['Delegado por', 'txt'],
    ['Delegado em', 'data'],
    ['Observação', 'txt'],
  ];
  // Uma linha por risco: etapa do quadro e quem resolve.
  const quadroRows = () =>
    scope().map(r => {
      const d = r.delegado;
      return [
        r.id,
        r.unit,
        r.titulo,
        etapaOf(r)[1],
        STAT[r.status][0],
        nivel(r) || '',
        d ? d.nome : '',
        d ? d.por : '',
        d ? d.ts : '',
        d ? d.nota : '',
      ];
    });
  // Colunas do CSV do histórico.
  const HCOLS = [
    ['Data e hora', 'txt'],
    ['Pessoa', 'txt'],
    ['Perfil', 'txt'],
    ['Coordenadoria', 'txt'],
    ['Risco', 'txt'],
    ['Ação', 'txt'],
    ['Campo', 'txt'],
    ['Valor anterior', 'txt'],
    ['Valor novo', 'txt'],
    ['Observação', 'txt'],
  ];
  // Uma linha por campo alterado (ou uma por ação sem campos), com os valores já legíveis (fmtV).
  function histRows() {
    const out = [];
    S.audit.forEach(a => {
      const base = [
        new Date(a.ts).toLocaleString('pt-BR'),
        a.user,
        PAPEL[a.role] || a.role,
        a.unit || '',
        a.riskId || '',
        a.action,
      ];
      (a.changes && a.changes.length ? a.changes : [null]).forEach(c =>
        out.push(
          base.concat(c ? [c.campo, fmtV(c.campo, c.de), fmtV(c.campo, c.para)] : ['', '', ''], [
            a.note || '',
          ]),
        ),
      );
    });
    return out;
  }
  // Markdown simples para ler na tela: títulos (#, ##, ###), listas (-), tabelas (|), **negrito** e parágrafos.
  // O texto é escapado antes (esc); só essa marcação vira HTML.
  function mdHtml(md) {
    const inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const cells = l =>
      l
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(c => c.trim());
    const L = String(md).split('\n'),
      out = [];
    for (let i = 0; i < L.length; i++) {
      const l = L[i],
        h = l.match(/^(#{1,3}) (.*)$/);
      if (h) out.push('<h' + (h[1].length + 2) + '>' + inl(h[2]) + '</h' + (h[1].length + 2) + '>');
      else if (/^- /.test(l)) {
        const it = [];
        while (i < L.length && /^- /.test(L[i])) it.push('<li>' + inl(L[i++].slice(2)) + '</li>');
        i--;
        out.push('<ul>' + it.join('') + '</ul>');
      } else if (/^\|/.test(l)) {
        const rows = [];
        while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
        i--;
        // A segunda linha da tabela é o separador (|---|---|).
        const body = rows.filter((r, k) => k !== 1);
        out.push(
          '<div class="scroll"><table class="tbl compact"><thead><tr>' +
            cells(body[0])
              .map(c => '<th>' + inl(c) + '</th>')
              .join('') +
            '</tr></thead><tbody>' +
            body
              .slice(1)
              .map(
                r =>
                  '<tr>' +
                  cells(r)
                    .map(c => '<td>' + inl(c) + '</td>')
                    .join('') +
                  '</tr>',
              )
              .join('') +
            '</tbody></table></div>',
        );
      } else if (l.trim()) out.push('<p>' + inl(l) + '</p>');
    }
    return '<div class="md">' + out.join('') + '</div>';
  }
  // O mesmo Markdown como texto puro, para o .txt: sem #, sem ** e com as tabelas em linhas "a · b · c".
  const mdTxt = md =>
    String(md)
      .split('\n')
      .filter(l => !/^\|[\s|:-]+\|$/.test(l))
      .map(l =>
        l
          .replace(/^#{1,3} /, '')
          .replace(/\*\*/g, '')
          .replace(/^\| ?(.*?) ?\|$/, (x, c) => c.split(' | ').join(' · ')),
      )
      .join('\n');
  // Texto de dado dentro do Markdown: sem quebra de linha e sem "|" (que quebraria a tabela).
  const mdc = t =>
    String(t == null ? '' : t)
      .replace(/[\r\n]+/g, ' ')
      .replace(/\|/g, '/');
  // Célula do CSV entre aspas, com aspas internas duplicadas.
  const csvq = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  // Excel em português lê ";" como separador e vírgula como decimal; o BOM garante os acentos.
  const csvv = (v, k) =>
    v == null || v === '' || v === false
      ? ''
      : k === 'data'
        ? fd(v)
        : k === 'brl' || k === 'x' || k === 'dec'
          ? String(Math.round(Number(v) * 100) / 100).replace('.', ',')
          : v;
  // CSV genérico, no mesmo formato do CSV de riscos: cabeçalho e linhas, cada coluna com o seu tipo.
  const csvOf = (cols, rows) =>
    '\ufeff' +
    cols.map(c => csvq(c[0])).join(';') +
    '\r\n' +
    rows.map(r => r.map((v, i) => csvq(csvv(v, cols[i][1]))).join(';')).join('\r\n');
  // CSV dos riscos visíveis, separado por ";".
  const csvAll = () => csvOf(EXPORT, expRows());
  // Planilha Excel com a aba Riscos e a aba Por coordenadoria (app/planilha.js).
  function xlsxAll() {
    const cols = EXPORT.map(c => ({ t: c[0], k: c[1], w: c[2] || 22 }));
    const rows = expRows().map(r => r.map(v => (v === false || v == null ? '' : v)));
    const ucols = UCOLS.map(c => ({ t: c[0], k: c[1], w: 22 }));
    return xlsx([
      { nome: 'Riscos', cols, rows },
      { nome: 'Por coordenadoria', cols: ucols, rows: porUnid() },
    ]);
  }
  // Pede ao assistente de IA para estruturar um texto livre ou revisar o que já foi escrito.
  async function runIA(review) {
    const st = document.getElementById('ia-status'),
      f = readIdent(),
      free = val('ia-text').trim();
    if (review ? !(f.causa || f.evento || f.impacto || f.objetivo || f.titulo) : !free) {
      toast(
        review
          ? 'Escreva algo nos campos antes de pedir a revisão.'
          : 'Descreva o que preocupa você no campo de texto.',
      );
      return;
    }
    const btns = root.querySelectorAll('[data-act="ia"],[data-act="ia-review"]');
    btns.forEach(b => (b.disabled = true));
    if (st) st.textContent = 'Pensando…';
    try {
      const { ia: d } = await api('POST', 'ai', { review, text: free, fields: f });
      UI.ia = UI.ia || {};
      UI.ia[UI.rid] = d;
      const cur = Object.assign({}, f);
      ['titulo', 'causa', 'evento', 'impacto', 'objetivo'].forEach(k => {
        if (d[k] && String(d[k]).trim()) cur[k] = String(d[k]).trim();
      });
      UI.draft = Object.assign({ _rid: UI.rid }, cur);
      if (UI.view === 'risco') render(true);
      toast(
        d.ehRisco === false
          ? 'Isto parece um problema. Veja o aviso e o evento reescrito.'
          : 'Campos preenchidos. Confira antes de salvar.',
      );
    } catch (e) {
      if (st) st.textContent = e.message;
      btns.forEach(b => (b.disabled = false));
    }
  }
  // Recarrega os dados e redesenha a tela.
  const refresh = async keep => {
    await load();
    render(keep);
  };
  // Executa a ação de um botão (data-act). As permissões são conferidas de novo no servidor;
  // aqui só se escolhe a chamada e a mensagem.
  async function doAct(a, el) {
    const u = me(),
      r = UI.rid && UI.rid !== 'new' ? rk(UI.rid) : null;
    const act2 = (action, extra) =>
      api('POST', 'risks/' + r.id + '/action', Object.assign({ action }, extra || {}));
    switch (a) {
      // Navegação, filtros e sessão
      case 'novo':
        UI.view = 'risco';
        UI.rid = 'new';
        // O novo risco começa pelo contexto da coordenadoria (fase 1).
        UI.tab = 1;
        UI.draft = null;
        UI.warnAck = false;
        render();
        break;
      case 'clearfilt':
        UI.filt = { unit: '', nv: '', st: '', cell: null };
        render(true);
        break;
      case 'logout':
        await api('POST', 'logout');
        S = { me: null, risks: [], audit: [], alerts: [], ctx: {}, team: [], users: [], units: [] };
        UI.view = 'paineis';
        UI.authErr = '';
        render();
        break;
      // Assistente de IA
      case 'ia':
        runIA(false);
        break;
      case 'ia-review':
        runIA(true);
        break;
      case 'ia-notas': {
        const d = UI.ia && UI.ia[r.id];
        if (!d) break;
        const p = Math.min(5, Math.max(1, Number(d.probabilidade) || 1)),
          i = Math.min(5, Math.max(1, Number(d.impactoNota) || 1));
        const rp = document.querySelector('input[name="prob"][value="' + p + '"]'),
          ri = document.querySelector('input[name="imp"][value="' + i + '"]');
        if (rp) rp.checked = true;
        if (ri) ri.checked = true;
        updAv();
        break;
      }
      case 'ia-acao': {
        const d = UI.ia && UI.ia[r.id],
          t = d && d.acoes && d.acoes[Number(el.dataset.i)],
          ta = document.getElementById('p-acao');
        if (t && ta) {
          ta.value = ta.value ? ta.value + '\n' + t : t;
          toast('Ação adicionada ao PRR.');
        }
        break;
      }
      // Fases 2 a 4: gravar o risco e enviar o PRR
      case 'save-ident': {
        const f = readIdent();
        if (['titulo', 'causa', 'evento', 'impacto', 'objetivo'].some(k => !f[k])) {
          toast('Preencha todos os campos da identificação.');
          break;
        }
        if (checkRisk(f).length && !UI.warnAck) {
          UI.warnAck = true;
          toast('Há avisos nos campos. Revise ou clique de novo para salvar assim mesmo.');
          break;
        }
        if (UI.rid === 'new') {
          const j = await api('POST', 'risks', f);
          await load();
          UI.rid = j.risk.id;
          UI.tab = 3;
          UI.draft = null;
          UI.warnAck = false;
          render();
          toast('Risco ' + j.risk.id + ' cadastrado. Agora avalie probabilidade e impacto.');
        } else {
          await api('POST', 'risks/' + r.id + '/ident', f);
          UI.draft = null;
          UI.warnAck = false;
          await refresh(true);
          toast('Identificação salva.');
        }
        break;
      }
      case 'save-aval': {
        const p = Number((document.querySelector('input[name="prob"]:checked') || {}).value || 0),
          i = Number((document.querySelector('input[name="imp"]:checked') || {}).value || 0);
        if (!p || !i) {
          toast('Escolha a probabilidade e o impacto.');
          break;
        }
        const expTxt = val('f-exp').trim(),
          exposicao = expTxt ? parseBRL(expTxt) : 0;
        if (!Number.isFinite(exposicao)) {
          toast('Valor da exposição não entendido. Use, por exemplo, 4.000.000.');
          break;
        }
        await api('POST', 'risks/' + r.id + '/aval', { prob: p, imp: i, exposicao });
        await refresh(true);
        toast('Avaliação salva: nível ' + p * i + '.');
        break;
      }
      case 'save-prr':
      case 'send-prr': {
        const prr = readPrr();
        await api('POST', 'risks/' + r.id + '/prr', { prr });
        if (a === 'save-prr') {
          await refresh(true);
          toast('Rascunho do PRR salvo.');
          break;
        }
        const errs = MIRA.prrErrors(prr);
        if (errs.length) {
          await load();
          showPrrErrors(errs);
          break;
        }
        try {
          await act2('send-prr');
        } catch (e) {
          showPrrErrors((e.data && e.data.errors) || [e.message]);
          break;
        }
        await refresh(true);
        toast('PRR enviado ao gestor da ' + r.unit + '.');
        break;
      }
      // Decisões sobre o PRR: gestor valida, Alta Gestão aprova, ambos podem devolver com motivo
      case 'gestor-ok':
        await act2('gestor-ok', { motivo: val('ap-motivo') });
        await refresh(true);
        toast('PRR encaminhado à Alta Gestão de Riscos.');
        break;
      case 'altagestao-ok':
        await act2('altagestao-ok', { motivo: val('ap-motivo') });
        UI.tab = 5;
        await load();
        render();
        toast('PRR aprovado.');
        break;
      case 'gestor-dev':
      case 'altagestao-dev':
        await act2(a, { motivo: val('ap-motivo') });
        await refresh(true);
        toast('PRR devolvido ao cadastrador.');
        break;
      // Fase 5: medições, reavaliação, evento ocorrido e encerramento
      case 'add-med':
        await act2('add-med', { valor: val('m-valor') });
        await refresh(true);
        toast('Medição registrada.');
        break;
      case 'reaval':
        await act2('reaval', {
          prob: Number(val('r-prob')),
          imp: Number(val('r-imp')),
          motivo: val('r-motivo'),
        });
        await refresh(true);
        toast('Nível reavaliado.');
        break;
      case 'evento':
        await act2('evento');
        await refresh(true);
        toast('Evento registrado. Reavalie o nível.');
        break;
      case 'encerrar':
        await act2('encerrar');
        await refresh(true);
        toast('Risco encerrado.');
        break;
      // Fase 1: contexto da coordenadoria
      // Passo 1 do novo risco: grava o escopo (se mudou) e segue para a identificação.
      case 'ctx-seguir': {
        const escopo = val('c-escopo').trim();
        if (!escopo) {
          toast('Descreva o escopo do contexto antes de seguir.');
          break;
        }
        if (escopo !== ((S.ctx[me().unit] || {}).escopo || '')) await api('POST', 'ctx/escopo', { escopo });
        UI.tab = 2;
        await refresh();
        toast('Contexto salvo. Agora identifique o risco.');
        break;
      }
      case 'save-ctx':
        await api('POST', 'ctx/escopo', { escopo: val('c-escopo') });
        await refresh(true);
        toast('Escopo salvo.');
        break;
      case 'add-marco':
        await api('POST', 'ctx/marco', { op: 'add', marco: val('c-marco'), data: val('c-data') });
        await refresh(true);
        toast('Marco incluído.');
        break;
      case 'rm-marco':
        await api('POST', 'ctx/marco', { op: 'remove', idx: Number(el.dataset.i) });
        await refresh(true);
        break;
      // Avisos
      case 'lidos':
        await api('POST', 'alerts/read', {});
        await refresh(true);
        break;
      // Textos para copiar e arquivos para baixar
      case 'copytce':
        copyText('tcetext', tceMd(rk(UI.tce)));
        break;
      case 'dl-tce-md':
        download('justificativa-' + UI.tce + '.md', tceMd(rk(UI.tce)), 'text/markdown;charset=utf-8');
        break;
      case 'dl-tce-txt':
        download('justificativa-' + UI.tce + '.txt', mdTxt(tceMd(rk(UI.tce))), 'text/plain;charset=utf-8');
        break;
      case 'closetce':
        UI.tce = null;
        render(true);
        break;
      case 'copyrep':
        copyText('reptext', reportMd());
        break;
      case 'dl-rep-md':
        download('relatorio-alta-gestao-mira.md', reportMd(), 'text/markdown;charset=utf-8');
        break;
      case 'dl-rep-txt':
        download('relatorio-alta-gestao-mira.txt', mdTxt(reportMd()), 'text/plain;charset=utf-8');
        break;
      case 'dl-csv':
        download('riscos-mira.csv', csvAll(), 'text/csv;charset=utf-8');
        break;
      case 'dl-csv-unid':
        download('riscos-por-coordenadoria-mira.csv', csvOf(UCOLS, porUnid()), 'text/csv;charset=utf-8');
        break;
      case 'dl-csv-faixa':
        download('riscos-por-faixa-mira.csv', csvOf(FCOLS(), porFaixa()), 'text/csv;charset=utf-8');
        break;
      case 'dl-csv-med':
        download('medicoes-mira.csv', csvOf(MCOLS, medRows()), 'text/csv;charset=utf-8');
        break;
      case 'dl-csv-quadro':
        download('quadro-mira.csv', csvOf(QCOLS, quadroRows()), 'text/csv;charset=utf-8');
        break;
      case 'dl-csv-hist':
        download('historico-mira.csv', csvOf(HCOLS, histRows()), 'text/csv;charset=utf-8');
        break;
      case 'dl-xlsx':
        download(
          'riscos-mira.xlsx',
          xlsxAll(),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        break;
      // Usuários e coordenadorias (só administrador): senha, desativação e remoção de coordenadoria vazia
      case 'pw-ask':
        UI.pwFor = el.dataset.id;
        render(true);
        break;
      case 'pw-cancel':
        UI.pwFor = null;
        render(true);
        break;
      case 'reset-pw':
        await api('POST', 'users/' + el.dataset.id + '/password', { password: val('pw-new') });
        UI.pwFor = null;
        await refresh(true);
        toast('Senha redefinida. A pessoa precisa entrar de novo.');
        break;
      case 'toggle-ativo':
        await api('POST', 'users/' + el.dataset.id + '/ativo', { ativo: el.dataset.v === '1' });
        await refresh(true);
        break;
      // Quadro: o gestor abre o formulário de delegação no cartão, grava ou cancela
      case 'deleg-ask':
        UI.delegFor = el.dataset.id;
        render(true);
        break;
      case 'deleg-cancel':
        UI.delegFor = null;
        render(true);
        break;
      case 'deleg-save': {
        // Lê o formulário antes de redesenhar: depois do refresh os campos já não existem.
        const para = val('dg-para');
        await api('POST', 'risks/' + el.dataset.id + '/action', {
          action: 'delegar',
          para,
          nota: val('dg-nota').trim(),
        });
        UI.delegFor = null;
        await refresh(true);
        toast(para ? 'Responsável definido.' : 'Responsável retirado.');
        break;
      }
      // Coordenadorias: editar o nome por extenso
      case 'unit-edit':
        UI.unitEdit = el.dataset.sigla;
        render(true);
        break;
      case 'unit-edit-cancel':
        UI.unitEdit = null;
        render(true);
        break;
      case 'unit-edit-save':
        await api('POST', 'units/nome', { sigla: el.dataset.sigla, nome: val('ue-nome').trim() });
        UI.unitEdit = null;
        await refresh(true);
        toast('Nome da coordenadoria atualizado.');
        break;
      case 'ped-ask':
        UI.pedFor = el.dataset.id;
        render();
        break;
      case 'ped-cancel':
        UI.pedFor = null;
        render(true);
        break;
      case 'ped-md': {
        const x = S.users.find(p => p.id === el.dataset.id);
        if (x)
          download('relatorio-de-pedido-' + x.username + '.md', pedidoMd(x), 'text/markdown;charset=utf-8');
        break;
      }
      case 'ped-txt': {
        const x = S.users.find(p => p.id === el.dataset.id);
        if (x)
          download(
            'relatorio-de-pedido-' + x.username + '.txt',
            mdTxt(pedidoMd(x)),
            'text/plain;charset=utf-8',
          );
        break;
      }
      case 'user-del-ask':
        UI.delFor = el.dataset.id;
        render(true);
        break;
      case 'user-del-cancel':
        UI.delFor = null;
        render(true);
        break;
      case 'user-del':
        await api('POST', 'users/' + el.dataset.id + '/apagar', {});
        UI.delFor = null;
        await refresh(true);
        toast('Pessoa apagada.');
        break;
      case 'unit-remove':
        await api('POST', 'units/remove', { sigla: el.dataset.sigla });
        await refresh(true);
        toast('Coordenadoria removida.');
        break;
    }
  }
  // Lista no formulário o que falta para enviar o PRR.
  function showPrrErrors(errs) {
    const e = document.getElementById('p-err');
    if (e)
      e.innerHTML =
        '<div class="warn-box"><b>Corrija antes de enviar:</b><ul style="margin:4px 0 0 18px;padding:0">' +
        errs.map(x => '<li>' + esc(x) + '</li>').join('') +
        '</ul></div>';
  }
  // Durante uma gravação a tela fica marcada como ocupada; um novo envio avisa em vez de ser ignorado em silêncio.
  function setBusy(on) {
    UI.busy = on;
    if (root.setAttribute) {
      if (on) root.setAttribute('aria-busy', 'true');
      else root.removeAttribute('aria-busy');
    }
  }
  // Verdadeiro enquanto uma gravação está em andamento; avisa a pessoa para aguardar.
  const isBusy = () => {
    if (UI.busy) toast('Aguarde: a alteração anterior ainda está sendo salva.');
    return UI.busy;
  };
  // Envolve doAct: marca a tela como ocupada, mostra o erro do servidor e libera no fim.
  async function act(a, el) {
    if (isBusy()) return;
    setBusy(true);
    try {
      await doAct(a, el);
      const dm = el && el.closest ? el.closest('details.dl-menu') : null;
      if (dm) dm.open = false;
    } catch (e) {
      toast(e.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }
  // Atualiza o resultado da avaliação ao escolher probabilidade ou impacto.
  function updAv() {
    const p = Number((document.querySelector('input[name="prob"]:checked') || {}).value || 0),
      i = Number((document.querySelector('input[name="imp"]:checked') || {}).value || 0);
    const e = document.getElementById('av-res');
    if (e) e.innerHTML = avRes(p, i);
    const c = document.getElementById('exp-conta');
    if (c) c.innerHTML = expConta(p, parseBRL(val('f-exp')));
  }
  // Depois de entrar: o administrador abre em Usuários; Alta Gestão e CGGE na Alta Gestão; os demais, no Operacional.
  function afterLogin() {
    const u = me();
    UI.view = u.papel === 'admin' ? 'usuarios' : 'paineis';
    UI.panel = u.papel === 'altagestao' || u.papel === 'cgge' ? 'alta' : 'op';
    UI.rid = null;
    UI.draft = null;
    UI.tce = null;
    UI.filt = { unit: '', nv: '', st: '', cell: null };
  }
  // Envia o login.
  async function onAuth() {
    UI.authErr = '';
    try {
      const body = { username: val('a-user').trim().toLowerCase(), password: val('a-pw') };
      await api('POST', 'login', body);
      await load();
      afterLogin();
      render();
    } catch (e) {
      UI.authErr = e.message;
      render();
    }
  }
  // Cliques da tela inteira, por delegação no elemento raiz (data-act, data-open, data-nav...).
  const onClick = e => {
    const pk = e.target.closest('summary[data-peek]');
    if (pk && pk.dataset.peek) {
      UI.ctxPeek = !pk.parentNode.open;
      return;
    }
    const rs = e.target.closest('[data-res]');
    if (rs && rs.dataset.res) {
      const r = rk(UI.rid),
        [dp, di] = rs.dataset.res.split(',').map(Number),
        lim = v => Math.min(5, Math.max(1, v));
      const sp = document.getElementById('p-probres'),
        si = document.getElementById('p-impres');
      if (r && sp && si) {
        sp.value = String(lim(r.prob + dp));
        si.value = String(lim(r.imp + di));
        prrLive();
      }
      return;
    }
    const t = e.target.closest(
      '[data-act],[data-open],[data-nav],[data-tab],[data-panel],[data-cell],[data-tce],[data-stfilt]',
    );
    if (!t) return;
    if (t.dataset.open) {
      e.preventDefault();
      openRisk(t.dataset.open);
      return;
    }
    if (t.dataset.nav) {
      const n = t.dataset.nav;
      UI.rid = null;
      UI.draft = null;
      UI.warnAck = false;
      if (n === 'novo') {
        act('novo');
        return;
      }
      if (n !== 'riscos' || UI.view !== 'riscos') UI.filt = { unit: '', nv: '', st: '', cell: null };
      UI.view = n;
      render();
      return;
    }
    if (t.dataset.tab) {
      UI.tab = Number(t.dataset.tab);
      render(true);
      return;
    }
    if (t.dataset.panel) {
      UI.panel = t.dataset.panel;
      render();
      return;
    }
    if (t.dataset.cell) {
      const [p, i] = t.dataset.cell.split('-').map(Number);
      const same = UI.filt.cell && UI.filt.cell.p === p && UI.filt.cell.i === i;
      UI.filt.cell = same ? null : { p, i };
      render(true);
      return;
    }
    if (t.dataset.tce) {
      UI.tce = t.dataset.tce;
      render(true);
      const x = document.getElementById('tcetext');
      if (x) x.scrollIntoView({ block: 'center' });
      return;
    }
    if (t.dataset.stfilt) {
      UI.filt.st = UI.filt.st === t.dataset.stfilt ? '' : t.dataset.stfilt;
      render(true);
      return;
    }
    if (t.dataset.act) act(t.dataset.act, t);
  };
  // Dica flutuante dos gráficos: lê data-tip como texto puro (textContent), no hover e no foco do teclado.
  let tipEl = null;
  // Esconde a dica flutuante.
  function hideTip() {
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
    }
  }
  // Mostra a dica flutuante perto do elemento, sem sair da tela.
  function showTip(t) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tip';
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = t.dataset.tip;
    const r = t.getBoundingClientRect(),
      w = tipEl.offsetWidth,
      h = tipEl.offsetHeight;
    tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tipEl.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px';
  }
  // Mostra ou esconde a dica conforme o elemento sob o mouse ou o foco.
  const onTip = e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t);
    else hideTip();
  };
  // Mudanças em selects, filtros e caixas de marcar.
  const onChange = e => {
    const t = e.target;
    if (t.dataset.filter) {
      UI.filt[t.dataset.filter] = t.value;
      render(true);
      return;
    }
    if (t.dataset.qfilt !== undefined) {
      UI.qfilt = t.value;
      render(true);
      return;
    }
    if (t.dataset.ctxunit !== undefined) {
      UI.ctxUnit = t.value;
      render(true);
      return;
    }
    if (t.name === 'prob' || t.name === 'imp') {
      updAv();
      return;
    }
    if (isPrrField(t)) {
      prrLive();
      return;
    }
    if (t.id === 'n-papel') {
      const w = document.getElementById('n-unit-wrap');
      if (w) w.hidden = t.value === 'altagestao' || t.value === 'cgge';
      return;
    }
    if (t.dataset.marco !== undefined) {
      act2marco(Number(t.dataset.marco));
    }
  };
  // Marca ou desmarca um marco do cronograma como concluído.
  async function act2marco(idx) {
    if (isBusy()) return;
    setBusy(true);
    try {
      await api('POST', 'ctx/marco', { op: 'toggle', idx });
      await refresh(true);
    } catch (e) {
      toast(e.message);
      await refresh(true);
    } finally {
      setBusy(false);
    }
  }
  // Verdadeiro para os campos do PRR (id começa com "p-").
  const isPrrField = t => !!t.id && t.id.indexOf('p-') === 0 && t.id !== 'p-err';
  // Resumo do PRR e guia dos limites que acompanham o formulário: recalculam com o que está digitado.
  function prrLive() {
    const el = document.getElementById('prr-live'),
      r = UI.rid && UI.rid !== 'new' ? rk(UI.rid) : null;
    if (el && r) el.innerHTML = prrLiveHTML(r, readPrr());
    const g = document.getElementById('lim-guia');
    if (g) g.innerHTML = limGuia(readPrr());
    const rc = document.getElementById('res-conta');
    if (rc && r) rc.innerHTML = resConta(r, readPrr());
  }
  // Digitação: atualiza a identificação ou o resumo do PRR ao vivo e filtra a lista de pessoas.
  const onInput = e => {
    if (e.target.dataset.brl !== undefined) {
      const h = document.getElementById(e.target.id + '-v');
      if (h) h.textContent = brlLido(e.target.value);
      if (e.target.id === 'f-exp') updAv();
    }
    if (e.target.dataset.ubusca !== undefined) {
      const q = e.target.value.trim().toLowerCase();
      root
        .querySelectorAll('tr[data-busca]')
        .forEach(tr => (tr.hidden = !!q && !tr.dataset.busca.includes(q)));
      return;
    }
    if (e.target.dataset.live) {
      UI.warnAck = false;
      refreshIdent();
    } else if (isPrrField(e.target)) prrLive();
  };
  // Envio de formulários: login, cadastro de pessoa e criação de coordenadoria.
  const onSubmit = e => {
    e.preventDefault();
    if (e.target.id === 'auth-form') {
      onAuth();
      return;
    }
    if (e.target.id === 'user-form') {
      const papel = val('n-papel');
      act2user({
        username: val('n-user'),
        papel,
        unit: papel === 'altagestao' || papel === 'cgge' ? null : val('n-unit'),
        password: val('n-pw'),
      });
      return;
    }
    if (e.target.id === 'ped-form') {
      act2pedido(UI.pedFor);
      return;
    }
    if (e.target.id === 'unit-form') act2unit({ sigla: val('u-sigla').trim(), nome: val('u-nome').trim() });
  };
  // Lê o relatório de pedido de um formulário (prefixo dos ids). O PDF vai em base64; o servidor confere tudo.
  async function readPedido(px) {
    const f = fileOf(px + '-ped-pdf');
    if (f && f.size > SEI_MAX) throw new Error('O PDF pode ter no máximo 10 MB.');
    return {
      tipo: val(px + '-ped-tipo'),
      nome: val(px + '-ped-nome').trim(),
      numero: val(px + '-ped-num').trim(),
      data: val(px + '-ped-data'),
      arquivo: f ? f.name : '',
      pdf: f ? toB64(await f.arrayBuffer()) : '',
    };
  }
  // Cadastra uma pessoa (só administrador), com o relatório de pedido.
  async function act2user(b) {
    if (isBusy()) return;
    setBusy(true);
    try {
      b.pedido = await readPedido('n');
      await api('POST', 'users', b);
      await refresh(true);
      toast('Pessoa cadastrada.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  // Registra o relatório de pedido de quem já tem conta (só administrador).
  async function act2pedido(id) {
    if (isBusy() || !id) return;
    setBusy(true);
    try {
      await api('POST', 'users/' + id + '/pedido', { pedido: await readPedido('p') });
      UI.pedFor = null;
      await refresh(true);
      toast('Relatório de pedido registrado.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  // Cria uma coordenadoria (só administrador).
  async function act2unit(b) {
    if (isBusy()) return;
    setBusy(true);
    try {
      await api('POST', 'units', b);
      await refresh(true);
      toast('Coordenadoria ' + b.sigla + ' criada.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('pointerover', onTip);
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', onTip);
  root.addEventListener('focusout', hideTip);
  /* ===== Início ===== */
  (async () => {
    try {
      const st = await api('GET', 'status');
      UI.sampleOk = !!st.ai;
      try {
        await load();
        afterLogin();
      } catch (e) {
        /* sem sessão: mostra o login */
      }
    } catch (e) {
      UI.authErr = 'Não foi possível falar com o servidor.';
    }
    UI.ready = true;
    render();
  })();
  return () => {
    alive = false;
    hideTip();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('pointerover', onTip);
    root.removeEventListener('pointerleave', hideTip);
    root.removeEventListener('focusin', onTip);
    root.removeEventListener('focusout', hideTip);
    root.innerHTML = '';
  };
}
