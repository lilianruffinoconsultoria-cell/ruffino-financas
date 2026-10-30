// Menu "Mais", gestão de categorias e configurações (tema, PIN, backup, dados de exemplo).
import { flushNow, cloudInfo } from '../sync.js';
import { S, save, replaceState, resetAll, seedDemo, category, categoryLabel, categoriesOf, subcategoriesOf, COLORS, CATEGORY_TYPES, NEUTRAL_TYPES, HOME_BLOCKS, defaultHomeBlocks, homeBlockOn, homeBlocksOrdered } from '../store.js';
import { esc, icon, uid, today, saveFile, sha256, money, round2, PICKABLE_ICONS, FEATURES } from '../util.js';
import { UI, pageHead, catBadge, on, rerender, openSheet, closeSheet, toast, confirmSheet, go } from '../ui.js';
import { transactionsCsv } from './reports.js';
import { applyTheme } from '../theme.js';
import { cloudCard } from './cloud.js';

// cópia dos dados de antes da última restauração de backup (para desfazer); fica só na memória, vale até fechar o app
let undoRestore = null;
try {
  localStorage.removeItem('ruffino-financas:antes-restaurar'); // chave antiga: a cópia não fica mais no navegador
} catch {
  /* sem armazenamento */
}

const MENU = [
  ['#/contas', 'landmark', 'Contas', 'Saldos, reajuste, arquivar e mover lançamentos'],
  ['#/cartoes', 'credit-card', 'Cartões de crédito', 'Faturas, compras parceladas, estorno e antecipação'],
  ['#/planejamento', 'target', 'Planejamento', 'Limites do mês por categoria e alertas'],
  ['#/objetivos', 'piggy-bank', 'Objetivos', 'Metas de economia com prazo'],
  ['#/relatorios', 'chart-column', 'Relatórios', 'DRE do mês, comparativos e evolução'],
  ['#/tags', 'tag', 'Tags e modo viagem', 'Totais por tag e viagem automática'],
  ['#/categorias', 'palette', 'Categorias', 'Subcategorias, ícones, cores e arquivo'],
  ['#/importar', 'upload', 'Importar extrato', 'Arquivo OFX ou CSV do banco'],
  ['#/personalizar-inicio', 'layout-dashboard', 'Personalizar tela inicial', 'Escolha o que aparece no Início'],
  ['#/config', 'settings', 'Configurações', 'Tema, senha, backup e automações'],
];

export function renderMore() {
  return `<section>
    <header class="page-head"><h1>Mais</h1></header>
    ${FEATURES.bankPaste ? `<button class="consult capture" data-action="capture"><span class="menu-ic gold">${icon('sparkles', 22)}</span><span><b>Lançar pela notificação ou SMS</b><small>Cole a mensagem do banco e o lançamento sai preenchido</small></span></button>` : ''}
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
        const ids = new Set([c.id, ...subs.map((s) => s.id)]);
        const n = S.transactions.filter((t) => ids.has(t.categoryId)).length;
        const extra = `${subs.length ? `As ${subs.length} subcategoria(s) também serão excluídas. ` : ''}Se quiser manter o histórico separado, prefira arquivar.`;
        let dest = null;
        if (n) dest = await pickDestination(c, { ids, n, extra, parent: isSub ? parent : null });
        else if (!(await confirmSheet({ title: `Excluir “${c.name}”?`, text: extra, options: [{ label: 'Excluir', value: 'yes', danger: true }] }))) return;
        if (n && !dest) return;
        for (const t of S.transactions) if (ids.has(t.categoryId)) t.categoryId = dest;
        S.categories = S.categories.filter((x) => !ids.has(x.id));
        for (const plan of Object.values(S.budgetMonths)) for (const id of ids) delete plan.cats[id];
        save();
        const what = isSub ? 'Subcategoria excluída' : 'Categoria excluída';
        toast(n ? `${what} e ${n} lançamento(s) movido(s) para “${categoryLabel(dest)}”.` : `${what}.`);
        rerender();
      });
    },
  });
}

/**
 * Pergunta para qual categoria vão os lançamentos da categoria excluída (mesmo tipo; subcategorias
 * de outras categorias também valem). Resolve com o id escolhido ou null se cancelar.
 */
function pickDestination(c, { ids, n, extra, parent }) {
  const opts = categoriesOf(c.type)
    .filter((x) => !ids.has(x.id))
    .flatMap((x) => [x, ...subcategoriesOf(x.id).filter((s) => !ids.has(s.id))]);
  const def = parent?.id || opts.find((x) => x.name === 'Outros' && !x.parentId)?.id || opts[0]?.id;
  return new Promise((resolve) => {
    openSheet(`<form class="tx-form"><h2 class="sheet-title">Excluir “${esc(c.name)}”?</h2>
      <p class="muted">${n} lançamento(s) usam ${c.parentId ? 'esta subcategoria' : 'esta categoria'}${c.parentId ? '' : ' ou as subcategorias dela'}. Escolha para onde eles vão.</p>
      <label class="field"><span>Mover os lançamentos para</span><select name="dest">${opts.map((x) => `<option value="${x.id}" ${x.id === def ? 'selected' : ''}>${esc(categoryLabel(x.id))}${x.id === parent?.id ? ' (categoria mãe)' : ''}</option>`).join('')}</select></label>
      <p class="hint">${esc(extra)}</p>
      <div class="stack"><button class="btn danger">${icon('trash-2', 18)} Mover e excluir</button><button type="button" class="btn ghost" data-cancel>Cancelar</button></div></form>`, {
      onMount(sheet) {
        let chosen = null;
        const f = sheet.querySelector('form');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          chosen = f.dest.value || null;
          closeSheet();
        });
        sheet.querySelector('[data-cancel]').addEventListener('click', () => closeSheet());
        return () => resolve(chosen);
      },
    });
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
      <header class="card-head"><h2>Calendário</h2></header>
      <label class="switch-row"><span>Abrir A pagar e receber em modo calendário</span><input type="checkbox" role="switch" data-setting="payablesView" ${st.payablesView === 'calendar' ? 'checked' : ''}></label>
    </article>
    <article class="card">
      <header class="card-head"><h2>Empresa</h2></header>
      <label class="switch-row"><span>Usar também finanças da empresa <small class="muted">(mostra Pessoal/Empresa em contas, cartões e filtros)</small></span><input type="checkbox" role="switch" data-setting="business" ${st.business ? 'checked' : ''}></label>
    </article>
    <article class="card">
      <header class="card-head"><h2>Automações</h2></header>
      <label class="switch-row"><span>Efetivar automaticamente <small class="muted">(despesas pendentes viram pagas no vencimento; valores a receber continuam em aberto)</small></span><input type="checkbox" role="switch" data-setting="autoPay" ${st.autoPay ? 'checked' : ''}></label>
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
      <p class="muted small">Seus dados ficam na sua conta (nuvem). Os comprovantes (fotos/PDF) ainda NÃO vão para a nuvem: ficam só neste aparelho. Faça backup com frequência.</p>
      <div class="stack">
        <button class="btn ghost" data-action="backup-export">${icon('database', 18)} Exportar backup (JSON)</button>
        <label class="btn ghost file-btn">${icon('upload', 18)} Restaurar backup<input type="file" accept="application/json,.json" data-input="backup-import" hidden></label>
        ${undoRestoreButton()}
        <button class="btn ghost" data-action="export-csv" data-scope="all">${icon('download', 18)} Exportar todas as transações (CSV)</button>
        <button class="btn ghost" data-action="demo">${icon('sparkles', 18)} Carregar dados de exemplo</button>
        <button class="btn ghost danger" data-action="reset">${icon('rotate-ccw', 18)} Apagar todos os dados</button>
      </div>
    </article>
    <p class="about">Ruffino Finanças · versão 1.1<br>Lilian Ruffino Consultoria Empresarial</p>
  </section>`;
}

// ---------- personalizar a tela inicial ----------
export function renderHomeBlocks() {
  const list = homeBlocksOrdered();
  return `<section>
    ${pageHead('Personalizar tela inicial', { back: '#/mais' })}
    <article class="card">
      <p class="muted small">Escolha o que aparece no Início e use ↑ ↓ para mudar a ordem. A lista segue a ordem da tela.</p>
      <div class="toolbar"><button class="btn ghost sm" data-action="home-all">${icon('check', 16)} Mostrar tudo</button>
        <button class="btn ghost sm" data-action="home-reset">${icon('rotate-ccw', 16)} Restaurar padrão</button></div>
      <ul class="hb-list">${list.map(([key, name, desc], i) => `<li class="hb-row">
        <label class="switch-row"><span>${name} <small class="muted">(${desc})</small></span><input type="checkbox" role="switch" data-setting="homeBlock" data-key="${key}" ${homeBlockOn(key) ? 'checked' : ''}></label>
        <span class="hb-move"><button class="icon-btn" data-action="home-move" data-key="${key}" data-dir="-1" aria-label="Subir ${name}" ${i === 0 ? 'disabled' : ''}>${icon('arrow-up', 18)}</button><button class="icon-btn" data-action="home-move" data-key="${key}" data-dir="1" aria-label="Descer ${name}" ${i === list.length - 1 ? 'disabled' : ''}>${icon('arrow-down', 18)}</button></span></li>`).join('')}</ul>
    </article>
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

/** Confere o PIN atual (mesmo hash do desbloqueio) antes de trocar ou remover. */
function askCurrentPin(title, next) {
  const p = pinPad(title, async (pin) => {
    if ((await sha256(`ruffino:${pin}`)) !== S.settings.pinHash) return false;
    next();
    return true;
  });
  openSheet(p.html, { onMount: p.mount });
}

/** Cria (ou troca) o PIN: digita duas vezes. */
function newPin() {
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
  step(S.settings.pinHash ? 'Crie o novo PIN de 4 dígitos' : 'Crie um PIN de 4 dígitos');
}

on({
  'home-all': () => {
    S.settings.homeBlocks = Object.fromEntries(HOME_BLOCKS.map(([k]) => [k, true]));
    save();
    rerender();
  },
  'home-reset': () => {
    S.settings.homeBlocks = defaultHomeBlocks();
    delete S.settings.homeOrder;
    save();
    toast('Tela inicial no padrão.');
    rerender();
  },
  // troca o bloco de lugar com o vizinho e devolve o foco ao mesmo botão (ou ao outro, se chegou na ponta)
  'home-move': (el) => {
    const order = homeBlocksOrdered().map(([k]) => k);
    const i = order.indexOf(el.dataset.key);
    const j = i + Number(el.dataset.dir);
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    S.settings.homeOrder = order;
    save();
    rerender();
    const sel = (d) => document.querySelector(`[data-action="home-move"][data-key="${el.dataset.key}"][data-dir="${d}"]`);
    const b = sel(el.dataset.dir);
    (b && !b.disabled ? b : sel(-Number(el.dataset.dir)))?.focus();
  },
  'cat-tab': (el) => ((UI.catTab = el.dataset.v), rerender()),
  'cat-form': (el) => categoryForm(el.dataset.id ? category(el.dataset.id) : null, el.dataset.parent || null),
  theme: (el) => {
    S.settings.theme = el.dataset.v;
    save();
    applyTheme();
    rerender();
  },
  'pin-set': () => (S.settings.pinHash ? askCurrentPin('Digite o PIN atual', newPin) : newPin()),
  'pin-remove': () =>
    askCurrentPin('Digite o PIN atual para remover', () => {
      S.settings.pinHash = null;
      save();
      closeSheet();
      toast('PIN removido. O app abrirá sem pedir senha.');
      rerender();
    }),
  'backup-undo': async () => {
    const saved = undoRestore;
    if (!saved?.data) return toast('Não há restauração para desfazer.');
    const ok = await confirmSheet({ title: 'Desfazer a restauração?', text: 'Voltar aos dados de antes da restauração? Os dados atuais serão substituídos.', options: [{ label: 'Desfazer restauração', value: 'yes', danger: true }] });
    if (!ok) return;
    replaceState(saved.data);
    undoRestore = null;
    applyTheme();
    toast('Restauração desfeita.');
    go('#/');
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
    const cloud = cloudInfo().cloudOnly;
    if (!(await confirmSheet({ title: 'Apagar todos os dados?', text: cloud ? 'Contas, cartões, transações, objetivos e configurações serão apagados da sua conta. Não dá para desfazer.' : 'Contas, cartões, transações, objetivos e configurações serão apagados deste aparelho. Não dá para desfazer.', options: [{ label: 'Apagar tudo', value: 'yes', danger: true }] }))) return;
    const before = cloud ? JSON.parse(JSON.stringify(S)) : null;
    resetAll();
    if (cloud && !(await flushNow())) {
      // a conta não foi alcançada: devolve os dados e não apaga nada
      replaceState(before);
      applyTheme();
      rerender();
      return toast('Não foi possível apagar: sem conexão com a sua conta. Nada foi apagado.');
    }
    applyTheme();
    location.hash = '#/';
    location.reload();
  },
});

/** Campos de configuração e restauração de backup (eventos "change"). */
export function handleSettingChange(el) {
  if (el.dataset.setting === 'autoPay' && el.checked) return confirmAutoPay(el);
  if (el.dataset.setting === 'name') S.settings.name = el.value.trim();
  if (['hide', 'autoPay', 'smartAlert', 'business'].includes(el.dataset.setting)) S.settings[el.dataset.setting] = el.checked;
  if (el.dataset.setting === 'homeBlock') S.settings.homeBlocks = { ...S.settings.homeBlocks, [el.dataset.key]: el.checked };
  if (el.dataset.setting === 'payablesView') S.settings.payablesView = el.checked ? 'calendar' : 'list';
  save();
}

/** O que a efetivação automática baixaria agora (mesmo critério do applyAutoPay do store). */
export function autoPayPreview(list = S.transactions, t0 = today()) {
  const items = list.filter((t) => !t.paid && !t.cardId && (t.type === 'expense' || t.type === 'transfer') && t.date <= t0);
  return { count: items.length, total: round2(items.reduce((s, t) => s + (Number(t.amount) || 0), 0)) };
}

/** Ao ligar a efetivação automática: mostra a prévia e só grava se a usuária confirmar. */
async function confirmAutoPay(el) {
  const { count, total } = autoPayPreview();
  const ok = await confirmSheet({
    title: 'Ligar a efetivação automática?',
    text: `${count
      ? `Agora ${count} lançamento(s) pendente(s) (despesas e transferências fora do cartão, com data até hoje) serão marcados como pagos, somando ${money(total)}.`
      : 'Nenhuma despesa pendente vence até hoje; as próximas serão marcadas como pagas no vencimento.'} Valores a receber nunca são baixados sozinhos: continuam em aberto até você registrar o recebimento.`,
    options: [{ label: 'Ligar e efetivar', value: 'yes' }],
  });
  if (!ok) {
    el.checked = false;
    return;
  }
  S.settings.autoPay = true;
  save();
  toast(count ? `Efetivação automática ligada: ${count} lançamento(s) marcado(s) como pago(s).` : 'Efetivação automática ligada.');
  rerender(); // o render aplica o applyAutoPay
}

/** Botão para desfazer a última restauração, se a cópia de antes ainda estiver na memória. */
function undoRestoreButton() {
  try {
    const saved = undoRestore;
    if (!saved?.at) return '';
    const d = new Date(saved.at);
    const p = (n) => String(n).padStart(2, '0');
    const when = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    return `<button class="btn ghost" data-action="backup-undo">${icon('rotate-ccw', 18)} Desfazer restauração de ${when}</button>`;
  } catch {
    return '';
  }
}

export async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('formato');
    const ok = await confirmSheet({ title: 'Restaurar backup?', text: `${data.transactions.length} transações e ${data.accounts.length} contas vão substituir os dados atuais. Os dados atuais ficam guardados até você fechar o app e dá para desfazer em Configurações.`, options: [{ label: 'Restaurar', value: 'yes', danger: true }] });
    if (!ok) return;
    // guarda a cópia de antes, para desfazer a restauração
    undoRestore = { at: new Date().toISOString(), data: JSON.parse(JSON.stringify(S)) };
    replaceState(data);
    applyTheme();
    toast('Backup restaurado. Para voltar, use “Desfazer restauração” em Configurações.');
    go('#/');
    rerender();
  } catch {
    toast('Arquivo inválido. Escolha um backup exportado pelo app.');
  }
}
