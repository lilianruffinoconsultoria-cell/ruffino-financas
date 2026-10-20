// Planejamento mensal: limite de gasto por categoria, acompanhamento e sugestão automática.
import { S, save, category, categoriesOf, spentInCategory, averageSpending, monthSummary } from '../store.js';
import { esc, icon, parseMoney, moneyPlain, monthLabel } from '../util.js';
import { UI, $m, monthSwitcher, scopeChips, catBadge, progress, empty, on, rerender, openSheet, closeSheet, toast, confirmSheet } from '../ui.js';

export function renderPlanning() {
  const ym = UI.month;
  const ids = Object.keys(S.budgets).filter((id) => S.categories.some((c) => c.id === id));
  const rows = ids
    .map((id) => ({ cat: category(id), limit: S.budgets[id], spent: spentInCategory(id, ym, UI.scope) }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  const planned = rows.reduce((a, r) => a + r.limit, 0);
  const spent = rows.reduce((a, r) => a + r.spent, 0);
  const others = categoriesOf('expense')
    .filter((c) => !S.budgets[c.id])
    .map((c) => ({ cat: c, spent: spentInCategory(c.id, ym, UI.scope) }))
    .sort((a, b) => b.spent - a.spent);
  const income = monthSummary(ym, UI.scope).income;
  const over = rows.filter((r) => r.spent > r.limit);

  return `<section>
    <header class="page-head"><h1>Planejamento</h1><div class="head-right">${monthSwitcher()}</div></header>
    ${scopeChips()}
    <article class="hero slim">
      <div class="hero-split">
        <div><p class="hero-k">Gasto em categorias planejadas</p><p class="hero-v sm">${$m(spent)}</p></div>
        <div class="right"><p class="hero-k">Planejado</p><p class="hero-v sm gold">${$m(planned)}</p></div>
      </div>
      ${progress(spent, planned)}
      <p class="hero-sub">${planned ? (spent <= planned ? `Restam <strong>${$m(planned - spent)}</strong> para ${monthLabel(ym, { year: false }).toLowerCase()}.` : `Você passou <strong>${$m(spent - planned)}</strong> do planejado.`) : 'Defina limites para começar.'}
      ${income && planned ? ` O planejado equivale a ${Math.round((planned / income) * 100)}% das receitas do mês.` : ''}</p>
    </article>

    ${over.length ? `<div class="alert">${icon('info', 18)}<span>${over.length === 1 ? `A categoria <b>${esc(over[0].cat.name)}</b> passou do limite.` : `${over.length} categorias passaram do limite.`}</span></div>` : ''}

    <div class="toolbar end">
      <button class="btn ghost sm" data-action="budget-suggest">${icon('sparkles', 16)} Sugerir pela média de 3 meses</button>
    </div>

    <article class="card">
      <header class="card-head"><h2>Categorias planejadas</h2></header>
      ${rows.length ? `<ul class="list">${rows.map((r) => `
        <li><button class="row col linklike" data-action="budget-edit" data-id="${r.cat.id}">
          <div class="row-in">${catBadge(r.cat, 36)}<span class="grow"><b>${esc(r.cat.name)}</b>
            <small>${$m(r.spent)} de ${$m(r.limit)}</small></span>
            <span class="num sm ${r.spent > r.limit ? 'neg' : ''}">${r.spent > r.limit ? `+${$m(r.spent - r.limit)}` : `${$m(r.limit - r.spent)} livre`}</span></div>
          ${progress(r.spent, r.limit)}</button></li>`).join('')}</ul>`
        : empty('target', 'Nenhum limite definido', 'Escolha uma categoria abaixo ou use a sugestão automática.')}
    </article>

    <article class="card">
      <header class="card-head"><h2>Sem planejamento</h2></header>
      <ul class="list">${others.map((o) => `<li><button class="row linklike" data-action="budget-edit" data-id="${o.cat.id}">
        ${catBadge(o.cat, 32)}<span class="grow"><b>${esc(o.cat.name)}</b><small>Gasto no mês: ${$m(o.spent)}</small></span>
        <span class="link">${icon('plus', 16)} Definir</span></button></li>`).join('')}</ul>
    </article>
  </section>`;
}

on({
  'budget-edit': (el) => {
    const c = category(el.dataset.id);
    const current = S.budgets[c.id];
    const avg = averageSpending(c.id, UI.month);
    openSheet(`<form class="tx-form">
      <h2 class="sheet-title">${catBadge(c, 32)} ${esc(c.name)}</h2>
      <label class="amount-field"><span>Limite mensal</span><div><em>R$</em><input name="limit" inputmode="decimal" placeholder="0,00" value="${current ? moneyPlain(current) : ''}" autofocus></div></label>
      <p class="hint">Média dos últimos 3 meses: <b>${$m(avg)}</b>${avg ? ` <button type="button" class="link" data-fill="${moneyPlain(Math.ceil(avg / 10) * 10)}">usar</button>` : ''}</p>
      <div class="form-actions">${current ? `<button type="button" class="btn ghost danger" data-remove>${icon('trash-2', 18)} Remover limite</button>` : ''}
        <button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        sheet.querySelector('[data-fill]')?.addEventListener('click', (e) => (f.limit.value = e.target.dataset.fill));
        sheet.querySelector('[data-remove]')?.addEventListener('click', () => {
          delete S.budgets[c.id];
          save();
          closeSheet();
          rerender();
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = parseMoney(f.limit.value);
          if (v) S.budgets[c.id] = v;
          else delete S.budgets[c.id];
          save();
          closeSheet();
          toast('Planejamento salvo.');
          rerender();
        });
      },
    });
  },
  'budget-suggest': async () => {
    const sugg = categoriesOf('expense')
      .map((c) => ({ c, avg: averageSpending(c.id, UI.month) }))
      .filter((x) => x.avg > 0);
    if (!sugg.length) return toast('Ainda não há histórico suficiente nos últimos 3 meses.');
    const ok = await confirmSheet({
      title: 'Sugerir limites',
      text: `Vamos definir o limite de ${sugg.length} categoria(s) pela média de gastos dos 3 meses anteriores, arredondada para cima. Limites já definidos serão substituídos.`,
      options: [{ label: 'Aplicar sugestão', value: 'yes' }],
    });
    if (!ok) return;
    for (const { c, avg } of sugg) S.budgets[c.id] = Math.ceil(avg / 10) * 10;
    save();
    toast('Limites sugeridos aplicados.');
    rerender();
  },
});
