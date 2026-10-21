// Calendário do mês: receitas e despesas por dia, e a lista do dia escolhido.
import { monthTx, counted } from '../store.js';
import { icon, lastDay, pad, today, dayLabel, round2 } from '../util.js';
import { UI, $m, monthSwitcher, scopeChips, empty, on, rerender, pageHead } from '../ui.js';
import { txRow } from './transactions.js';

const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const short = (v) => (v >= 1000 ? `${round2(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : Math.round(v).toLocaleString('pt-BR'));

export function renderCalendar() {
  const ym = UI.month;
  const list = monthTx(ym, UI.scope);
  const days = new Map();
  for (const t of list) {
    if (!counted(t) || (t.type !== 'income' && t.type !== 'expense')) continue;
    const d = days.get(t.date) || { inc: 0, exp: 0, pending: false };
    if (t.type === 'income') d.inc += t.amount;
    else d.exp += t.amount;
    if (!t.paid && !t.cardId) d.pending = true;
    days.set(t.date, d);
  }
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const sel = UI.calDay && UI.calDay.startsWith(ym) ? UI.calDay : today().startsWith(ym) ? today() : `${ym}-01`;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="cal-cell blank"></span>');
  for (let d = 1; d <= lastDay(ym); d++) {
    const iso = `${ym}-${pad(d)}`;
    const v = days.get(iso);
    cells.push(`<button class="cal-cell ${iso === sel ? 'on' : ''} ${iso === today() ? 'today' : ''}" data-action="cal-day" data-v="${iso}" aria-label="${dayLabel(iso)}">
      <b>${d}</b>${v?.inc ? `<i class="pos">${UI.hide ? '•' : short(v.inc)}</i>` : ''}${v?.exp ? `<i class="neg">${UI.hide ? '•' : short(v.exp)}</i>` : ''}${v?.pending ? '<em class="dot-pend" title="Pendente"></em>' : ''}</button>`);
  }
  const dayList = list.filter((t) => t.date === sel).sort((a, b) => (a.type === 'income' ? -1 : 1));
  return `<section>
    ${pageHead('Calendário', { back: '#/mais', right: monthSwitcher() })}
    ${scopeChips()}
    <article class="card cal">
      <div class="cal-grid">${WEEK.map((w) => `<span class="cal-w">${w}</span>`).join('')}${cells.join('')}</div>
      <p class="legend-inline"><i class="inc"></i>Receitas <i class="exp"></i>Despesas <em class="dot-pend"></em> Pendente</p>
    </article>
    <article class="card">
      <header class="card-head"><h2>${dayLabel(sel)}</h2><button class="link" data-action="new-tx" data-kind="expense">${icon('plus', 14)} Lançar</button></header>
      ${dayList.length ? `<ul class="list">${dayList.map((t) => txRow(t)).join('')}</ul>` : empty('calendar', 'Nada neste dia', 'Escolha outro dia no calendário.')}
    </article>
  </section>`;
}

on({ 'cal-day': (el) => ((UI.calDay = el.dataset.v), rerender()) });
