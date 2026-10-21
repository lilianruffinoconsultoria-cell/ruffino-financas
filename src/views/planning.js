// Planejamento mensal: meta geral, limites por categoria/subcategoria, % de alerta e sugestão pela média.
import { S, save, category, categoriesOf, subcategoriesOf, spentInCategory, averageSpending, monthSummary, budgetFor, budgetOrigin, editableBudget } from '../store.js';
import { esc, icon, parseMoney, moneyPlain, monthLabel } from '../util.js';
import { UI, ACTIONS, $m, monthSwitcher, scopeChips, catBadge, progress, empty, on, rerender, openSheet, closeSheet, toast, confirmSheet } from '../ui.js';

export function renderPlanning() {
  const ym = UI.month;
  const plan = budgetFor(ym);
  const origin = budgetOrigin(ym);
  const warn = (plan.alert || 80) / 100;
  const ids = Object.keys(plan.cats).filter((id) => S.categories.some((c) => c.id === id && !c.parentId));
  const rows = ids
    .map((id) => ({ cat: category(id), limit: plan.cats[id], spent: spentInCategory(id, ym, UI.scope) }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  const catSum = rows.reduce((a, r) => a + r.limit, 0);
  const goal = plan.total || catSum;
  const spentTotal = plan.total ? monthSummary(ym, UI.scope).expense : rows.reduce((a, r) => a + r.spent, 0);
  const others = categoriesOf('expense')
    .filter((c) => !plan.cats[c.id])
    .map((c) => ({ cat: c, spent: spentInCategory(c.id, ym, UI.scope) }))
    .sort((a, b) => b.spent - a.spent);
  const income = monthSummary(ym, UI.scope).income;
  const over = rows.filter((r) => r.spent > r.limit);
  const near = rows.filter((r) => r.spent <= r.limit && r.spent >= r.limit * warn);

  const subRows = (r) =>
    subcategoriesOf(r.cat.id)
      .filter((s) => plan.cats[s.id])
      .map((s) => {
        const sp = spentInCategory(s.id, ym, UI.scope);
        return `<li class="sub-row"><button class="row col linklike" data-action="budget-edit" data-id="${s.id}"><div class="row-in"><span class="sub-mark">↳</span><span class="grow"><b>${esc(s.name)}</b><small>${$m(sp)} de ${$m(plan.cats[s.id])}</small></span></div>${progress(sp, plan.cats[s.id], { warn })}</button></li>`;
      })
      .join('');

  return `<section>
    <header class="page-head"><h1>Planejamento</h1><div class="head-right">${monthSwitcher()}</div></header>
    ${scopeChips()}
    ${origin && origin !== ym ? `<p class="badge-line">${icon('info', 14)} Usando o planejamento de ${monthLabel(origin)}. Ao alterar, o novo plano vale a partir de ${monthLabel(ym)}.</p>` : ''}
    <article class="hero slim">
      <div class="hero-split">
        <div><p class="hero-k">${plan.total ? 'Gasto total do mês' : 'Gasto nas categorias planejadas'}</p><p class="hero-v sm">${$m(spentTotal)}</p></div>
        <div class="right"><p class="hero-k">${plan.total ? 'Meta geral' : 'Planejado'}</p><p class="hero-v sm gold">${$m(goal)}</p></div>
      </div>
      ${progress(spentTotal, goal, { warn })}
      <p class="hero-sub">${goal ? (spentTotal <= goal ? `Restam <strong>${$m(goal - spentTotal)}</strong> para ${monthLabel(ym, { year: false }).toLowerCase()}.` : `Você passou <strong>${$m(spentTotal - goal)}</strong> da meta.`) : 'Defina uma meta geral ou limites por categoria.'}
      ${income && goal ? ` A meta equivale a ${Math.round((goal / income) * 100)}% das receitas do mês.` : ''}
      ${plan.total && catSum ? ` Distribuído em categorias: ${$m(catSum)}${plan.total > catSum ? ` · livre ${$m(plan.total - catSum)}` : ''}.` : ''}</p>
    </article>

    ${over.length ? `<div class="alert">${icon('info', 18)}<span>${over.length === 1 ? `<b>${esc(over[0].cat.name)}</b> passou do limite.` : `${over.length} categorias passaram do limite.`}</span></div>` : ''}
    ${near.length ? `<div class="alert warn">${icon('info', 18)}<span>${near.map((r) => `<b>${esc(r.cat.name)}</b>`).join(', ')} já ${near.length === 1 ? 'atingiu' : 'atingiram'} ${plan.alert || 80}% do limite.</span></div>` : ''}

    <div class="toolbar end">
      <button class="btn ghost sm" data-action="budget-general">${icon('target', 16)} Meta geral e alerta</button>
      <button class="btn ghost sm" data-action="budget-suggest">${icon('sparkles', 16)} Sugerir pela média</button>
    </div>

    <article class="card">
      <header class="card-head"><h2>Categorias planejadas</h2><span class="muted small">alerta em ${plan.alert || 80}%</span></header>
      ${rows.length ? `<ul class="list">${rows.map((r) => `
        <li><button class="row col linklike" data-action="budget-edit" data-id="${r.cat.id}">
          <div class="row-in">${catBadge(r.cat, 36)}<span class="grow"><b>${esc(r.cat.name)}</b>
            <small>${$m(r.spent)} de ${$m(r.limit)}</small></span>
            <span class="num sm ${r.spent > r.limit ? 'neg' : ''}">${r.spent > r.limit ? `+${$m(r.spent - r.limit)}` : `${$m(r.limit - r.spent)} livre`}</span></div>
          ${progress(r.spent, r.limit, { warn })}</button></li>${subRows(r)}`).join('')}</ul>`
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
    const plan = budgetFor(UI.month);
    const current = plan.cats[c.id];
    const avg = averageSpending(c.id, UI.month);
    const subs = c.parentId ? [] : subcategoriesOf(c.id);
    const subSum = subs.reduce((a, s) => a + (plan.cats[s.id] || 0), 0);
    openSheet(`<form class="tx-form">
      <h2 class="sheet-title">${catBadge(c.parentId ? category(c.parentId) : c, 32)} ${esc(c.parentId ? `${category(c.parentId).name} › ${c.name}` : c.name)}</h2>
      <label class="amount-field"><span>Limite em ${monthLabel(UI.month)}</span><div><em>R$</em><input name="limit" inputmode="decimal" placeholder="0,00" value="${current ? moneyPlain(current) : ''}" autofocus></div></label>
      <p class="hint">Média dos últimos 3 meses: <b>${$m(avg)}</b>${avg ? ` <button type="button" class="link" data-fill="${moneyPlain(Math.ceil(avg / 10) * 10)}">usar</button>` : ''}</p>
      ${subs.length ? `<p class="hint">Subcategorias: ${subs.map((s) => `<button type="button" class="link" data-sub="${s.id}">${esc(s.name)}${plan.cats[s.id] ? ` (${$m(plan.cats[s.id])})` : ''}</button>`).join(' · ')}</p>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <div class="form-actions">${current ? `<button type="button" class="btn ghost danger" data-remove>${icon('trash-2', 18)} Remover</button>` : ''}
        <button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        sheet.querySelector('[data-fill]')?.addEventListener('click', (e) => (f.limit.value = e.target.dataset.fill));
        sheet.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => ACTIONS_EDIT(b.dataset.sub)));
        sheet.querySelector('[data-remove]')?.addEventListener('click', () => {
          const p = editableBudget(UI.month);
          delete p.cats[c.id];
          for (const s of subs) delete p.cats[s.id];
          save();
          closeSheet();
          rerender();
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = parseMoney(f.limit.value);
          const err = f.querySelector('.form-error');
          if (v && subSum > v) {
            err.textContent = `O limite da categoria não pode ser menor que a soma das subcategorias (${$m(subSum)}).`;
            err.hidden = false;
            return;
          }
          if (v && c.parentId) {
            const parentLimit = plan.cats[c.parentId] || 0;
            const siblings = subcategoriesOf(c.parentId).filter((s) => s.id !== c.id).reduce((a, s) => a + (plan.cats[s.id] || 0), 0);
            if (parentLimit && siblings + v > parentLimit) {
              err.textContent = `A soma das subcategorias passaria o limite de ${category(c.parentId).name} (${$m(parentLimit)}).`;
              err.hidden = false;
              return;
            }
          }
          const p = editableBudget(UI.month);
          if (v) p.cats[c.id] = v;
          else delete p.cats[c.id];
          if (v && c.parentId && !p.cats[c.parentId]) p.cats[c.parentId] = v;
          save();
          closeSheet();
          toast('Planejamento salvo.');
          rerender();
        });
      },
    });
  },
  'budget-general': () => {
    const plan = budgetFor(UI.month);
    openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('target', 20)} Meta geral de ${monthLabel(UI.month)}</h2>
      <label class="amount-field"><span>Quanto pretende gastar no mês (opcional)</span><div><em>R$</em><input name="total" inputmode="decimal" placeholder="0,00" value="${plan.total ? moneyPlain(plan.total) : ''}" autofocus></div></label>
      <p class="hint">Receitas do mês: <b>${$m(monthSummary(UI.month, UI.scope).income)}</b>. Sem meta geral, usamos a soma dos limites por categoria.</p>
      <label class="field"><span>Avisar quando atingir</span><select name="alert">${[50, 60, 70, 75, 80, 85, 90, 95, 100].map((p) => `<option value="${p}" ${p === (plan.alert || 80) ? 'selected' : ''}>${p}% do limite</option>`).join('')}</select></label>
      <div class="form-actions"><button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const p = editableBudget(UI.month);
          p.total = parseMoney(f.total.value);
          p.alert = Number(f.alert.value);
          save();
          closeSheet();
          toast('Meta geral salva.');
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
      text: `Vamos definir o limite de ${sugg.length} categoria(s) em ${monthLabel(UI.month)} pela média dos 3 meses anteriores, arredondada para cima. Limites já definidos serão substituídos.`,
      options: [{ label: 'Aplicar sugestão', value: 'yes' }],
    });
    if (!ok) return;
    const p = editableBudget(UI.month);
    for (const { c, avg } of sugg) p.cats[c.id] = Math.ceil(avg / 10) * 10;
    save();
    toast('Limites sugeridos aplicados.');
    rerender();
  },
});

// abrir o limite de uma subcategoria a partir do painel da categoria-mãe
const ACTIONS_EDIT = (id) => ACTIONS['budget-edit']({ dataset: { id } });
