// Menu "Mais", gestão de categorias e configurações (tema, PIN, backup, dados de exemplo).
import { S, save, replaceState, resetAll, seedDemo, category, categoriesOf, subcategoriesOf, COLORS, CATEGORY_TYPES, NEUTRAL_TYPES } from '../store.js';
import { esc, icon, uid, today, saveFile, sha256, PICKABLE_ICONS } from '../util.js';
import { UI, pageHead, catBadge, on, rerender, openSheet, closeSheet, toast, confirmSheet, go } from '../ui.js';
import { transactionsCsv } from './reports.js';
import { applyTheme } from '../theme.js';
import { cloudCard } from './cloud.js';

const MENU = [
  ['#/contas', 'landmark', 'Contas', 'Saldos, reajuste, arquivar e mover lançamentos'],
  ['#/cartoes', 'credit-card', 'Cartões de crédito', 'Faturas, compras parceladas, estorno e antecipação'],
  ['#/parcelamentos', 'handshake', 'Parcelamentos', 'Com pessoas, lojas, carnês e crediários: a pagar e a receber'],
  ['#/planejamento', 'target', 'Planejamento', 'Limites do mês por categoria e alertas'],
  ['#/objetivos', 'piggy-bank', 'Objetivos', 'Metas de economia com prazo'],
  ['#/relatorios', 'chart-column', 'Relatórios', 'DRE do mês, comparativos e evolução'],
  ['#/calendario', 'calendar', 'Calendário', 'Receitas, despesas e pendências por dia'],
  ['#/tags', 'tag', 'Tags e modo viagem', 'Totais por tag e viagem automática'],
  ['#/categorias', 'palette', 'Categorias', 'Subcategorias, ícones, cores e arquivo'],
  ['#/importar', 'upload', 'Importar extrato', 'Arquivo OFX ou CSV do banco'],
  ['#/config', 'settings', 'Configurações', 'Tema, senha, backup e automações'],
];

export function renderMore() {
  return `<section>
    <header class="page-head"><h1>Mais</h1></header>
    <button class="consult capture" data-action="capture"><span class="menu-ic gold">${icon('sparkles', 22)}</span><span><b>Lançar pela notificação ou SMS</b><small>Cole a mensagem do banco e o lançamento sai preenchido</small></span></button>
    <div class="menu-grid">${MENU.map(([href, ic, t, d]) => `<a class="menu-item" href="${href}"><span class="menu-ic">${icon(ic, 22)}</span><span><b>${t}</b><small>${d}</small></span>${icon('chevron-right', 18, 'muted')}</a>`).join('')}</div>
    <a class="consult" href="https://wa.me/5514996805832?text=${encodeURIComponent('Olá, Lilian! Vim pelo app Ruffino Finanças e gostaria de falar sobre consultoria financeira.')}" target="_blank" rel="noopener">
      <span class="menu-ic gold">${icon('message-circle', 22)}</span><span><b>Fale com a consultora</b><small>Lilian Ruffino Consultoria · BPO financeiro, planejamento e tributos</small></span></a>
  </section>`;
}

// ---------- categorias ----------
const countTx = (id) => S.transactions.filter((t) => t.categoryId === id).length;
const catRow = (c) => `<li><button class="row linklike" data-action="cat-form" data-id="${c.id}">${catBadge(c, 36)}<span class="grow"><b>${esc(c.name)}</b><small>${countTx(c.id)} lançamento(s)${c.archived ? ' · arquivada' : ''}</small></span>${icon('pencil', 16, 'muted')}</button></li>
  ${subcategoriesOf(c.id, { archived: true }).map((s) => `<li class="sub-row"><button class="row linklike" data-action="cat-form" data-id="${s.id}"><span class="sub-mark">↳</span><span class="grow"><b>${esc(s.name)}</b><small>${countTx(s.id)} lançamento(s)${s.archived ? ' · arquivada' : ''}</small></span>${icon('pencil', 14, 'muted')}</button></li>`).join('')}
  ${c.archived ? '' : `<li class="sub-row"><button class="link sub-add" data-action="cat-form" data-parent="${c.id}">${icon('plus', 14)} Subcategoria</button></li>`}`;

export function renderCategories() {
  const list = categoriesOf(UI.catTab);
  const archived = categoriesOf(UI.catTab, { archived: true });
  return `<section>
    ${pageHead('Categorias', { back: '#/mais', right: `<button class="btn primary sm" data-action="cat-form">${icon('plus', 16)} Nova</button>` })}
    <div class="chips scroll">${Object.entries(CATEGORY_TYPES).map(([v, l]) => `<button class="chip ${UI.catTab === v ? 'on' : ''}" data-action="cat-tab" data-v="${v}">${l}</button>`).join('')}</div>
    ${NEUTRAL_TYPES[UI.catTab] ? `<p class="badge-line">${icon('info', 14)} ${UI.catTab === 'transfer'
      ? 'Use em entradas e saídas que só mudam o dinheiro de lugar (aplicação, resgate, empréstimo, Pix para você mesma). Elas mexem no saldo da conta, mas não contam como receita nem despesa.'
      : 'Use quando alguém devolve um gasto seu (empresa, cliente, amigo) ou quando você devolve um valor. Mexe no saldo, mas não infla suas receitas nem suas despesas.'}</p>` : ''}
    <article class="card">${list.length ? `<ul class="list">${list.map(catRow).join('')}</ul>` : `<p class="muted small">Nenhuma categoria aqui ainda. Toque em “Nova”.</p>`}</article>
    ${archived.length ? `<details class="card"><summary class="card-head"><h2>Arquivadas (${archived.length})</h2></summary><ul class="list">${archived.map(catRow).join('')}</ul></details>` : ''}
  </section>`;
}

function categoryForm(c, parentId = null) {
  const isEdit = !!c;
  const parent = category(isEdit ? c.parentId : parentId);
  const isSub = !!(isEdit ? c.parentId : parentId);
  const v = c || { type: isSub ? parent.type : UI.catTab, icon: isSub ? parent.icon : 'tag', color: isSub ? parent.color : COLORS[S.categories.length % COLORS.length], parentId };
  if (!PICKABLE_ICONS.includes(v.icon) && v.icon !== 'tag') PICKABLE_ICONS.push(v.icon);
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${isEdit ? (isSub ? 'Editar subcategoria' : 'Editar categoria') : isSub ? `Nova subcategoria de ${esc(parent.name)}` : `Nova categoria · ${CATEGORY_TYPES[v.type]}`}</h2>
    <label class="field"><span>Nome</span><input name="name" maxlength="30" value="${esc(v.name || '')}" autofocus></label>
    ${isEdit ? `<label class="switch-row"><span>Arquivar <small class="muted">(some da escolha de categoria; o histórico continua)</small></span><input type="checkbox" role="switch" name="archived" ${v.archived ? 'checked' : ''}></label>` : ''}
    <fieldset class="field"><legend>Ícone</legend><div class="icon-grid">${PICKABLE_ICONS.map((i) => `<label><input type="radio" name="icon" value="${i}" ${i === v.icon ? 'checked' : ''}><span>${icon(i, 18)}</span></label>`).join('')}</div></fieldset>
    <div class="field"><span>Cor</span><div class="swatches">${COLORS.map((col) => `<label style="--c:${col}"><input type="radio" name="color" value="${col}" ${col === v.color ? 'checked' : ''}><span></span></label>`).join('')}</div></div>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">${isEdit ? `<button type="button" class="btn ghost danger" data-del>${icon('trash-2', 18)} Excluir</button>` : ''}<button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const er = f.querySelector('.form-error');
        const name = f.name.value.trim();
        if (!name) {
          er.textContent = 'Informe o nome.';
          er.hidden = false;
          return;
        }
        if (isSub && name.toLowerCase() === parent.name.toLowerCase()) {
          er.textContent = 'Categoria e subcategoria não podem ter o mesmo nome.';
          er.hidden = false;
          return;
        }
        const data = { name, icon: f.icon.value || 'tag', color: f.color.value, archived: !!f.archived?.checked };
        if (isEdit) Object.assign(category(c.id), data);
        else S.categories.push({ id: uid(), type: v.type, ...(isSub ? { parentId } : {}), ...data });
        save();
        closeSheet();
        toast(isSub ? 'Subcategoria salva.' : 'Categoria salva.');
        rerender();
      });
      sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
        const subs = isSub ? [] : subcategoriesOf(c.id, { archived: true });
        const others = categoriesOf(c.type).filter((x) => x.id !== c.id);
        if (!isSub && !others.length) return toast('Mantenha ao menos uma categoria.');
        const fallback = isSub ? parent : others.find((x) => x.name === 'Outros') || others[0];
        const ids = new Set([c.id, ...subs.map((s) => s.id)]);
        const n = S.transactions.filter((t) => ids.has(t.categoryId)).length;
        const ok = await confirmSheet({
          title: `Excluir “${c.name}”?`,
          text: `${n ? `${n} lançamento(s) serão reassociados a “${fallback.name}”. ` : ''}${subs.length ? `As ${subs.length} subcategoria(s) também serão excluídas. ` : ''}Se quiser manter o histórico separado, prefira arquivar.`,
          options: [{ label: 'Excluir', value: 'yes', danger: true }],
        });
        if (!ok) return;
        for (const t of S.transactions) if (ids.has(t.categoryId)) t.categoryId = fallback.id;
        S.categories = S.categories.filter((x) => !ids.has(x.id));
        for (const plan of Object.values(S.budgetMonths)) for (const id of ids) delete plan.cats[id];
        save();
        toast('A reassociação foi concluída com sucesso.');
        rerender();
      });
    },
  });
}

// ---------- configurações ----------
export function renderSettings() {
  const st = S.settings;
  const themes = [['dark', 'Escuro', 'moon'], ['light', 'Claro', 'sun'], ['auto', 'Automático', 'contrast']];
  return `<section>
    ${pageHead('Configurações', { back: '#/mais' })}
    <article class="card">
      <header class="card-head"><h2>Perfil</h2></header>
      <label class="field"><span>Como podemos te chamar?</span><input data-setting="name" value="${esc(st.name)}" maxlength="30" placeholder="Seu nome"></label>
    </article>
    <article class="card">
      <header class="card-head"><h2>Aparência</h2></header>
      <div class="seg three">${themes.map(([v, l, ic]) => `<button class="seg-btn ${st.theme === v ? 'on' : ''}" data-action="theme" data-v="${v}">${icon(ic, 16)}<span>${l}</span></button>`).join('')}</div>
      <label class="switch-row"><span>Abrir com valores ocultos</span><input type="checkbox" role="switch" data-setting="hide" ${st.hide ? 'checked' : ''}></label>
    </article>
    <article class="card">
      <header class="card-head"><h2>Automações</h2></header>
      <label class="switch-row"><span>Efetivar automaticamente <small class="muted">(contas pendentes viram pagas no vencimento)</small></span><input type="checkbox" role="switch" data-setting="autoPay" ${st.autoPay ? 'checked' : ''}></label>
      <label class="switch-row"><span>Análise inteligente <small class="muted">(avisa quando uma despesa está muito acima da média)</small></span><input type="checkbox" role="switch" data-setting="smartAlert" ${st.smartAlert ? 'checked' : ''}></label>
      <div class="switch-row"><span>Modo viagem ${st.travelTag ? `<small class="muted">· ativo com #${esc(st.travelTag)}</small>` : '<small class="muted">· desativado</small>'}</span><button class="btn ghost sm" data-action="travel">${icon('plane', 16)} ${st.travelTag ? 'Alterar' : 'Ativar'}</button></div>
    </article>
    <article class="card">
      <header class="card-head"><h2>Segurança</h2></header>
      <p class="muted small">Um PIN de 4 dígitos protege a abertura do app neste aparelho.</p>
      <div class="toolbar"><button class="btn ${st.pinHash ? 'ghost' : 'primary'} sm" data-action="pin-set">${icon('lock', 16)} ${st.pinHash ? 'Trocar PIN' : 'Definir PIN'}</button>
        ${st.pinHash ? `<button class="btn ghost danger sm" data-action="pin-remove">Remover PIN</button>` : ''}</div>
    </article>
    ${cloudCard()}
    <article class="card">
      <header class="card-head"><h2>Dados e backup</h2></header>
      <p class="muted small">Seus dados ficam guardados neste aparelho e, se a sincronização estiver ligada, também na nuvem. Faça backup com frequência.</p>
      <div class="stack">
        <button class="btn ghost" data-action="backup-export">${icon('database', 18)} Exportar backup (JSON)</button>
        <label class="btn ghost file-btn">${icon('upload', 18)} Restaurar backup<input type="file" accept="application/json,.json" data-input="backup-import" hidden></label>
        <button class="btn ghost" data-action="export-csv" data-scope="all">${icon('download', 18)} Exportar todas as transações (CSV)</button>
        <button class="btn ghost" data-action="demo">${icon('sparkles', 18)} Carregar dados de exemplo</button>
        <button class="btn ghost danger" data-action="reset">${icon('rotate-ccw', 18)} Apagar todos os dados</button>
      </div>
    </article>
    <p class="about">Ruffino Finanças · versão 1.1<br>Lilian Ruffino Consultoria Empresarial</p>
  </section>`;
}

export function pinPad(title, onDone, { allowCancel = true } = {}) {
  let digits = '';
  return {
    html: `<div class="pin"><h2 class="sheet-title center">${esc(title)}</h2><div class="pin-dots">${'<i></i>'.repeat(4)}</div>
      <p class="form-error center" role="alert" hidden></p>
      <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((k) => (k === '' ? '<span></span>' : `<button type="button" data-k="${k}" aria-label="${k === 'del' ? 'Apagar' : k}">${k === 'del' ? icon('delete', 22) : k}</button>`)).join('')}</div>
      ${allowCancel ? '<button class="btn ghost" data-cancel>Cancelar</button>' : ''}</div>`,
    mount(root) {
      const dots = root.querySelectorAll('.pin-dots i');
      const err = root.querySelector('.form-error');
      const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < digits.length));
      const press = async (k) => {
        err.hidden = true;
        if (k === 'del') digits = digits.slice(0, -1);
        else if (digits.length < 4) digits += k;
        paint();
        if (digits.length === 4) {
          const ok = await onDone(digits);
          if (ok === false) {
            err.textContent = 'PIN incorreto.';
            err.hidden = false;
            digits = '';
            setTimeout(paint, 150);
          }
        }
      };
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (b) press(b.dataset.k);
        if (e.target.closest('[data-cancel]')) closeSheet();
      });
      const onKey = (e) => {
        if (/^\d$/.test(e.key)) press(e.key);
        if (e.key === 'Backspace') press('del');
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    },
  };
}

on({
  'cat-tab': (el) => ((UI.catTab = el.dataset.v), rerender()),
  'cat-form': (el) => categoryForm(el.dataset.id ? category(el.dataset.id) : null, el.dataset.parent || null),
  theme: (el) => {
    S.settings.theme = el.dataset.v;
    save();
    applyTheme();
    rerender();
  },
  'pin-set': () => {
    let first = null;
    const step = (title) => {
      const p = pinPad(title, async (pin) => {
        if (!first) {
          first = pin;
          step('Confirme o PIN');
          return true;
        }
        if (pin !== first) {
          first = null;
          toast('Os PINs não conferem. Tente de novo.');
          step('Crie um PIN de 4 dígitos');
          return true;
        }
        S.settings.pinHash = await sha256(`ruffino:${pin}`);
        save();
        closeSheet();
        toast('PIN definido.');
        rerender();
        return true;
      });
      openSheet(p.html, { onMount: p.mount });
    };
    step('Crie um PIN de 4 dígitos');
  },
  'pin-remove': async () => {
    if (!(await confirmSheet({ title: 'Remover o PIN?', text: 'O app abrirá sem pedir senha.', options: [{ label: 'Remover', value: 'yes', danger: true }] }))) return;
    S.settings.pinHash = null;
    save();
    rerender();
  },
  'backup-export': async () => {
    await saveFile(`ruffino-financas-backup-${today()}.json`, JSON.stringify(S, null, 1), 'application/json');
    toast('Backup gerado.');
  },
  demo: async () => {
    if (S.transactions.length && !(await confirmSheet({ title: 'Substituir seus dados?', text: 'Os dados de exemplo vão substituir tudo o que está salvo. Exporte um backup antes, se quiser guardar.', options: [{ label: 'Carregar exemplo', value: 'yes', danger: true }] }))) return;
    seedDemo(S.settings.name);
    toast('Dados de exemplo carregados.');
    go('#/');
  },
  reset: async () => {
    if (!(await confirmSheet({ title: 'Apagar todos os dados?', text: 'Contas, cartões, transações, objetivos e configurações serão apagados deste aparelho. Não dá para desfazer.', options: [{ label: 'Apagar tudo', value: 'yes', danger: true }] }))) return;
    resetAll();
    applyTheme();
    location.hash = '#/';
    location.reload();
  },
});

/** Campos de configuração e restauração de backup (eventos "change"). */
export function handleSettingChange(el) {
  if (el.dataset.setting === 'name') S.settings.name = el.value.trim();
  if (['hide', 'autoPay', 'smartAlert'].includes(el.dataset.setting)) S.settings[el.dataset.setting] = el.checked;
  save();
  if (el.dataset.setting === 'autoPay' && el.checked) toast('Pendências vencidas serão efetivadas automaticamente.');
}

export async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('formato');
    const ok = await confirmSheet({ title: 'Restaurar backup?', text: `${data.transactions.length} transações e ${data.accounts.length} contas vão substituir os dados atuais.`, options: [{ label: 'Restaurar', value: 'yes', danger: true }] });
    if (!ok) return;
    replaceState(data);
    applyTheme();
    toast('Backup restaurado.');
    go('#/');
    rerender();
  } catch {
    toast('Arquivo inválido. Escolha um backup exportado pelo app.');
  }
}
