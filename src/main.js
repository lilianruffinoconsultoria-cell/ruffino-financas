// Ponto de entrada: estrutura da tela, rotas, eventos globais, boas-vindas e bloqueio por PIN.
import './styles.css';
import { S, ensureRecurring, applyAutoPay, seedDemo, startFromScratch } from './store.js';
import { icon, addMonths, thisMonth, sha256, isNative } from './util.js';
import { UI, ACTIONS, on, setRerender, removeSheet, sheetOpen, closeSheet, toast } from './ui.js';
import { applyTheme } from './theme.js';
import { LOGO } from './brand.js';
import './form.js';
import { renderHome } from './views/home.js';
import { renderTransactions } from './views/transactions.js';
import { renderPlanning } from './views/planning.js';
import { renderAccounts, renderCards, renderCardDetail } from './views/accounts.js';
import { renderGoals } from './views/goals.js';
import { renderReports } from './views/reports.js';
import { renderMore, renderCategories, renderSettings, pinPad, handleSettingChange, importBackup } from './views/more.js';
import { renderCalendar } from './views/calendar.js';
import { renderTags } from './views/tags.js';
import { renderImport, handleImportInput } from './views/import.js';
import { renderInstallments } from './views/installments.js';
import { initCloud, onCloudChange } from './sync.js';
import { openLogin } from './views/cloud.js';

const ROUTES = [
  [/^#?\/?$/, renderHome, 'home'],
  [/^#\/transacoes$/, renderTransactions, 'tx'],
  [/^#\/planejamento$/, renderPlanning, 'plan'],
  [/^#\/relatorios$/, renderReports, 'reports'],
  [/^#\/mais$/, renderMore, 'more'],
  [/^#\/contas$/, renderAccounts, 'more'],
  [/^#\/cartoes$/, renderCards, 'more'],
  [/^#\/cartao\/([\w-]+)$/, renderCardDetail, 'more'],
  [/^#\/objetivos$/, renderGoals, 'more'],
  [/^#\/categorias$/, renderCategories, 'more'],
  [/^#\/config$/, renderSettings, 'more'],
  [/^#\/calendario$/, renderCalendar, 'more'],
  [/^#\/tags$/, renderTags, 'more'],
  [/^#\/importar$/, renderImport, 'more'],
  [/^#\/parcelamentos$/, renderInstallments, 'inst'],
];

const NAV = [
  ['#/', 'house', 'Início', 'home'],
  ['#/transacoes', 'arrow-left-right', 'Transações', 'tx'],
  ['#/planejamento', 'target', 'Planejamento', 'plan'],
  ['#/relatorios', 'chart-pie', 'Relatórios', 'reports'],
  ['#/mais', 'ellipsis', 'Mais', 'more'],
  ['#/parcelamentos', 'handshake', 'Parcelamentos', 'inst'],
];

const app = document.getElementById('app');

function shell() {
  const tab = (n) => `<a href="${n[0]}" data-tab="${n[3]}">${icon(n[1], 22)}<span>${n[2]}</span></a>`;
  return `<div class="shell">
    <aside class="side">
      <a class="brand" href="#/">${LOGO}<span><b>Ruffino</b><em>Finanças</em></span></a>
      <button class="btn primary block" data-action="quick-add">${icon('plus', 18)} Novo lançamento</button>
      <nav aria-label="Principal">${[NAV[0], NAV[1], NAV[5], NAV[2], NAV[3], NAV[4]].map((n) => `<a href="${n[0]}" data-tab="${n[3]}">${icon(n[1], 20)}<span>${n[2]}</span></a>`).join('')}</nav>
      <p class="side-foot">Lilian Ruffino<br>Consultoria Empresarial</p>
    </aside>
    <main id="view" class="view" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Principal">${tab(NAV[0])}${tab(NAV[1])}
      <button class="fab" data-action="quick-add" aria-label="Novo lançamento">${icon('plus', 28)}</button>
      ${tab(NAV[5])}${tab(NAV[4])}</nav>
  </div>`;
}

function render({ keepScroll = false } = {}) {
  const view = document.getElementById('view');
  if (!view) return;
  const hash = location.hash || '#/';
  let match = null;
  const route = ROUTES.find(([re]) => (match = hash.match(re))) || ROUTES[0];
  const [, fn, tab] = route;
  ensureRecurring(UI.month > thisMonth() ? UI.month : addMonths(thisMonth(), 1));
  applyAutoPay();

  const active = document.activeElement;
  const inputKey = active?.dataset?.input;
  const caret = inputKey ? active.selectionStart : null;
  const y = window.scrollY;

  view.innerHTML = fn(match?.[1]);
  document.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));

  if (inputKey) {
    const again = view.querySelector(`[data-input="${inputKey}"]`);
    if (again) {
      again.focus({ preventScroll: true });
      if (caret != null) again.setSelectionRange?.(caret, caret);
    }
  }
  window.scrollTo(0, keepScroll ? y : 0);
}
setRerender(() => render({ keepScroll: true }));

// ---------- ações globais ----------
on({
  month: (el) => {
    const step = Number(el.dataset.step);
    UI.month = step === 0 ? thisMonth() : addMonths(UI.month, step);
    render({ keepScroll: true });
  },
  scope: (el) => {
    UI.scope = el.dataset.v;
    render({ keepScroll: true });
  },
  'toggle-hide': () => {
    UI.hide = !UI.hide;
    render({ keepScroll: true });
  },
});

document.addEventListener('click', (e) => {
  if (e.target.matches?.('[data-sheet-close]')) return closeSheet();
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'BUTTON') e.preventDefault();
  fn(el, e);
});

document.addEventListener('input', (e) => {
  if (e.target.dataset?.input === 'tx-query') {
    UI.txQuery = e.target.value;
    render({ keepScroll: true });
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.setting) handleSettingChange(el);
  if (el.dataset?.input?.startsWith('import-')) handleImportInput(el);
  if (el.dataset?.input === 'backup-import' && el.files?.[0]) {
    importBackup(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen()) closeSheet();
});

window.addEventListener('popstate', () => sheetOpen() && removeSheet());

// ---------- telas de entrada ----------
function showOnboarding() {
  app.innerHTML = `<div class="onboard">
    <div class="ob-logo">${LOGO}</div>
    <h1>Ruffino <span>Finanças</span></h1>
    <p class="lead">Controle de gastos, cartões, planejamento e metas, com o método da Lilian Ruffino Consultoria.</p>
    <ul class="ob-feats">
      <li>${icon('credit-card', 20)}<span>Contas e cartões com faturas automáticas</span></li>
      <li>${icon('target', 20)}<span>Planejamento mensal por categoria</span></li>
      <li>${icon('briefcase', 20)}<span>Separação entre finanças pessoais e da empresa</span></li>
      <li>${icon('chart-column', 20)}<span>DRE do mês e relatórios</span></li>
    </ul>
    <label class="field"><span>Como podemos te chamar?</span><input id="ob-name" maxlength="30" placeholder="Seu nome" autocomplete="given-name"></label>
    <button class="btn primary block" data-ob="scratch">Começar do zero</button>
    <button class="btn ghost block" data-ob="demo">Explorar com dados de exemplo</button>
    <button class="btn ghost block" data-ob="cloud">${icon('cloud', 18)} Já uso em outro aparelho</button>
    <p class="small muted center">${icon('lock', 14)} Seus dados ficam no aparelho. A sincronização na nuvem é opcional.</p>
  </div>`;
  app.querySelectorAll('[data-ob]').forEach((b) =>
    b.addEventListener('click', () => {
      const name = document.getElementById('ob-name').value.trim();
      if (b.dataset.ob === 'cloud') {
        openLogin({ onDone: () => !S.settings.onboarded && toast('Nenhum dado na nuvem para esta conta ainda: comece do zero e eles serão enviados.') });
        return;
      }
      if (b.dataset.ob === 'demo') seedDemo(name);
      else startFromScratch(name);
      location.hash = '#/';
      start();
    }),
  );
}

function showLock() {
  const pad = pinPad('Digite seu PIN', async (pin) => {
    if ((await sha256(`ruffino:${pin}`)) !== S.settings.pinHash) return false;
    cleanup?.();
    start();
    return true;
  }, { allowCancel: false });
  app.innerHTML = `<div class="lock"><div class="ob-logo sm">${LOGO}</div>${pad.html}</div>`;
  const cleanup = pad.mount(app.querySelector('.lock'));
}

let cloudStarted = false;
function start() {
  app.innerHTML = shell();
  render();
  if (!cloudStarted) {
    cloudStarted = true;
    initCloud();
  }
}
/** Entra no app respeitando o PIN (usado também quando os dados chegam da nuvem). */
function enter() {
  if (sheetOpen()) removeSheet();
  location.hash = '#/';
  if (S.settings.pinHash) showLock();
  else start();
}
// dados novos vindos de outro aparelho: aplica tema e redesenha (ou entra, se ainda estava na boas-vindas)
onCloudChange((what) => {
  if (what !== 'data') return;
  applyTheme();
  if (document.getElementById('view')) render({ keepScroll: true });
  else if (S.settings.onboarded && !document.querySelector('.lock')) enter();
})

window.addEventListener('hashchange', () => {
  if (sheetOpen()) removeSheet();
  render();
});

applyTheme();
if (!S.settings.onboarded) showOnboarding();
else if (S.settings.pinHash) showLock();
else start();

if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNative() && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
