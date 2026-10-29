// Importação de extrato (CSV ou OFX) para uma conta, ou da fatura de um cartão.
// Na fatura, tudo entra na fatura escolhida; parcelas ("PARC 03/10") entram só nela, com o valor
// da parcela, ligadas à mesma compra das faturas anteriores. As parcelas futuras não são criadas:
// ficam "a importar" (ocupam o limite e o quanto falta) até chegar a fatura seguinte.
import { S, save, categoriesOf, descriptionsIndex, invoiceFor, card, currentInvoice, invoiceCloseDate, invoiceDueDate, NEUTRAL_TYPES, COLORS } from '../store.js';
import { esc, icon, uid, shortDate, addMonths, monthLabel, shiftDate, isoDate } from '../util.js';
import { UI, $m, pageHead, empty, on, rerender, toast, go, confirmSheet } from '../ui.js';
import { parseCsv, parseOfx, parseInstallment, isInvoicePayment } from '../importer.js';

// newCats: categorias citadas no CSV que ainda não existem; só entram no app se forem usadas na importação.
const STATE = { rows: [], file: '', target: '', invoice: '', positive: true, newCats: [] };

const cardOf = (target) => (target.startsWith('card:') ? card(target.slice(5)) : null);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim();
const dayBefore = (iso) => {
  const d = new Date(`${iso}T12:00`);
  d.setDate(d.getDate() - 1);
  return isoDate(d);
};
/** Período de compras de uma fatura: do fechamento anterior até a véspera do fechamento. */
const cycleOf = (c, ym) => ({ start: invoiceCloseDate(c, addMonths(ym, -1)), end: dayBefore(invoiceCloseDate(c, ym)) });

/** Tipo da linha: na conta, receita/despesa; no cartão, compra, estorno/crédito ou pagamento da fatura. */
function kindOf(r) {
  if (!cardOf(STATE.target)) return r.amount > 0 ? 'income' : 'expense';
  if (isInvoicePayment(r.desc)) return 'payment';
  return r.amount > 0 === STATE.positive ? 'expense' : 'refund';
}

/** Categorias que a linha aceita: as do tipo, as de transferência/reembolso e as novas vindas do CSV. */
const catChoices = (type) => {
  const ok = (t) => t === type || NEUTRAL_TYPES[t];
  return { main: [...categoriesOf(type), ...STATE.newCats.filter((c) => c.type === type)], neutral: [...Object.keys(NEUTRAL_TYPES).flatMap((t) => categoriesOf(t)), ...STATE.newCats.filter((c) => ok(c.type) && c.type !== type)] };
};

function guessCategory(desc, type) {
  const known = descriptionsIndex().get(desc);
  const knownType = S.categories.find((c) => c.id === known)?.type;
  if (known && (knownType === type || NEUTRAL_TYPES[knownType])) return known;
  return (categoriesOf(type).find((c) => c.name === 'Outros') || categoriesOf(type)[0])?.id;
}

const NEW_ICON = { income: 'banknote', expense: 'tag', transfer: 'arrow-left-right', refund: 'rotate-ccw' };

/** Categoria escrita na coluna do CSV: acha pelo nome ou prepara uma nova (o tipo vem da coluna Tipo). */
function csvCategory(r, type) {
  if (!r.category) return null;
  const name = r.category.trim();
  const { main, neutral } = catChoices(type);
  const found = [...main, ...neutral].find((c) => norm(c.name) === norm(name));
  if (found) return found.id;
  const t = /transf/i.test(r.type) ? 'transfer' : /reembolso|estorno/i.test(r.type) ? 'refund' : type;
  const cat = { id: uid(), name, type: t, icon: NEW_ICON[t], color: COLORS[(S.categories.length + STATE.newCats.length) % COLORS.length] };
  STATE.newCats.push(cat);
  return cat.id;
}

/** Já existe? Na conta: mesma data, valor e descrição. No cartão: mesma fatura (ou a mesma parcela da compra). */
function isDuplicate(r) {
  const c = cardOf(STATE.target);
  const value = Math.abs(r.amount);
  if (!c) return S.transactions.some((t) => (r.fitid && t.fitid === r.fitid) || (t.date === r.date && Math.abs(t.amount - value) < 0.005 && (t.desc || '') === r.desc));
  return S.transactions.some(
    (t) =>
      t.cardId === c.id &&
      !t.prior &&
      Math.abs(t.amount - value) < 0.005 &&
      ((r.fitid && t.fitid === r.fitid) ||
        (t.invoice === STATE.invoice && norm(t.desc) === norm(r.inst ? r.inst.base : r.desc)) ||
        (r.inst && t.installment && t.installment.n === r.inst.n && t.installment.total === r.inst.total && norm(t.desc) === norm(r.inst.base))),
  );
}

/** Fatura mais provável do arquivo: a que recebe a maioria das compras à vista. */
function guessInvoice(c) {
  const count = new Map();
  for (const r of STATE.rows) if (!r.inst && !isInvoicePayment(r.desc)) count.set(invoiceFor(c, r.date), (count.get(invoiceFor(c, r.date)) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || addMonths(currentInvoice(c), -1);
}

/** Recalcula tipo, categoria sugerida e duplicados quando muda o destino, a fatura ou o sinal. */
function refresh() {
  for (const r of STATE.rows) {
    const kind = kindOf(r);
    if (kind !== r.kind) {
      r.kind = kind;
      if (!r.catTouched) r.categoryId = kind === 'expense' || kind === 'income' ? csvCategory(r, kind) || guessCategory(r.inst ? r.inst.base : r.desc, kind) : null;
    }
    r.dup = isDuplicate(r);
    if (!r.offTouched) r.on = !r.dup && kind !== 'payment';
  }
}

const KIND_LABEL = { refund: 'Estorno / crédito na fatura', payment: 'Pagamento da fatura anterior (não importa)' };

function catSelect(r, i) {
  const { main, neutral } = catChoices(r.kind);
  const opt = (ct) => `<option value="${ct.id}" ${ct.id === r.categoryId ? 'selected' : ''}>${esc(ct.name)}</option>`;
  return `<select class="mini-select" data-input="import-cat" data-i="${i}" aria-label="Categoria">${main.map(opt).join('')}${neutral.length ? `<optgroup label="Não computa">${neutral.map(opt).join('')}</optgroup>` : ''}</select>`;
}

export function renderImport() {
  const holders = [...S.cards.filter((c) => !c.archived).map((c) => [`card:${c.id}`, `Fatura · ${c.name}`]), ...S.accounts.filter((a) => !a.archived).map((a) => [a.id, `Extrato · ${a.name}`])];
  const c = cardOf(STATE.target);
  const sel = STATE.rows.filter((r) => r.on);
  const total = sel.reduce((a, r) => a + (r.kind === 'refund' ? -1 : r.kind === 'income' ? 0 : 1) * Math.abs(r.amount), 0);
  const invOptions = c ? Array.from({ length: 9 }, (_, i) => addMonths(currentInvoice(c), i - 6)) : [];
  const cyc = c && STATE.invoice ? cycleOf(c, STATE.invoice) : null;
  return `<section>
    ${pageHead('Importar extrato ou fatura', { back: '#/mais' })}
    <article class="card">
      <p class="muted small">Exporte no site ou app do banco a <b>fatura do cartão em CSV</b> ou o <b>extrato da conta</b> em OFX/CSV. Colunas: data, descrição e valor (tipo e categoria são opcionais).</p>
      <div class="toolbar"><label class="btn primary file-btn">${icon('upload', 18)} Escolher arquivo<input type="file" accept=".csv,.ofx,.txt,text/csv,application/x-ofx" data-input="import-file" hidden></label>
        ${STATE.file ? `<span class="muted small">${esc(STATE.file)}</span>` : ''}</div>
    </article>
    ${STATE.rows.length ? `
    <article class="card">
      <label class="field"><span>Importar como</span><select data-input="import-target">${holders.map(([id, n]) => `<option value="${id}" ${STATE.target === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      ${c ? `
      <div class="row2">
        <label class="field"><span>Fatura</span><select data-input="import-invoice">${invOptions.map((ym) => `<option value="${ym}" ${ym === STATE.invoice ? 'selected' : ''}>${monthLabel(ym)} · vence ${shortDate(invoiceDueDate(c, ym)).slice(0, 5)}</option>`).join('')}</select></label>
        <label class="field"><span>No arquivo, as compras estão</span><select data-input="import-sign"><option value="pos" ${STATE.positive ? 'selected' : ''}>Positivas (ex.: 120,00)</option><option value="neg" ${STATE.positive ? '' : 'selected'}>Negativas (ex.: -120,00)</option></select></label>
      </div>
      <p class="badge-line">${icon('info', 14)} Tudo entra só na fatura de ${monthLabel(STATE.invoice)} (compras de ${shortDate(cyc.start)} a ${shortDate(cyc.end)}). Parcelas como “PARC 03/10” entram com o valor da parcela, só nesta fatura; as próximas chegam quando você importar as faturas seguintes.</p>` : ''}
    </article>
    <article class="card">
      <header class="card-head"><h2>${STATE.rows.length} linha(s) no arquivo</h2><span class="muted small">${sel.length} selecionada(s) · ${$m(total)}</span></header>
      <ul class="list">${STATE.rows.map((r, i) => `<li><label class="row">
        <input type="checkbox" data-input="import-row" data-i="${i}" ${r.on ? 'checked' : ''}>
        <span class="grow"><b>${esc(r.inst ? r.inst.base : r.desc || '(sem descrição)')}${r.inst ? ` <span class="tag-badge">parcela ${r.inst.n}/${r.inst.total}</span>` : ''}</b>
          <small>${r.inst ? `compra em ${shortDate(r.date)}` : shortDate(r.date)}${r.dup ? ' · <span class="neg">já lançado</span>' : ''}${KIND_LABEL[r.kind] ? ` · ${KIND_LABEL[r.kind]}` : ''}</small></span>
        ${r.kind === 'expense' || r.kind === 'income' ? catSelect(r, i) : ''}
        <span class="num ${r.kind === 'income' || r.kind === 'refund' ? 'pos' : 'neg'}">${$m(Math.abs(r.amount))}</span></label></li>`).join('')}</ul>
      <div class="form-actions"><button class="btn primary" data-action="import-run">${icon('check', 18)} Importar ${sel.length} lançamento(s)</button></div>
    </article>` : `<article class="card">${empty('file-text', 'Nenhum arquivo carregado', 'Escolha a fatura do cartão (CSV) ou o extrato da conta (OFX/CSV) para ver a prévia antes de importar.')}</article>`}
    ${historyCard()}
  </section>`;
}

const holderLabel = (target) => (cardOf(target) ? cardOf(target).name : S.accounts.find((a) => a.id === target)?.name || 'Conta');

/** Importações feitas: cada uma pode ser desfeita (inclusive as antigas, sem registro, pela tag "importado"). */
function historyCard() {
  const log = (S.importLog || []).map((l) => ({ ...l, n: S.transactions.filter((t) => t.importId === l.id).length })).filter((l) => l.n);
  const legacy = S.transactions.filter((t) => !t.importId && (t.tags || []).includes('importado')).length;
  if (!log.length && !legacy) return '';
  return `<article class="card">
    <header class="card-head"><h2>Importações feitas</h2></header>
    <ul class="list">${log.map((l) => `<li class="row"><span class="grow"><b>${esc(l.file || 'Arquivo')}</b><small>${holderLabel(l.target)}${l.invoice ? ` · fatura de ${monthLabel(l.invoice)}` : ''} · ${l.n} lançamento(s) · ${shortDate(l.at.slice(0, 10))}</small></span>
      <button class="btn ghost danger sm" data-action="import-undo" data-id="${l.id}">${icon('rotate-ccw', 14)} Desfazer</button></li>`).join('')}
    ${legacy ? `<li class="row"><span class="grow"><b>Importações antigas</b><small>${legacy} lançamento(s) com a tag #importado, de antes desta versão (podem estar em meses errados)</small></span>
      <button class="btn ghost danger sm" data-action="import-undo" data-id="legacy">${icon('trash-2', 14)} Apagar</button></li>` : ''}</ul>
  </article>`;
}

export async function handleImportInput(el) {
  const key = el.dataset.input;
  if (key === 'import-file' && el.files?.[0]) {
    const file = el.files[0];
    const text = await file.text();
    const rows = /<OFX>|OFXHEADER/i.test(text) ? parseOfx(text) : parseCsv(text);
    el.value = '';
    if (!rows.length) return toast('Não encontramos lançamentos nesse arquivo.');
    STATE.file = file.name;
    STATE.newCats = [];
    STATE.rows =rows.map((r) => ({ ...r, inst: parseInstallment(r.desc), kind: null }));
    // compras positivas ou negativas? vale o sinal da maioria das linhas que não são pagamento
    const body = STATE.rows.filter((r) => !isInvoicePayment(r.desc));
    STATE.positive = body.filter((r) => r.amount > 0).length >= body.filter((r) => r.amount < 0).length;
    if (!STATE.target) STATE.target = S.cards.find((c) => !c.archived) ? `card:${S.cards.find((c) => !c.archived).id}` : S.accounts.find((a) => !a.archived)?.id || '';
    if (cardOf(STATE.target)) STATE.invoice = guessInvoice(cardOf(STATE.target));
    refresh();
    rerender();
  } else if (key === 'import-target') {
    STATE.target = el.value;
    if (cardOf(STATE.target)) STATE.invoice = guessInvoice(cardOf(STATE.target));
    refresh();
    rerender();
  } else if (key === 'import-invoice') {
    STATE.invoice = el.value;
    refresh();
    rerender();
  } else if (key === 'import-sign') {
    STATE.positive = el.value === 'pos';
    refresh();
    rerender();
  } else if (key === 'import-row') {
    Object.assign(STATE.rows[el.dataset.i], { on: el.checked, offTouched: true });
    rerender();
  } else if (key === 'import-cat') Object.assign(STATE.rows[el.dataset.i], { categoryId: el.value, catTouched: true });
}

/** Lança uma parcela importada: liga à compra das faturas anteriores ou cria a compra com o histórico. */
function importInstallment(c, r, base) {
  const { n, total, base: desc } = r.inst;
  const value = Math.abs(r.amount);
  const sameBuy = (t) => t.cardId === c.id && t.installment?.total === total && norm(t.desc) === norm(desc) && Math.abs((t.originalAmount || t.amount) - value) < 0.05;
  const linked = S.transactions.find((t) => t.groupId && t.importedSeries && sameBuy(t));
  const groupId = linked?.groupId || uid();
  const placeholder = linked && S.transactions.find((t) => t.groupId === groupId && t.prior && t.installment.n === n);
  const live = { ...base, desc, amount: value, installment: { n, total }, groupId, importedSeries: true, purchaseDate: r.date };
  if (placeholder) Object.assign(placeholder, live, { id: placeholder.id, prior: false });
  else S.transactions.push(live);
  if (!linked)
    // parcelas anteriores: só histórico da compra (fora de fatura, saldo, limite e relatórios)
    for (let k = 1; k < n; k++)
      S.transactions.push({ ...live, id: uid(), installment: { n: k, total }, prior: true, invoice: addMonths(STATE.invoice, k - n), date: shiftDate(base.date, k - n), tags: [...(base.tags || [])] });
}

on({
  'import-undo': async (el) => {
    const legacy = el.dataset.id === 'legacy';
    const match = (t) => (legacy ? !t.importId && (t.tags || []).includes('importado') : t.importId === el.dataset.id);
    const n = S.transactions.filter(match).length;
    const ok = await confirmSheet({
      title: legacy ? 'Apagar as importações antigas?' : 'Desfazer esta importação?',
      text: `${n} lançamento(s) serão apagados${legacy ? ' (tudo que tem a tag #importado e veio antes desta versão)' : ''}. Depois você pode importar o arquivo de novo.`,
      options: [{ label: legacy ? 'Apagar' : 'Desfazer importação', value: 'yes', danger: true }],
    });
    if (!ok) return;
    S.transactions = S.transactions.filter((t) => !match(t));
    if (!legacy) S.importLog = (S.importLog || []).filter((l) => l.id !== el.dataset.id);
    save();
    toast(`${n} lançamento(s) removido(s).`);
    rerender();
  },
  'import-run': () => {
    const sel = STATE.rows.filter((r) => r.on);
    if (!sel.length) return toast('Selecione ao menos um lançamento.');
    if (!STATE.target) return toast('Escolha a conta ou o cartão.');
    const c = cardOf(STATE.target);
    const cyc = c ? cycleOf(c, STATE.invoice) : null;
    const importId = uid();
    S.importLog = [{ id: importId, at: new Date().toISOString(), file: STATE.file, target: STATE.target, invoice: c ? STATE.invoice : null }, ...(S.importLog || [])].slice(0, 30);
    const used = new Set(sel.map((r) => r.categoryId));
    S.categories.push(...STATE.newCats.filter((ct) => used.has(ct.id)));
    let n = 0;
    for (const r of sel) {
      if (r.kind === 'payment') continue;
      const tags = ['importado', ...(r.tags || []).filter((t) => t !== 'importado')];
      const base = { id: uid(), amount: Math.abs(r.amount), desc: r.desc, categoryId: r.categoryId || undefined, paid: true, tags, note: '', fitid: r.fitid || undefined, importId };
      if (c) {
        // sempre na fatura escolhida; a data fica dentro do período dela (parcelas antigas não voltam no tempo)
        const date = r.date >= cyc.start && r.date <= cyc.end ? r.date : cyc.end;
        const item = { ...base, cardId: c.id, invoice: STATE.invoice, date, purchaseDate: r.date !== date ? r.date : undefined };
        if (r.kind === 'refund') S.transactions.push({ ...item, type: 'refund', categoryId: undefined });
        else if (r.inst) importInstallment(c, r, { ...item, type: 'expense' });
        else S.transactions.push({ ...item, type: 'expense' });
      } else S.transactions.push({ ...base, date: r.date, type: r.kind, accountId: STATE.target });
      n++;
    }
    save();
    toast(c ? `${n} lançamento(s) importado(s) na fatura de ${monthLabel(STATE.invoice)}.` : `${n} lançamento(s) importado(s).`);
    const dest = c ? `#/cartao/${c.id}` : '#/transacoes';
    if (c) UI.invoice[c.id] = STATE.invoice;
    Object.assign(STATE, { rows: [], file: '', newCats: [] });
    go(dest);
  },
});
