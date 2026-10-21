// Compras parceladas (no cartão e fora dele): parcelas pagas, valor pago, quanto falta e quitação.
import { S, save, installmentGroups, installmentPaid, installmentDue, payNextInstallment, settleInstallments, category, card, account, accountBalance } from '../store.js';
import { esc, icon, shortDate, monthLabel, monthOf, thisMonth, addMonths, parseMoney, moneyPlain, today, money } from '../util.js';
import { UI, $m, pageHead, scopeChips, progress, catBadge, empty, on, rerender, openSheet, closeSheet, toast, go } from '../ui.js';
import { openTxForm } from '../form.js';

const F = { where: 'all', status: 'active' };
const WHERE = [['all', 'Todas'], ['outside', 'Fora do cartão'], ['card', 'No cartão']];

const holderName = (g) => (g.cardId ? card(g.cardId)?.name || 'Cartão' : account(g.accountId)?.name || 'Conta');

function groupCard(g) {
  const c = category(g.categoryId);
  const pct = g.total ? Math.round((g.paidValue / g.total) * 100) : 0;
  return `<li><button class="row col linklike inst" data-action="inst-open" data-id="${g.groupId}">
    <div class="row-in">${catBadge(c, 40)}
      <span class="grow"><b>${esc(g.desc)}</b><small>${g.cardId ? icon('credit-card', 12) : icon('receipt', 12)} ${esc(holderName(g))} · ${g.n}× de ${$m(g.per)}</small></span>
      <span class="inst-count"><b>${g.paidCount}/${g.n}</b><small>pagas</small></span></div>
    ${progress(g.paidValue, g.total, { warn: 2 })}
    <div class="inst-nums">
      <span><small>Total</small><b>${$m(g.total)}</b></span>
      <span><small>Pago</small><b class="pos">${$m(g.paidValue)}</b></span>
      <span><small>Falta</small><b class="${g.remaining ? 'neg' : ''}">${$m(g.remaining)}</b></span>
    </div>
    <small class="muted">${g.done ? `Quitada ${g.discount ? `· economia de ${$m(g.discount)}` : ''}` : g.next ? `Próxima: parcela ${g.next.installment.n} em ${shortDate(installmentDue(g.next))} · ${pct}% pago${installmentDue(g.next) < today() && !g.cardId ? ' · <span class="neg">atrasada</span>' : ''}` : ''}</small>
  </button></li>`;
}

export function renderInstallments() {
  const all = installmentGroups(UI.scope);
  const byWhere = all.filter((g) => F.where === 'all' || (F.where === 'card' ? g.cardId : !g.cardId));
  const list = byWhere.filter((g) => (F.status === 'active' ? !g.done : g.done)).sort((a, b) => (a.next ? installmentDue(a.next) : a.end).localeCompare(b.next ? installmentDue(b.next) : b.end) * (F.status === 'active' ? 1 : -1));
  const active = byWhere.filter((g) => !g.done);
  const remaining = active.reduce((a, g) => a + g.remaining, 0);
  const nextMonth = addMonths(thisMonth(), 1);
  const dueIn = (ym) => active.reduce((a, g) => a + g.list.filter((t) => !installmentPaid(t) && monthOf(installmentDue(t)) === ym).reduce((x, t) => x + t.amount, 0), 0);
  const lastEnd = active.map((g) => g.end).sort().pop();

  return `<section>
    ${pageHead('Compras parceladas', { back: '#/mais', right: `<button class="btn primary sm" data-action="inst-new">${icon('plus', 16)} Nova</button>` })}
    ${scopeChips()}
    <article class="hero slim">
      <p class="hero-k">Falta pagar em ${active.length} compra(s) parcelada(s)</p>
      <p class="hero-v sm">${$m(remaining)}</p>
      <div class="hero-pills">
        <div class="pill exp"><span>${icon('calendar', 16)}</span><div><small>Neste mês</small><b>${$m(dueIn(thisMonth()))}</b></div></div>
        <div class="pill exp"><span>${icon('calendar-clock', 16)}</span><div><small>${monthLabel(nextMonth, { short: true })}</small><b>${$m(dueIn(nextMonth))}</b></div></div>
      </div>
      ${lastEnd ? `<p class="hero-sub" style="margin-top:10px">Última parcela prevista em <strong>${shortDate(lastEnd)}</strong>.</p>` : ''}
    </article>
    <div class="chips">${WHERE.map(([v, l]) => `<button class="chip ${F.where === v ? 'on' : ''}" data-action="inst-where" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="chips small">${[['active', 'Em andamento'], ['done', 'Quitadas']].map(([v, l]) => `<button class="chip ${F.status === v ? 'on' : ''}" data-action="inst-status" data-v="${v}">${l}</button>`).join('')}</div>
    <article class="card">${list.length ? `<ul class="list">${list.map(groupCard).join('')}</ul>`
      : empty('layers', F.status === 'active' ? 'Nenhuma compra parcelada em andamento' : 'Nenhuma compra quitada ainda', 'Registre carnês, crediários, boletos parcelados, financiamentos ou compras parceladas no cartão.', '<button class="btn primary sm" data-action="inst-new">Nova compra parcelada</button>')}</article>
  </section>`;
}

function openGroup(groupId) {
  const g = installmentGroups('all').find((x) => x.groupId === groupId);
  if (!g) return;
  const outside = !g.cardId;
  openSheet(`<div class="tx-form">
    <h2 class="sheet-title">${catBadge(category(g.categoryId), 32)} ${esc(g.desc)}</h2>
    <p class="muted small">${g.cardId ? `No cartão ${esc(holderName(g))}` : `Fora do cartão · ${esc(holderName(g))}`} · ${g.n}× · ${shortDate(g.start)} a ${shortDate(g.end)}</p>
    <div class="inst-nums big">
      <span><small>Pagas</small><b>${g.paidCount} de ${g.n}</b></span>
      <span><small>Já pago</small><b class="pos">${money(g.paidValue)}</b></span>
      <span><small>Falta</small><b class="neg">${money(g.remaining)}</b></span>
    </div>
    ${progress(g.paidValue, g.total, { warn: 2 })}
    <p class="hint">Total da compra: <b>${money(g.total)}</b>${g.discount ? ` · economia na quitação: <b class="pos">${money(g.discount)}</b>` : ''}</p>
    ${g.done ? '' : `<div class="toolbar">
      ${outside ? `<button class="btn primary sm" data-pay-next>${icon('circle-check', 16)} Pagar parcela ${g.next?.installment.n}</button><button class="btn ghost sm" data-settle>${icon('hand-coins', 16)} Quitar antecipado</button>`
        : `<button class="btn primary sm" data-go-card>${icon('calendar-clock', 16)} Antecipar no cartão</button>`}
    </div>`}
    <ul class="list inst-list">${g.list.map((t) => {
      const ok = installmentPaid(t);
      const late = !ok && installmentDue(t) < today();
      return `<li class="row"><span class="inst-n ${ok ? 'ok' : late ? 'late' : ''}">${t.installment.n}</span>
        <span class="grow"><b>${money(t.amount)}${t.originalAmount ? ` <small class="muted"><s>${money(t.originalAmount)}</s></small>` : ''}</b><small>${g.cardId ? `Fatura de ${monthLabel(t.invoice, { short: true })} · vence ${shortDate(installmentDue(t))}` : `Vence ${shortDate(t.date)}`}</small></span>
        <span class="small ${ok ? 'pos' : late ? 'neg' : 'muted'}">${ok ? 'Paga' : late ? 'Atrasada' : 'A pagar'}</span>
        ${outside ? `<button class="icon-btn check ${ok ? 'done' : ''}" data-toggle="${t.id}" aria-label="${ok ? 'Marcar como não paga' : 'Marcar como paga'}">${icon(ok ? 'circle-check' : 'circle', 20)}</button>` : '<span class="check-spacer"></span>'}</li>`;
    }).join('')}</ul>
    <div class="form-actions"><button class="btn ghost" data-edit>${icon('pencil', 16)} Editar compra</button><button class="btn ghost" data-close>Fechar</button></div>
  </div>`, {
    onMount(sheet) {
      sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-edit]').addEventListener('click', () => openTxForm(null, g.next || g.list[g.list.length - 1]));
      sheet.querySelector('[data-go-card]')?.addEventListener('click', () => {
        closeSheet();
        setTimeout(() => go(`#/cartao/${g.cardId}`), 50);
        toast('Use “Antecipar parcelas” na fatura do cartão.');
      });
      sheet.querySelector('[data-pay-next]')?.addEventListener('click', () => {
        const t = payNextInstallment(g.groupId);
        if (t) toast(`Parcela ${t.installment.n} de ${g.n} paga.`);
        rerender();
        openGroup(groupId);
      });
      sheet.querySelectorAll('[data-toggle]').forEach((b) =>
        b.addEventListener('click', () => {
          const t = S.transactions.find((x) => x.id === b.dataset.toggle);
          t.paid = !t.paid;
          save();
          rerender();
          openGroup(groupId);
        }),
      );
      sheet.querySelector('[data-settle]')?.addEventListener('click', () => openSettle(g));
    },
  });
}

function openSettle(g) {
  const accId = g.accountId || S.accounts.find((a) => !a.archived)?.id;
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('hand-coins', 20)} Quitar ${esc(g.desc)}</h2>
    <p class="muted small">Faltam ${g.n - g.paidCount} parcela(s), somando <b>${money(g.remaining)}</b>. Se a loja ou o banco deu desconto para quitar, informe o valor realmente pago.</p>
    <label class="amount-field t-expense"><span>Valor pago na quitação</span><div><em>R$</em><input name="amount" inputmode="decimal" value="${moneyPlain(g.remaining)}" autofocus></div></label>
    <label class="field"><span>Pago com a conta</span><select name="accountId">${S.accounts.filter((a) => !a.archived).map((a) => `<option value="${a.id}" ${a.id === accId ? 'selected' : ''}>${esc(a.name)} · ${money(accountBalance(a.id))}</option>`).join('')}</select></label>
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
        toast(saved > 0 ? `Compra quitada com economia de ${money(saved)}.` : 'Compra quitada.');
        rerender();
      });
    },
  });
}

on({
  'inst-where': (el) => ((F.where = el.dataset.v), rerender()),
  'inst-status': (el) => ((F.status = el.dataset.v), rerender()),
  'inst-open': (el) => openGroup(el.dataset.id),
  'inst-new': () =>
    openSheet(`<h2 class="sheet-title">${icon('layers', 20)} Nova compra parcelada</h2>
      <div class="quick-grid">
        <button class="quick t-expense" data-action="inst-new-kind" data-kind="expense">${icon('receipt', 22)}<span>Fora do cartão</span><small class="muted">Carnê, boleto, crediário, financiamento, Pix parcelado</small></button>
        <button class="quick t-card" data-action="inst-new-kind" data-kind="card">${icon('credit-card', 22)}<span>No cartão</span><small class="muted">Parcelas entram nas faturas</small></button>
      </div>`),
  'inst-new-kind': (el) => openTxForm(el.dataset.kind, null, { repeat: 'installments', times: 10 }),
});
