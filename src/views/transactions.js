// Lista de transações do mês, com busca, filtros por tipo, situação, conta, categoria e tag.
import {
  S, isNeutral, CATEGORY_TYPES, category, categoryLabel, account, card, togglePaid, rootId, categoriesOf, allTags,
  accountTx, accountEffect, accountBalance, accountBalanceAt, ACCOUNT_ICONS,
} from '../store.js';
import { esc, icon, dayLabel, shortDate, round2, monthOf, monthLabel, monthEnd, dateIn, addMonths } from '../util.js';
import { UI, $m, monthSwitcher, catBadge, empty, on, rerender, toast, openSheet, closeSheet } from '../ui.js';

const TYPE_FILTERS = [['all', 'Todas'], ['in', 'Entradas'], ['out', 'Saídas'], ['transfer', 'Transferências']];
const STATUS = [['all', 'Todas'], ['paid', 'Pagas/recebidas'], ['pending', 'Pendentes'], ['ignored', 'Ignoradas']];
export const TXF = { status: 'all', cat: '', tag: '' };
const activeFilters = () => [TXF.status !== 'all', TXF.cat, TXF.tag].filter(Boolean).length;

function txMeta(t) {
  if (t.type === 'transfer') return `${esc(account(t.accountId)?.name || '?')} → ${esc(account(t.toAccountId)?.name || '?')}`;
  if (t.type === 'payment') return `Pagamento de fatura · ${esc(account(t.accountId)?.name || '')}`;
  if (t.type === 'refund') return `Estorno · ${esc(card(t.cardId)?.name || '')}`;
  if (t.type === 'invoiceAdjust') return `Ajuste de fatura · ${esc(card(t.cardId)?.name || '')}`;
  const parts = [esc(categoryLabel(t.categoryId)), t.cardId ? esc(card(t.cardId)?.name || 'Cartão') : esc(account(t.accountId)?.name || '')];
  if (t.person) parts.push(`${t.type === 'income' ? 'de' : 'para'} ${esc(t.person)}`);
  if (t.installment) parts.push(`parcela ${t.installment.n}/${t.installment.total}`);
  if (t.purchaseDate) parts.push(`compra em ${shortDate(t.purchaseDate)}`);
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

/** `accountId`: mostra o lançamento do ponto de vista dessa conta (transferência entrando ou saindo). */
export function txRow(t, { showDate = false, accountId = null } = {}) {
  const c = SPECIAL[t.type] || category(t.categoryId);
  const credit = accountId && t.type === 'transfer' ? t.toAccountId === accountId : t.type === 'income' || t.type === 'refund' || (t.type === 'invoiceAdjust' && t.delta < 0);
  const cls = t.ignored ? 'muted' : credit ? 'pos' : t.type === 'transfer' && !accountId ? 'neu' : 'neg';
  const sign = credit ? '+' : t.type === 'transfer' && !accountId ? '' : '−';
  const value = t.type === 'invoiceAdjust' ? Math.abs(t.delta) : t.amount;
  const canToggle = (t.type === 'income' || t.type === 'expense' || t.type === 'transfer') && !t.cardId;
  const badges = [t.ignored ? '<span class="tag-badge">ignorada</span>' : '', isNeutral(t) ? `<span class="tag-badge">${category(category(t.categoryId).parentId || t.categoryId).type === 'refund' ? 'reembolso' : 'transferência'}</span>` : '', t.receipt ? icon('file-text', 13, 'muted') : '', t.anticipated ? '<span class="tag-badge">antecipada</span>' : ''].join('');
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

// ---------- extrato por conta ----------
const ACC_KEY = 'ruffino-financas:conta-extrato';
/** Conta do extrato: a escolhida (lembrada neste aparelho) ou a primeira ativa. */
export function statementAccount() {
  const active = S.accounts.filter((a) => !a.archived);
  if (!UI.txAccount) {
    try {
      UI.txAccount = localStorage.getItem(ACC_KEY) || '';
    } catch {
      UI.txAccount = '';
    }
  }
  if (!S.accounts.some((a) => a.id === UI.txAccount)) UI.txAccount = active[0]?.id || '';
  return account(UI.txAccount);
}

const FLOW = { in: (t, acc) => accountEffect(t, acc) > 0, out: (t, acc) => accountEffect(t, acc) < 0 };

export function filteredTransactions(accId = UI.txAccount) {
  const q = UI.txQuery.trim().toLowerCase();
  let list = accountTx(accId);
  if (!q && !TXF.tag) list = list.filter((t) => monthOf(t.date) === UI.month);
  if (q)
    list = list.filter((t) =>
      [t.desc, t.note, categoryLabel(t.categoryId), ...(t.tags || [])].some((s) => String(s || '').toLowerCase().includes(q)) ||
      String(t.amount).replace('.', ',').includes(q));
  if (UI.txType === 'in' || UI.txType === 'out') list = list.filter((t) => FLOW[UI.txType](t, accId));
  else if (UI.txType === 'transfer') list = list.filter((t) => t.type === 'transfer');
  if (UI.pendingOnly || TXF.status === 'pending') list = list.filter((t) => !t.paid);
  if (TXF.status === 'paid') list = list.filter((t) => t.paid);
  if (TXF.status === 'ignored') list = list.filter((t) => t.ignored);
  if (TXF.cat) list = list.filter((t) => t.categoryId && rootId(t.categoryId) === TXF.cat);
  if (TXF.tag) list = list.filter((t) => (t.tags || []).includes(TXF.tag));
  return list.sort((a, b) => b.date.localeCompare(a.date) || accountEffect(b, accId) - accountEffect(a, accId));
}

export function renderTransactions() {
  const acc = statementAccount();
  if (!acc)
    return `<section><header class="page-head"><h1>Transações</h1></header>
      <article class="card">${empty('landmark', 'Nenhuma conta', 'Cadastre uma conta para ver o extrato dela.', '<a class="btn primary sm" href="#/contas">Adicionar conta</a>')}</article></section>`;
  const q = UI.txQuery.trim();
  const list = filteredTransactions(acc.id);
  const ym = UI.month;
  const monthList = accountTx(acc.id).filter((t) => monthOf(t.date) === ym);
  const inSum = round2(monthList.reduce((a, t) => a + Math.max(0, accountEffect(t, acc.id)), 0));
  const outSum = round2(monthList.reduce((a, t) => a + Math.max(0, -accountEffect(t, acc.id)), 0));
  const opening = accountBalanceAt(acc.id, dateIn(addMonths(ym, -1), 31));
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const allMonths = q || TXF.tag;
  const nf = activeFilters();
  const accounts = S.accounts.filter((a) => !a.archived || a.id === acc.id);

  return `<section>
    <header class="page-head"><h1>Transações</h1><div class="head-right">${monthSwitcher()}</div></header>
    <div class="chips scroll acc-chips" role="tablist" aria-label="Conta">${accounts.map((a) => `<button class="chip ${a.id === acc.id ? 'on' : ''}" role="tab" aria-selected="${a.id === acc.id}" data-action="tx-account" data-v="${a.id}">${icon(ACCOUNT_ICONS[a.type] || 'wallet', 14)} ${esc(a.name)}</button>`).join('')}</div>
    <article class="acc-head" style="--c:${acc.color}">
      <div><small>${esc(acc.name)} · saldo atual</small><b>${$m(accountBalance(acc.id))}</b></div>
      <div class="right"><small>Previsto fim de ${monthLabel(ym, { short: true, year: false }).toLowerCase()}</small><b>${$m(accountBalanceAt(acc.id, monthEnd(ym)))}</b></div>
    </article>
    <div class="summary-strip">
      <div><small>Saldo inicial</small><b>${$m(opening)}</b></div>
      <div><small>Entradas</small><b class="pos">${$m(inSum)}</b></div>
      <div><small>Saídas</small><b class="neg">${$m(outSum)}</b></div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search', 18)}<input type="search" placeholder="Buscar nesta conta (todos os meses)" value="${esc(UI.txQuery)}" data-input="tx-query" aria-label="Buscar no extrato"></label>
      <div class="chips scroll">${TYPE_FILTERS.map(([v, l]) => `<button class="chip ${UI.txType === v ? 'on' : ''}" data-action="tx-type" data-v="${v}">${l}</button>`).join('')}
        <button class="chip ${UI.pendingOnly ? 'on' : ''}" data-action="tx-pending-toggle">${icon('clock', 14)} Pendentes</button>
        <button class="chip ${nf ? 'on' : ''}" data-action="tx-filters">${icon('layers', 14)} Filtros${nf ? ` (${nf})` : ''}</button></div>
    </div>
    ${allMonths || nf ? `<p class="muted small">${list.length} resultado(s)${allMonths ? ' em todos os meses' : ''}${nf ? ' · <button class="link" data-action="tx-clear-filters">limpar filtros</button>' : ''}</p>` : ''}
    ${list.length
      ? [...groups.entries()].map(([date, items]) => `<div class="day-group"><h3 class="day-head"><span>${dayLabel(date)}${allMonths ? ` · ${shortDate(date)}` : ''}</span>${allMonths ? '' : `<span class="day-bal">saldo ${$m(accountBalanceAt(acc.id, date))}</span>`}</h3><ul class="list card flat">${items.map((t) => txRow(t, { accountId: acc.id })).join('')}</ul></div>`).join('')
      : `<div class="card">${empty('receipt', q || nf ? 'Nada encontrado' : `Nenhum lançamento em ${esc(acc.name)}`, q || nf ? 'Tente outro termo ou ajuste os filtros.' : 'Toque em + para lançar. Compras no cartão aparecem dentro do cartão.', '<button class="btn primary sm" data-action="quick-add">Novo lançamento</button>')}</div>`}
  </section>`;
}

function openFilters() {
  const cats = ['expense', 'income', 'transfer', 'refund'].flatMap((k) => categoriesOf(k));
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('layers', 20)} Filtrar o extrato</h2>
    <div class="field"><span>Situação</span><div class="chips">${STATUS.map(([v, l]) => `<label class="chip ${TXF.status === v ? 'on' : ''}"><input type="radio" name="status" value="${v}" ${TXF.status === v ? 'checked' : ''} hidden>${l}</label>`).join('')}</div></div>
    <label class="field"><span>Categoria</span><select name="cat"><option value="">Todas</option>${cats.map((c) => `<option value="${c.id}" ${TXF.cat === c.id ? 'selected' : ''}>${esc(c.name)} (${CATEGORY_TYPES[c.type].toLowerCase()})</option>`).join('')}</select></label>
    <label class="field"><span>Tag <small>(mostra todos os meses)</small></span><select name="tag"><option value="">Todas</option>${allTags().map((t) => `<option ${TXF.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <div class="form-actions"><button type="button" class="btn ghost" data-clear>Limpar</button><button class="btn primary">${icon('check', 18)} Aplicar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      f.querySelectorAll('[name=status]').forEach((r) => r.addEventListener('change', () => f.querySelectorAll('.chips .chip').forEach((c) => c.classList.toggle('on', c.contains(r) && r.checked))));
      sheet.querySelector('[data-clear]').addEventListener('click', () => {
        Object.assign(TXF, { status: 'all', cat: '', tag: '' });
        closeSheet();
        rerender();
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        Object.assign(TXF, { status: f.status.value, cat: f.cat.value, tag: f.tag.value });
        closeSheet();
        rerender();
      });
    },
  });
}

on({
  'tx-account': (el) => {
    UI.txAccount = el.dataset.v;
    try {
      localStorage.setItem(ACC_KEY, el.dataset.v);
    } catch {
      /* preferência só deste aparelho */
    }
    rerender();
  },
  'tx-type': (el) => ((UI.txType = el.dataset.v), rerender()),
  'tx-filter': (el) => ((UI.txType = el.dataset.v === 'income' ? 'in' : el.dataset.v === 'expense' ? 'out' : el.dataset.v), (UI.pendingOnly = false)),
  'tx-pending': () => ((UI.pendingOnly = true), (UI.txType = 'all')),
  'tx-pending-toggle': () => ((UI.pendingOnly = !UI.pendingOnly), rerender()),
  'tx-filters': () => openFilters(),
  'tx-clear-filters': () => (Object.assign(TXF, { status: 'all', cat: '', tag: '' }), rerender()),
  'tx-tag': (el) => (Object.assign(TXF, { status: 'all', cat: '', tag: el.dataset.v }), (UI.txType = 'all')),
  'toggle-paid': (el) => {
    const t = S.transactions.find((x) => x.id === el.dataset.id);
    togglePaid(el.dataset.id);
    if (t) toast(t.paid ? (t.type === 'income' ? 'Marcado como recebido.' : 'Marcado como efetuado.') : 'Marcado como pendente.');
    rerender();
  },
});
