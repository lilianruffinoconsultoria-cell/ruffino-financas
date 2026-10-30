// Formulário de lançamento: despesa, receita, transferência e despesa no cartão.
import {
  S, save, byId, category, categoriesOf, NEUTRAL_TYPES, subcategoriesOf, addTransaction, updateTransaction, deleteTransaction, descriptionsIndex, allTags,
  invoiceFor, invoiceDueDate, card, SCOPES, averageForDescription, rootId, knownPeople, account, accountBalance, accountEffect,
} from './store.js';
import { esc, icon, today, isoDate, parseMoney, moneyPlain, monthLabel, money, uid, addMonths, shiftDate, round2, shortDate, FEATURES } from './util.js';
import { openSheet, closeSheet, confirmSheet, rerender, toast, on, go } from './ui.js';
import { parseBankMessage } from './capture.js';
import { putReceipt, getReceipt, deleteReceipt, prepareFile } from './receipts.js';

const TYPES = [
  ['expense', 'Despesa', 'trending-down'],
  ['income', 'Receita', 'trending-up'],
  ['transfer', 'Transferência', 'arrow-left-right'],
  ['card', 'Cartão', 'credit-card'],
];

// alcance ao editar um lançamento de série (valores aceitos por updateTransaction)
const EDIT_SCOPES = [['one', 'Só este'], ['future', 'Este e os próximos'], ['all', 'Todos da série']];

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// parcelas anteriores à atual (k) no "Já estou pagando": singular quando só a 1ª ficou para trás
const priorLine = (k, done) => (k - 1 === 1 ? `a parcela 1 fica no histórico como já ${done}` : `as parcelas 1 a ${k - 1} ficam no histórico como já ${done}s`);

// aviso quando a soma das parcelas digitadas não bate com o valor informado (tolerância de 1 centavo)
const schedMismatch = (sum, expected) =>
  expected > 0 && Math.abs(round2(sum - expected)) >= 0.01
    ? `A soma das parcelas (${money(sum)}) é diferente do valor informado (${money(expected)}). Será salvo o que está nas parcelas.`
    : '';

// valor negativo com o sinal de menos tipográfico: −R$ 10,00
const negMoney = (v) => `−${money(Math.abs(v))}`;

/** Move uma data como a 1ª parcela foi movida: mesmo dia → em meses; senão → em dias corridos. */
function moveDate(iso, from, to) {
  if (!iso) return iso;
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  if (d1 === d2) return shiftDate(iso, (y2 - y1) * 12 + m2 - m1);
  const days = Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 864e5);
  const x = new Date(`${iso}T12:00`);
  x.setDate(x.getDate() + days);
  return isoDate(x);
}

const activeAccounts = () => S.accounts.filter((a) => !a.archived);
const activeCards = () => S.cards.filter((c) => !c.archived);
const accountOptions = (selected) =>
  activeAccounts().map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}${S.settings.business && S.accounts.some((x) => x.scope === 'pj') ? ` · ${SCOPES[a.scope || 'pf']}` : ''}</option>`).join('');

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
    ${kind === 'expense' || kind === 'transfer' ? '<p class="hint warn-line" data-neg hidden></p>' : ''}

    ${
      isEdit
        ? v.groupId
          ? `<div class="field"><span>Aplicar as alterações a</span><div class="seg three" data-scope role="radiogroup" aria-label="Aplicar as alterações a">
               ${EDIT_SCOPES.map(([val, l], i) => `<label class="seg-btn ${i ? '' : 'on'}"><input type="radio" name="editScope" value="${val}" ${i ? '' : 'checked'}>${l}</label>`).join('')}</div></div>
             <p class="hint">${v.installment ? `Parcela ${v.installment.n} de ${v.installment.total}${v.anticipated ? ' · antecipada' : ''}` : 'Lançamento fixo mensal'}</p>`
          : ''
        : `<div class="row2">
            <label class="field"><span>${preset.payable ? 'Forma' : 'Repetir'}</span>
              <select name="repeat"><option value="none">${preset.payable ? 'À vista / parcela única' : 'Não repete'}</option>${kind === 'transfer' ? '' : `<option value="installments" ${preset.repeat === 'installments' ? 'selected' : ''}>${preset.payable ? 'Parcelado' : 'Parcelada'}</option>`}<option value="fixed">Fixa (todo mês)</option></select></label>
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
            ${kind === 'card' ? '' : `<details class="inst-schedule" data-schedule><summary>${icon('list-ordered', 15)} Vencimentos e valores de cada parcela</summary>
              <div class="inst-rows" data-rows></div>
              <p class="hint" data-sched-sum></p>
              <button type="button" class="link" data-sched-reset>Recalcular parcelas iguais e mensais</button></details>`}
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
      ${isEdit ? `<button type="button" class="btn danger ghost" data-delete>${icon('trash-2', 18)} Excluir</button>
        <button type="button" class="btn ghost" data-duplicate>${icon('layers', 18)} Duplicar</button>` : ''}
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
        err.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      // some ao corrigir qualquer campo
      form.addEventListener('input', () => (err.hidden = true));
      let removeReceipt = false;

      form.querySelectorAll('[data-kind]').forEach((b) =>
        b.addEventListener('click', () =>
          openTxForm(b.dataset.kind, null, {
            date: form.date.value, amount: parseMoney(form.amount.value), desc: form.desc.value, cardId: preset.cardId, paid: preset.paid, accountId: preset.accountId, payable: preset.payable,
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
            ? `Ex.: na fatura do banco aparece <b>04/10</b> → informe 4. A parcela ${k} entra na fatura de <b>${inv ? monthLabel(inv) : '—'}</b>; ${priorLine(k, 'paga')}, <b>fora das faturas, do limite e dos relatórios</b>.`
            : `${cap(priorLine(k, kind === 'income' ? 'recebida' : 'paga'))}, <b>sem mexer no saldo das contas nem nos relatórios</b>. A parcela ${k} vence na data informada.`;
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
      // alcance da edição numa série (fixa ou parcelada)
      form.querySelectorAll('[name=editScope]').forEach((r) =>
        r.addEventListener('change', () => r.closest('.seg').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.contains(r) && r.checked))),
      );
      ['times', 'amountMode', 'startAt', 'amount', 'person'].forEach((n) => form[n]?.addEventListener('input', updatePreview));
      ['amountMode', 'cardId', 'date'].forEach((n) => form[n]?.addEventListener('change', updatePreview));
      updatePreview();

      // parcelas uma a uma (fora do cartão, compra nova): vencimento e valor de cada uma, ajustáveis
      const sched = form.querySelector('[data-schedule]');
      const rowsBox = sched?.querySelector('[data-rows]');
      const schedSum = sched?.querySelector('[data-sched-sum]');
      let custom = false;
      let kept = []; // parcelas ajustadas tiradas do fim: voltam se o nº de parcelas aumentar de novo
      let baseDate = form.date.value; // 1ª parcela de referência para deslocar as datas ajustadas
      // valor padrão de cada parcela (a 1ª absorve os centavos que sobram)
      const perDefault = (n) => {
        const v = parseMoney(form.amount.value);
        return form.amountMode.value === 'per' ? v : Math.floor((v / n) * 100) / 100;
      };
      const defaultSchedule = () => {
        const n = Math.max(2, Number(form.times.value) || 2);
        const v = parseMoney(form.amount.value);
        const per = perDefault(n);
        const total = form.amountMode.value === 'per' ? round2(v * n) : v;
        return Array.from({ length: n }, (_, i) => ({ date: form.date.value ? shiftDate(form.date.value, i) : '', amount: i === 0 ? round2(total - per * (n - 1)) : per }));
      };
      const rowHtml = (p, i) =>
        `<div class="inst-row"><span class="inst-n">${i + 1}</span><input type="date" value="${p.date}" aria-label="Vencimento da parcela ${i + 1}"><input inputmode="decimal" autocomplete="off" value="${p.amount ? moneyPlain(p.amount) : ''}" aria-label="Valor da parcela ${i + 1}"></div>`;
      const writeRows = (list) => (rowsBox.innerHTML = list.map(rowHtml).join(''));
      // com ajustes: mantém as linhas; acrescenta mensais no fim (a partir da última) ou tira as do fim
      const resizeCustom = (n) => {
        const list = readSchedule();
        if (list.length === n) return;
        if (list.length > n) kept = [...list.splice(n), ...kept];
        while (list.length < n) {
          if (kept.length) list.push(kept.shift());
          else {
            const last = list[list.length - 1]?.date;
            list.push({ date: last ? shiftDate(last, 1) : '', amount: perDefault(n) });
          }
        }
        writeRows(list);
      };
      const readSchedule = () =>
        [...rowsBox.querySelectorAll('.inst-row')].map((r) => ({ date: r.querySelector('input[type=date]').value, amount: parseMoney(r.querySelector('input[inputmode]').value) }));
      const sumSchedule = () => {
        const list = readSchedule();
        const total = round2(list.reduce((a, p) => a + (p.amount || 0), 0));
        const last = list[list.length - 1]?.date;
        const informed = parseMoney(form.amount.value);
        const expected = form.amountMode.value === 'per' ? round2(informed * list.length) : informed;
        const warn = schedMismatch(total, expected);
        schedSum.innerHTML = `${list.length} parcela(s) · total <b>${money(total)}</b>${last ? ` · última em ${shortDate(last)}` : ''}${custom ? ' · <span class="muted">ajustadas à mão: mudar a data desloca todas, o nº de parcelas acrescenta ou tira no fim e o valor não as altera</span>' : ''}${warn ? `<br><span class="warn-line">${icon('triangle-alert', 14)} ${warn}</span>` : ''}`;
      };
      const drawSchedule = () => {
        if (!sched) return;
        sched.hidden = !isInst() || ongoing();
        if (sched.hidden) return;
        if (custom) resizeCustom(Math.max(2, Number(form.times.value) || 2));
        else writeRows(defaultSchedule());
        sumSchedule();
      };
      // refazer tudo igual e mensal: só pelo botão
      const recalc = () => ((custom = false), (kept = []), drawSchedule());
      // nova data da 1ª parcela: com ajustes, desloca todas as datas (e as guardadas) igual
      const moveSchedule = () => {
        const to = form.date.value;
        if (custom && baseDate && to && to !== baseDate) {
          writeRows(readSchedule().map((p) => ({ ...p, date: moveDate(p.date, baseDate, to) })));
          kept = kept.map((p) => ({ ...p, date: moveDate(p.date, baseDate, to) }));
        }
        if (to) baseDate = to;
        drawSchedule();
      };
      if (sched) {
        rowsBox.addEventListener('input', () => ((custom = true), sumSchedule()));
        sched.querySelector('[data-sched-reset]').addEventListener('click', recalc);
        ['times', 'amount'].forEach((n) => form[n]?.addEventListener('input', drawSchedule));
        form.amountMode?.addEventListener('change', drawSchedule);
        form.date.addEventListener('change', moveSchedule);
        repeat?.addEventListener('change', drawSchedule);
        form.querySelectorAll('[name=progress]').forEach((r) => r.addEventListener('change', drawSchedule));
        drawSchedule();
      }

      // saldo negativo: despesa/transferência paga fora do cartão (avisa, não bloqueia)
      const negLine = form.querySelector('[data-neg]');
      // quanto sai da conta agora: no parcelamento, só a parcela da data informada
      const outNow = () => {
        const val = parseMoney(form.amount.value);
        if (isEdit || !isInst()) return val;
        if (sched && !sched.hidden && custom) return readSchedule()[0]?.amount || 0;
        const n = Math.max(2, Number(form.times.value) || 2);
        const per = round2(perDefault(n));
        if (startAt() > 1) return per;
        const total = form.amountMode.value === 'per' ? round2(val * n) : val;
        return round2(total - per * (n - 1));
      };
      // saldo depois de salvar; na edição tira o efeito antigo do lançamento, que já está no saldo
      const balanceAfter = (accId) => {
        let b = accountBalance(accId);
        if (isEdit && v.paid) b -= accountEffect(v, accId);
        return round2(b - outNow());
      };
      const checkNeg = () => {
        if (!negLine) return;
        const accId = form.accountId.value;
        const after = form.paid.checked && !v.prior && parseMoney(form.amount.value) > 0 ? balanceAfter(accId) : 0;
        negLine.hidden = !(after < 0);
        if (after < 0) negLine.innerHTML = `${icon('triangle-alert', 14)} Esta ${kind === 'transfer' ? 'transferência' : 'despesa'} deixa <b>${esc(account(accId)?.name)}</b> em <b>${negMoney(after)}</b>.`;
      };
      if (negLine) {
        form.addEventListener('input', checkNeg);
        form.addEventListener('change', checkNeg);
        sched?.querySelector('[data-sched-reset]').addEventListener('click', checkNeg);
        checkNeg();
      }

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

      // Duplicar: novo lançamento com os mesmos dados, na data de hoje e fora de qualquer série
      sheet.querySelector('[data-duplicate]')?.addEventListener('click', () => {
        openTxForm(kind, null, {
          amount: v.amount, desc: v.desc, categoryId: v.categoryId, accountId: v.accountId, toAccountId: v.toAccountId, cardId: v.cardId,
          tags: [...(v.tags || [])], note: v.note, person: v.person, ignored: v.ignored, date: today(),
        });
        toast('Cópia aberta: confira e salve.');
      });

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

        // depois de salvar: avisa no toast se a conta de saída ficou negativa
        const negNote = () => {
          if ((kind !== 'expense' && kind !== 'transfer') || !data.paid || v.prior) return '';
          const b = accountBalance(data.accountId);
          return b < 0 ? ` Atenção: ${account(data.accountId)?.name} ficou negativa (${negMoney(b)}).` : '';
        };
        if (isEdit) {
          const scope = form.querySelector('[name=editScope]:checked')?.value || 'one';
          updateTransaction(v.id, data, scope);
          toast((scope === 'all' ? 'Toda a série foi atualizada.' : scope === 'future' ? 'Este e os próximos foram atualizados.' : 'Lançamento atualizado.') + negNote());
        } else {
          const rep = form.repeat?.value || 'none';
          const times = Math.max(2, Number(form.times?.value) || 2);
          const k = rep === 'installments' ? startAt() : 1;
          if (rep === 'installments' && Number(form.startAt?.value) > times && ongoing()) return showErr('A parcela atual não pode ser maior que o número de parcelas.');
          const schedule = rep === 'installments' && sched && !sched.hidden && custom ? readSchedule() : null;
          if (schedule?.some((p) => !p.date || !(p.amount > 0))) return showErr('Confira o vencimento e o valor de cada parcela.');
          addTransaction(data, rep, times, { startAt: k, perInstallment: rep === 'installments' && form.amountMode?.value === 'per', schedule });
          toast((rep === 'installments' ? (k > 1 ? `Parcelamento cadastrado a partir da parcela ${k}/${times}.` : `Compra parcelada em ${times}x criada.`) : rep === 'fixed' ? 'Lançamento fixo criado.' : 'Lançamento salvo.') + negNote());
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

/**
 * Colar o texto de uma notificação ou SMS do banco e abrir o lançamento já preenchido.
 * ARQUIVADO para uso futuro: desligado por FEATURES.bankPaste (util.js); o código fica pronto para religar.
 */
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
    <p class="hint" data-refund-hint></p>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} Lançar estorno</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      // mostra em qual fatura o estorno entra (e alerta se diferir da fatura que o usuário estava vendo)
      const hint = f.querySelector('[data-refund-hint]');
      const updateHint = () => {
        const c = card(f.cardId.value);
        if (!c || !f.date.value) return (hint.textContent = '');
        const inv = invoiceFor(c, f.date.value);
        const warn = preset.invoice && preset.invoice !== inv ? ` <span class="warn-line">Atenção: você está vendo a fatura de ${monthLabel(preset.invoice)}, mas pela data este estorno entra na fatura de ${monthLabel(inv)}. Ajuste a data se quiser.</span>` : '';
        hint.innerHTML = `Entra na fatura de ${monthLabel(inv)} (vence ${shortDate(invoiceDueDate(c, inv))}).${warn}`;
      };
      f.cardId.addEventListener('change', updateHint);
      f.date.addEventListener('change', updateHint);
      updateHint();
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
  // "Colar notificação/SMS" arquivado: só existe com FEATURES.bankPaste ligado (util.js)
  ...(FEATURES.bankPaste ? { capture: () => openCapture() } : {}),
  'quick-add': () =>
    openSheet(`<h2 class="sheet-title">Novo lançamento</h2>
      <div class="quick-grid">${TYPES.map(([k, l, ic]) => `<button class="quick t-${k}" data-action="new-tx" data-kind="${k}">${icon(ic, 22)}<span>${l}</span></button>`).join('')}</div>
      ${FEATURES.bankPaste ? `<button class="btn ghost block capture-btn" data-action="capture">${icon('message-circle', 18)} Colar notificação ou SMS do banco</button>` : ''}`),
});
