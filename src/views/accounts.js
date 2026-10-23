// Contas bancárias e cartões de crédito (faturas, limite, pagamento, estorno, ajuste e antecipação).
import {
  S, save, account, card, accountBalance, ACCOUNT_TYPES, ACCOUNT_ICONS, SCOPES, COLORS, currentInvoice, invoiceItems, invoiceTotal,
  invoicePaid, invoiceStatus, invoiceDueDate, invoiceCloseDate, cardUsed, accountsIn, cardsIn, bestCard, daysToDue, anticipatable,
  anticipate, adjustBalanceWithTransaction, moveTransactions, invoiceBreakdown, futureInstallments, installmentGroups, installmentIn, category,
} from '../store.js';
import { esc, icon, uid, parseMoney, moneyPlain, monthEnd, thisMonth, monthLabel, addMonths, shortDate, today, round2 } from '../util.js';
import { UI, $m, pageHead, scopeChips, progress, empty, on, rerender, openSheet, closeSheet, toast, confirmSheet, go, catBadge } from '../ui.js';
import { txRow } from './transactions.js';
import { openTxForm, openRefund } from '../form.js';

const colorPicker = (selected) =>
  `<div class="swatches">${COLORS.map((c) => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === selected ? 'checked' : ''}><span></span></label>`).join('')}</div>`;
const scopePicker = (selected = 'pf') =>
  `<div class="seg two">${Object.entries(SCOPES).map(([k, l]) => `<label class="seg-btn ${k === selected ? 'on' : ''}"><input type="radio" name="scope" value="${k}" ${k === selected ? 'checked' : ''}>${l}</label>`).join('')}</div>`;
const signed = (raw) => parseMoney(raw) * (String(raw).trim().startsWith('-') ? -1 : 1);

function wireSeg(sheet) {
  sheet.querySelectorAll('.seg input[type=radio]').forEach((r) =>
    r.addEventListener('change', () => r.closest('.seg').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.contains(r) && r.checked))),
  );
}

// ---------- contas ----------
const accountRow = (a) => `
  <li class="row"><button class="row linklike grow-row" data-action="open-statement" data-id="${a.id}" aria-label="Ver extrato de ${esc(a.name)}">
    <span class="cat-badge" style="--c:${a.color}">${icon(ACCOUNT_ICONS[a.type] || 'wallet', 18)}</span>
    <span class="grow"><b>${esc(a.name)}</b><small>${ACCOUNT_TYPES[a.type] || 'Conta'} · ${SCOPES[a.scope || 'pf']}${a.archived ? ' · arquivada' : ''} · ver extrato</small></span>
    <span class="num-col"><span class="num ${accountBalance(a.id) < 0 ? 'neg' : ''}">${$m(accountBalance(a.id))}</span><small>prev. ${$m(accountBalance(a.id, monthEnd(thisMonth())))}</small></span>
  </button><button class="icon-btn" data-action="account-form" data-id="${a.id}" aria-label="Editar ${esc(a.name)}">${icon('pencil', 16)}</button></li>`;

export function renderAccounts() {
  const list = accountsIn(UI.scope);
  const archived = accountsIn(UI.scope, { archived: true });
  const total = list.reduce((a, x) => a + accountBalance(x.id), 0);
  const forecast = list.reduce((a, x) => a + accountBalance(x.id, monthEnd(thisMonth())), 0);
  return `<section>
    ${pageHead('Contas', { back: '#/mais', right: `<button class="btn primary sm" data-action="account-form">${icon('plus', 16)} Nova</button>` })}
    ${scopeChips()}
    <div class="summary-strip two"><div><small>Saldo atual</small><b>${$m(total)}</b></div><div><small>Previsto fim do mês</small><b>${$m(forecast)}</b></div></div>
    <article class="card">${list.length ? `<ul class="list">${list.map(accountRow).join('')}</ul>` : empty('landmark', 'Nenhuma conta', 'Adicione conta corrente, poupança, carteira ou investimentos.')}</article>
    ${archived.length ? `<details class="card"><summary class="card-head"><h2>Arquivadas (${archived.length})</h2></summary><ul class="list">${archived.map(accountRow).join('')}</ul></details>` : ''}
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
    ${isEdit ? `<p class="hint">Saldo atual: <b>${$m(accountBalance(a.id))}</b>. Para corrigir o saldo, use “Reajustar saldo”.</p>` : ''}
    <div class="field"><span>Cor</span>${colorPicker(a.color)}</div>
    ${isEdit ? `<label class="switch-row"><span>Arquivar conta <small class="muted">(some das listas e do saldo geral)</small></span><input type="checkbox" role="switch" name="archived" ${a.archived ? 'checked' : ''}></label>` : ''}
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">
      ${isEdit ? `<button type="button" class="btn ghost danger" data-del aria-label="Excluir conta">${icon('trash-2', 18)}</button><button type="button" class="btn ghost" data-adjust>Reajustar saldo</button>` : ''}
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
        const data = { name: f.name.value.trim(), type: f.type.value, scope: f.scope.value, initial: signed(f.initial.value), color: f.color.value, archived: !!f.archived?.checked };
        if (isEdit) Object.assign(account(a.id), data);
        else S.accounts.push({ id: uid(), ...data });
        save();
        closeSheet();
        toast(data.archived ? 'Conta arquivada.' : 'Conta salva.');
        rerender();
      });
      sheet.querySelector('[data-adjust]')?.addEventListener('click', () => {
        openSheet(`<form class="tx-form"><h2 class="sheet-title">Reajustar saldo de ${esc(a.name)}</h2>
          <label class="amount-field"><span>Saldo real hoje</span><div><em>R$</em><input name="real" inputmode="decimal" value="${moneyPlain(accountBalance(a.id))}" autofocus></div></label>
          <div class="field"><span>Como ajustar</span><div class="seg two">
            <label class="seg-btn on"><input type="radio" name="mode" value="tx" checked>Criar lançamento</label>
            <label class="seg-btn"><input type="radio" name="mode" value="initial">Editar saldo inicial</label></div></div>
          <p class="hint">“Criar lançamento” registra a diferença hoje como reajuste (fora dos relatórios). “Editar saldo inicial” muda o ponto de partida e altera os saldos de todos os meses.</p>
          <div class="form-actions"><button class="btn primary">${icon('check', 18)} Ajustar</button></div></form>`, {
          onMount(s2) {
            wireSeg(s2);
            const f2 = s2.querySelector('form');
            f2.addEventListener('submit', (e) => {
              e.preventDefault();
              const real = signed(f2.real.value);
              if (f2.mode.value === 'tx') adjustBalanceWithTransaction(a.id, real);
              else {
                const acc = account(a.id);
                acc.initial = round2(acc.initial + real - accountBalance(a.id));
                save();
              }
              closeSheet();
              toast('Saldo reajustado.');
              rerender();
            });
          },
        });
      });
      sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
        const used = S.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id) || S.cards.some((c) => c.accountId === a.id);
        const others = S.accounts.filter((x) => x.id !== a.id);
        if (used && !others.length) return toast('Crie outra conta para receber os lançamentos antes de excluir esta.');
        const choice = await confirmSheet({
          title: `Excluir ${a.name}?`,
          text: used ? 'Esta conta tem lançamentos. Para excluir, eles serão movidos para outra conta.' : '',
          options: used ? others.map((o) => ({ label: `Mover para ${o.name} e excluir`, value: o.id, danger: true })) : [{ label: 'Excluir', value: 'yes', danger: true }],
        });
        if (!choice) return;
        if (used) moveTransactions(a.id, choice);
        S.accounts = S.accounts.filter((x) => x.id !== a.id);
        save();
        toast('Conta excluída.');
        rerender();
      });
    },
  });
}

// ---------- cartões ----------
const STATUS = { aberta: ['Aberta', 'st-open'], fechada: ['Fechada', 'st-closed'], parcial: ['Paga parcialmente', 'st-closed'], paga: ['Paga', 'st-paid'], vencida: ['Vencida', 'st-late'] };
const dueText = (d) => (d > 1 ? `vence em ${d} dias` : d === 1 ? 'vence amanhã' : d === 0 ? 'vence hoje' : `venceu há ${-d} dia(s)`);

function cardTile(c) {
  const inv = currentInvoice(c);
  const used = cardUsed(c.id);
  const inst = installmentGroups('all', { cardId: c.id }).filter((g) => !g.done);
  const future = futureInstallments(c.id, inv);
  return `<a class="credit-card" href="#/cartao/${c.id}" style="--c:${c.color}">
    <div class="cc-top"><b>${esc(c.name)}</b>${icon('credit-card', 22)}</div>
    <div><small>Fatura atual · ${monthLabel(inv, { short: true })} · ${dueText(daysToDue(c, inv))}</small><p class="cc-v">${$m(invoiceTotal(c.id, inv))}</p></div>
    <div class="cc-foot"><span>Fecha dia ${c.closeDay}</span><span>Vence dia ${c.dueDay}</span></div>
    ${progress(used, c.limit)}<small>Disponível ${$m(c.limit - used)} de ${$m(c.limit)}</small>
    ${inst.length ? `<small class="cc-inst">${icon('layers', 12)} ${inst.length} compra(s) parcelada(s) · ${$m(future)} em faturas futuras</small>` : ''}</a>`;
}

export function renderCards() {
  const list = cardsIn(UI.scope);
  const archived = cardsIn(UI.scope, { archived: true });
  const best = bestCard(UI.scope);
  return `<section>
    ${pageHead('Cartões de crédito', { back: '#/mais', right: `<button class="btn primary sm" data-action="card-form">${icon('plus', 16)} Novo</button>` })}
    ${scopeChips()}
    ${best ? `<div class="best-card">${icon('star', 18)}<span>O melhor cartão para comprar hoje é o <b>${esc(best.card.name)}</b>: a compra só vence em <b>${best.days} dias</b> (${shortDate(invoiceDueDate(best.card, currentInvoice(best.card)))}).</span></div>` : ''}
    ${list.length ? `<div class="grid">${list.map(cardTile).join('')}</div>` : `<article class="card">${empty('credit-card', 'Nenhum cartão', 'Cadastre seus cartões para acompanhar faturas e limite disponível.')}</article>`}
    <p class="hint">${icon('info', 14)} Toque num cartão para ver a fatura e as compras parceladas dele.</p>
    ${archived.length ? `<details class="card"><summary class="card-head"><h2>Arquivados (${archived.length})</h2></summary><div class="grid">${archived.map(cardTile).join('')}</div></details>` : ''}
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
    ${isEdit ? `<label class="switch-row"><span>Arquivar cartão</span><input type="checkbox" role="switch" name="archived" ${c.archived ? 'checked' : ''}></label>` : ''}
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
        const data = { name: f.name.value.trim(), limit: parseMoney(f.limit.value), closeDay: Number(f.closeDay.value), dueDay: Number(f.dueDay.value), accountId: f.accountId.value, scope: f.scope.value, color: f.color.value, archived: !!f.archived?.checked };
        if (isEdit) Object.assign(card(c.id), data);
        else S.cards.push({ id: uid(), ...data });
        save();
        closeSheet();
        toast('Cartão salvo.');
        rerender();
      });
      sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
        const n = S.transactions.filter((t) => t.cardId === c.id).length;
        const ok = await confirmSheet({ title: `Excluir ${c.name}?`, text: n ? `Os ${n} lançamentos e pagamentos deste cartão também serão excluídos. Se quiser manter o histórico, prefira arquivar.` : '', options: [{ label: 'Excluir cartão', value: 'yes', danger: true }] });
        if (!ok) return;
        S.cards = S.cards.filter((x) => x.id !== c.id);
        S.transactions = S.transactions.filter((t) => t.cardId !== c.id);
        save();
        go('#/cartoes');
      });
    },
  });
}

/** Linha de uma compra parcelada dentro do cartão, mostrando a parcela que cai na fatura visualizada. */
function cardInstRow(g, ym) {
  const here = installmentIn(g, ym);
  const after = g.list.filter((t) => !t.prior && t.invoice > ym);
  const left = after.reduce((a, t) => a + t.amount, 0) + (g.missingValue || 0);
  const nextInv = after[0]?.invoice;
  const afterCount = after.length + (g.missing || 0);
  return `<li><button class="row col linklike inst" data-action="inst-open" data-id="${g.groupId}">
    <div class="row-in">${catBadge(category(g.categoryId), 36)}
      <span class="grow"><b>${esc(g.desc)}</b><small>${here ? `Parcela <b>${here.installment.n}/${g.n}</b> nesta fatura · ${$m(here.amount)}` : nextInv ? `Sem parcela nesta fatura · próxima em ${monthLabel(nextInv, { short: true })}` : g.missing ? 'Próximas parcelas virão na importação das faturas seguintes' : 'Sem parcelas a partir desta fatura'}${g.imported ? ' · importada' : ''}</small></span>
      <span class="num-col"><span class="num">${$m(left)}</span><small>${afterCount ? `${afterCount} parcela(s) depois` : g.done ? 'quitada' : 'última'}</small></span></div>
    ${progress(g.paidValue, g.total, { warn: 2 })}
  </button></li>`;
}

export function renderCardDetail(id) {
  const c = card(id);
  if (!c) return `<section>${pageHead('Cartão', { back: '#/cartoes' })}${empty('credit-card', 'Cartão não encontrado', '')}</section>`;
  const ym = UI.invoice[id] || currentInvoice(c);
  const allItems = invoiceItems(id, ym);
  const filter = UI.invItems || 'all';
  const items = allItems.filter((t) => filter === 'all' || (filter === 'inst' ? t.installment : !t.installment));
  const total = invoiceTotal(id, ym);
  const paid = invoicePaid(id, ym);
  const st = invoiceStatus(c, ym);
  const used = cardUsed(id);
  const d = daysToDue(c, ym);
  const bd = invoiceBreakdown(id, ym);
  const future = futureInstallments(id, ym);
  const groups = installmentGroups('all', { cardId: id })
    .filter((g) => installmentIn(g, ym) || g.list.some((t) => !t.prior && t.invoice > ym))
    .sort((a, b) => !!installmentIn(b, ym) - !!installmentIn(a, ym) || b.remaining - a.remaining);
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
      <div><small>Total da fatura${st !== 'paga' ? ` · ${dueText(d)}` : ''}</small><p class="cc-v">${$m(total)}</p>${paid ? `<small>Pago: ${$m(paid)}${total - paid > 0.004 ? ` · falta ${$m(total - paid)}` : ''}</small>` : ''}</div>
      <div class="cc-foot"><span>Fecha ${shortDate(invoiceCloseDate(c, ym)).slice(0, 5)}</span><span>Vence ${shortDate(invoiceDueDate(c, ym)).slice(0, 5)}</span></div>
      ${progress(used, c.limit)}<small>Limite disponível ${$m(c.limit - used)} de ${$m(c.limit)}</small>
    </article>
    <div class="summary-strip">
      <div><small>Compras à vista</small><b>${$m(bd.single)}</b></div>
      <div><small>Parcelas (${bd.installmentCount})</small><b>${$m(bd.installments)}</b></div>
      <div><small>${bd.other < 0 ? 'Estornos/ajustes' : 'Ajustes'}</small><b class="${bd.other < 0 ? 'pos' : ''}">${$m(bd.other)}</b></div>
    </div>
    <div class="toolbar">
      <button class="btn primary" data-action="pay-invoice" data-id="${id}" ${total - paid <= 0.004 ? 'disabled' : ''}>${icon('hand-coins', 18)} Pagar fatura</button>
      <button class="btn ghost" data-action="new-card-expense" data-id="${id}">${icon('plus', 18)} Despesa</button>
      <button class="btn ghost" data-action="new-card-inst" data-id="${id}">${icon('layers', 18)} Parcelada</button>
    </div>
    <div class="chips scroll">
      <button class="chip" data-action="card-refund" data-id="${id}">${icon('rotate-ccw', 14)} Lançar estorno</button>
      <button class="chip" data-action="card-adjust" data-id="${id}">${icon('scale', 14)} Ajustar fatura</button>
      <button class="chip" data-action="card-anticipate" data-id="${id}">${icon('calendar-clock', 14)} Antecipar parcelas</button>
    </div>
    <article class="card">
      <header class="card-head"><h2>Compras parceladas</h2><span class="muted small">${groups.length} ativa(s)</span></header>
      ${groups.length ? `<p class="hint">Nesta fatura entram só as parcelas do mês (<b>${$m(bd.installments)}</b>). Faltam <b>${$m(future)}</b> em faturas futuras: isso ocupa o limite, mas não soma nesta fatura.</p>
        <ul class="list">${groups.map((g) => cardInstRow(g, ym)).join('')}</ul>`
        : empty('layers', 'Nenhuma compra parcelada', 'Compras parceladas neste cartão aparecem aqui, com a parcela de cada fatura e quanto falta.', `<button class="btn primary sm" data-action="new-card-inst" data-id="${id}">Lançar compra parcelada</button>`)}
    </article>
    <article class="card">
      <header class="card-head"><h2>Lançamentos</h2><span class="muted small">${items.length} item(ns)</span></header>
      <div class="chips small">${[['all', 'Todos'], ['single', 'À vista'], ['inst', 'Parcelas']].map(([v, l]) => `<button class="chip ${filter === v ? 'on' : ''}" data-action="inv-items" data-v="${v}">${l}</button>`).join('')}</div>
      ${items.length ? `<ul class="list">${items.map((t) => txRow(t, { showDate: true })).join('')}</ul>` : empty('receipt', 'Fatura sem lançamentos', 'As compras deste período aparecerão aqui.')}
    </article>
    ${payments.length ? `<article class="card"><header class="card-head"><h2>Pagamentos</h2></header><ul class="list">${payments.map((p) => `
      <li class="row">${icon('circle-check', 20, 'pos')}<span class="grow"><b>${shortDate(p.date)}</b><small>${esc(account(p.accountId)?.name || '')}</small></span><span class="num">${$m(p.amount)}</span>
      <button class="icon-btn" data-action="del-card-item" data-id="${p.id}" aria-label="Excluir pagamento">${icon('trash-2', 18)}</button></li>`).join('')}</ul></article>` : ''}
  </section>`;
}

const invoiceOf = (c) => UI.invoice[c.id] || currentInvoice(c);

on({
  'account-form': (el) => accountForm(el.dataset.id ? account(el.dataset.id) : null),
  'open-statement': (el) => {
    UI.txAccount = el.dataset.id;
    UI.txQuery = '';
    try {
      localStorage.setItem('ruffino-financas:conta-extrato', el.dataset.id);
    } catch {
      /* preferência só deste aparelho */
    }
    if (location.hash !== '#/transacoes') go('#/transacoes');
  },
  'card-form': (el) => cardForm(el.dataset.id ? card(el.dataset.id) : null),
  'invoice-month': (el) => {
    const c = card(el.dataset.id);
    const step = Number(el.dataset.step);
    UI.invoice[c.id] = step === 0 ? currentInvoice(c) : addMonths(invoiceOf(c), step);
    rerender();
  },
  'new-card-expense': (el) => openTxForm('card', null, { cardId: el.dataset.id }),
  'new-card-inst': (el) => openTxForm('card', null, { cardId: el.dataset.id, repeat: 'installments', times: 10 }),
  'inv-items': (el) => ((UI.invItems = el.dataset.v), rerender()),
  'card-refund': (el) => openRefund(el.dataset.id),
  'card-adjust': (el) => {
    const c = card(el.dataset.id);
    const ym = invoiceOf(c);
    const total = invoiceTotal(c.id, ym);
    openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('scale', 20)} Ajustar fatura de ${monthLabel(ym)}</h2>
      <p class="muted small">Use quando o total no app não bate com a fatura do banco (juros, IOF, anuidade, centavos).</p>
      <label class="amount-field"><span>Total correto da fatura</span><div><em>R$</em><input name="real" inputmode="decimal" value="${moneyPlain(total)}" autofocus></div></label>
      <p class="hint">Total no app: <b>${$m(total)}</b>. A diferença vira um lançamento de ajuste nesta fatura.</p>
      <div class="form-actions"><button class="btn primary">${icon('check', 18)} Ajustar</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const delta = round2(parseMoney(f.real.value) - total);
          if (delta) S.transactions.push({ id: uid(), type: 'invoiceAdjust', delta, amount: Math.abs(delta), cardId: c.id, invoice: ym, date: today() < invoiceCloseDate(c, ym) ? today() : invoiceCloseDate(c, ym), paid: true, desc: 'Ajuste de fatura', tags: [] });
          save();
          closeSheet();
          toast(delta ? 'Fatura ajustada.' : 'O total já estava correto.');
          rerender();
        });
      },
    });
  },
  'card-anticipate': (el) => {
    const c = card(el.dataset.id);
    const target = invoiceOf(c);
    const list = anticipatable(c.id, target);
    if (!list.length) return toast('Nenhuma parcela futura para antecipar nesta fatura.');
    openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('calendar-clock', 20)} Antecipar parcelas</h2>
      <p class="muted small">As parcelas marcadas entram na fatura de <b>${monthLabel(target)}</b>. Atenção: depois de feita, a antecipação não pode ser desfeita.</p>
      <ul class="list">${list.map((t) => `<li><label class="row"><input type="checkbox" name="ids" value="${t.id}"><span class="grow"><b>${esc(t.desc || 'Parcela')}</b><small>Parcela ${t.installment.n}/${t.installment.total} · fatura de ${monthLabel(t.invoice, { short: true })}</small></span><span class="num">${$m(t.amount)}</span></label></li>`).join('')}</ul>
      <div class="form-actions"><button class="btn primary">${icon('check', 18)} Antecipar selecionadas</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const ids = [...f.querySelectorAll('[name=ids]:checked')].map((x) => x.value);
          if (!ids.length) return toast('Selecione ao menos uma parcela.');
          anticipate(ids, target);
          closeSheet();
          toast(`${ids.length} parcela(s) antecipada(s).`);
          rerender();
        });
      },
    });
  },
  'pay-invoice': (el) => {
    const c = card(el.dataset.id);
    const ym = invoiceOf(c);
    const due = round2(invoiceTotal(c.id, ym) - invoicePaid(c.id, ym));
    openSheet(`<form class="tx-form"><h2 class="sheet-title">Pagar fatura de ${monthLabel(ym)}</h2>
      <label class="amount-field"><span>Valor pago</span><div><em>R$</em><input name="amount" inputmode="decimal" value="${moneyPlain(due)}" autofocus></div></label>
      <label class="field"><span>Pagar com a conta</span><select name="accountId">${S.accounts.filter((a) => !a.archived).map((a) => `<option value="${a.id}" ${a.id === c.accountId ? 'selected' : ''}>${esc(a.name)} · ${$m(accountBalance(a.id))}</option>`).join('')}</select></label>
      <label class="field"><span>Data do pagamento</span><input type="date" name="date" value="${today()}"></label>
      <p class="hint">Pode pagar um valor parcial: a fatura fica como “paga parcialmente” e o restante continua em aberto.</p>
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
          toast(amount < due - 0.004 ? 'Pagamento parcial registrado.' : 'Fatura paga.');
          rerender();
        });
      },
    });
  },
  'del-card-item': async (el) => {
    if (!(await confirmSheet({ title: 'Excluir este lançamento da fatura?', options: [{ label: 'Excluir', value: 'yes', danger: true }] }))) return;
    S.transactions = S.transactions.filter((t) => t.id !== el.dataset.id);
    save();
    rerender();
  },
});
