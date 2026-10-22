// Tela e painéis da sincronização com o Supabase (configuração, login, status e conflito).
import { cloudInfo, setCloudConfig, signIn, signUp, signOut, syncNow, setConflictHandler, onCloudChange } from '../sync.js';
import { esc, icon } from '../util.js';
import { on, openSheet, closeSheet, toast, confirmSheet, rerender } from '../ui.js';

const time = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

function statusLine(i) {
  if (!i.signedIn) return '<span class="dot"></span> Desconectado: os dados ficam só neste aparelho';
  if (i.state === 'busy') return '<span class="dot busy"></span> Sincronizando…';
  if (i.state === 'error') return `<span class="dot err"></span> <span>${esc(i.error)}</span>`;
  if (i.dirty) return '<span class="dot busy"></span> Alterações aguardando envio';
  return `<span class="dot on"></span> Sincronizado${i.lastSync ? ` em ${time(i.lastSync)}` : ''}`;
}

/** Cartão da tela Configurações. */
export function cloudCard() {
  const i = cloudInfo();
  return `<article class="card">
    <header class="card-head"><h2>${icon('cloud', 18)} Sincronização na nuvem</h2></header>
    ${!i.configured
      ? `<p class="muted small">Use o mesmo controle no celular, no computador e no APK. Crie um projeto grátis no Supabase, rode o script <b>supabase/schema.sql</b> e informe a URL e a chave pública do projeto.</p>
         <div class="toolbar"><button class="btn primary sm" data-action="cloud-config">${icon('cloud', 16)} Configurar Supabase</button></div>`
      : `<p class="sync-status">${statusLine(i)}</p>
         ${i.signedIn ? `<p class="muted small">Conta: <b>${esc(i.email)}</b>. Cada alteração sobe sozinha; ao abrir o app em outro aparelho, ele baixa a versão mais nova. Comprovantes (fotos/PDF) ficam só no aparelho.</p>` : '<p class="muted small">Entre com a mesma conta em todos os aparelhos.</p>'}
         <div class="toolbar">
           ${i.signedIn
             ? `<button class="btn primary sm" data-action="cloud-sync">${icon('refresh-cw', 16)} Sincronizar agora</button><button class="btn ghost sm" data-action="cloud-logout">${icon('log-out', 16)} Sair</button>`
             : `<button class="btn primary sm" data-action="cloud-login">${icon('mail', 16)} Entrar ou criar conta</button>`}
           ${i.fromEnv ? '' : `<button class="btn ghost sm" data-action="cloud-config">${icon('settings', 16)} Projeto</button>`}
         </div>`}
  </article>`;
}

export function openCloudConfig(after) {
  const i = cloudInfo();
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('cloud', 20)} Projeto Supabase</h2>
    <p class="muted small">No painel do Supabase: <b>Project Settings → API</b>. Copie a <b>Project URL</b> e a chave <b>anon public</b> (nunca use a chave <i>service_role</i> no app).</p>
    <label class="field"><span>Project URL</span><input name="url" inputmode="url" autocomplete="off" placeholder="https://xxxx.supabase.co" value="${esc(i.url)}"></label>
    <label class="field"><span>Chave anon public</span><input name="key" autocomplete="off" placeholder="eyJhbGciOi…"></label>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = f.querySelector('.form-error');
        if (!/^https:\/\/.+/.test(f.url.value.trim()) || f.key.value.trim().length < 20) {
          err.textContent = 'Informe a URL (https://…supabase.co) e a chave anon public.';
          err.hidden = false;
          return;
        }
        await setCloudConfig(f.url.value, f.key.value);
        toast('Projeto salvo.');
        if (after) after();
        else openLogin();
      });
    },
  });
}

/** Login/cadastro. `onDone` roda depois de entrar e sincronizar. */
export function openLogin({ onDone } = {}) {
  if (!cloudInfo().configured) return openCloudConfig(() => openLogin({ onDone }));
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('cloud', 20)} Entrar na nuvem</h2>
    <p class="muted small">Use o mesmo e-mail e senha em todos os seus aparelhos.</p>
    <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required autofocus></label>
    <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions"><button type="button" class="btn ghost" data-signup>Criar conta</button><button class="btn primary">${icon('log-in', 18)} Entrar</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      const err = f.querySelector('.form-error');
      const busy = (b) => f.querySelectorAll('button').forEach((x) => (x.disabled = b));
      const run = async (fn) => {
        err.hidden = true;
        if (!f.email.value.trim() || f.password.value.length < 6) {
          err.textContent = 'Informe o e-mail e uma senha com pelo menos 6 caracteres.';
          err.hidden = false;
          return;
        }
        busy(true);
        try {
          await fn(f.email.value, f.password.value);
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
        } finally {
          busy(false);
        }
      };
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        run(async (email, pass) => {
          await signIn(email, pass);
          closeSheet();
          const i = cloudInfo();
          toast(i.state === 'error' ? i.error : 'Conectado. Dados sincronizados.');
          onDone?.();
          rerender();
        });
      });
      sheet.querySelector('[data-signup]').addEventListener('click', () =>
        run(async (email, pass) => {
          const r = await signUp(email, pass);
          if (r.confirm) {
            err.textContent = 'Conta criada! Abra o link de confirmação que chegou no seu e-mail e depois toque em “Entrar”.';
            err.hidden = false;
            return;
          }
          closeSheet();
          toast('Conta criada e dados enviados para a nuvem.');
          onDone?.();
          rerender();
        }),
      );
    },
  });
}

// conflito: os dois lados mudaram desde a última sincronização
setConflictHandler(async ({ firstTime }) => {
  const choice = await confirmSheet({
    title: firstTime ? 'Já existem dados nesta conta' : 'Os dados mudaram em outro aparelho',
    text: firstTime
      ? 'Este aparelho também tem lançamentos. Qual versão deve valer? A outra será substituída (exporte um backup antes, se quiser guardar).'
      : 'Este aparelho tem alterações que ainda não subiram e a nuvem recebeu outras. Qual versão deve valer?',
    options: [{ label: 'Usar os dados da nuvem', value: 'cloud' }, { label: 'Manter os deste aparelho', value: 'local', danger: true }],
  });
  return choice || 'skip';
});

on({
  'cloud-config': () => openCloudConfig(),
  'cloud-login': () => openLogin(),
  'cloud-sync': async () => {
    await syncNow();
    const i = cloudInfo();
    toast(i.state === 'error' ? i.error : 'Sincronizado.');
  },
  'cloud-logout': async () => {
    const ok = await confirmSheet({ title: 'Sair da nuvem?', text: 'Os dados continuam neste aparelho, mas param de sincronizar até você entrar de novo.', options: [{ label: 'Sair', value: 'yes', danger: true }] });
    if (!ok) return;
    await signOut();
    toast('Sincronização desligada neste aparelho.');
  },
});

onCloudChange((what) => {
  if (what !== 'data' && location.hash === '#/config') rerender();
});
