// Ponto de entrada: estrutura da tela, rotas, eventos globais, boas-vindas e bloqueio por PIN.
import './styles.css';
import { S, ensureRecurring, applyAutoPay, seedDemo, startFromScratch } from './store.js';
import { icon, esc, addMonths, thisMonth, sha256, isNative, maskMoney } from './util.js';
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
import { renderMore, renderCategories, renderSettings, renderHomeBlocks, pinPad, handleSettingChange, importBackup } from './views/more.js';
import { renderTags } from './views/tags.js';
import { renderImport, handleImportInput } from './views/import.js';
import { renderPayables, handlePayablesInput } from './views/payables.js';
import { initCloud, onCloudChange, cloudConfigured, cloudInfo, signIn, signUp, resetPassword, syncNow, sessionFromLink } from './sync.js';
import { openLogin, openNewPassword } from './views/cloud.js';

const ROUTES = [
  [/^#?\/?$/, renderHome, 'home'],
  [/^#\/transacoes$/, renderTransactions, 'tx'],
  [/^#\/pagar-receber$/, renderPayables, 'pay'],
  [/^#\/planejamento$/, renderPlanning, 'plan'],
  [/^#\/relatorios$/, renderReports, 'reports'],
  [/^#\/mais$/, renderMore, 'more'],
  [/^#\/contas$/, renderAccounts, 'more'],
  [/^#\/cartoes$/, renderCards, 'more'],
  [/^#\/cartao\/([\w-]+)$/, renderCardDetail, 'more'],
  [/^#\/objetivos$/, renderGoals, 'more'],
  [/^#\/categorias$/, renderCategories, 'more'],
  [/^#\/config$/, renderSettings, 'more'],
  [/^#\/personalizar-inicio$/, renderHomeBlocks, 'more'],
  [/^#\/tags$/, renderTags, 'more'],
  [/^#\/importar$/, renderImport, 'more'],
  [/^#\/(parcelamentos)$/, renderPayables, 'pay'], // a antiga aba virou a visão Parcelamentos
  [/^#\/calendario$/, renderCalendarAlias, 'pay'], // o calendário único fica em A pagar e receber
];

/** Rota antiga #/calendario: abre A pagar e receber na visão calendário. */
function renderCalendarAlias() {
  S.settings.payablesView = 'calendar';
  history.replaceState(null, '', '#/pagar-receber');
  return renderPayables();
}

// [rota, ícone, nome, aba, nome curto na barra inferior]
const NAV = [
  ['#/', 'house', 'Início', 'home'],
  ['#/transacoes', 'arrow-left-right', 'Transações', 'tx'],
  ['#/planejamento', 'target', 'Planejamento', 'plan', 'Planejar'],
  ['#/relatorios', 'chart-pie', 'Relatórios', 'reports'],
  ['#/mais', 'ellipsis', 'Mais', 'more'],
  ['#/pagar-receber', 'calendar-clock', 'A pagar e receber', 'pay', 'A pagar'],
];

const app = document.getElementById('app');

function shell() {
  const tab = (n) => `<a href="${n[0]}" data-tab="${n[3]}">${icon(n[1], 22)}<span>${n[4] || n[2]}</span></a>`;
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
      ${tab(NAV[5])}${tab(NAV[2])}${tab(NAV[4])}</nav>
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

// ---------- máscara de dinheiro (centavos) ----------
// Vale para todo <input inputmode="decimal"> (exceto data-nomask). Roda na captura, antes dos
// listeners do próprio formulário, para que eles já leiam o valor formatado.
const moneyInput = (el) => el?.matches?.('input[inputmode="decimal"]:not([data-nomask])');
const setMasked = (el, text) => {
  el.value = text;
  const end = text.length;
  el.setSelectionRange?.(end, end);
};
document.addEventListener(
  'input',
  (e) => {
    const el = e.target;
    if (!moneyInput(el)) return;
    // colar/autocompletar (ou teclado que insere o texto inteiro, ex.: "1.500,00") lê o texto como reais
    const whole = /^insertFrom|Replacement/.test(e.inputType || '') || (e.data && e.data.length > 1 && /[,.]/.test(e.data));
    setMasked(el, whole ? maskMoney(e.data || el.value, true) : maskMoney(el.value));
  },
  true,
);
document.addEventListener(
  'paste',
  (e) => {
    const el = e.target;
    if (!moneyInput(el)) return;
    const text = e.clipboardData?.getData('text') || '';
    e.preventDefault();
    if (!/\d/.test(text)) return;
    setMasked(el, maskMoney(text, true));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  true,
);

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.setting) handleSettingChange(el);
  if (el.dataset?.input?.startsWith('import-')) handleImportInput(el);
  if (el.dataset?.input === 'pr-period') handlePayablesInput(el);
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
// nome informado no cadastro que exigiu confirmação por e-mail (usado no primeiro login dessa conta)
const PENDING_KEY = 'ruffino-financas:pending-name';
function pendingName(email, set) {
  try {
    if (set) return localStorage.setItem(PENDING_KEY, JSON.stringify({ email: email.toLowerCase(), name: set }));
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    return p && p.email === email.toLowerCase() ? p.name : '';
  } catch {
    return '';
  }
}

/** Entra no app já com os dados em S (conta nova ou sem dados na nuvem) e sobe para a conta. */
async function startAccount(name) {
  startFromScratch(name);
  location.hash = '#/';
  start();
  await syncNow();
}

/** Boas-vindas com cadastro/login. `tab`: 'login' | 'signup'. */
function showOnboarding({ tab = 'login', email = '', notice = '' } = {}) {
  if (!cloudConfigured()) return showOnboardingLocal();
  const login = tab === 'login';
  app.innerHTML = `<div class="onboard">
    <div class="ob-logo">${LOGO}</div>
    <h1>Ruffino <span>Finanças</span></h1>
    <p class="lead">Controle de gastos, cartões, planejamento e metas, com o método da Lilian Ruffino Consultoria.</p>
    <div class="seg two ob-tabs" role="tablist">
      <button type="button" role="tab" class="seg-btn${login ? ' on' : ''}" data-tab-ob="login" aria-selected="${login}">Entrar</button>
      <button type="button" role="tab" class="seg-btn${login ? '' : ' on'}" data-tab-ob="signup" aria-selected="${!login}">Criar conta</button>
    </div>
    <form class="ob-form" novalidate>
      ${notice ? `<p class="ob-notice" role="status">${icon('mail', 16)}<span>${esc(notice)}</span></p>` : ''}
      ${login ? '' : '<label class="field"><span>Como podemos te chamar?</span><input id="ob-name" name="name" maxlength="30" placeholder="Seu nome" autocomplete="given-name"></label>'}
      <label class="field"><span>E-mail</span><input name="email" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" value="${esc(email)}"></label>
      <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? 'Sua senha' : 'Mínimo de 6 caracteres'}"></label>
      ${login ? '' : '<p class="small muted">Use pelo menos 6 caracteres. Seus dados ficam salvos neste e-mail.</p>'}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" data-submit>${login ? 'Entrar' : 'Criar conta'}</button>
      ${login ? '<button type="button" class="ob-link center" data-forgot>Esqueci minha senha</button>' : ''}
    </form>
  </div>`;

  const form = app.querySelector('.ob-form');
  const err = form.querySelector('.form-error');
  const btn = form.querySelector('[data-submit]');
  const showErr = (msg) => ((err.textContent = msg), (err.hidden = !msg));
  const busy = (on, label) => {
    form.querySelectorAll('button').forEach((b) => (b.disabled = on));
    btn.textContent = on ? label : login ? 'Entrar' : 'Criar conta';
  };

  app.querySelectorAll('[data-tab-ob]').forEach((b) =>
    b.addEventListener('click', () => b.dataset.tabOb !== tab && showOnboarding({ tab: b.dataset.tabOb, email: form.email.value })),
  );

  form.querySelector('[data-forgot]')?.addEventListener('click', async () => {
    if (!form.email.value.trim()) return showErr('Digite seu e-mail acima para receber o link de nova senha.');
    showErr('');
    busy(true, 'Enviando…');
    try {
      await resetPassword(form.email.value);
      toast('Enviamos o link para redefinir a senha. Confira seu e-mail.');
    } catch (e) {
      showErr(e.message);
    } finally {
      busy(false);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mail = form.email.value.trim();
    const pass = form.password.value;
    // form.name é o atributo "name" do próprio <form> quando não há campo de nome (aba Entrar)
    const name = form.elements.namedItem('name')?.value.trim() || '';
    if (!/^\S+@\S+\.\S+$/.test(mail)) return showErr('Informe um e-mail válido.');
    if (pass.length < 6) return showErr(login ? 'Informe sua senha (mínimo de 6 caracteres).' : 'A senha precisa ter pelo menos 6 caracteres.');
    showErr('');
    busy(true, login ? 'Entrando…' : 'Criando…');
    try {
      if (login) {
        await signIn(mail, pass);
        const i = cloudInfo();
        // com dados na nuvem, onCloudChange('data') já entrou no app; aqui só falta o caso da conta vazia
        if (!S.settings.onboarded) {
          if (i.state === 'error') throw new Error(i.error);
          await startAccount(name || pendingName(mail));
        }
      } else {
        const r = await signUp(mail, pass);
        if (r.confirm) {
          if (name) pendingName(mail, name);
          return showOnboarding({ tab: 'login', email: mail, notice: `Enviamos um link para ${mail}. Confirme e depois entre aqui.` });
        }
        await startAccount(name);
      }
    } catch (ex) {
      busy(false);
      showErr(ex.message);
    }
  });
}

/** Tela antiga, sem conta (build sem Supabase). */
function showOnboardingLocal() {
  app.innerHTML = `<div class="onboard">
    <div class="ob-logo">${LOGO}</div>
    <h1>Ruffino <span>Finanças</span></h1>
    <p class="lead">Controle de gastos, cartões, planejamento e metas, com o método da Lilian Ruffino Consultoria.</p>
    <ul class="ob-feats">
      <li>${icon('credit-card', 20)}<span>Contas e cartões com faturas automáticas</span></li>
      <li>${icon('target', 20)}<span>Planejamento mensal por categoria</span></li>
      <li>${icon('wallet', 20)}<span>Suas finanças pessoais num só lugar</span></li>
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
  app.innerHTML = `<div class="lock"><div class="ob-logo sm">${LOGO}</div>${pad.html}
    <p class="small muted center">Esqueceu o PIN? Entre com sua conta (e-mail e senha) em outro aparelho ou reinstale o app — seus dados ficam salvos na nuvem.</p></div>`;
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
// links do e-mail: o Supabase devolve os tokens na URL (#access_token=...&type=signup|recovery) e a limpa ao ler;
// se o link já foi usado ou venceu, volta com #error_code=... (limpamos aqui e avisamos)
const link = new URLSearchParams(location.hash.slice(1));
const linkType = link.get('access_token') ? link.get('type') : null;
const linkError = link.get('error_code');
if (linkError) history.replaceState(null, '', location.pathname + location.search);
const LINK_ERROR =
  linkError === 'otp_expired'
    ? 'Este link já foi usado ou venceu. Se você já confirmou o e-mail, é só entrar com e-mail e senha.'
    : 'Não foi possível usar o link do e-mail. Entre com e-mail e senha ou peça um link novo.';

if (!S.settings.onboarded) showOnboarding(linkError ? { notice: LINK_ERROR } : {});
else if (S.settings.pinHash) showLock();
else start();
if (linkError && S.settings.onboarded) toast(LINK_ERROR);

if (linkType === 'recovery')
  sessionFromLink().then((ok) => {
    if (!ok) return toast('O link de nova senha expirou. Peça outro em “Esqueci minha senha”.');
    // aparelho ainda sem dados: depois da senha nova, baixa a conta (onCloudChange('data') entra no app)
    openNewPassword({ onDone: () => !S.settings.onboarded && syncNow() });
  });
else if (linkType && !S.settings.onboarded)
  // confirmação do cadastro: já entra na conta; sem dados na nuvem, começa do zero com o nome do cadastro
  sessionFromLink().then(async (ok) => {
    if (!ok) return;
    await syncNow();
    if (!S.settings.onboarded) startAccount(pendingName(cloudInfo().email || ''));
  });

if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNative() && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
