// Importação de extrato (CSV ou OFX): prévia, escolha da conta/cartão, categorias e duplicados.
import { S, save, categoriesOf, descriptionsIndex, invoiceFor, card } from '../store.js';
import { esc, icon, uid, shortDate } from '../util.js';
import { $m, pageHead, empty, on, rerender, toast, go } from '../ui.js';
import { parseCsv, parseOfx } from '../importer.js';

const STATE = { rows: [], file: '', target: '' };

function guessCategory(row) {
  const type = row.amount > 0 ? 'income' : 'expense';
  const byName = row.category && S.categories.find((c) => c.type === type && c.name.toLowerCase() === row.category.toLowerCase());
  if (byName) return byName.id;
  const known = descriptionsIndex().get(row.desc);
  if (known && S.categories.find((c) => c.id === known)?.type === type) return known;
  return (categoriesOf(type).find((c) => c.name === 'Outros') || categoriesOf(type)[0])?.id;
}

const isDuplicate = (row) =>
  S.transactions.some((t) => (row.fitid && t.fitid === row.fitid) || (t.date === row.date && Math.abs(t.amount - Math.abs(row.amount)) < 0.005 && (t.desc || '') === row.desc));

export function renderImport() {
  const holders = [...S.accounts.filter((a) => !a.archived).map((a) => [a.id, a.name]), ...S.cards.filter((c) => !c.archived).map((c) => [`card:${c.id}`, `${c.name} (cartão)`])];
  const fresh = STATE.rows.filter((r) => !r.dup).length;
  return `<section>
    ${pageHead('Importar extrato', { back: '#/mais' })}
    <article class="card">
      <p class="muted small">Exporte o extrato no site ou app do banco em <b>OFX</b> (recomendado) ou <b>CSV</b>. No CSV, use colunas de data, descrição e valor (negativo para saídas); colunas de tipo e categoria são opcionais.</p>
      <div class="toolbar"><label class="btn primary file-btn">${icon('upload', 18)} Escolher arquivo<input type="file" accept=".csv,.ofx,.txt,text/csv,application/x-ofx" data-input="import-file" hidden></label>
        ${STATE.file ? `<span class="muted small">${esc(STATE.file)}</span>` : ''}</div>
    </article>
    ${STATE.rows.length ? `
    <article class="card">
      <header class="card-head"><h2>${STATE.rows.length} lançamento(s) encontrados</h2><span class="muted small">${STATE.rows.length - fresh} já existem</span></header>
      <label class="field"><span>Lançar em</span><select data-input="import-target">${holders.map(([id, n]) => `<option value="${id}" ${STATE.target === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <ul class="list">${STATE.rows.map((r, i) => `<li><label class="row">
        <input type="checkbox" data-input="import-row" data-i="${i}" ${r.on ? 'checked' : ''}>
        <span class="grow"><b>${esc(r.desc || '(sem descrição)')}</b><small>${shortDate(r.date)}${r.dup ? ' · <span class="neg">já lançado</span>' : ''}</small></span>
        <select class="mini-select" data-input="import-cat" data-i="${i}" aria-label="Categoria">${categoriesOf(r.amount > 0 ? 'income' : 'expense').map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <span class="num ${r.amount > 0 ? 'pos' : 'neg'}">${$m(Math.abs(r.amount))}</span></label></li>`).join('')}</ul>
      <div class="form-actions"><button class="btn primary" data-action="import-run">${icon('check', 18)} Importar selecionados</button></div>
    </article>` : `<article class="card">${empty('file-text', 'Nenhum arquivo carregado', 'Escolha um arquivo OFX ou CSV para ver a prévia antes de importar.')}</article>`}
  </section>`;
}

export async function handleImportInput(el) {
  const key = el.dataset.input;
  if (key === 'import-file' && el.files?.[0]) {
    const file = el.files[0];
    const text = await file.text();
    const rows = /<OFX>|OFXHEADER/i.test(text) ? parseOfx(text) : parseCsv(text);
    if (!rows.length) return toast('Não encontramos lançamentos nesse arquivo.');
    STATE.file = file.name;
    STATE.target ||= S.accounts.find((a) => !a.archived)?.id || '';
    STATE.rows = rows.map((r) => {
      const dup = isDuplicate(r);
      return { ...r, dup, on: !dup, categoryId: guessCategory(r) };
    });
    el.value = '';
    rerender();
  } else if (key === 'import-target') STATE.target = el.value;
  else if (key === 'import-row') STATE.rows[el.dataset.i].on = el.checked;
  else if (key === 'import-cat') STATE.rows[el.dataset.i].categoryId = el.value;
}

on({
  'import-run': () => {
    const sel = STATE.rows.filter((r) => r.on);
    if (!sel.length) return toast('Selecione ao menos um lançamento.');
    if (!STATE.target) return toast('Escolha a conta ou o cartão.');
    const cardId = STATE.target.startsWith('card:') ? STATE.target.slice(5) : null;
    for (const r of sel) {
      const income = r.amount > 0;
      const base = { id: uid(), amount: Math.abs(r.amount), desc: r.desc, date: r.date, categoryId: r.categoryId, paid: true, tags: ['importado'], note: '', fitid: r.fitid || undefined };
      if (cardId) {
        const c = card(cardId);
        S.transactions.push(income ? { ...base, type: 'refund', cardId, invoice: invoiceFor(c, r.date) } : { ...base, type: 'expense', cardId, invoice: invoiceFor(c, r.date) });
      } else S.transactions.push({ ...base, type: income ? 'income' : 'expense', accountId: STATE.target });
    }
    save();
    toast(`${sel.length} lançamento(s) importado(s).`);
    Object.assign(STATE, { rows: [], file: '' });
    go('#/transacoes');
  },
});
