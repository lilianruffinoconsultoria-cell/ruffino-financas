// Lista de transações do mês, com busca, filtros por tipo, situação, conta, categoria e tag.
import { S, category, categoryLabel, account, card, monthTx, inScope, monthSummary, togglePaid, rootId, categoriesOf, allTags, counted } from '../store.js';
import { esc, icon, dayLabel, shortDate, round2 } from '../util.js';
import { UI, $m, monthSwitcher, scopeChips, catBadge, empty, on, rerender, toast, openSheet, closeSheet } from '../ui.js';

const TYPE_FILTERS = [['all', 'Todas'], ['income', 'Receitas'], ['expense', 'Despesas'], ['transfer', 'Transferências']];
const STATUS = [['all', 'Todas'], ['paid', 'Pagas/recebidas'], ['pending', 'Pendentes'], ['ignored', 'Ignoradas']];
export const TXF = { status: 'all', holder: '', cat: '', tag: '' };
const activeFilters = () => [TXF.status !== 'all', TXF.holder, TXF.cat, TXF.tag].filter(Boolean).length;

function txMeta(t) {
  if (t.type === 'transfer') return `${esc(account(t.accountId)?.name || '?')} → ${esc(account(t.toAccountId)?.name || '?')}`;
  if (t.type === 'payment') return `Pagamento de fatura · ${esc(account(t.accountId)?.name || '')}`;
  if (t.type === 'refund') return `Estorno · ${esc(card(t.cardId)?.name || '')}`;
  if (t.type === 'invoiceAdjust') return `Ajuste de fatura · ${esc(card(t.cardId)?.name || '')}`;
  const parts = [esc(categoryLabel(t.categoryId)), t.cardId ? esc(card(t.cardId)?.name || 'Cartão') : esc(account(t.accountId)?.name || '')];
  if (t.installment) parts.push(`${t.installment.n}/${t.installment.total}`);
  if (t.fixed) parts.push('fixa');
  return parts.join(' · ');
}

const DEFAULT_LABEL = { transfer: 'Transferência', payment: 'Pagamento de fatura', refund: 'Estorno', invoiceAdjust: 'Ajuste de fatura' };
const SPECIAL = {
  transfer: { color: '#8FA3BF', icon: 'arrow-left-right' },
  payment: { color: '#C5A059', icon: 'hand-coins' },
  refund: { color: '#5FAF6E', icon: 'rotate-ccw' },
  invoiceAdjust: { color: '#7F8C9A', icon: 'scale' },
};

export function txRow(t, { showDate = false } = {}) {
  const c = SPECIAL[t.type] || category(t.categoryId);
  const credit = t.type === 'income' || t.type === 'refund' || (t.type === 'invoiceAdjust' && t.delta < 0);
  const cls = t.ignored ? 'muted' : credit ? 'pos' : t.type === 'transfer' ? 'neu' : 'neg';
  const sign = credit ? '+' : t.type === 'transfer' ? '' : '−';
  const value = t.type === 'invoiceAdjust' ? Math.abs(t.delta) : t.amount;
  const canToggle = (t.type === 'income' || t.type === 'expense' || t.type === 'transfer') && !t.cardId;
  const badges = [t.ignored ? '<span class="tag-badge">ignorada</span>' : '', t.receipt ? icon('file-text', 13, 'muted') : '', t.anticipated ? '<span class="tag-badge">antecipada</span>' : ''].join('');
  return `<li class="row tx ${t.ignored ? 'is-ignored' : ''}">
    ${catBadge(c, 38)}
    <button class="grow linklike" data-action="edit-tx" data-id="${t.id}">
      <b>${esc(t.desc || DEFAULT_LABEL[t.type] || category(t.categoryId).name)} ${badges}</b>
      <small>${showDate ? `${shortDate(t.date)} · ` : ''}${txMeta(t)}${(t.tags || []).length ? ` · ${t.tags.map((x) => `#${esc(x)}`).join(' ')}` : ''}</small>
    </button>
    <span class="num ${cls}">${sign} ${$m(value)}</span>
    ${canToggle ? `<button class="icon-btn check ${t.paid ? 'done' : ''}" data-action="toggle-paid" data-id="${t.id}" aria-label="${t.paid ? 'Marcar como pendente' : t.type === 'income' ? 'Marcar como recebido' : 'Marcar como pago'}" title="${t.paid ? 'Efetuada' : 'Pendente'}">${icon(t.paid ? 'circle-check' : 'circle', 20)}</button>` : '<span class="check-spacer"></span>'}
  </li>`;
}

export function filteredTransactions() {
  const q = UI.txQuery.trim().toLowerCase();
  let list = q || TXF.tag ? S.transactions.filter((t) => inScope(t, UI.scope)) : monthTx(UI.month, UI.scope);
  if (q)
    list = list.filter((t) =>
      [t.desc, t.note, categoryLabel(t.categoryId), ...(t.tags || [])].some((s) => String(s || '').toLowerCase().includes(q)) ||
      String(t.amount).replace('.', ',').includes(q));
  if (UI.txType !== 'all') list = list.filter((t) => t.type === UI.txType);
  if (UI.pendingOnly || TXF.status === 'pending') list = list.filter((t) => !t.paid);
  if (TXF.status === 'paid') list = list.filter((t) => t.paid);
  if (TXF.status === 'ignored') list = list.filter((t) => t.ignored);
  if (TXF.holder) list = list.filter((t) => t.accountId === TXF.holder || t.toAccountId === TXF.holder || t.cardId === TXF.holder);
  if (TXF.cat) list = list.filter((t) => t.categoryId && rootId(t.categoryId) === TXF.cat);
  if (TXF.tag) list = list.filter((t) => (t.tags || []).includes(TXF.tag));
  return list.sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'income' ? -1 : 1));
}

export function renderTransactions() {
  const q = UI.txQuery.trim();
  const list = filteredTransactions();
  const s = monthSummary(UI.month, UI.scope);
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const listTotal = round2(list.filter(counted).reduce((a, t) => a + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0));
  const allMonths = q || TXF.tag;
  const nf = activeFilters();

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
        <button class="chip ${UI.pendingOnly ? 'on' : ''}" data-action="tx-pending-toggle">${icon('clock', 14)} Pendentes</button>
        <button class="chip ${nf ? 'on' : ''}" data-action="tx-filters">${icon('layers', 14)} Filtros${nf ? ` (${nf})` : ''}</button></div>
    </div>
    ${allMonths || nf ? `<p class="muted small">${list.length} resultado(s)${allMonths ? ' em todos os meses' : ''} · saldo ${$m(listTotal)}${nf ? ' · <button class="link" data-action="tx-clear-filters">limpar filtros</button>' : ''}</p>` : ''}
    ${list.length
      ? [...groups.entries()].map(([date, items]) => `<div class="day-group"><h3 class="day-head">${dayLabel(date)}${allMonths ? ` · ${shortDate(date)}` : ''}</h3><ul class="list card flat">${items.map((t) => txRow(t)).join('')}</ul></div>`).join('')
      : `<div class="card">${empty('receipt', q || nf ? 'Nada encontrado' : 'Nenhuma transação', q || nf ? 'Tente outro termo ou ajuste os filtros.' : 'Toque em + para lançar sua primeira transação deste mês.', '<button class="btn primary sm" data-action="quick-add">Novo lançamento</button>')}</div>`}
  </section>`;
}

function openFilters() {
  const holders = [...S.accounts.map((a) => [a.id, a.name]), ...S.cards.map((c) => [c.id, `${c.name} (cartão)`])];
  const cats = [...categoriesOf('expense'), ...categoriesOf('income')];
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('layers', 20)} Filtrar transações</h2>
    <div class="field"><span>Situação</span><div class="chips">${STATUS.map(([v, l]) => `<label class="chip ${TXF.status === v ? 'on' : ''}"><input type="radio" name="status" value="${v}" ${TXF.status === v ? 'checked' : ''} hidden>${l}</label>`).join('')}</div></div>
    <label class="field"><span>Conta ou cartão</span><select name="holder"><option value="">Todos</option>${holders.map(([id, n]) => `<option value="${id}" ${TXF.holder === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <label class="field"><span>Categoria</span><select name="cat"><option value="">Todas</option>${cats.map((c) => `<option value="${c.id}" ${TXF.cat === c.id ? 'selected' : ''}>${esc(c.name)} (${c.type === 'income' ? 'receita' : 'despesa'})</option>`).join('')}</select></label>
    <label class="field"><span>Tag <small>(mostra todos os meses)</small></span><select name="tag"><option value="">Todas</option>${allTags().map((t) => `<option ${TXF.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <div class="form-actions"><button type="button" class="btn ghost" data-clear>Limpar</button><button class="btn primary">${icon('check', 18)} Aplicar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      f.querySelectorAll('[name=status]').forEach((r) => r.addEventListener('change', () => f.querySelectorAll('.chips .chip').forEach((c) => c.classList.toggle('on', c.contains(r) && r.checked))));
      sheet.querySelector('[data-clear]').addEventListener('click', () => {
        Object.assign(TXF, { status: 'all', holder: '', cat: '', tag: '' });
        closeSheet();
        rerender();
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        Object.assign(TXF, { status: f.status.value, holder: f.holder.value, cat: f.cat.value, tag: f.tag.value });
        closeSheet();
        rerender();
      });
    },
  });
}

on({
  'tx-type': (el) => ((UI.txType = el.dataset.v), rerender()),
  'tx-filter': (el) => ((UI.txType = el.dataset.v), (UI.pendingOnly = false)),
  'tx-pending': () => ((UI.pendingOnly = true), (UI.txType = 'all')),
  'tx-pending-toggle': () => ((UI.pendingOnly = !UI.pendingOnly), rerender()),
  'tx-filters': () => openFilters(),
  'tx-clear-filters': () => (Object.assign(TXF, { status: 'all', holder: '', cat: '', tag: '' }), rerender()),
  'tx-tag': (el) => (Object.assign(TXF, { status: 'all', holder: '', cat: '', tag: el.dataset.v }), (UI.txType = 'all')),
  'toggle-paid': (el) => {
    const t = S.transactions.find((x) => x.id === el.dataset.id);
    togglePaid(el.dataset.id);
    if (t) toast(t.paid ? (t.type === 'income' ? 'Marcado como recebido.' : 'Marcado como efetuado.') : 'Marcado como pendente.');
    rerender();
  },
});
