// Contas bancárias e cartões de crédito (faturas, limite e pagamento).
import {
  S, save, account, card, accountBalance, ACCOUNT_TYPES, ACCOUNT_ICONS, SCOPES, COLORS, currentInvoice, invoiceItems, invoiceTotal,
  invoicePaid, invoiceStatus, invoiceDueDate, invoiceCloseDate, cardUsed, accountsIn, cardsIn,
} from '../store.js';
import { esc, icon, uid, parseMoney, moneyPlain, monthEnd, thisMonth, monthLabel, addMonths, shortDate, today, round2 } from '../util.js';
import { UI, $m, pageHead, scopeChips, progress, empty, on, rerender, openSheet, closeSheet, toast, confirmSheet, go } from '../ui.js';
import { txRow } from './transactions.js';
import { openTxForm } from '../form.js';

const colorPicker = (selected) =>
  `<div class="swatches">${COLORS.map((c) => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === selected ? 'checked' : ''}><span></span></label>`).join('')}</div>`;
const scopePicker = (selected = 'pf') =>
  `<div class="seg two">${Object.entries(SCOPES).map(([k, l]) => `<label class="seg-btn ${k === selected ? 'on' : ''}"><input type="radio" name="scope" value="${k}" ${k === selected ? 'checked' : ''}>${l}</label>`).join('')}</div>`;

function wireSeg(sheet) {
  sheet.querySelectorAll('.seg input[type=radio]').forEach((r) =>
    r.addEventListener('change', () => r.closest('.seg').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.contains(r) && r.checked))),
  );
}

// ---------- contas ----------
export function renderAccounts() {
  const list = accountsIn(UI.scope);
  const total = list.reduce((a, x) => a + accountBalance(x.id), 0);
  const forecast = list.reduce((a, x) => a + accountBalance(x.id, monthEnd(thisMonth())), 0);
  return `<section>
    ${pageHead('Contas', { back: '#/mais', right: `<button class="btn primary sm" data-action="account-form">${icon('plus', 16)} Nova</button>` })}
    ${scopeChips()}
    <div class="summary-strip two"><div><small>Saldo atual</small><b>${$m(total)}</b></div><div><small>Previsto fim do mês</small><b>${$m(forecast)}</b></div></div>
    <article class="card">${list.length ? `<ul class="list">${list.map((a) => `
      <li><button class="row linklike" data-action="account-form" data-id="${a.id}">
        <span class="cat-badge" style="--c:${a.color}">${icon(ACCOUNT_ICONS[a.type] || 'wallet', 18)}</span>
        <span class="grow"><b>${esc(a.name)}</b><small>${ACCOUNT_TYPES[a.type] || 'Conta'} · ${SCOPES[a.scope || 'pf']}</small></span>
        <span class="num-col"><span class="num ${accountBalance(a.id) < 0 ? 'neg' : ''}">${$m(accountBalance(a.id))}</span><small>prev. ${$m(accountBalance(a.id, monthEnd(thisMonth())))}</small></span>
      </button></li>`).join('')}</ul>` : empty('landmark', 'Nenhuma conta', 'Adicione conta corrente, poupança, carteira ou investimentos.')}</article>
  </section>`;
}

function accountForm(a) {
  const isEdit = !!a;
  a = a || { type: 'checking', scope: 'pf', initial: 0, color: COLORS[S.accounts.length % COLORS.length] };
  openSheet(`<form class="tx-form">
    <h2 class="sheet-title">${isEdit ? 'Editar conta' : 'Nova conta'}</h2>
    <label class="field"><span>Nome</span><input name="name" required maxlength="40" value="${esc(a.name || '')}" placeholder="Ex.: Nubank, Itaú, Carteira" autofocus></label>
    <label class="field"><span>Tipo</span><select name="type">${Object.entries(ACCOUNT_TYPES).map(([k, l]) => `<option value="${k}" ${k === a.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="field"><span>Uso</span>${scopePicker(a.scope)}</div>
    <label class="amount-field"><span>Saldo inicial</span><div><em>R$</em><input name="initial" inputmode="decimal" value="${moneyPlain(a.initial)}"></div></label>
    ${isEdit ? `<p class="hint">Saldo atual: <b>${$m(accountBalance(a.id))}</b>. Para corrigir o saldo, use “Ajustar saldo”.</p>` : ''}
    <div class="field"><span>Cor</span>${colorPicker(a.color)}</div>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">
      ${isEdit ? `<button type="button" class="btn ghost danger" data-del>${icon('trash-2', 18)}</button><button type="button" class="btn ghost" data-adjust>Ajustar saldo</button>` : ''}
      <button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
    onMount(sheet) {
      wireSeg(sheet);
      const f = sheet.querySelector('form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!f.name.value.trim()) {
          const er = f.querySelector('.form-error');
          er.textContent = 'Informe o nome da conta.';
          er.hidden = false;
          return;
        }
        const data = { name: f.name.value.trim(), type: f.type.value, scope: f.scope.value, initial: parseMoney(f.initial.value) * (f.initial.value.trim().startsWith('-') ? -1 : 1), color: f.color.value };
        if (isEdit) Object.assign(account(a.id), data);
        else S.accounts.push({ id: uid(), ...data });
        save();
        closeSheet();
        toast('Conta salva.');
        rerender();
      });
      sheet.querySelector('[data-adjust]')?.addEventListener('click', () => {
        openSheet(`<form class="tx-form"><h2 class="sheet-title">Ajustar saldo de ${esc(a.name)}</h2>
          <label class="amount-field"><span>Saldo real hoje</span><div><em>R$</em><input name="real" inputmode="decimal" value="${moneyPlain(accountBalance(a.id))}" autofocus></div></label>
          <p class="hint">Ajustamos o saldo inicial para que o saldo atual fique igual ao valor informado, sem criar lançamentos.</p>
          <div class="form-actions"><button class="btn primary">${icon('check', 18)} Ajustar</button></div></form>`, {
          onMount(s2) {
            const f2 = s2.querySelector('form');
            f2.addEventListener('submit', (e) => {
              e.preventDefault();
              const raw = f2.real.value.trim();
              const real = parseMoney(raw) * (raw.startsWith('-') ? -1 : 1);
              const acc = account(a.id);
              acc.initial = round2(acc.initial + real - accountBalance(a.id));
              save();
              closeSheet();
              toast('Saldo ajustado.');
              rerender();
            });
          },
        });
      });
      sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
        const used = S.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id) || S.cards.some((c) => c.accountId === a.id);
        if (used) {
          await confirmSheet({ title: 'Não é possível excluir', text: 'Esta conta tem lançamentos ou cartões vinculados. Exclua ou mova os lançamentos antes.', options: [{ label: 'Entendi', value: 'ok' }] });
          return;
        }
        if (!(await confirmSheet({ title: `Excluir ${a.name}?`, options: [{ label: 'Excluir', value: 'yes', danger: true }] }))) return;
        S.accounts = S.accounts.filter((x) => x.id !== a.id);
        save();
        toast('Conta excluída.');
        rerender();
      });
    },
  });
}

// ---------- cartões ----------
export function renderCards() {
  const list = cardsIn(UI.scope);
  return `<section>
    ${pageHead('Cartões de crédito', { back: '#/mais', right: `<button class="btn primary sm" data-action="card-form">${icon('plus', 16)} Novo</button>` })}
    ${scopeChips()}
    ${list.length ? `<div class="grid">${list.map((c) => {
      const inv = currentInvoice(c);
      const used = cardUsed(c.id);
      return `<a class="credit-card" href="#/cartao/${c.id}" style="--c:${c.color}">
        <div class="cc-top"><b>${esc(c.name)}</b>${icon('credit-card', 22)}</div>
        <div><small>Fatura atual · ${monthLabel(inv, { short: true })}</small><p class="cc-v">${$m(invoiceTotal(c.id, inv))}</p></div>
        <div class="cc-foot"><span>Fecha dia ${c.closeDay}</span><span>Vence dia ${c.dueDay}</span></div>
        ${progress(used, c.limit)}<small>Disponível ${$m(c.limit - used)} de ${$m(c.limit)}</small></a>`;
    }).join('')}</div>` : `<article class="card">${empty('credit-card', 'Nenhum cartão', 'Cadastre seus cartões para acompanhar faturas e limite disponível.')}</article>`}
  </section>`;
}

function cardForm(c) {
  const isEdit = !!c;
  c = c || { limit: 0, closeDay: 1, dueDay: 10, scope: 'pf', accountId: S.accounts[0]?.id, color: COLORS[(S.cards.length + 3) % COLORS.length] };
  const days = (sel) => Array.from({ length: 31 }, (_, i) => `<option ${i + 1 === sel ? 'selected' : ''}>${i + 1}</option>`).join('');
  openSheet(`<form class="tx-form">
    <h2 class="sheet-title">${isEdit ? 'Editar cartão' : 'Novo cartão'}</h2>
    <label class="field"><span>Nome</span><input name="name" maxlength="40" value="${esc(c.name || '')}" placeholder="Ex.: Nubank, Inter Gold" autofocus></label>
    <label class="amount-field"><span>Limite</span><div><em>R$</em><input name="limit" inputmode="decimal" value="${c.limit ? moneyPlain(c.limit) : ''}" placeholder="0,00"></div></label>
    <div class="row2"><label class="field"><span>Dia de fechamento</span><select name="closeDay">${days(c.closeDay)}</select></label>
      <label class="field"><span>Dia de vencimento</span><select name="dueDay">${days(c.dueDay)}</select></label></div>
    <label class="field"><span>Conta de pagamento</span><select name="accountId">${S.accounts.map((a) => `<option value="${a.id}" ${a.id === c.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <div class="field"><span>Uso</span>${scopePicker(c.scope)}</div>
    <div class="field"><span>Cor</span>${colorPicker(c.color)}</div>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">${isEdit ? `<button type="button" class="btn ghost danger" data-del>${icon('trash-2', 18)} Excluir</button>` : ''}<button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
    onMount(sheet) {
      wireSeg(sheet);
      const f = sheet.querySelector('form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = f.querySelector('.form-error');
        if (!f.name.value.trim() || !parseMoney(f.limit.value)) {
          err.textContent = 'Informe o nome e o limite do cartão.';
          err.hidden = false;
          return;
        }
        if (!S.accounts.length) {
          err.textContent = 'Cadastre uma conta para pagar a fatura.';
          err.hidden = false;
          return;
        }
        const data = { name: f.name.value.trim(), limit: parseMoney(f.limit.value), closeDay: Number(f.closeDay.value), dueDay: Number(f.dueDay.value), accountId: f.accountId.value, scope: f.scope.value, color: f.color.value };
        if (isEdit) Object.assign(card(c.id), data);
        else S.cards.push({ id: uid(), ...data });
        save();
        closeSheet();
        toast('Cartão salvo.');
        rerender();
      });
      sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
        const n = S.transactions.filter((t) => t.cardId === c.id).length;
        const ok = await confirmSheet({ title: `Excluir ${c.name}?`, text: n ? `Os ${n} lançamentos e pagamentos deste cartão também serão excluídos.` : '', options: [{ label: 'Excluir cartão', value: 'yes', danger: true }] });
        if (!ok) return;
        S.cards = S.cards.filter((x) => x.id !== c.id);
        S.transactions = S.transactions.filter((t) => t.cardId !== c.id);
        save();
        go('#/cartoes');
      });
    },
  });
}

const STATUS = { aberta: ['Aberta', 'st-open'], fechada: ['Fechada', 'st-closed'], paga: ['Paga', 'st-paid'], vencida: ['Vencida', 'st-late'] };

export function renderCardDetail(id) {
  const c = card(id);
  if (!c) return `<section>${pageHead('Cartão', { back: '#/cartoes' })}${empty('credit-card', 'Cartão não encontrado', '')}</section>`;
  const ym = UI.invoice[id] || currentInvoice(c);
  const items = invoiceItems(id, ym);
  const total = invoiceTotal(id, ym);
  const paid = invoicePaid(id, ym);
  const st = invoiceStatus(c, ym);
  const used = cardUsed(id);
  const payments = S.transactions.filter((t) => t.type === 'payment' && t.cardId === id && t.invoice === ym);
  return `<section>
    ${pageHead(c.name, { back: '#/cartoes', right: `<button class="icon-btn" data-action="card-form" data-id="${c.id}" aria-label="Editar cartão">${icon('pencil')}</button>` })}
    <div class="month-switch center">
      <button class="icon-btn" data-action="invoice-month" data-id="${id}" data-step="-1" aria-label="Fatura anterior">${icon('chevron-left')}</button>
      <button class="month-label" data-action="invoice-month" data-id="${id}" data-step="0">Fatura de ${monthLabel(ym)}</button>
      <button class="icon-btn" data-action="invoice-month" data-id="${id}" data-step="1" aria-label="Próxima fatura">${icon('chevron-right')}</button>
    </div>
    <article class="credit-card big" style="--c:${c.color}">
      <div class="cc-top"><span class="status ${STATUS[st][1]}">${STATUS[st][0]}</span>${icon('credit-card', 22)}</div>
      <div><small>Total da fatura</small><p class="cc-v">${$m(total)}</p>${paid ? `<small>Pago: ${$m(paid)}${total - paid > 0.004 ? ` · falta ${$m(total - paid)}` : ''}</small>` : ''}</div>
      <div class="cc-foot"><span>Fecha ${shortDate(invoiceCloseDate(c, ym)).slice(0, 5)}</span><span>Vence ${shortDate(invoiceDueDate(c, ym)).slice(0, 5)}</span></div>
      ${progress(used, c.limit)}<small>Limite disponível ${$m(c.limit - used)} de ${$m(c.limit)}</small>
    </article>
    <div class="toolbar">
      <button class="btn primary" data-action="pay-invoice" data-id="${id}" ${total - paid <= 0.004 ? 'disabled' : ''}>${icon('hand-coins', 18)} Pagar fatura</button>
      <button class="btn ghost" data-action="new-card-expense" data-id="${id}">${icon('plus', 18)} Nova despesa</button>
    </div>
    <article class="card">
      <header class="card-head"><h2>Lançamentos</h2><span class="muted small">${items.length} item(ns)</span></header>
      ${items.length ? `<ul class="list">${items.map((t) => txRow(t, { showDate: true })).join('')}</ul>` : empty('receipt', 'Fatura sem lançamentos', 'As compras deste período aparecerão aqui.')}
    </article>
    ${payments.length ? `<article class="card"><header class="card-head"><h2>Pagamentos</h2></header><ul class="list">${payments.map((p) => `
      <li class="row">${icon('circle-check', 20, 'pos')}<span class="grow"><b>${shortDate(p.date)}</b><small>${esc(account(p.accountId)?.name || '')}</small></span><span class="num">${$m(p.amount)}</span>
      <button class="icon-btn" data-action="del-payment" data-id="${p.id}" aria-label="Excluir pagamento">${icon('trash-2', 18)}</button></li>`).join('')}</ul></article>` : ''}
  </section>`;
}

on({
  'account-form': (el) => accountForm(el.dataset.id ? account(el.dataset.id) : null),
  'card-form': (el) => cardForm(el.dataset.id ? card(el.dataset.id) : null),
  'invoice-month': (el) => {
    const c = card(el.dataset.id);
    const step = Number(el.dataset.step);
    UI.invoice[c.id] = step === 0 ? currentInvoice(c) : addMonths(UI.invoice[c.id] || currentInvoice(c), step);
    rerender();
  },
  'new-card-expense': (el) => openTxForm('card', null, { cardId: el.dataset.id }),
  'pay-invoice': (el) => {
    const c = card(el.dataset.id);
    const ym = UI.invoice[c.id] || currentInvoice(c);
    const due = round2(invoiceTotal(c.id, ym) - invoicePaid(c.id, ym));
    openSheet(`<form class="tx-form"><h2 class="sheet-title">Pagar fatura de ${monthLabel(ym)}</h2>
      <label class="amount-field"><span>Valor pago</span><div><em>R$</em><input name="amount" inputmode="decimal" value="${moneyPlain(due)}" autofocus></div></label>
      <label class="field"><span>Pagar com a conta</span><select name="accountId">${S.accounts.map((a) => `<option value="${a.id}" ${a.id === c.accountId ? 'selected' : ''}>${esc(a.name)} · ${$m(accountBalance(a.id))}</option>`).join('')}</select></label>
      <label class="field"><span>Data do pagamento</span><input type="date" name="date" value="${today()}"></label>
      <p class="hint">Pode pagar um valor parcial; o restante continua em aberto nesta fatura.</p>
      <div class="form-actions"><button class="btn primary">${icon('check', 18)} Confirmar pagamento</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const amount = parseMoney(f.amount.value);
          if (!amount) return;
          S.transactions.push({ id: uid(), type: 'payment', amount, cardId: c.id, invoice: ym, accountId: f.accountId.value, date: f.date.value || today(), paid: true, desc: `Fatura ${c.name}` });
          save();
          closeSheet();
          toast('Pagamento registrado.');
          rerender();
        });
      },
    });
  },
  'del-payment': async (el) => {
    if (!(await confirmSheet({ title: 'Excluir este pagamento?', options: [{ label: 'Excluir', value: 'yes', danger: true }] }))) return;
    S.transactions = S.transactions.filter((t) => t.id !== el.dataset.id);
    save();
    rerender();
  },
});
