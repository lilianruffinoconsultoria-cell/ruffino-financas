// Calendário único do app: as contas a pagar e a receber do mês, por vencimento.
// `calendarWidget` aparece em A pagar e receber (visão Calendário) e no Início, sempre com a mesma legenda.
// A rota antiga #/calendario é um alias para A pagar e receber › Calendário (main.js).
// O clique no dia ('cal-day') abre a lista do dia, definida em payables.js.
import { S, save, payablesOf, dueOf, payableState } from '../store.js';
import { icon, lastDay, pad, today, dayLabel, round2 } from '../util.js';
import { UI, on } from '../ui.js';

const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const short = (v) => (v >= 1000 ? `${round2(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : Math.round(v).toLocaleString('pt-BR'));

/** Resumo por dia de vencimento: valores em aberto e contagem de cada marcador. */
function dayMap(ym, scope) {
  const days = new Map();
  const get = (iso) => {
    if (!days.has(iso)) days.set(iso, { inc: 0, exp: 0, pay: 0, rec: 0, late: 0, done: 0 });
    return days.get(iso);
  };
  for (const t of payablesOf(ym, scope)) {
    const d = get(dueOf(t));
    const st = payableState(t);
    if (st === 'baixada') d.done++;
    else {
      d[t.type === 'income' ? 'rec' : 'pay']++;
      d[t.type === 'income' ? 'inc' : 'exp'] += t.amount;
      if (st === 'vencida') d.late++;
    }
  }
  return days;
}

/** Marcadores do dia: a pagar (vermelho), a receber (verde), vencida (losango), paga/recebida (check). */
function markers(v) {
  if (!v || !(v.pay || v.rec || v.late || v.done)) return '';
  return `<span class="cal-mk" aria-hidden="true">${v.pay ? '<em class="mk pay"></em>' : ''}${v.rec ? '<em class="mk rec"></em>' : ''}${v.late ? '<em class="mk late"></em>' : ''}${v.done ? '<em class="mk done">✓</em>' : ''}</span>`;
}

function dayLabelFull(iso, v) {
  const parts = [];
  if (v?.pay) parts.push(`${v.pay} a pagar`);
  if (v?.rec) parts.push(`${v.rec} a receber`);
  if (v?.late) parts.push(`${v.late} vencida(s)`);
  if (v?.done) parts.push(`${v.done} paga(s) ou recebida(s)`);
  return `${dayLabel(iso)}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

/** Legenda única, igual em todo lugar. */
const LEGEND = `<p class="legend-inline cal-legend"><span><em class="mk pay"></em>A pagar</span><span><em class="mk rec"></em>A receber</span><span><em class="mk late"></em>Vencida</span><span><em class="mk done">✓</em>Paga/recebida</span></p>`;

/**
 * Grade do mês com as contas por vencimento. Valores do dia = o que está em aberto (verde a receber,
 * vermelho a pagar). `compact` (Início): células menores, sem os valores; a legenda é a mesma.
 */
export function calendarWidget({ ym = UI.month, scope = UI.scope, compact = false } = {}) {
  const days = dayMap(ym, scope);
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const sel = UI.calDay && UI.calDay.startsWith(ym) ? UI.calDay : '';
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="cal-cell blank"></span>');
  for (let d = 1; d <= lastDay(ym); d++) {
    const iso = `${ym}-${pad(d)}`;
    const v = days.get(iso);
    const amounts = compact ? '' : `${v?.inc ? `<i class="pos">${UI.hide ? '•' : short(v.inc)}</i>` : ''}${v?.exp ? `<i class="neg">${UI.hide ? '•' : short(v.exp)}</i>` : ''}`;
    cells.push(`<button class="cal-cell ${iso === sel ? 'on' : ''} ${iso === today() ? 'today' : ''} ${v?.late ? 'has-late' : ''}" data-action="cal-day" data-v="${iso}" aria-label="${dayLabelFull(iso, v)}">
      <b>${d}</b>${amounts}${markers(v)}</button>`);
  }
  return `<div class="cal ${compact ? 'compact' : ''}"><div class="cal-grid">${WEEK.map((w) => `<span class="cal-w">${w}</span>`).join('')}${cells.join('')}</div>${LEGEND}
    <p class="muted small cal-tip">${icon('info', 14)} Toque num dia para ver as contas e os lançamentos, pagar, receber e lançar.</p></div>`;
}

on({
  // link "Abrir" do bloco do Início: A pagar e receber já na visão Calendário
  'cal-open': () => {
    S.settings.payablesView = 'calendar';
    save();
  },
});
