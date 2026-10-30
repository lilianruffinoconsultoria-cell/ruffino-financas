// Aba "A pagar e receber": todas as contas (à vista, fixas e parcelas) por vencimento, a visão por
// parcelamento, o calendário, a baixa de cada conta e as faturas do cartão (informativo).
import {
  S, save, byId, account, category, categoryLabel, cardsIn, monthTx, counted, payablesOf, overdueBefore, payableState, dueOf, isPayable, inScope,
  settlePayable, unsettlePayable, invoiceTotal, invoiceStatus, invoiceDueDate,
} from '../store.js';
import { esc, icon, today, shortDate, dayLabel, daysBetween, money, moneyPlain, parseMoney, sum, round2, monthOf, monthLabel, thisMonth, isoDate } from '../util.js';
import { UI, $m, pageHead, monthSwitcher, scopeChips, catBadge, empty, on, rerender, toast, openSheet, closeSheet, confirmSheet, go } from '../ui.js';
import { openTxForm } from '../form.js';
import { txRow } from './transactions.js';
import { calendarWidget } from './calendar.js';
import { installmentsPanel } from './installments.js';
import { unpaidClosed, unpaidText } from './accounts.js';

const SIDES = [['pay', 'arrow-up-right', 'A pagar', 't-expense'], ['rec', 'arrow-down-left', 'A receber', 't-income']];
// [valor, ícone, rótulo, rótulo curto (celular)]
const VIEWS = [['list', 'layers', 'Vencimentos', 'Lista'], ['groups', 'handshake', 'Parcelamentos', 'Parcelas'], ['calendar', 'calendar', 'Calendário', 'Calendário']];
const PERIODS = [['month', 'Mês'], ['next7', 'Próximos 7 dias + vencidas'], ['next30', 'Próximos 30 dias + vencidas'], ['overdue', 'Todas as vencidas'], ['all', 'Todo o período']];
const STATUS = [['all', 'Todas'], ['open', 'Em aberto'], ['late', 'Vencidas'], ['done', { pay: 'Pagas', rec: 'Recebidas' }]];
const KINDS = [['all', 'Todos'], ['single', 'À vista'], ['inst', 'Parceladas'], ['fixed', 'Fixas']];
const GROUPS = [['vencida', 'Vencidas'], ['hoje', 'Hoje'], ['aberta', 'Próximas'], ['baixada', { pay: 'Pagas', rec: 'Recebidas' }]];
const INV_STATUS = { aberta: 'Aberta', fechada: 'Fechada', parcial: 'Paga parcialmente', paga: 'Paga', vencida: 'Vencida' };
const dd = (iso) => shortDate(iso).slice(0, 5);
const label = (l, side) => (typeof l === 'string' ? l : l[side]);
const plusDays = (iso, n) => {
  const d = new Date(`${iso}T12:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

// ---------- filtros ----------
const typeOf = (side) => (side === 'pay' ? 'expense' : 'income');
const kindOf = (t) => (t.installment ? 'inst' : t.fixed ? 'fixed' : 'single');

/** Contas do lado escolhido com os filtros de período, situação e tipo, por vencimento. */
function filtered(side) {
  const now = today();
  const inPeriod = {
    month: (due) => monthOf(due) === UI.month,
    // em aberto até a data, inclusive as já vencidas (vêm primeiro, no grupo Vencidas)
    next7: (due, t) => !t.paid && due <= plusDays(now, 7),
    next30: (due, t) => !t.paid && due <= plusDays(now, 30),
    overdue: (due, t) => !t.paid && due < now,
    all: () => true,
  }[UI.prPeriod];
  const inStatus = { all: () => true, open: (t) => !t.paid, late: (t) => payableState(t) === 'vencida', done: (t) => t.paid }[UI.prStatus];
  return S.transactions
    .filter((t) => isPayable(t) && t.type === typeOf(side) && inScope(t, UI.scope) && inPeriod(dueOf(t), t) && inStatus(t) && (UI.prKind === 'all' || kindOf(t) === UI.prKind))
    .sort((a, b) => dueOf(a).localeCompare(dueOf(b)) || (a.desc || '').localeCompare(b.desc || ''));
}

/**
 * Período, situação e tipo. No celular (≤ 520px) ficam num bloco recolhível "Filtros" (fechado por padrão);
 * o seletor de mês continua visível. No desktop o botão some e tudo fica aberto.
 */
function filtersBar(side) {
  const chips = (list, key, action) =>
    `<div class="chips small">${list.map(([v, l]) => `<button class="chip ${UI[key] === v ? 'on' : ''}" data-action="${action}" data-v="${v}">${label(l, side)}</button>`).join('')}</div>`;
  const active = [UI.prPeriod !== 'month', UI.prStatus !== 'all', UI.prKind !== 'all'].filter(Boolean).length;
  const open = !!UI.prFiltersOpen;
  return `<div class="pr-fbox ${open ? 'open' : ''}">
    <div class="pr-filters">
      <button type="button" class="btn ghost sm pr-ftoggle" data-action="pr-filters" aria-expanded="${open}" aria-controls="pr-fmore">${icon('sliders-horizontal', 15)} Filtros${active ? ` · ${active} ativo${active > 1 ? 's' : ''}` : ''} ${icon('chevron-down', 15, 'pr-fchev')}</button>
      <label class="field compact pr-period"><span>Período</span><select data-input="pr-period">${PERIODS.map(([v, l]) => `<option value="${v}" ${UI.prPeriod === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${UI.prPeriod === 'month' ? monthSwitcher() : ''}
    </div>
    <div class="pr-fmore" id="pr-fmore">
      ${chips(STATUS, 'prStatus', 'pr-status')}
      ${chips(KINDS, 'prKind', 'pr-kind')}
    </div></div>`;
}

/** "Todo o período": avisa que a lista vai até as fixas já geradas para os próximos meses. */
function allPeriodNote(list) {
  if (UI.prPeriod !== 'all' || !list.length) return '';
  const ym = monthOf(dueOf(list[list.length - 1]));
  const when = `${monthLabel(ym, { year: false }).toLowerCase()} de ${ym.slice(0, 4)}`;
  const text = list.some((t) => t.fixed && monthOf(dueOf(t)) > thisMonth())
    ? `Inclui as contas fixas projetadas até ${when}.`
    : `Mostra todas as contas lançadas, até ${when}.`;
  return `<p class="badge-line pr-note">${icon('info', 14)} ${text}</p>`;
}

// ---------- itens ----------
/** Lançamento de juros criado na baixa com valor maior (campo `interestOf`), se houver. */
const interestOf = (t) => (t.paid ? (t.baixa?.interestId && byId(S.transactions, t.baixa.interestId)) || S.transactions.find((x) => x.interestOf === t.id) : null);

function statusBadge(t) {
  const st = payableState(t);
  if (st === 'baixada') return `<span class="pr-st done">${t.type === 'income' ? 'Recebida' : 'Paga'} em ${dd(t.date)}</span>`;
  if (st === 'vencida') {
    const n = daysBetween(dueOf(t), today());
    return `<span class="pr-st late">Vencida há ${n} dia${n > 1 ? 's' : ''}</span>`;
  }
  return st === 'hoje' ? '<span class="pr-st today">Vence hoje</span>' : '<span class="pr-st">Em aberto</span>';
}

/** Linha de uma conta, com "Baixar" (em aberto) ou "Estornar baixa" (baixada). `date`: data padrão da baixa. */
export function payableRow(t, { date = today() } = {}) {
  const c = category(t.categoryId);
  const inst = t.installment && t.groupId;
  const fee = interestOf(t);
  return `<li class="pr-item st-${payableState(t)}">
    <div class="row">${catBadge(c, 38)}
      <button class="grow linklike" data-action="edit-tx" data-id="${t.id}">
        <b>${esc(t.desc || c.name)}${inst ? ` <span class="tag-badge">parcela ${t.installment.n}/${t.installment.total}</span>` : t.fixed ? ' <span class="tag-badge">fixa</span>' : ''}${t.restOf ? ' <span class="tag-badge">restante</span>' : ''}</b>
        <small>${esc(categoryLabel(t.categoryId))}${t.person ? ` · ${esc(t.person)}` : ''} · ${esc(account(t.accountId)?.name || 'sem conta')} · venc. ${dd(dueOf(t))}</small>
        <small>${statusBadge(t)}${t.originalAmount && t.paid ? ` <s class="muted">${$m(t.originalAmount)}</s>` : ''}${fee ? ` <span class="pr-fee ${t.type === 'income' ? 'pos' : 'neg'}">+ ${$m(fee.amount)} de juros</span>` : ''}</small>
      </button>
      <span class="num ${t.type === 'income' ? 'pos' : 'neg'}">${$m(t.amount)}</span></div>
    <div class="pr-act">${inst ? `<button class="btn ghost sm" data-action="inst-open" data-id="${t.groupId}">${icon('handshake', 14)} Parcelamento</button>` : ''}${t.paid
      ? `<button class="btn ghost sm" data-action="pr-undo" data-id="${t.id}">${icon('rotate-ccw', 14)} Estornar baixa</button>`
      : `<button class="btn primary sm" data-action="pr-settle" data-id="${t.id}" data-date="${date}">${icon('check', 14)} ${t.type === 'income' ? 'Receber' : 'Pagar'}</button>`}</div></li>`;
}

function summaryStrip(list, side) {
  const part = (f) => $m(sum(list.filter(f), (t) => t.amount));
  return `<div class="summary-strip two four">
    <div><small>Previsto</small><b>${part(() => true)}</b></div>
    <div><small>${side === 'pay' ? 'Pago' : 'Recebido'}</small><b class="pos">${part((t) => t.paid)}</b></div>
    <div><small>Em aberto</small><b>${part((t) => !t.paid)}</b></div>
    <div><small>Vencido</small><b class="neg">${part((t) => payableState(t) === 'vencida')}</b></div></div>`;
}

function groupsList(list, side) {
  const html = GROUPS.map(([st, l]) => {
    const items = list.filter((t) => payableState(t) === st);
    if (!items.length) return '';
    return `<div class="day-group"><h3 class="day-head"><span>${label(l, side)}</span><span class="day-bal">${items.length} · ${$m(sum(items, (t) => t.amount))}</span></h3>
      <ul class="list card flat">${items.map((t) => payableRow(t)).join('')}</ul></div>`;
  }).join('');
  return html || `<div class="card">${empty('calendar-clock', 'Nenhuma conta com esses filtros', `Lance uma conta ${side === 'pay' ? 'a pagar' : 'a receber'}, à vista ou parcelada, ou mude os filtros.`)}</div>`;
}

/** Faturas a pagar: as fechadas com saldo (de qualquer mês) e a do mês da tela, se ainda não paga. Não entram nos totais. */
function invoicesCard() {
  const rows = cardsIn(UI.scope).flatMap((c) => {
    const owed = unpaidClosed(c).map((f) => ({ c, ym: f.ym, value: f.rest, sub: unpaidText(f) }));
    const total = invoiceTotal(c.id, UI.month);
    const st = invoiceStatus(c, UI.month);
    // a fatura do mês já vem na lista de vencidas quando está fechada com saldo: não repete
    const month = total > 0 && st !== 'paga' && !owed.some((f) => f.ym === UI.month)
      ? [{ c, ym: UI.month, value: total, sub: `vence ${dd(invoiceDueDate(c, UI.month))} · ${INV_STATUS[st]}` }]
      : [];
    return [...owed, ...month];
  });
  if (!rows.length) return '';
  return `<article class="card"><header class="card-head"><h2>${icon('credit-card', 18)} Faturas a pagar</h2><span class="muted small">pagas pela tela do cartão</span></header>
    <ul class="list">${rows.map(({ c, ym, value, sub }) => `<li><button class="row linklike" data-action="pr-invoice" data-card="${c.id}" data-ym="${ym}"><span class="cat-badge" style="--c:${c.color}">${icon('credit-card', 18)}</span>
      <span class="grow"><b>${esc(c.name)}</b><small>${sub}</small></span><span class="num">${$m(value)}</span></button></li>`).join('')}</ul></article>`;
}

// ---------- tela ----------
/** `alias` 'parcelamentos' (rota antiga #/parcelamentos) abre direto a visão por parcelamento. */
export function renderPayables(alias) {
  if (alias === 'parcelamentos') {
    S.settings.payablesView = 'groups';
    history.replaceState(null, '', '#/pagar-receber');
  }
  if (UI.prTab !== 'pay' && UI.prTab !== 'rec') UI.prTab = 'pay';
  UI.prPeriod ||= 'month';
  UI.prStatus ||= 'all';
  UI.prKind ||= 'all';
  const side = UI.prTab;
  const view = VIEWS.some(([v]) => v === S.settings.payablesView) ? S.settings.payablesView : 'list';
  const list = view === 'list' ? filtered(side) : [];
  const old = view === 'list' && UI.prPeriod === 'month' ? overdueBefore(UI.month, UI.scope, side) : [];
  const oldFirst = old.map((t) => dueOf(t).slice(0, 7)).sort()[0];
  const kind = typeOf(side);

  return `<section>
    ${pageHead('A pagar e receber')}
    <div class="seg two pr-side" role="tablist" aria-label="Contas">${SIDES.map(([v, ic, l, cls]) => `<button class="seg-btn ${cls} ${side === v ? 'on' : ''}" role="tab" aria-selected="${side === v}" data-action="pr-tab" data-v="${v}">${icon(ic, 16)}<span>${l}</span></button>`).join('')}</div>
    <div class="seg pr-view" role="tablist" aria-label="Visão">${VIEWS.map(([v, ic, l, short]) => `<button class="seg-btn ${view === v ? 'on' : ''}" role="tab" aria-selected="${view === v}" data-action="pr-view" data-v="${v}" title="${l}">${icon(ic, 15)}<span class="lbl-full">${l}</span><span class="lbl-short">${short}</span></button>`).join('')}</div>
    ${scopeChips()}
    ${S.settings.autoPay ? `<div class="pr-warn">${icon('triangle-alert', 18)}<span>A efetivação automática está ligada: ela baixa sozinha só as despesas (e transferências) pendentes no vencimento, sem registrar data de pagamento, conta nem juros. Valores a receber continuam em aberto até você registrar o recebimento. Para controlar cada pagamento aqui, desligue.</span>
      <button class="btn ghost sm" data-action="pr-autopay-off">Desligar</button></div>` : ''}
    <div class="toolbar pr-new">
      <button class="btn primary sm" data-action="pr-new" data-kind="${kind}">${icon('plus', 15)} Conta ${side === 'pay' ? 'a pagar' : 'a receber'}</button>
      <button class="btn ghost sm" data-action="pr-new" data-kind="${kind}" data-inst="1">${icon('list-ordered', 15)} Parcelada</button></div>
    ${view === 'groups' ? installmentsPanel(side === 'pay' ? 'pay' : 'receive')
      : view === 'calendar' ? `<div class="pr-bar">${monthSwitcher()}</div><article class="card">${calendarWidget({ ym: UI.month, scope: UI.scope })}</article>`
      : `${filtersBar(side)}
        ${old.length ? `<p class="badge-line">${icon('clock', 14)} ${old.length} conta(s) vencida(s) em meses anteriores (${$m(sum(old, (t) => t.amount))}). <button class="link" data-action="pr-month" data-v="${oldFirst}">Ver ${esc(oldFirst.slice(5))}/${oldFirst.slice(0, 4)}</button></p>` : ''}
        ${allPeriodNote(list)}
        ${summaryStrip(list, side)}
        ${groupsList(list, side)}`}
    ${side === 'pay' && view !== 'groups' ? invoicesCard() : ''}
  </section>`;
}

// ---------- baixa ----------
/**
 * Sheet da baixa (conta à vista, fixa ou parcela). `back`: dia do calendário para reabrir depois;
 * `onDone`: o que abrir depois de salvar (ex.: a ficha do parcelamento).
 */
export function openSettle(id, { date = today(), back = null, onDone = null } = {}) {
  const t = byId(S.transactions, id);
  if (!t) return;
  const inc = t.type === 'income';
  const accs = S.accounts.filter((a) => !a.archived || a.id === t.accountId);
  const accId = accs.some((a) => a.id === t.accountId) ? t.accountId : accs[0]?.id;
  if (!accId) return toast('Cadastre uma conta primeiro.');
  const what = t.installment ? `parcela ${t.installment.n} de ${t.installment.total}` : '';
  openSheet(`<form class="tx-form">
    <h2 class="sheet-title">${inc ? 'Receber' : 'Pagar'}: ${esc(t.desc || category(t.categoryId).name)}</h2>
    <p class="muted small">${what ? `${what} · ` : ''}vencimento ${shortDate(dueOf(t))} · previsto ${money(t.amount)}</p>
    <label class="field"><span>Data do ${inc ? 'recebimento' : 'pagamento'}</span><input type="date" name="date" value="${date}" required></label>
    <label class="field"><span>Conta</span><select name="accountId">${accs.map((a) => `<option value="${a.id}" ${a.id === accId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <label class="amount-field t-${inc ? 'income' : 'expense'}"><span>Valor ${inc ? 'recebido' : 'pago'}</span><div><em>R$</em><input name="amount" inputmode="decimal" autocomplete="off" value="${moneyPlain(t.amount)}"></div></label>
    <div class="field" data-rest hidden><span>A diferença de <b data-rest-v></b></span><div class="seg two">
      <label class="seg-btn on"><input type="radio" name="rest" value="open" checked>Fica em aberto</label>
      <label class="seg-btn"><input type="radio" name="rest" value="discount">Foi desconto</label></div></div>
    <p class="hint" data-diff></p>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} ${inc ? 'Receber' : 'Pagar'}</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      const hint = f.querySelector('[data-diff]');
      const restBox = f.querySelector('[data-rest]');
      const err = f.querySelector('.form-error');
      const rest = () => f.querySelector('[name=rest]:checked').value;
      const update = () => {
        const diff = round2(parseMoney(f.amount.value) - t.amount);
        restBox.hidden = !(diff < -0.004);
        restBox.querySelector('[data-rest-v]').textContent = money(-diff);
        hint.textContent =
          diff < -0.004
            ? rest() === 'open'
              ? `Será criada uma conta ${inc ? 'a receber' : 'a pagar'} de ${money(-diff)} com o restante, no mesmo vencimento.`
              : `Fica quitada com desconto de ${money(-diff)}; o valor previsto fica guardado.`
            : diff > 0.004
              ? `${money(diff)} entram como lançamento separado em ${inc ? 'Juros recebidos' : 'Juros e multas'}.`
              : '';
      };
      f.amount.addEventListener('input', update);
      f.querySelectorAll('[name=rest]').forEach((r) =>
        r.addEventListener('change', () => {
          r.closest('.seg').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.contains(r) && r.checked));
          update();
        }),
      );
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = parseMoney(f.amount.value);
        if (!amount) {
          err.textContent = 'Informe um valor maior que zero.';
          err.hidden = false;
          return;
        }
        if (!f.date.value) return;
        settlePayable(id, { date: f.date.value, accountId: f.accountId.value, amount, rest: rest() });
        toast(`${what ? `${what[0].toUpperCase()}${what.slice(1)} ` : ''}${inc ? (what ? 'recebida' : 'Recebimento registrado') : what ? 'paga' : 'Pagamento registrado'}.`);
        rerender();
        if (onDone) onDone();
        else if (back) openDaySheet(back);
        else closeSheet();
      });
    },
  });
}

// ---------- lista do dia (calendário) ----------
/** Total pago/recebido no dia `iso` (data = dia, efetivado e contado), de receitas ou despesas. */
export const dayPosted = (list, iso, type) => sum(list.filter((t) => t.date === iso && t.paid && counted(t) && t.type === type), (t) => t.amount);

export function openDaySheet(iso) {
  const ym = iso.slice(0, 7);
  const bills = payablesOf(ym, UI.scope).filter((t) => dueOf(t) === iso);
  const ids = new Set(bills.map((t) => t.id));
  const dayTx = monthTx(ym, UI.scope).filter((t) => t.date === iso && t.type !== 'payment');
  const others = dayTx.filter((t) => !ids.has(t.id));
  const open = (type) => sum(bills.filter((t) => !t.paid && t.type === type), (t) => t.amount);
  // "lançadas": tudo o que foi pago/recebido no dia, inclusive contas baixadas nele (cada lançamento uma vez só)
  const posted = (type) => dayPosted(dayTx, iso, type);
  openSheet(`<div class="day-sheet"><h2 class="sheet-title">${dayLabel(iso)} <small class="muted">${shortDate(iso)}</small></h2>
    <div class="summary-strip two four">
      <div><small>A pagar (em aberto)</small><b class="neg">${$m(open('expense'))}</b></div>
      <div><small>A receber (em aberto)</small><b class="pos">${$m(open('income'))}</b></div>
      <div><small>Receitas lançadas</small><b>${$m(posted('income'))}</b></div>
      <div><small>Despesas lançadas</small><b>${$m(posted('expense'))}</b></div></div>
    <div class="toolbar pr-new">
      <button class="btn primary sm" data-action="pr-new" data-kind="expense" data-date="${iso}">${icon('plus', 15)} Conta a pagar</button>
      <button class="btn ghost sm" data-action="pr-new" data-kind="income" data-date="${iso}">${icon('plus', 15)} Conta a receber</button></div>
    <h3 class="day-head">Contas com vencimento neste dia</h3>
    ${bills.length ? `<ul class="list">${bills.map((t) => payableRow(t, { date: iso })).join('')}</ul>` : '<p class="muted small">Nenhuma conta vence neste dia.</p>'}
    ${others.length ? `<h3 class="day-head">Lançamentos do dia</h3><ul class="list">${others.map((t) => txRow(t)).join('')}</ul>` : ''}</div>`, {
    onMount() {
      UI.daySheet = iso;
      return () => (UI.daySheet = null);
    },
  });
}

on({
  'cal-day': (el) => {
    UI.calDay = el.dataset.v;
    rerender();
    openDaySheet(el.dataset.v);
  },
  'pr-tab': (el) => ((UI.prTab = el.dataset.v), rerender()),
  'pr-view': (el) => {
    S.settings.payablesView = el.dataset.v;
    save();
    rerender();
  },
  // abre/fecha o bloco de filtros do celular sem redesenhar a tela
  'pr-filters': (el) => {
    UI.prFiltersOpen = !UI.prFiltersOpen;
    el.closest('.pr-fbox')?.classList.toggle('open', UI.prFiltersOpen);
    el.setAttribute('aria-expanded', UI.prFiltersOpen);
  },
  'pr-status': (el) => ((UI.prStatus = el.dataset.v), rerender()),
  'pr-kind': (el) => ((UI.prKind = el.dataset.v), rerender()),
  'pr-month': (el) => ((UI.month = el.dataset.v), (UI.prPeriod = 'month'), rerender()),
  // abre a fatura certa na tela do cartão, onde a baixa é feita
  'pr-invoice': (el) => {
    UI.invoice[el.dataset.card] = el.dataset.ym;
    go(`#/cartao/${el.dataset.card}`);
  },
  'pr-new': (el) =>
    openTxForm(el.dataset.kind, null, { paid: false, payable: true, date: el.dataset.date || today(), ...(el.dataset.inst ? { repeat: 'installments', times: 2 } : {}) }),
  'pr-settle': (el) => openSettle(el.dataset.id, { date: el.dataset.date || today(), back: UI.daySheet }),
  'pr-undo': async (el) => {
    const back = UI.daySheet;
    const t = byId(S.transactions, el.dataset.id);
    const ok = await confirmSheet({
      title: 'Estornar a baixa?',
      text: `${t?.installment ? 'Só esta parcela volta a ficar em aberto, no vencimento original.' : 'A conta volta a ficar em aberto no vencimento original.'}${t && interestOf(t) ? ' O lançamento de juros da baixa é removido.' : ''}`,
      options: [{ label: 'Estornar baixa', value: 'yes', danger: true }],
    });
    if (!ok) return back && openDaySheet(back);
    unsettlePayable(el.dataset.id);
    toast('Baixa estornada.');
    rerender();
    if (back) openDaySheet(back);
  },
  'pr-autopay-off': () => {
    S.settings.autoPay = false;
    save();
    toast('Efetivação automática desligada.');
    rerender();
  },
});

/** Filtro de período (select): chamado pelo listener global de input/change do main.js. */
export function handlePayablesInput(el) {
  if (el.dataset.input !== 'pr-period') return false;
  UI.prPeriod = el.value;
  rerender();
  return true;
}
