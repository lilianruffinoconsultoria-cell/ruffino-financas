// Lista de transações do mês, com busca, filtros por tipo e pendências.
import { S, category, account, card, monthTx, inScope, monthSummary, togglePaid } from '../store.js';
import { esc, icon, dayLabel, shortDate, round2 } from '../util.js';
import { UI, $m, monthSwitcher, scopeChips, catBadge, empty, on, rerender, toast } from '../ui.js';

const TYPE_FILTERS = [['all', 'Todas'], ['income', 'Receitas'], ['expense', 'Despesas'], ['transfer', 'Transferências']];

function txMeta(t) {
  if (t.type === 'transfer') return `${esc(account(t.accountId)?.name || '?')} → ${esc(account(t.toAccountId)?.name || '?')}`;
  if (t.type === 'payment') return `Fatura ${esc(card(t.cardId)?.name || '')} · ${esc(account(t.accountId)?.name || '')}`;
  const parts = [esc(category(t.categoryId).name), t.cardId ? esc(card(t.cardId)?.name || 'Cartão') : esc(account(t.accountId)?.name || '')];
  if (t.installment) parts.push(`${t.installment.n}/${t.installment.total}`);
  if (t.fixed) parts.push('fixa');
  return parts.join(' · ');
}

export function txRow(t, { showDate = false } = {}) {
  const c =
    t.type === 'transfer' ? { color: '#8FA3BF', icon: 'arrow-left-right' }
    : t.type === 'payment' ? { color: '#C5A059', icon: 'credit-card' }
    : category(t.categoryId);
  const cls = t.type === 'income' ? 'pos' : t.type === 'transfer' ? 'neu' : 'neg';
  const sign = t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '−';
  const canToggle = (t.type === 'income' || t.type === 'expense') && !t.cardId;
  return `<li class="row tx">
    ${catBadge(c, 38)}
    <button class="grow linklike" data-action="edit-tx" data-id="${t.id}">
      <b>${esc(t.desc || (t.type === 'transfer' ? 'Transferência' : category(t.categoryId).name))}</b>
      <small>${showDate ? `${shortDate(t.date)} · ` : ''}${txMeta(t)}${(t.tags || []).length ? ` · ${t.tags.map((x) => `#${esc(x)}`).join(' ')}` : ''}</small>
    </button>
    <span class="num ${cls}">${sign} ${$m(t.amount)}</span>
    ${canToggle ? `<button class="icon-btn check ${t.paid ? 'done' : ''}" data-action="toggle-paid" data-id="${t.id}" aria-label="${t.paid ? 'Marcar como pendente' : t.type === 'income' ? 'Marcar como recebido' : 'Marcar como pago'}" title="${t.paid ? (t.type === 'income' ? 'Recebido' : 'Pago') : 'Pendente'}">${icon(t.paid ? 'circle-check' : 'circle', 20)}</button>` : '<span class="check-spacer"></span>'}
  </li>`;
}

export function renderTransactions() {
  const q = UI.txQuery.trim().toLowerCase();
  let list = q
    ? S.transactions.filter((t) => inScope(t, UI.scope))
    : monthTx(UI.month, UI.scope);
  if (q)
    list = list.filter((t) =>
      [t.desc, t.note, category(t.categoryId).name, ...(t.tags || [])].some((s) => String(s || '').toLowerCase().includes(q)) ||
      String(t.amount).replace('.', ',').includes(q));
  if (UI.txType !== 'all') list = list.filter((t) => t.type === UI.txType);
  if (UI.pendingOnly) list = list.filter((t) => !t.paid);
  list.sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'income' ? -1 : 1));

  const s = monthSummary(UI.month, UI.scope);
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const listTotal = round2(list.reduce((a, t) => a + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0));

  return `<section>
    <header class="page-head"><h1>Transações</h1><div class="head-right">${monthSwitcher()}</div></header>
    ${scopeChips()}
    <div class="summary-strip">
      <div><small>Receitas</small><b class="pos">${$m(s.income)}</b></div>
      <div><small>Despesas</small><b class="neg">${$m(s.expense)}</b></div>
      <div><small>Balanço</small><b>${$m(s.income - s.expense)}</b></div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search', 18)}<input type="search" placeholder="Buscar em todos os meses" value="${esc(UI.txQuery)}" data-input="tx-query" aria-label="Buscar transações"></label>
      <div class="chips scroll">${TYPE_FILTERS.map(([v, l]) => `<button class="chip ${UI.txType === v ? 'on' : ''}" data-action="tx-type" data-v="${v}">${l}</button>`).join('')}
        <button class="chip ${UI.pendingOnly ? 'on' : ''}" data-action="tx-pending-toggle">${icon('clock', 14)} Pendentes</button></div>
    </div>
    ${q ? `<p class="muted small">${list.length} resultado(s) para “${esc(UI.txQuery)}” · saldo ${$m(listTotal)}</p>` : ''}
    ${list.length
      ? [...groups.entries()].map(([date, items]) => `<div class="day-group"><h3 class="day-head">${dayLabel(date)}${q ? ` · ${shortDate(date)}` : ''}</h3><ul class="list card flat">${items.map((t) => txRow(t)).join('')}</ul></div>`).join('')
      : `<div class="card">${empty('receipt', q ? 'Nada encontrado' : 'Nenhuma transação', q ? 'Tente outro termo de busca.' : 'Toque em + para lançar sua primeira transação deste mês.', '<button class="btn primary sm" data-action="quick-add">Novo lançamento</button>')}</div>`}
  </section>`;
}

on({
  'tx-type': (el) => ((UI.txType = el.dataset.v), rerender()),
  'tx-filter': (el) => ((UI.txType = el.dataset.v), (UI.pendingOnly = false)),
  'tx-pending': () => ((UI.pendingOnly = true), (UI.txType = 'all')),
  'tx-pending-toggle': () => ((UI.pendingOnly = !UI.pendingOnly), rerender()),
  'toggle-paid': (el) => {
    const t = S.transactions.find((x) => x.id === el.dataset.id);
    togglePaid(el.dataset.id);
    if (t) toast(t.paid ? (t.type === 'income' ? 'Marcado como recebido.' : 'Marcado como pago.') : 'Marcado como pendente.');
    rerender();
  },
});
