// Parcelamentos fora do cartão (pessoas, lojas, carnês e crediários), a pagar e a receber.
// As compras parceladas no cartão ficam dentro de cada cartão; a ficha de cada compra (openGroup) serve aos dois.
import {
  S, installmentGroups, installmentPaid, installmentDue, installmentPeople, payInstallment, unpayInstallment, settleInstallments,
  deleteTransaction, category, card, account, accountBalance, invoiceFor,
} from '../store.js';
import { esc, icon, shortDate, monthLabel, monthOf, thisMonth, addMonths, parseMoney, moneyPlain, today, money } from '../util.js';
import { UI, $m, pageHead, scopeChips, progress, catBadge, empty, on, rerender, openSheet, closeSheet, toast, go, confirmSheet } from '../ui.js';
import { openTxForm } from '../form.js';
import { deleteReceipt } from '../receipts.js';

const F = { dir: 'pay', status: 'active', person: '' };
const NO_PERSON = 'Sem pessoa informada';
const VERB = { pay: { do: 'Pagar', done: 'Paga', left: 'Falta pagar', paid: 'Já pago', doing: 'pagas' }, receive: { do: 'Receber', done: 'Recebida', left: 'Falta receber', paid: 'Já recebido', doing: 'recebidas' } };

const holderName = (g) => (g.cardId ? card(g.cardId)?.name || 'Cartão' : account(g.accountId)?.name || 'Conta');
const whoLine = (g) => (g.cardId ? `${icon('credit-card', 12)} ${esc(holderName(g))}` : g.person ? `${icon('user-round', 12)} ${esc(g.person)} · ${esc(holderName(g))}` : `${icon('landmark', 12)} ${esc(holderName(g))}`);

function groupRow(g) {
  const c = category(g.categoryId);
  const V = VERB[g.dir];
  const pct = g.total ? Math.round((g.paidValue / g.total) * 100) : 0;
  const nextDue = g.next ? installmentDue(g.next) : null;
  const late = g.late && !g.cardId;
  return `<li><button class="row col linklike inst" data-action="inst-open" data-id="${g.groupId}">
    <div class="row-in">${catBadge(c, 40)}
      <span class="grow"><b>${esc(g.desc)}</b><small>${whoLine(g)} · ${g.n}× de ${$m(g.per)}</small></span>
      <span class="inst-count"><b>${g.paidCount}/${g.n}</b><small>${V.doing}</small></span></div>
    ${progress(g.paidValue, g.total, { warn: 2 })}
    <div class="inst-nums">
      <span><small>Total</small><b>${$m(g.total)}</b></span>
      <span><small>${V.paid}</small><b class="pos">${$m(g.paidValue)}</b></span>
      <span><small>${g.dir === 'pay' ? 'Falta' : 'A receber'}</small><b class="${g.remaining ? (g.dir === 'pay' ? 'neg' : 'pos') : ''}">${$m(g.remaining)}</b></span>
    </div>
    <small class="muted">${g.done ? `Quitada${g.discount ? ` · economia de ${$m(g.discount)}` : ''}` : nextDue ? `Próxima: parcela ${g.next.installment.n} em ${shortDate(nextDue)} · ${pct}%${late ? ` · <span class="neg">${g.late} atrasada(s)</span>` : ''}` : ''}</small>
  </button></li>`;
}

export function renderInstallments() {
  const all = installmentGroups(UI.scope, { where: 'outside' });
  const ofDir = all.filter((g) => g.dir === F.dir);
  const byPerson = ofDir.filter((g) => !F.person || (g.person || NO_PERSON).toLowerCase() === F.person.toLowerCase());
  const list = byPerson
    .filter((g) => (F.status === 'active' ? !g.done : g.done))
    .sort((a, b) => (a.next ? installmentDue(a.next) : a.end).localeCompare(b.next ? installmentDue(b.next) : b.end) * (F.status === 'active' ? 1 : -1));
  const active = byPerson.filter((g) => !g.done);
  const V = VERB[F.dir];
  const remaining = active.reduce((a, g) => a + g.remaining, 0);
  const nextMonth = addMonths(thisMonth(), 1);
  const dueIn = (ym) => active.reduce((a, g) => a + g.list.filter((t) => !installmentPaid(t) && monthOf(installmentDue(t)) === ym).reduce((x, t) => x + t.amount, 0), 0);
  const late = active.reduce((a, g) => a + g.late, 0);
  const people = installmentPeople(UI.scope).filter((p) => p[F.dir] > 0 || p.groups.some((g) => g.dir === F.dir && !g.done));

  return `<section>
    ${pageHead('Parcelamentos', { back: '#/mais', right: `<button class="btn primary sm" data-action="inst-new">${icon('plus', 16)} Novo</button>` })}
    <p class="muted small page-sub">Compras e vendas parceladas fora do cartão: com pessoas, lojas, carnês e crediários.</p>
    ${scopeChips()}
    <div class="seg two">${[['pay', 'arrow-up-right', 'Eu pago'], ['receive', 'arrow-down-left', 'Eu recebo']].map(([v, ic, l]) => `<button class="seg-btn ${F.dir === v ? 'on' : ''} ${v === 'pay' ? 't-expense' : 't-income'}" data-action="inst-dir" data-v="${v}">${icon(ic, 16)}<span>${l}</span></button>`).join('')}</div>
    <article class="hero slim">
      <p class="hero-k">${V.left}${F.person ? ` · ${esc(F.person)}` : ''} · ${active.length} parcelamento(s)</p>
      <p class="hero-v sm">${$m(remaining)}</p>
      <div class="hero-pills">
        <div class="pill ${F.dir === 'pay' ? 'exp' : 'inc'}"><span>${icon('calendar', 16)}</span><div><small>Neste mês</small><b>${$m(dueIn(thisMonth()))}</b></div></div>
        <div class="pill ${F.dir === 'pay' ? 'exp' : 'inc'}"><span>${icon('calendar-clock', 16)}</span><div><small>${monthLabel(nextMonth, { short: true })}</small><b>${$m(dueIn(nextMonth))}</b></div></div>
      </div>
      ${late ? `<p class="hero-sub" style="margin-top:10px">${icon('triangle-alert', 14)} <strong>${late} parcela(s) atrasada(s)</strong></p>` : ''}
    </article>
    ${people.length ? `<article class="card">
      <header class="card-head"><h2>Por pessoa</h2>${F.person ? '<button class="link" data-action="inst-person" data-v="">Ver todas</button>' : ''}</header>
      <ul class="list compact">${people.map((p) => `<li><button class="row linklike ${F.person.toLowerCase() === p.name.toLowerCase() ? 'is-on' : ''}" data-action="inst-person" data-v="${esc(p.name)}">
        <span class="cat-badge sm person-badge">${p.name === NO_PERSON ? icon('receipt', 14) : esc(p.name.slice(0, 1).toUpperCase())}</span>
        <span class="grow"><b>${esc(p.name)}</b><small>${p.active} ativo(s)${p.late ? ` · <span class="neg">${p.late} atrasada(s)</span>` : ''}</small></span>
        <span class="num-col">${p.pay ? `<span class="num neg">− ${$m(p.pay)}</span>` : ''}${p.receive ? `<span class="num pos">+ ${$m(p.receive)}</span>` : ''}</span></button></li>`).join('')}</ul>
    </article>` : ''}
    <div class="chips small">${[['active', 'Em andamento'], ['done', 'Quitados']].map(([v, l]) => `<button class="chip ${F.status === v ? 'on' : ''}" data-action="inst-status" data-v="${v}">${l}</button>`).join('')}</div>
    <article class="card">${list.length ? `<ul class="list">${list.map(groupRow).join('')}</ul>`
      : empty('handshake', F.status === 'active' ? `Nenhum parcelamento ${F.dir === 'pay' ? 'a pagar' : 'a receber'}` : 'Nenhum parcelamento quitado ainda',
        F.dir === 'pay' ? 'Registre compras parceladas com pessoas, carnês, crediários, boletos ou Pix parcelado.' : 'Registre vendas ou empréstimos que alguém está te pagando em parcelas.',
        '<button class="btn primary sm" data-action="inst-new">Novo parcelamento</button>')}</article>
  </section>`;
}

/** Ficha de uma compra parcelada (no cartão ou fora dele). */
export function openGroup(groupId) {
  const g = installmentGroups('all').find((x) => x.groupId === groupId);
  if (!g) return;
  const outside = !g.cardId;
  const V = VERB[g.dir];
  const editable = g.list.filter((t) => !t.prior);
  openSheet(`<div class="tx-form">
    <h2 class="sheet-title">${catBadge(category(g.categoryId), 32)} ${esc(g.desc)}</h2>
    <p class="muted small">${outside ? `${g.person ? `${g.dir === 'pay' ? 'Com' : 'De'} ${esc(g.person)} · ` : ''}conta ${esc(holderName(g))}` : `No cartão ${esc(holderName(g))}`} · ${g.n}× · ${shortDate(g.start)} a ${shortDate(g.end)}</p>
    <div class="inst-nums big">
      <span><small>${V.doing[0].toUpperCase() + V.doing.slice(1)}</small><b>${g.paidCount} de ${g.n}</b></span>
      <span><small>${V.paid}</small><b class="pos">${money(g.paidValue)}</b></span>
      <span><small>Falta</small><b class="${g.dir === 'pay' ? 'neg' : 'pos'}">${money(g.remaining)}</b></span>
    </div>
    ${progress(g.paidValue, g.total, { warn: 2 })}
    <p class="hint">Total: <b>${money(g.total)}</b>${g.discount ? ` · economia na quitação: <b class="pos">${money(g.discount)}</b>` : ''}${g.priorCount ? ` · parcelas 1 a ${g.priorCount} pagas antes de usar o app (só histórico)` : ''}</p>
    ${g.done ? '' : `<div class="toolbar">
      ${outside ? `<button class="btn primary sm" data-pay="${g.next.id}">${icon('circle-check', 16)} ${V.do} parcela ${g.next.installment.n}</button><button class="btn ghost sm" data-settle>${icon('hand-coins', 16)} Quitar antecipado</button>`
        : `<button class="btn primary sm" data-go-card>${icon('calendar-clock', 16)} Antecipar no cartão</button>`}
    </div>`}
    <ul class="list inst-list">${g.list.map((t) => {
      const ok = installmentPaid(t);
      const late = !ok && installmentDue(t) < today();
      const status = t.prior ? 'Antes do app' : ok ? V.done : late ? 'Atrasada' : g.cardId ? 'A cobrar' : `A ${V.do.toLowerCase()}`;
      return `<li class="row ${t.prior ? 'is-prior' : ''}"><span class="inst-n ${ok ? 'ok' : late ? 'late' : ''}">${t.installment.n}</span>
        <span class="grow"><b>${money(t.amount)}${t.originalAmount ? ` <small class="muted"><s>${money(t.originalAmount)}</s></small>` : ''}</b><small>${t.prior ? `Antes do app · ${monthLabel(monthOf(installmentDue(t)), { short: true })}` : g.cardId ? `Fatura de ${monthLabel(t.invoice, { short: true })} · vence ${shortDate(installmentDue(t))}${t.anticipated ? ' · antecipada' : ''}` : `${ok ? `${V.done} em` : 'Vence'} ${shortDate(t.date)}${ok && t.accountId ? ` · ${esc(account(t.accountId)?.name || '')}` : ''}`}</small></span>
        <span class="small ${t.prior ? 'muted' : ok ? 'pos' : late ? 'neg' : 'muted'}">${status}</span>
        ${outside && !t.prior ? `<button class="icon-btn check ${ok ? 'done' : ''}" data-toggle="${t.id}" aria-label="${ok ? 'Desfazer' : V.do}">${icon(ok ? 'circle-check' : 'circle', 20)}</button>` : '<span class="check-spacer"></span>'}</li>`;
    }).join('')}</ul>
    <div class="form-actions">
      <button class="btn ghost danger" data-del aria-label="Excluir parcelamento">${icon('trash-2', 16)}</button>
      ${editable.length ? `<button class="btn ghost" data-edit>${icon('pencil', 16)} Editar</button>` : ''}
      <button class="btn ghost" data-close>Fechar</button></div>
  </div>`, {
    onMount(sheet) {
      const reopen = () => (rerender(), openGroup(groupId));
      sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-edit]')?.addEventListener('click', () => openTxForm(null, g.next && !g.next.prior ? g.next : editable[editable.length - 1]));
      sheet.querySelector('[data-go-card]')?.addEventListener('click', () => {
        const c = card(g.cardId);
        UI.invoice[g.cardId] = c ? invoiceFor(c, today()) : UI.invoice[g.cardId];
        closeSheet();
        setTimeout(() => go(`#/cartao/${g.cardId}`), 50);
        toast('Use “Antecipar parcelas” na fatura do cartão.');
      });
      sheet.querySelector('[data-pay]')?.addEventListener('click', (e) => openPay(e.currentTarget.dataset.pay, groupId));
      sheet.querySelectorAll('[data-toggle]').forEach((b) =>
        b.addEventListener('click', () => {
          const t = S.transactions.find((x) => x.id === b.dataset.toggle);
          if (!t) return;
          if (t.paid) {
            unpayInstallment(t.id);
            reopen();
          } else openPay(t.id, groupId);
        }),
      );
      sheet.querySelector('[data-settle]')?.addEventListener('click', () => openSettle(g));
      sheet.querySelector('[data-del]').addEventListener('click', async () => {
        const ok = await confirmSheet({
          title: `Excluir “${g.desc}”?`,
          text: `As ${g.n} parcelas serão excluídas${g.cardId ? ' e saem das faturas do cartão' : ''}. As já pagas também somem do saldo das contas.`,
          options: [{ label: 'Excluir parcelamento', value: 'yes', danger: true }],
        });
        if (!ok) return;
        for (const t of deleteTransaction(g.list[0].id, 'all')) if (t.receipt) deleteReceipt(t.receipt.id);
        toast('Parcelamento excluído.');
        rerender();
      });
    },
  });
}

/** Pagamento (ou recebimento) de uma parcela: valor de fato, conta e data. */
function openPay(id, groupId) {
  const t = S.transactions.find((x) => x.id === id);
  if (!t) return;
  const V = VERB[t.type === 'income' ? 'receive' : 'pay'];
  const accs = S.accounts.filter((a) => !a.archived);
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('circle-check', 20)} ${V.do} parcela ${t.installment.n} de ${t.installment.total}</h2>
    <p class="muted small">${esc(t.desc || '')}${t.person ? ` · ${esc(t.person)}` : ''} · prevista para ${shortDate(t.date)}</p>
    <label class="amount-field ${t.type === 'income' ? 't-income' : 't-expense'}"><span>Valor ${t.type === 'income' ? 'recebido' : 'pago'}</span><div><em>R$</em><input name="amount" inputmode="decimal" value="${moneyPlain(t.amount)}" autofocus></div></label>
    <label class="field"><span>${t.type === 'income' ? 'Entrou na conta' : 'Saiu da conta'}</span><select name="accountId">${accs.map((a) => `<option value="${a.id}" ${a.id === t.accountId ? 'selected' : ''}>${esc(a.name)} · ${money(accountBalance(a.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Data</span><input type="date" name="date" value="${today()}"></label>
    <p class="hint">Se pagou com juros, multa ou desconto, informe o valor real: o valor previsto fica guardado.</p>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} Confirmar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = parseMoney(f.amount.value);
        if (!v) return;
        payInstallment(id, { amount: v, accountId: f.accountId.value, date: f.date.value || today() });
        toast(`Parcela ${t.installment.n} de ${t.installment.total} ${t.type === 'income' ? 'recebida' : 'paga'}.`);
        rerender();
        openGroup(groupId);
      });
    },
  });
}

function openSettle(g) {
  const accId = g.accountId || S.accounts.find((a) => !a.archived)?.id;
  const V = VERB[g.dir];
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('hand-coins', 20)} Quitar ${esc(g.desc)}</h2>
    <p class="muted small">Faltam ${g.n - g.paidCount} parcela(s), somando <b>${money(g.remaining)}</b>. Se houve desconto para quitar, informe o valor realmente ${g.dir === 'pay' ? 'pago' : 'recebido'}.</p>
    <label class="amount-field ${g.dir === 'pay' ? 't-expense' : 't-income'}"><span>Valor da quitação</span><div><em>R$</em><input name="amount" inputmode="decimal" value="${moneyPlain(g.remaining)}" autofocus></div></label>
    <label class="field"><span>Conta</span><select name="accountId">${S.accounts.filter((a) => !a.archived).map((a) => `<option value="${a.id}" ${a.id === accId ? 'selected' : ''}>${esc(a.name)} · ${money(accountBalance(a.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Data</span><input type="date" name="date" value="${today()}"></label>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} Quitar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = parseMoney(f.amount.value);
        if (!v) return;
        const saved = settleInstallments(g.groupId, v, f.accountId.value, f.date.value || today());
        closeSheet();
        toast(saved > 0 ? `Quitado com economia de ${money(saved)}.` : 'Parcelamento quitado.');
        rerender();
      });
    },
  });
}

on({
  'inst-dir': (el) => ((F.dir = el.dataset.v), (F.person = ''), rerender()),
  'inst-status': (el) => ((F.status = el.dataset.v), rerender()),
  'inst-person': (el) => ((F.person = F.person.toLowerCase() === el.dataset.v.toLowerCase() ? '' : el.dataset.v), rerender()),
  'inst-open': (el) => openGroup(el.dataset.id),
  'inst-new': () =>
    openSheet(`<h2 class="sheet-title">${icon('handshake', 20)} Novo parcelamento</h2>
      <div class="quick-grid">
        <button class="quick t-expense" data-action="inst-new-kind" data-kind="expense">${icon('arrow-up-right', 22)}<span>Eu pago</span><small class="muted">Compra com pessoa ou loja, carnê, crediário, boleto, Pix parcelado</small></button>
        <button class="quick t-income" data-action="inst-new-kind" data-kind="income">${icon('arrow-down-left', 22)}<span>Eu recebo</span><small class="muted">Venda ou empréstimo que alguém te paga em parcelas</small></button>
      </div>
      <p class="hint">${icon('credit-card', 14)} Compra parcelada no cartão? Lance pelo cartão: cada parcela entra na fatura do mês.</p>
      <button class="btn ghost block" data-action="inst-new-kind" data-kind="card">${icon('credit-card', 18)} Parcelar no cartão</button>`),
  'inst-new-kind': (el) => openTxForm(el.dataset.kind, null, { repeat: 'installments', times: 10, person: F.person && F.person !== NO_PERSON ? F.person : '' }),
});
