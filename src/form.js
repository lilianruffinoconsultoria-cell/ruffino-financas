// Formulário de lançamento: despesa, receita, transferência e despesa no cartão.
import {
  S, save, byId, category, categoriesOf, NEUTRAL_TYPES, subcategoriesOf, addTransaction, updateTransaction, deleteTransaction, descriptionsIndex, allTags,
  invoiceFor, card, SCOPES, averageForDescription, rootId, knownPeople,
} from './store.js';
import { esc, icon, today, isoDate, parseMoney, moneyPlain, monthLabel, money, uid, addMonths } from './util.js';
import { openSheet, closeSheet, confirmSheet, rerender, toast, on, go } from './ui.js';
import { parseBankMessage } from './capture.js';
import { putReceipt, getReceipt, deleteReceipt, prepareFile } from './receipts.js';

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

const activeAccounts = () => S.accounts.filter((a) => !a.archived);
const activeCards = () => S.cards.filter((c) => !c.archived);
const accountOptions = (selected) =>
  activeAccounts().map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}${S.accounts.some((x) => x.scope === 'pj') ? ` · ${SCOPES[a.scope || 'pf']}` : ''}</option>`).join('');

const catOption = (c, selectedRoot) => `<label class="cat-opt" style="--c:${c.color}"><input type="radio" name="categoryId" value="${c.id}" ${c.id === selectedRoot ? 'checked' : ''}>
      <span class="cat-badge sm">${icon(c.icon, 16)}</span><span>${esc(c.name)}</span></label>`;

/** Categorias do tipo do lançamento e, separadas, as que não contam como receita/despesa. */
function categoryGrid(type, selectedRoot) {
  const neutral = Object.keys(NEUTRAL_TYPES).flatMap((t) => categoriesOf(t));
  return `${categoriesOf(type).map((c) => catOption(c, selectedRoot)).join('')}
    ${neutral.length ? `<p class="cat-sep">${icon('arrow-left-right', 13)} Não computa em receitas e despesas</p>${neutral.map((c) => catOption(c, selectedRoot)).join('')}` : ''}`;
}
const subOptions = (rootCat, selected) => {
  const subs = rootCat ? subcategoriesOf(rootCat) : [];
  return subs.length ? `<option value="">Sem subcategoria</option>${subs.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}` : '';
};

/** Abre o formulário. `kind` é o tipo de tela (expense|income|transfer|card); `tx` edita uma existente. */
export function openTxForm(kind = 'expense', tx = null, preset = {}) {
  if (tx) kind = tx.type === 'expense' && tx.cardId ? 'card' : tx.type;
  if (kind === 'card' && !activeCards().length) {
    toast('Cadastre um cartão de crédito primeiro.');
    go('#/cartoes');
    return;
  }
  if (!activeAccounts().length) {
    toast('Cadastre uma conta primeiro.');
    go('#/contas');
    return;
  }
  if (kind === 'transfer' && activeAccounts().length < 2) {
    toast('Você precisa de pelo menos duas contas para transferir.');
    return;
  }
  const travel = S.settings.travelTag;
  const v = tx || { date: today(), paid: true, tags: travel && kind !== 'transfer' ? [travel] : [], ...preset };
  const catType = kind === 'income' ? 'income' : 'expense';
  const isEdit = !!tx;
  const selRoot = v.categoryId ? rootId(v.categoryId) : null;
  const selSub = v.categoryId && category(v.categoryId).parentId ? v.categoryId : '';
  const descs = [...descriptionsIndex().keys()].slice(-200);
  const tags = allTags();
  const instPreset = preset.repeat === 'installments';
  // "Com quem": parcelamentos fora do cartão (pessoa, loja, crediário)
  const showPerson = kind === 'expense' || kind === 'income';
  const personVisible = showPerson && (isEdit ? !!(v.installment || v.person) : instPreset || !!v.person);

  const html = `
  <form class="tx-form" novalidate>
    <div class="seg" role="tablist">${TYPES.map(([k, l, ic]) => `<button type="button" class="seg-btn ${k === kind ? 'on' : ''} t-${k}" data-kind="${k}" ${isEdit ? 'disabled' : ''}>${icon(ic, 16)}<span>${l}</span></button>`).join('')}</div>
    ${travel && !isEdit && kind !== 'transfer' ? `<p class="badge-line">${icon('plane', 14)} Modo viagem ativo · tag <b>#${esc(travel)}</b></p>` : ''}

    <label class="amount-field t-${kind}">
      <span>Valor</span>
      <div><em>R$</em><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${v.amount ? moneyPlain(v.amount) : ''}" autofocus required></div>
    </label>

    <label class="field"><span>Descrição</span>
      <input name="desc" list="desc-list" maxlength="80" value="${esc(v.desc || '')}" placeholder="${kind === 'transfer' ? 'Ex.: Reserva do mês' : 'Ex.: Mercado do mês'}">
      <datalist id="desc-list">${descs.map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
    </label>
    <p class="hint warn-line" data-avg hidden></p>

    ${kind !== 'transfer' ? `<fieldset class="field"><legend>Categoria</legend><div class="cat-grid">${categoryGrid(catType, selRoot)}</div></fieldset>
      <label class="field" data-sub ${subOptions(selRoot) ? '' : 'hidden'}><span>Subcategoria</span><select name="subcategoryId">${subOptions(selRoot, selSub)}</select></label>` : ''}

    ${
      kind === 'transfer'
        ? `<div class="row2">
            <label class="field"><span>De</span><select name="accountId">${accountOptions(v.accountId || activeAccounts()[0].id)}</select></label>
            <label class="field"><span>Para</span><select name="toAccountId">${accountOptions(v.toAccountId || activeAccounts()[1].id)}</select></label></div>`
        : kind === 'card'
          ? `<label class="field"><span>Cartão</span><select name="cardId">${activeCards().map((c) => `<option value="${c.id}" ${c.id === v.cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
             <p class="hint" data-invoice-hint></p>`
          : `<label class="field"><span>Conta</span><select name="accountId">${accountOptions(v.accountId || activeAccounts()[0].id)}</select></label>`
    }

    <div class="field"><span data-date-label>Data</span>
      <div class="date-row">
        <button type="button" class="chip" data-date="${today()}">Hoje</button>
        <button type="button" class="chip" data-date="${yesterday()}">Ontem</button>
        <input type="date" name="date" value="${v.date}" required>
      </div>
    </div>

    ${kind === 'card' ? '' : `<label class="switch-row"><span data-paid-label>${kind === 'income' ? 'Recebido' : kind === 'transfer' ? 'Transferência efetuada' : 'Pago'}</span><input type="checkbox" role="switch" name="paid" ${v.paid !== false && !(instPreset && !isEdit) ? 'checked' : ''}></label>`}

    ${
      isEdit
        ? v.groupId
          ? `<label class="switch-row"><span>Aplicar alterações às próximas ${v.installment ? 'parcelas' : 'repetições'}</span><input type="checkbox" role="switch" name="applyFuture"></label>
             <p class="hint">${v.installment ? `Parcela ${v.installment.n} de ${v.installment.total}${v.anticipated ? ' · antecipada' : ''}` : 'Lançamento fixo mensal'}</p>`
          : ''
        : `<div class="row2">
            <label class="field"><span>Repetir</span>
              <select name="repeat"><option value="none">Não repete</option><option value="fixed">Fixa (todo mês)</option>${kind === 'transfer' ? '' : `<option value="installments" ${preset.repeat === 'installments' ? 'selected' : ''}>Parcelada</option>`}</select></label>
            <label class="field" data-times ${preset.repeat === 'installments' ? '' : 'hidden'}><span>Nº de parcelas</span><input name="times" type="number" min="2" max="420" value="${preset.times || 2}" inputmode="numeric"></label>
          </div>
          <div class="installment-opts" data-inst-opts ${instPreset ? '' : 'hidden'}>
            <label class="field"><span>O valor informado é</span><select name="amountMode"><option value="total">O total da compra</option><option value="per">O valor de cada parcela</option></select></label>
            <div class="field"><span>Situação da compra</span><div class="seg two" data-progress>
              <label class="seg-btn on"><input type="radio" name="progress" value="new" checked>Compra nova</label>
              <label class="seg-btn"><input type="radio" name="progress" value="ongoing">Já estou pagando</label></div></div>
            <label class="field" data-current hidden><span>${kind === 'card' ? 'Parcela que aparece na fatura' : 'Parcela atual (a próxima a pagar)'}</span><input name="startAt" type="number" min="2" max="420" value="2" inputmode="numeric"></label>
            <p class="hint" data-ongoing-hint hidden></p>
            ${kind === 'card' ? '<p class="hint">Cada fatura recebe só a parcela do mês. O restante ocupa o limite do cartão, mas não entra no valor da fatura atual.</p>' : ''}
            <p class="hint" data-inst-preview></p>
          </div>`
    }

    ${showPerson ? `<label class="field" data-person ${personVisible ? '' : 'hidden'}><span>${kind === 'income' ? 'Quem vai te pagar' : 'Com quem é a compra'} <small>(pessoa, loja, crediário)</small></span>
      <input name="person" list="person-list" maxlength="60" value="${esc(v.person || '')}" placeholder="Ex.: João, Loja do bairro, tia Maria">
      <datalist id="person-list">${knownPeople().map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>` : ''}

    ${
      kind === 'transfer'
        ? ''
        : `<label class="field"><span>Tags <small>(separe por vírgula)</small></span>
            <input name="tags" list="tag-list" value="${esc((v.tags || []).join(', '))}" placeholder="Ex.: viagem, trabalho">
            <datalist id="tag-list">${tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
           <label class="switch-row"><span>Ignorar nos relatórios e no planejamento <small class="muted">(continua no saldo)</small></span><input type="checkbox" role="switch" name="ignored" ${v.ignored ? 'checked' : ''}></label>`
    }
    <label class="field"><span>Observação</span><textarea name="note" rows="2" maxlength="300">${esc(v.note || '')}</textarea></label>

    <div class="field"><span>Comprovante</span>
      <div class="receipt-row" data-receipt>
        ${v.receipt ? `<button type="button" class="btn ghost sm" data-view-receipt>${icon('file-text', 16)} Ver ${esc(v.receipt.name || 'comprovante')}</button><button type="button" class="icon-btn" data-remove-receipt aria-label="Remover comprovante">${icon('x', 18)}</button>` : ''}
        <label class="btn ghost sm file-btn">${icon('upload', 16)} ${v.receipt ? 'Trocar' : 'Anexar foto ou PDF'}<input type="file" name="receiptFile" accept="image/*,application/pdf" hidden></label>
        <small class="muted" data-receipt-name></small>
      </div>
    </div>

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
      let removeReceipt = false;

      form.querySelectorAll('[data-kind]').forEach((b) =>
        b.addEventListener('click', () =>
          openTxForm(b.dataset.kind, null, {
            date: form.date.value, amount: parseMoney(form.amount.value), desc: form.desc.value, cardId: preset.cardId,
            person: form.person?.value || preset.person, repeat: form.repeat?.value === 'installments' ? 'installments' : undefined, times: Number(form.times?.value) || preset.times,
          }),
        ),
      );
      form.querySelectorAll('[data-date]').forEach((b) =>
        b.addEventListener('click', () => {
          form.date.value = b.dataset.date;
          form.date.dispatchEvent(new Event('change'));
        }),
      );

      const repeat = form.querySelector('[name=repeat]');
      const instOpts = form.querySelector('[data-inst-opts]');
      const preview = form.querySelector('[data-inst-preview]');
      const personWrap = form.querySelector('[data-person]');
      const currentWrap = form.querySelector('[data-current]');
      const ongoingHint = form.querySelector('[data-ongoing-hint]');
      const dateLabel = form.querySelector('[data-date-label]');
      const paidLabel = form.querySelector('[data-paid-label]');
      const isInst = () => repeat?.value === 'installments';
      const ongoing = () => isInst() && form.querySelector('[name=progress]:checked')?.value === 'ongoing';
      const startAt = () => (ongoing() ? Math.min(Math.max(2, Number(form.times.value) || 2), Math.max(2, Number(form.startAt.value) || 2)) : 1);
      const updatePreview = () => {
        if (!preview) return;
        const inst = isInst();
        const on = ongoing();
        if (currentWrap) currentWrap.hidden = !on;
        if (ongoingHint) ongoingHint.hidden = !on;
        if (personWrap && !isEdit) personWrap.hidden = !inst && !form.person.value;
        if (dateLabel) dateLabel.textContent = !inst ? 'Data' : kind === 'card' ? (on ? 'Data (a parcela atual entra na fatura desta data)' : 'Data da compra') : on ? 'Vencimento da parcela atual' : 'Vencimento da 1ª parcela';
        if (paidLabel && inst) paidLabel.textContent = `${on ? 'Parcela atual' : '1ª parcela'} já ${kind === 'income' ? 'recebida' : 'paga'}`;
        if (!inst) return;
        const n = Math.max(2, Number(form.times.value) || 2);
        const v = parseMoney(form.amount.value);
        const per = form.amountMode.value === 'per' ? v : v / n;
        const k = startAt();
        const c = kind === 'card' ? card(form.cardId.value) : null;
        const inv = c && form.date.value ? invoiceFor(c, form.date.value) : null;
        if (on && ongoingHint)
          ongoingHint.innerHTML = c
            ? `Ex.: na fatura do banco aparece <b>04/10</b> → informe 4. A parcela ${k} entra na fatura de <b>${inv ? monthLabel(inv) : '—'}</b>; as parcelas 1 a ${k - 1} ficam no histórico como já pagas, <b>fora das faturas, do limite e dos relatórios</b>.`
            : `As parcelas 1 a ${k - 1} ficam no histórico como já ${kind === 'income' ? 'recebidas' : 'pagas'}, <b>sem mexer no saldo das contas nem nos relatórios</b>. A parcela ${k} vence na data informada.`;
        preview.innerHTML = v
          ? `${n}× de <b>${money(per)}</b> · total <b>${money(per * n)}</b>${k > 1 ? ` · faltam ${n - k + 1} parcela(s), <b>${money(per * (n - k + 1))}</b>` : ''}${inv ? ` · última na fatura de ${monthLabel(addMonths(inv, n - k), { short: true })}` : ''}`
          : '';
      };
      repeat?.addEventListener('change', () => {
        form.querySelector('[data-times]').hidden = !isInst();
        instOpts.hidden = !isInst();
        if (isInst() && form.paid) form.paid.checked = false;
        updatePreview();
      });
      form.querySelectorAll('[name=progress]').forEach((r) =>
        r.addEventListener('change', () => {
          r.closest('.seg').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.contains(r) && r.checked));
          updatePreview();
        }),
      );
      ['times', 'amountMode', 'startAt', 'amount', 'person'].forEach((n) => form[n]?.addEventListener('input', updatePreview));
      ['amountMode', 'cardId', 'date'].forEach((n) => form[n]?.addEventListener('change', updatePreview));
      updatePreview();

      // subcategorias da categoria escolhida
      const subWrap = form.querySelector('[data-sub]');
      form.querySelectorAll('[name=categoryId]').forEach((r) =>
        r.addEventListener('change', () => {
          const opts = subOptions(r.value);
          subWrap.querySelector('select').innerHTML = opts;
          subWrap.hidden = !opts;
        }),
      );

      // sugere a categoria usada da última vez com a mesma descrição
      const index = descriptionsIndex();
      const avgLine = form.querySelector('[data-avg]');
      const checkAverage = () => {
        if (kind === 'income' || kind === 'transfer' || !S.settings.smartAlert) return;
        const a = averageForDescription(form.desc.value);
        const amount = parseMoney(form.amount.value);
        const over = a && amount > a.avg * 1.3;
        avgLine.hidden = !over;
        if (over) avgLine.innerHTML = `${icon('info', 14)} Este valor está <b>${Math.round((amount / a.avg - 1) * 100)}% acima</b> da média de “${esc(form.desc.value)}” (${money(a.avg)} em ${a.n} lançamentos).`;
      };
      form.desc.addEventListener('change', () => {
        const catId = index.get(form.desc.value.trim());
        if (catId && !form.querySelector('[name=categoryId]:checked')) {
          const radio = form.querySelector(`[name=categoryId][value="${rootId(catId)}"]`);
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
            if (category(catId).parentId) form.subcategoryId.value = catId;
          }
        }
        checkAverage();
      });
      form.amount.addEventListener('change', checkAverage);

      const hint = form.querySelector('[data-invoice-hint]');
      const updateHint = () => {
        if (!hint) return;
        const c = card(form.cardId.value);
        if (c && form.date.value) hint.textContent = `Entra na fatura de ${monthLabel(invoiceFor(c, form.date.value))} (fecha dia ${c.closeDay}, vence dia ${c.dueDay}).`;
      };
      form.cardId?.addEventListener('change', updateHint);
      form.date.addEventListener('change', updateHint);
      updateHint();

      // comprovante
      const nameOut = form.querySelector('[data-receipt-name]');
      form.receiptFile.addEventListener('change', () => (nameOut.textContent = form.receiptFile.files[0]?.name || ''));
      sheet.querySelector('[data-remove-receipt]')?.addEventListener('click', (e) => {
        removeReceipt = true;
        e.currentTarget.previousElementSibling.remove();
        e.currentTarget.remove();
      });
      sheet.querySelector('[data-view-receipt]')?.addEventListener('click', () => viewReceipt(v.receipt));

      sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const choice = v.groupId
          ? await confirmSheet({
              title: 'Excluir lançamento',
              text: 'Este lançamento se repete. O que deseja excluir?',
              options: [{ label: 'Somente este', value: 'one' }, { label: 'Este e os próximos', value: 'future', danger: true }, { label: 'Todos da série', value: 'all', danger: true }],
            })
          : await confirmSheet({ title: 'Excluir lançamento?', text: `${v.desc || category(v.categoryId).name}`, options: [{ label: 'Excluir', value: 'one', danger: true }] });
        if (!choice) return;
        for (const t of deleteTransaction(v.id, choice)) if (t.receipt) deleteReceipt(t.receipt.id);
        toast('Lançamento excluído.');
        rerender();
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseMoney(form.amount.value);
        if (!amount) return showErr('Informe um valor maior que zero.');
        if (!form.date.value) return showErr('Informe a data.');
        const data = { type: kind === 'card' ? 'expense' : kind, amount, desc: form.desc.value.trim(), date: form.date.value, note: form.note.value.trim() };
        if (kind !== 'transfer') {
          const catId = form.querySelector('[name=categoryId]:checked')?.value;
          if (!catId) return showErr('Escolha uma categoria.');
          data.categoryId = form.subcategoryId?.value || catId;
          data.tags = form.tags.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
          data.ignored = form.ignored.checked;
        }
        if (form.person) data.person = form.person.value.trim();
        if (kind === 'card') {
          data.cardId = form.cardId.value;
          data.accountId = null;
          data.paid = true;
        } else {
          data.accountId = form.accountId.value;
          data.paid = form.paid.checked;
        }
        if (kind === 'transfer') {
          data.toAccountId = form.toAccountId.value;
          if (data.toAccountId === data.accountId) return showErr('Escolha contas diferentes para origem e destino.');
          if (!data.desc) data.desc = 'Transferência';
        }

        const file = form.receiptFile.files[0];
        if (file) {
          const rid = uid();
          try {
            await putReceipt(rid, await prepareFile(file));
            if (v.receipt) deleteReceipt(v.receipt.id);
            data.receipt = { id: rid, name: file.name, type: file.type };
          } catch {
            toast('Não foi possível guardar o comprovante neste navegador.');
          }
        } else if (removeReceipt && v.receipt) {
          deleteReceipt(v.receipt.id);
          data.receipt = null;
        }

        if (isEdit) {
          updateTransaction(v.id, data, form.applyFuture?.checked);
          toast('Lançamento atualizado.');
        } else {
          const rep = form.repeat?.value || 'none';
          const times = Math.max(2, Number(form.times?.value) || 2);
          const k = rep === 'installments' ? startAt() : 1;
          if (rep === 'installments' && Number(form.startAt?.value) > times && ongoing()) return showErr('A parcela atual não pode ser maior que o número de parcelas.');
          addTransaction(data, rep, times, { startAt: k, perInstallment: rep === 'installments' && form.amountMode?.value === 'per' });
          toast(rep === 'installments' ? (k > 1 ? `Parcelamento cadastrado a partir da parcela ${k}/${times}.` : `Compra parcelada em ${times}x criada.`) : rep === 'fixed' ? 'Lançamento fixo criado.' : 'Lançamento salvo.');
        }
        closeSheet();
        rerender();
      });
    },
  });
}

export async function viewReceipt(r) {
  const blob = r && (await getReceipt(r.id).catch(() => null));
  if (!blob) return toast('Comprovante não encontrado neste aparelho.');
  const url = URL.createObjectURL(blob);
  openSheet(`<h2 class="sheet-title">${icon('file-text', 20)} ${esc(r.name || 'Comprovante')}</h2>
    ${blob.type.startsWith('image/') ? `<img class="receipt-img" src="${url}" alt="Comprovante">` : `<p><a class="btn primary" href="${url}" target="_blank" rel="noopener">Abrir arquivo</a></p>`}`, {
    wide: true,
    onMount: () => () => URL.revokeObjectURL(url),
  });
}

/** Colar o texto de uma notificação ou SMS do banco e abrir o lançamento já preenchido. */
function openCapture() {
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('message-circle', 20)} Lançar a partir de notificação ou SMS</h2>
    <p class="muted small">Copie a notificação ou o SMS do seu banco e cole abaixo. Reconhecemos valor, estabelecimento, data e tipo (compra no cartão, Pix, débito, estorno), no formato de Nubank, Inter, BB, C6, Bradesco, Santander, Itaú, Caixa, Neon, Digio, Sicoob e outros.</p>
    <label class="field"><span>Texto da mensagem</span><textarea name="text" rows="4" placeholder="Ex.: Compra aprovada: R$ 25,90 em PADARIA CENTRAL" autofocus></textarea></label>
    <div class="toolbar"><button type="button" class="btn ghost sm" data-paste>${icon('download', 16)} Colar da área de transferência</button></div>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions"><button class="btn primary">${icon('sparkles', 18)} Reconhecer</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      sheet.querySelector('[data-paste]').addEventListener('click', async () => {
        try {
          f.text.value = await navigator.clipboard.readText();
        } catch {
          toast('Permita o acesso à área de transferência ou cole manualmente.');
        }
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = parseBankMessage(f.text.value);
        const err = f.querySelector('.form-error');
        if (!r) {
          err.textContent = 'Não encontramos um valor na mensagem.';
          err.hidden = false;
          return;
        }
        if (r.kind === 'invoicePayment') {
          toast('É um pagamento de fatura: registre em Cartões → Pagar fatura.');
          return go('#/cartoes');
        }
        const bankCard = r.bank && activeCards().find((c) => c.name.toLowerCase().includes(r.bank.toLowerCase().split(' ')[0]));
        const bankAcc = r.bank && activeAccounts().find((a) => a.name.toLowerCase().includes(r.bank.toLowerCase().split(' ')[0]));
        const known = descriptionsIndex().get(r.merchant);
        const preset = { amount: r.amount, desc: r.merchant || r.bank || '', date: r.date, categoryId: known, note: r.foreign ? 'Compra em moeda estrangeira (valor original em US$)' : '' };
        if (r.kind === 'card' && activeCards().length) openTxForm('card', null, { ...preset, cardId: bankCard?.id });
        else if (r.kind === 'refund' && activeCards().length) openRefund(bankCard?.id || activeCards()[0].id, preset);
        else openTxForm(r.kind === 'income' ? 'income' : 'expense', null, { ...preset, accountId: bankAcc?.id });
      });
    },
  });
}

/** Estorno no cartão: crédito que abate a fatura em que cair. */
export function openRefund(cardId, preset = {}) {
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('rotate-ccw', 20)} Lançar estorno</h2>
    <label class="amount-field t-income"><span>Valor estornado</span><div><em>R$</em><input name="amount" inputmode="decimal" value="${preset.amount ? moneyPlain(preset.amount) : ''}" placeholder="0,00" autofocus></div></label>
    <label class="field"><span>Descrição</span><input name="desc" value="${esc(preset.desc || '')}" placeholder="Ex.: Estorno loja X"></label>
    <label class="field"><span>Cartão</span><select name="cardId">${activeCards().map((c) => `<option value="${c.id}" ${c.id === cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Data</span><input type="date" name="date" value="${preset.date || today()}"></label>
    <p class="hint">O estorno abate o valor da fatura em que a data cair.</p>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} Lançar estorno</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = parseMoney(f.amount.value);
        if (!amount) return;
        const c = card(f.cardId.value);
        S.transactions.push({ id: uid(), type: 'refund', amount, desc: f.desc.value.trim() || 'Estorno', cardId: c.id, date: f.date.value || today(), invoice: invoiceFor(c, f.date.value || today()), paid: true, tags: [] });
        save();
        closeSheet();
        toast('Estorno lançado.');
        rerender();
      });
    },
  });
}

on({
  'new-tx': (el) => openTxForm(el.dataset.kind || 'expense'),
  'edit-tx': async (el) => {
    const t = byId(S.transactions, el.dataset.id);
    if (!t) return;
    if (t.type === 'refund' || t.type === 'invoiceAdjust') {
      const ok = await confirmSheet({ title: `${t.type === 'refund' ? 'Estorno' : 'Ajuste de fatura'} de ${money(t.amount)}`, text: t.desc || '', options: [{ label: 'Excluir', value: 'yes', danger: true }] });
      if (!ok) return;
      deleteTransaction(t.id);
      rerender();
    } else if (t.type === 'payment') go(`#/cartao/${t.cardId}`);
    else openTxForm(null, t);
  },
  capture: () => openCapture(),
  'quick-add': () =>
    openSheet(`<h2 class="sheet-title">Novo lançamento</h2>
      <div class="quick-grid">${TYPES.map(([k, l, ic]) => `<button class="quick t-${k}" data-action="new-tx" data-kind="${k}">${icon(ic, 22)}<span>${l}</span></button>`).join('')}</div>
      <button class="btn ghost block capture-btn" data-action="capture">${icon('message-circle', 18)} Colar notificação ou SMS do banco</button>`),
});
