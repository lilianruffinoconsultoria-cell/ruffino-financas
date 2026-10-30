// Parcelamentos dentro de "A pagar e receber": visão por parcelamento (total, pago, saldo pendente) e a
// ficha de cada um. As parcelas são os próprios lançamentos (ligados pelo groupId): não há outra fonte de dados.
// Fora do cartão, cada parcela é baixada sozinha (openSettle); no cartão, entram nas faturas (só consulta aqui).
import {
  S, installmentGroups, installmentPaid, installmentDue, installmentPeople, unsettlePayable, settleInstallments,
  deleteTransaction, category, card, account, accountBalance, invoiceFor, save,
} from '../store.js';
import { esc, icon, shortDate, monthLabel, monthOf, thisMonth, addMonths, parseMoney, moneyPlain, today, money, round2 } from '../util.js';
import { UI, $m, progress, catBadge, empty, on, rerender, openSheet, closeSheet, toast, go, confirmSheet } from '../ui.js';
import { openTxForm } from '../form.js';
import { deleteReceipt } from '../receipts.js';
import { openSettle } from './payables.js';

const F = { status: 'active', person: '' };
const NO_PERSON = 'Sem pessoa informada';
const VERB = { pay: { do: 'Pagar', done: 'Paga', left: 'Falta pagar', paid: 'Já pago', doing: 'pagas' }, receive: { do: 'Receber', done: 'Recebida', left: 'Falta receber', paid: 'Já recebido', doing: 'recebidas' } };

const holderName = (g) => (g.cardId ? card(g.cardId)?.name || 'Cartão' : account(g.accountId)?.name || 'Conta');
// "N× de R$ x"; com parcelas de valores diferentes (editadas à mão), mostra a faixa
const perLine = (g) => (round2(g.perMax - g.perMin) > 0.01 ? `${g.n} parcelas de ${$m(g.perMin)} a ${$m(g.perMax)}` : `${g.n}× de ${$m(g.per)}`);
// parcelas pagas antes do app: singular quando só a 1ª
const priorLine = (n) => (n === 1 ? 'parcela 1 paga antes de usar o app' : `parcelas 1 a ${n} pagas antes de usar o app`);
// parcela que entrou numa quitação antecipada (a nota guarda a marca)
const earlySettled = (t) => t.paid && /Quitação antecipada/.test(t.note || '');
const dm = (iso) => shortDate(iso).slice(0, 5);
const whoLine = (g) => (g.cardId ? `${icon('credit-card', 12)} ${esc(holderName(g))}` : g.person ? `${icon('user-round', 12)} ${esc(g.person)} · ${esc(holderName(g))}` : `${icon('landmark', 12)} ${esc(holderName(g))}`);

function groupRow(g) {
  const c = category(g.categoryId);
  const V = VERB[g.dir];
  const pct = g.total ? Math.round((g.paidValue / g.total) * 100) : 0;
  const nextDue = g.next ? installmentDue(g.next) : null;
  const late = g.late && !g.cardId;
  return `<li><button class="row col linklike inst" data-action="inst-open" data-id="${g.groupId}">
    <div class="row-in">${catBadge(c, 40)}
      <span class="grow"><b>${esc(g.desc)}</b><small>${whoLine(g)} · ${perLine(g)}</small></span>
      <span class="inst-count"><b>${g.paidCount}/${g.n}</b><small>${V.doing}</small></span></div>
    ${progress(g.paidValue, g.total, { warn: 2 })}
    <div class="inst-nums">
      <span><small>Total</small><b>${$m(g.total)}</b></span>
      <span><small>${V.paid}</small><b class="pos">${$m(g.paidValue)}</b></span>
      <span><small>Saldo pendente</small><b class="${g.remaining ? (g.dir === 'pay' ? 'neg' : 'pos') : ''}">${$m(g.remaining)}</b></span>
    </div>
    <small class="muted">${g.done ? `Quitado${g.discount ? ` · economia de ${$m(g.discount)}` : ''}` : nextDue ? `Próxima: parcela ${g.next.installment.n} em ${shortDate(nextDue)} · ${pct}%${late ? ` · <span class="neg">${g.late} vencida(s)</span>` : ''}` : ''}</small>
  </button></li>`;
}

/** Visão "Parcelamentos" da aba. `dir`: 'pay' | 'receive'. */
export function installmentsPanel(dir) {
  const all = installmentGroups(UI.scope, { where: 'outside' }).filter((g) => g.dir === dir);
  const byPerson = all.filter((g) => !F.person || (g.person || NO_PERSON).toLowerCase() === F.person.toLowerCase());
  const list = byPerson
    .filter((g) => (F.status === 'active' ? !g.done : g.done))
    .sort((a, b) => (a.next ? installmentDue(a.next) : a.end).localeCompare(b.next ? installmentDue(b.next) : b.end) * (F.status === 'active' ? 1 : -1));
  const active = byPerson.filter((g) => !g.done);
  const V = VERB[dir];
  const remaining = active.reduce((a, g) => a + g.remaining, 0);
  const nextMonth = addMonths(thisMonth(), 1);
  const dueIn = (ym) => active.reduce((a, g) => a + g.list.filter((t) => !installmentPaid(t) && monthOf(installmentDue(t)) === ym).reduce((x, t) => x + t.amount, 0), 0);
  const late = active.reduce((a, g) => a + g.late, 0);
  const people = installmentPeople(UI.scope).filter((p) => p[dir] > 0 || p.groups.some((g) => g.dir === dir && !g.done));
  // compras parceladas no cartão: só consulta (são pagas pela fatura e não entram nos totais acima)
  const onCard = dir === 'pay' ? installmentGroups(UI.scope, { where: 'card' }).filter((g) => !g.done) : [];

  return `<article class="hero slim">
      <p class="hero-k">${V.left}${F.person ? ` · ${esc(F.person)}` : ''} · ${active.length} parcelamento(s)</p>
      <p class="hero-v sm">${$m(remaining)}</p>
      <div class="hero-pills">
        <div class="pill ${dir === 'pay' ? 'exp' : 'inc'}"><span>${icon('calendar', 16)}</span><div><small>Neste mês</small><b>${$m(dueIn(thisMonth()))}</b></div></div>
        <div class="pill ${dir === 'pay' ? 'exp' : 'inc'}"><span>${icon('calendar-clock', 16)}</span><div><small>${monthLabel(nextMonth, { short: true })}</small><b>${$m(dueIn(nextMonth))}</b></div></div>
      </div>
      ${late ? `<p class="hero-sub" style="margin-top:10px">${icon('triangle-alert', 14)} <strong>${late} parcela(s) vencida(s)</strong></p>` : ''}
    </article>
    ${people.length > 1 || F.person ? `<article class="card">
      <header class="card-head"><h2>Por pessoa ou loja</h2>${F.person ? '<button class="link" data-action="inst-person" data-v="">Ver todas</button>' : ''}</header>
      <ul class="list compact">${people.map((p) => `<li><button class="row linklike ${F.person.toLowerCase() === p.name.toLowerCase() ? 'is-on' : ''}" data-action="inst-person" data-v="${esc(p.name)}">
        <span class="cat-badge sm person-badge">${p.name === NO_PERSON ? icon('receipt', 14) : esc(p.name.slice(0, 1).toUpperCase())}</span>
        <span class="grow"><b>${esc(p.name)}</b><small>${p.active} ativo(s)${p.late ? ` · <span class="neg">${p.late} vencida(s)</span>` : ''}</small></span>
        <span class="num-col">${p.pay ? `<span class="num neg">− ${$m(p.pay)}</span>` : ''}${p.receive ? `<span class="num pos">+ ${$m(p.receive)}</span>` : ''}</span></button></li>`).join('')}</ul>
    </article>` : ''}
    <div class="chips small">${[['active', 'Em andamento'], ['done', 'Quitados']].map(([v, l]) => `<button class="chip ${F.status === v ? 'on' : ''}" data-action="inst-status" data-v="${v}">${l}</button>`).join('')}</div>
    <article class="card">${list.length ? `<ul class="list">${list.map(groupRow).join('')}</ul>`
      : empty('handshake', F.status === 'active' ? `Nenhum parcelamento ${dir === 'pay' ? 'a pagar' : 'a receber'}` : 'Nenhum parcelamento quitado ainda',
        dir === 'pay' ? 'Lance uma conta a pagar com a forma “Parcelado”: carnê, crediário, boleto, Pix parcelado, compra com pessoa ou loja.' : 'Lance uma conta a receber com a forma “Parcelado”: venda ou empréstimo que alguém te paga em parcelas.')}</article>
    ${onCard.length && F.status === 'active' ? `<article class="card"><header class="card-head"><h2>${icon('credit-card', 18)} No cartão</h2><span class="muted small">pagos pela fatura · fora dos totais</span></header>
      <ul class="list">${onCard.map(groupRow).join('')}</ul></article>` : ''}`;
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
      <span><small>Saldo pendente</small><b class="${g.dir === 'pay' ? 'neg' : 'pos'}">${money(g.remaining)}</b></span>
    </div>
    ${progress(g.paidValue, g.total, { warn: 2 })}
    <p class="hint">Total: <b>${money(g.total)}</b>${g.discount ? ` · economia: <b class="pos">${money(g.discount)}</b>` : ''}${g.priorCount ? ` · ${priorLine(g.priorCount)} (só histórico)` : ''}</p>
    ${g.done ? '' : `<div class="toolbar">
      ${outside ? `<button class="btn primary sm" data-pay="${g.next.id}">${icon('circle-check', 16)} ${V.do} parcela ${g.next.installment.n}</button><button class="btn ghost sm" data-settle>${icon('hand-coins', 16)} Quitar antecipado</button>`
        : `<button class="btn primary sm" data-go-card>${icon('calendar-clock', 16)} Antecipar no cartão</button>`}
    </div>`}
    <ul class="list inst-list">${g.list.map((t) => {
      const ok = installmentPaid(t);
      const due = t.dueDate || installmentDue(t);
      const late = !ok && due < today();
      const status = t.prior ? 'Antes do app' : ok ? V.done : late ? 'Vencida' : g.cardId ? 'A cobrar' : `A ${V.do.toLowerCase()}`;
      return `<li class="row ${t.prior ? 'is-prior' : ''}"><span class="inst-n ${ok ? 'ok' : late ? 'late' : ''}">${t.installment.n}</span>
        <span class="grow"><b>${money(t.amount)}${t.originalAmount ? ` <small class="muted"><s>${money(t.originalAmount)}</s></small>` : ''}</b><small>${t.prior ? `Antes do app · ${monthLabel(monthOf(installmentDue(t)), { short: true })}` : g.cardId ? `Fatura de ${monthLabel(t.invoice, { short: true })} · vence ${shortDate(installmentDue(t))}${t.anticipated ? ' · antecipada' : ''}` : `Vence ${shortDate(due)}${ok ? ` · ${earlySettled(t) ? `quitada antecipadamente em ${dm(t.date)}` : `${V.done.toLowerCase()} em ${shortDate(t.date)}`}${t.accountId ? ` · ${esc(account(t.accountId)?.name || '')}` : ''}` : ''}`}</small></span>
        <span class="small ${t.prior ? 'muted' : ok ? 'pos' : late ? 'neg' : 'muted'}">${status}</span>
        ${outside && !t.prior ? `<button class="icon-btn check ${ok ? 'done' : ''}" data-toggle="${t.id}" aria-label="${ok ? 'Estornar' : V.do}">${icon(ok ? 'circle-check' : 'circle', 20)}</button>` : '<span class="check-spacer"></span>'}</li>`;
    }).join('')}</ul>
    <div class="form-actions">
      <button class="btn ghost danger" data-del aria-label="Excluir parcelamento">${icon('trash-2', 16)}</button>
      ${editable.length ? `<button class="btn ghost" data-edit>${icon('pencil', 16)} Editar</button>` : ''}
      <button class="btn ghost" data-close>Fechar</button></div>
  </div>`, {
    onMount(sheet) {
      const reopen = () => (rerender(), openGroup(groupId));
      const pay = (id) => openSettle(id, { onDone: () => openGroup(groupId) });
      sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-edit]')?.addEventListener('click', () => openTxForm(null, g.next && !g.next.prior ? g.next : editable[editable.length - 1]));
      sheet.querySelector('[data-go-card]')?.addEventListener('click', () => {
        const c = card(g.cardId);
        UI.invoice[g.cardId] = c ? invoiceFor(c, today()) : UI.invoice[g.cardId];
        closeSheet();
        setTimeout(() => go(`#/cartao/${g.cardId}`), 50);
        toast('Use “Antecipar parcelas” na fatura do cartão.');
      });
      sheet.querySelector('[data-pay]')?.addEventListener('click', (e) => pay(e.currentTarget.dataset.pay));
      sheet.querySelectorAll('[data-toggle]').forEach((b) =>
        b.addEventListener('click', async () => {
          const t = S.transactions.find((x) => x.id === b.dataset.toggle);
          if (!t) return;
          if (!t.paid) return pay(t.id);
          const ok = await confirmSheet({
            title: `Estornar a parcela ${t.installment.n}?`,
            text: 'Só esta parcela volta a ficar em aberto, no vencimento original.',
            options: [{ label: 'Estornar', value: 'yes', danger: true }],
          });
          if (ok) unsettlePayable(t.id);
          reopen();
        }),
      );
      sheet.querySelector('[data-settle]')?.addEventListener('click', () => openSettleAll(g));
      sheet.querySelector('[data-del]').addEventListener('click', async () => {
        // fora do cartão, com parcelas já pagas: deixa escolher manter as pagas no histórico
        const paidN = g.list.filter((t) => t.paid && !t.prior).length;
        const split = outside && paidN > 0;
        const choice = await confirmSheet({
          title: `Excluir “${g.desc}”?`,
          text: split
            ? `${paidN} parcela(s) já paga(s). Se escolher “Só as em aberto”, as pagas continuam no histórico e no saldo das contas.`
            : `As ${g.n} parcelas serão excluídas${g.cardId ? ' e saem das faturas do cartão' : ''}. As já pagas também somem do saldo das contas.`,
          options: split
            ? [{ label: 'Excluir só as parcelas em aberto', value: 'open' }, { label: 'Excluir tudo, inclusive as pagas', value: 'all', danger: true }]
            : [{ label: 'Excluir parcelamento', value: 'yes', danger: true }],
        });
        if (!choice) return;
        if (choice === 'open') {
          const openTx = S.transactions.filter((t) => t.groupId === g.groupId && !t.paid && !t.prior);
          for (const t of openTx) if (t.receipt) deleteReceipt(t.receipt.id);
          S.transactions = S.transactions.filter((t) => !openTx.includes(t));
          save();
          toast('Parcelas em aberto excluídas; as pagas continuam no histórico.');
        } else {
          for (const t of deleteTransaction(g.list[0].id, 'all')) if (t.receipt) deleteReceipt(t.receipt.id);
          toast('Parcelamento excluído.');
        }
        rerender();
      });
    },
  });
}

/** Quitação antecipada (só quando pedida): das próximas parcelas em aberto, quantas o usuário escolher. */
function openSettleAll(g) {
  const accId = g.accountId || S.accounts.find((a) => !a.archived)?.id;
  // as mesmas que settleInstallments considera: em aberto, fora do cartão, a partir da próxima
  const open = g.list.filter((t) => !t.paid && !t.prior && !t.cardId);
  if (!open.length) return;
  const N = open.length;
  const verb = g.dir === 'pay' ? 'pago' : 'recebido';
  const pick = (k) => open.slice(0, k);
  const totalOf = (k) => round2(pick(k).reduce((a, t) => a + t.amount, 0));
  openSheet(`<form class="tx-form inst-settle"><h2 class="sheet-title">${icon('hand-coins', 20)} Quitar ${esc(g.desc)}</h2>
    <p class="muted small">Faltam ${N} parcela(s) em aberto, somando <b>${money(totalOf(N))}</b>. Se houve desconto para quitar, informe o valor realmente ${verb}.</p>
    <label class="field"><span>Quantas parcelas quitar</span><select name="count">${open.map((t, i) => `<option value="${i + 1}" ${i + 1 === N ? 'selected' : ''}>${i + 1 === N ? `Todas (${N})` : `${i + 1} parcela${i ? 's' : ''}`}</option>`).join('')}</select></label>
    <div class="inst-pick" data-pick aria-live="polite"></div>
    <label class="amount-field ${g.dir === 'pay' ? 't-expense' : 't-income'}"><span>Valor da quitação</span><div><em>R$</em><input name="amount" inputmode="decimal" autocomplete="off" value="${moneyPlain(totalOf(N))}"></div></label>
    <p class="hint" data-diff></p>
    <p class="hint">${icon('info', 14)}O desconto (ou acréscimo) é repartido na proporção do valor de cada parcela, e o vencimento original de cada uma fica registrado.</p>
    <label class="field"><span>Conta</span><select name="accountId">${S.accounts.filter((a) => !a.archived).map((a) => `<option value="${a.id}" ${a.id === accId ? 'selected' : ''}>${esc(a.name)} · ${money(accountBalance(a.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Data</span><input type="date" name="date" value="${today()}"></label>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} Quitar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      const box = f.querySelector('[data-pick]');
      const diff = f.querySelector('[data-diff]');
      const err = f.querySelector('.form-error');
      let touched = false; // o valor acompanha o total escolhido até o usuário editar
      const k = () => Number(f.count.value) || N;
      const update = () => {
        const list = pick(k());
        const total = totalOf(k());
        if (!touched) f.amount.value = moneyPlain(total);
        const nums = list.length === 1 ? `Parcela ${list[0].installment.n}` : `Parcelas ${list[0].installment.n} a ${list[list.length - 1].installment.n}`;
        box.innerHTML = `<p class="small"><b>${nums}</b> · total previsto <b>${money(total)}</b>${k() < N ? ` · ficam ${N - k()} em aberto` : ''}</p>
          <ul class="inst-pick-list">${list.map((t) => `<li><span class="inst-n">${t.installment.n}</span><span>venc. ${shortDate(installmentDue(t))}</span><b>${money(t.amount)}</b></li>`).join('')}</ul>`;
        const d = round2(parseMoney(f.amount.value) - total);
        diff.textContent = d < -0.004 ? `Desconto de ${money(-d)} (${Math.round((-d / total) * 100)}%).` : d > 0.004 ? `${money(d)} acima do previsto, repartidos nas parcelas.` : '';
      };
      f.count.addEventListener('change', update);
      f.amount.addEventListener('input', () => ((touched = true), update()));
      update();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = parseMoney(f.amount.value);
        if (!v) {
          err.textContent = 'Informe um valor maior que zero.';
          err.hidden = false;
          return;
        }
        const n = k();
        const saved = settleInstallments(g.groupId, v, f.accountId.value, f.date.value || today(), n);
        const what = n === N ? 'Parcelamento quitado' : `${n} parcela${n > 1 ? 's' : ''} quitada${n > 1 ? 's' : ''}`;
        toast(saved > 0.004 ? `${what} com economia de ${money(saved)}.` : `${what}.`);
        rerender();
        openGroup(g.groupId);
      });
    },
  });
}

on({
  'inst-status': (el) => ((F.status = el.dataset.v), rerender()),
  'inst-person': (el) => ((F.person = F.person.toLowerCase() === el.dataset.v.toLowerCase() ? '' : el.dataset.v), rerender()),
  'inst-open': (el) => openGroup(el.dataset.id),
});
