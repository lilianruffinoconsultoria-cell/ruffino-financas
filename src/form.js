// Formulário de lançamento: despesa, receita, transferência e despesa no cartão.
import {
  S, byId, category, categoriesOf, addTransaction, updateTransaction, deleteTransaction, descriptionsIndex, allTags, invoiceFor, card, SCOPES,
} from './store.js';
import { esc, icon, today, isoDate, parseMoney, moneyPlain, monthLabel } from './util.js';
import { openSheet, closeSheet, confirmSheet, rerender, toast, on, go } from './ui.js';

const TYPES = [
  ['expense', 'Despesa', 'trending-down'],
  ['income', 'Receita', 'trending-up'],
  ['transfer', 'Transferência', 'arrow-left-right'],
  ['card', 'Cartão', 'credit-card'],
];

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
};

const accountOptions = (selected) =>
  S.accounts.map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}${S.accounts.some((x) => x.scope === 'pj') ? ` · ${SCOPES[a.scope || 'pf']}` : ''}</option>`).join('');

function categoryGrid(type, selected) {
  return categoriesOf(type)
    .map(
      (c) => `<label class="cat-opt" style="--c:${c.color}"><input type="radio" name="categoryId" value="${c.id}" ${c.id === selected ? 'checked' : ''}>
      <span class="cat-badge sm">${icon(c.icon, 16)}</span><span>${esc(c.name)}</span></label>`,
    )
    .join('');
}

/** Abre o formulário. `kind` é o tipo de tela (expense|income|transfer|card); `tx` edita uma existente. */
export function openTxForm(kind = 'expense', tx = null, preset = {}) {
  if (tx) kind = tx.type === 'expense' && tx.cardId ? 'card' : tx.type;
  if (kind === 'card' && !S.cards.length) {
    toast('Cadastre um cartão de crédito primeiro.');
    go('#/cartoes');
    return;
  }
  if (!S.accounts.length) {
    toast('Cadastre uma conta primeiro.');
    go('#/contas');
    return;
  }
  if (kind === 'transfer' && S.accounts.length < 2) {
    toast('Você precisa de pelo menos duas contas para transferir.');
    return;
  }
  const v = tx || { date: today(), paid: true, tags: [], ...preset };
  const catType = kind === 'income' ? 'income' : 'expense';
  const isEdit = !!tx;
  const descs = [...descriptionsIndex().keys()].slice(-200);
  const tags = allTags();

  const html = `
  <form class="tx-form" novalidate>
    <div class="seg" role="tablist">${TYPES.map(([k, l, ic]) => `<button type="button" class="seg-btn ${k === kind ? 'on' : ''} t-${k}" data-kind="${k}" ${isEdit ? 'disabled' : ''}>${icon(ic, 16)}<span>${l}</span></button>`).join('')}</div>

    <label class="amount-field t-${kind}">
      <span>Valor</span>
      <div><em>R$</em><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${v.amount ? moneyPlain(v.amount) : ''}" autofocus required></div>
    </label>

    <label class="field"><span>Descrição</span>
      <input name="desc" list="desc-list" maxlength="80" value="${esc(v.desc || '')}" placeholder="${kind === 'transfer' ? 'Ex.: Reserva do mês' : 'Ex.: Mercado do mês'}">
      <datalist id="desc-list">${descs.map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
    </label>

    ${kind !== 'transfer' ? `<fieldset class="field"><legend>Categoria</legend><div class="cat-grid">${categoryGrid(catType, v.categoryId)}</div></fieldset>` : ''}

    ${
      kind === 'transfer'
        ? `<div class="row2">
            <label class="field"><span>De</span><select name="accountId">${accountOptions(v.accountId || S.accounts[0].id)}</select></label>
            <label class="field"><span>Para</span><select name="toAccountId">${accountOptions(v.toAccountId || S.accounts[1].id)}</select></label></div>`
        : kind === 'card'
          ? `<label class="field"><span>Cartão</span><select name="cardId">${S.cards.map((c) => `<option value="${c.id}" ${c.id === v.cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
             <p class="hint" data-invoice-hint></p>`
          : `<label class="field"><span>Conta</span><select name="accountId">${accountOptions(v.accountId || S.accounts[0].id)}</select></label>`
    }

    <div class="field"><span>Data</span>
      <div class="date-row">
        <button type="button" class="chip" data-date="${today()}">Hoje</button>
        <button type="button" class="chip" data-date="${yesterday()}">Ontem</button>
        <input type="date" name="date" value="${v.date}" required>
      </div>
    </div>

    ${
      kind === 'card' || kind === 'transfer'
        ? ''
        : `<label class="switch-row"><span>${kind === 'income' ? 'Recebido' : 'Pago'}</span><input type="checkbox" role="switch" name="paid" ${v.paid ? 'checked' : ''}></label>`
    }

    ${
      isEdit
        ? v.groupId
          ? `<label class="switch-row"><span>Aplicar alterações às próximas ${v.installment ? 'parcelas' : 'repetições'}</span><input type="checkbox" role="switch" name="applyFuture"></label>
             <p class="hint">${v.installment ? `Parcela ${v.installment.n} de ${v.installment.total}` : 'Lançamento fixo mensal'}</p>`
          : ''
        : kind === 'transfer'
          ? ''
          : `<div class="row2">
              <label class="field"><span>Repetir</span>
                <select name="repeat"><option value="none">Não repete</option><option value="fixed">Fixa (todo mês)</option><option value="installments">Parcelada</option></select></label>
              <label class="field" data-times hidden><span>Nº de parcelas</span><input name="times" type="number" min="2" max="72" value="2" inputmode="numeric"></label>
            </div>`
    }

    ${
      kind === 'transfer'
        ? ''
        : `<label class="field"><span>Tags <small>(separe por vírgula)</small></span>
            <input name="tags" list="tag-list" value="${esc((v.tags || []).join(', '))}" placeholder="Ex.: viagem, trabalho">
            <datalist id="tag-list">${tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>`
    }
    <label class="field"><span>Observação</span><textarea name="note" rows="2" maxlength="300">${esc(v.note || '')}</textarea></label>

    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">
      ${isEdit ? `<button type="button" class="btn danger ghost" data-delete>${icon('trash-2', 18)} Excluir</button>` : ''}
      <button type="submit" class="btn primary">${icon('check', 18)} Salvar</button>
    </div>
  </form>`;

  openSheet(html, {
    onMount(sheet) {
      const form = sheet.querySelector('form');
      const err = form.querySelector('.form-error');
      const showErr = (m) => {
        err.textContent = m;
        err.hidden = false;
      };

      form.querySelectorAll('[data-kind]').forEach((b) =>
        b.addEventListener('click', () => {
          const amount = form.amount.value;
          const desc = form.desc.value;
          openTxForm(b.dataset.kind, null, { date: form.date.value, amount: parseMoney(amount), desc });
        }),
      );
      form.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => {
        form.date.value = b.dataset.date;
        form.date.dispatchEvent(new Event('change'));
      }));

      const repeat = form.querySelector('[name=repeat]');
      repeat?.addEventListener('change', () => (form.querySelector('[data-times]').hidden = repeat.value !== 'installments'));

      // sugere a categoria usada da última vez com a mesma descrição
      const index = descriptionsIndex();
      form.desc.addEventListener('change', () => {
        const catId = index.get(form.desc.value.trim());
        const radio = catId && form.querySelector(`[name=categoryId][value="${catId}"]`);
        if (radio && !form.querySelector('[name=categoryId]:checked')) radio.checked = true;
      });

      const hint = form.querySelector('[data-invoice-hint]');
      const updateHint = () => {
        if (!hint) return;
        const c = card(form.cardId.value);
        if (c && form.date.value) hint.textContent = `Entra na fatura de ${monthLabel(invoiceFor(c, form.date.value))} (fecha dia ${c.closeDay}, vence dia ${c.dueDay}).`;
      };
      form.cardId?.addEventListener('change', updateHint);
      form.date.addEventListener('change', updateHint);
      updateHint();

      sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const choice = v.groupId
          ? await confirmSheet({
              title: 'Excluir lançamento',
              text: 'Este lançamento se repete. O que deseja excluir?',
              options: [{ label: 'Somente este', value: 'one' }, { label: 'Este e os próximos', value: 'future', danger: true }, { label: 'Todos da série', value: 'all', danger: true }],
            })
          : await confirmSheet({ title: 'Excluir lançamento?', text: `${v.desc || category(v.categoryId).name}`, options: [{ label: 'Excluir', value: 'one', danger: true }] });
        if (!choice) return;
        deleteTransaction(v.id, choice);
        toast('Lançamento excluído.');
        rerender();
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = parseMoney(form.amount.value);
        if (!amount) return showErr('Informe um valor maior que zero.');
        if (!form.date.value) return showErr('Informe a data.');
        const data = {
          type: kind === 'card' ? 'expense' : kind,
          amount,
          desc: form.desc.value.trim(),
          date: form.date.value,
          note: form.note.value.trim(),
        };
        if (kind !== 'transfer') {
          const catId = form.querySelector('[name=categoryId]:checked')?.value;
          if (!catId) return showErr('Escolha uma categoria.');
          data.categoryId = catId;
          data.tags = form.tags.value.split(',').map((t) => t.trim()).filter(Boolean);
        }
        if (kind === 'card') {
          data.cardId = form.cardId.value;
          data.accountId = null;
          data.paid = true;
        } else {
          data.accountId = form.accountId.value;
          data.paid = kind === 'transfer' ? true : form.paid.checked;
        }
        if (kind === 'transfer') {
          data.toAccountId = form.toAccountId.value;
          if (data.toAccountId === data.accountId) return showErr('Escolha contas diferentes para origem e destino.');
          if (!data.desc) data.desc = 'Transferência';
        }
        if (isEdit) {
          updateTransaction(v.id, data, form.applyFuture?.checked);
          toast('Lançamento atualizado.');
        } else {
          const rep = form.repeat?.value || 'none';
          const times = Number(form.times?.value) || 2;
          addTransaction(data, rep, times);
          toast(rep === 'installments' ? `Lançado em ${times}x.` : rep === 'fixed' ? 'Lançamento fixo criado.' : 'Lançamento salvo.');
        }
        closeSheet();
        rerender();
      });
    },
  });
}

on({
  'new-tx': (el) => openTxForm(el.dataset.kind || 'expense'),
  'edit-tx': (el) => {
    const t = byId(S.transactions, el.dataset.id);
    if (t && t.type !== 'payment') openTxForm(null, t);
    else if (t) go(`#/cartao/${t.cardId}`);
  },
  'quick-add': () =>
    openSheet(`<h2 class="sheet-title">Novo lançamento</h2>
      <div class="quick-grid">${TYPES.map(([k, l, ic]) => `<button class="quick t-${k}" data-action="new-tx" data-kind="${k}">${icon(ic, 22)}<span>${l}</span></button>`).join('')}</div>`),
});
