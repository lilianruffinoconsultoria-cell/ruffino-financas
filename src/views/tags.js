// Tags: total gasto e recebido por tag no mês e em todo o período; abre as transações da tag.
import { S, save, inScope, counted, allTags } from '../store.js';
import { esc, icon, monthOf, monthLabel } from '../util.js';
import { UI, $m, pageHead, scopeChips, empty, on, rerender, openSheet, closeSheet, toast, confirmSheet } from '../ui.js';

function totals(tag) {
  const r = { month: { inc: 0, exp: 0 }, all: { inc: 0, exp: 0 }, n: 0 };
  for (const t of S.transactions) {
    if (!(t.tags || []).includes(tag) || !counted(t) || t.prior || !inScope(t, UI.scope)) continue;
    r.n++;
    const k = t.type === 'income' ? 'inc' : t.type === 'expense' ? 'exp' : null;
    if (!k) continue;
    r.all[k] += t.amount;
    if (monthOf(t.date) === UI.month) r.month[k] += t.amount;
  }
  return r;
}

export function renderTags() {
  const tags = allTags().map((tag) => ({ tag, ...totals(tag) })).filter((x) => x.n).sort((a, b) => b.all.exp - a.all.exp);
  return `<section>
    ${pageHead('Tags', { back: '#/mais' })}
    ${scopeChips()}
    ${S.settings.travelTag ? `<p class="badge-line">${icon('plane', 14)} Modo viagem ativo com a tag <b>#${esc(S.settings.travelTag)}</b> · <button class="link" data-action="travel">alterar</button></p>` : ''}
    <article class="card">
      <header class="card-head"><h2>Suas tags</h2><span class="muted small">${monthLabel(UI.month)} · todo o período</span></header>
      ${tags.length ? `<ul class="list">${tags.map((x) => `<li class="row">
        <span class="cat-badge" style="--c:#C5A059">${icon('tag', 18)}</span>
        <a class="grow" href="#/transacoes" data-action="tx-tag" data-v="${esc(x.tag)}"><b>#${esc(x.tag)}</b><small>${x.n} lançamento(s) · no mês ${$m(x.month.exp)} · total ${$m(x.all.exp)}${x.all.inc ? ` · receitas ${$m(x.all.inc)}` : ''}</small></a>
        <button class="icon-btn" data-action="tag-rename" data-v="${esc(x.tag)}" aria-label="Editar tag">${icon('pencil', 16)}</button></li>`).join('')}</ul>`
        : empty('tag', 'Nenhuma tag ainda', 'Adicione tags nos lançamentos (ex.: viagem, reforma, trabalho) para somar gastos que atravessam categorias.')}
    </article>
  </section>`;
}

on({
  'tag-rename': (el) => {
    const old = el.dataset.v;
    openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('tag', 20)} Editar #${esc(old)}</h2>
      <label class="field"><span>Novo nome</span><input name="name" value="${esc(old)}" maxlength="30" autofocus></label>
      <div class="form-actions"><button type="button" class="btn ghost danger" data-del>${icon('trash-2', 18)} Remover tag</button><button class="btn primary">${icon('check', 18)} Renomear</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        const apply = (fn) => {
          for (const t of S.transactions) if ((t.tags || []).includes(old)) t.tags = [...new Set(fn(t.tags))];
          save();
          closeSheet();
          rerender();
        };
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = f.name.value.trim().replace(/^#/, '');
          if (!name) return;
          apply((tags) => tags.map((x) => (x === old ? name : x)));
          toast('Tag renomeada.');
        });
        sheet.querySelector('[data-del]').addEventListener('click', async () => {
          if (!(await confirmSheet({ title: `Remover #${old}?`, text: 'Os lançamentos continuam, só perdem esta tag.', options: [{ label: 'Remover', value: 'yes', danger: true }] }))) return;
          apply((tags) => tags.filter((x) => x !== old));
        });
      },
    });
  },
  travel: () => {
    const cur = S.settings.travelTag;
    openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('plane', 20)} Modo viagem</h2>
      <p class="muted small">Digite uma tag para a viagem. Enquanto o modo viagem estiver ativo, todo lançamento novo recebe essa tag automaticamente, e você acompanha o total da viagem em Tags.</p>
      <label class="field"><span>Tag da viagem</span><input name="tag" value="${esc(cur)}" placeholder="Ex.: ferias-nordeste" maxlength="30" autofocus></label>
      <div class="form-actions">${cur ? `<button type="button" class="btn ghost danger" data-off>Desativar</button>` : ''}<button class="btn primary">${icon('check', 18)} ${cur ? 'Salvar' : 'Ativar'}</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        sheet.querySelector('[data-off]')?.addEventListener('click', () => {
          S.settings.travelTag = '';
          save();
          closeSheet();
          toast('Modo viagem desativado.');
          rerender();
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const tag = f.tag.value.trim().replace(/^#/, '').replace(/\s+/g, '-');
          if (!tag) return;
          S.settings.travelTag = tag;
          save();
          closeSheet();
          toast('Modo viagem ativado com sucesso.');
          rerender();
        });
      },
    });
  },
});
