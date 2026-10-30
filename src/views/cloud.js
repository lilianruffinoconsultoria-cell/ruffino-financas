// Tela e painéis da sincronização com o Supabase (configuração, login, status e conflito).
import { cloudInfo, setCloudConfig, signIn, signUp, signOut, syncNow, flushNow, setConflictHandler, setLegacyHandler, onCloudChange, updatePassword } from '../sync.js';
import { readLegacyData } from '../store.js';
import { esc, icon, saveFile, today } from '../util.js';
import { on, openSheet, closeSheet, toast, confirmSheet, rerender } from '../ui.js';

const time = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

function statusLine(i) {
  if (!i.signedIn) return i.cloudOnly ? '<span class="dot"></span> Desconectado: entre na sua conta para ver e salvar seus dados' : '<span class="dot"></span> Desconectado: os dados ficam só neste aparelho';
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
         ${i.signedIn ? `<p class="muted small">Conta: <b>${esc(i.email)}</b>. Seus dados ficam na sua conta: cada alteração sobe sozinha e, em outro aparelho, o app mostra a versão mais nova. Atenção: comprovantes (fotos/PDF) ainda NÃO vão para a nuvem, ficam só neste aparelho.</p>` : '<p class="muted small">Entre com a mesma conta em todos os aparelhos.</p>'}
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
    <label class="field"><span>Chave pública (publishable ou anon)</span><input name="key" autocomplete="off" placeholder="sb_publishable_… ou eyJhbGciOi…"></label>
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

/** Senha nova, depois do link de "Esqueci minha senha". `onDone` roda depois de salvar. */
export function openNewPassword({ onDone } = {}) {
  openSheet(`<form class="tx-form"><h2 class="sheet-title">${icon('key-round', 20)} Criar senha nova</h2>
    <p class="muted small">Conta: <b>${esc(cloudInfo().email || '')}</b></p>
    <label class="field"><span>Senha nova</span><input name="password" type="password" autocomplete="new-password" minlength="6" required autofocus></label>
    <label class="field"><span>Repita a senha</span><input name="again" type="password" autocomplete="new-password" minlength="6" required></label>
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions"><button class="btn primary">${icon('check', 18)} Salvar senha</button></div></form>`, {
    onMount(sheet) {
      const f = sheet.querySelector('form');
      const err = f.querySelector('.form-error');
      const fail = (msg) => ((err.textContent = msg), (err.hidden = false));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.hidden = true;
        if (f.password.value.length < 6) return fail('A senha precisa ter pelo menos 6 caracteres.');
        if (f.password.value !== f.again.value) return fail('As duas senhas não são iguais.');
        f.querySelector('button').disabled = true;
        try {
          await updatePassword(f.password.value);
          closeSheet();
          toast('Senha alterada. Use a senha nova nos outros aparelhos.');
          onDone?.();
        } catch (ex) {
          fail(ex.message);
          f.querySelector('button').disabled = false;
        }
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

// dados antigos que versões anteriores deixaram neste navegador (só perguntado depois do login)
setLegacyHandler(async ({ cloudHasData, transactions }) => {
  const choice = await confirmSheet({
    title: 'Encontramos dados antigos neste navegador',
    text: cloudHasData
      ? `Este navegador guarda ${transactions} lançamento(s) de antes, e a sua conta já tem dados. Qual versão deve valer? A outra será descartada.`
      : `Este navegador guarda ${transactions} lançamento(s) de antes e a sua conta ainda está vazia. Quer enviar esses dados para a sua conta?`,
    options: cloudHasData
      ? [{ label: 'Usar os dados da minha conta', value: 'cloud' }, { label: 'Trocar pelos deste navegador', value: 'replace', danger: true }, { label: 'Baixar uma cópia e descartar', value: 'download' }]
      : [{ label: 'Enviar para minha conta', value: 'send' }, { label: 'Descartar', value: 'discard' }, { label: 'Baixar uma cópia e descartar', value: 'download' }],
  });
  if (choice !== 'download') return choice; // null = fechou sem escolher: não apaga nada
  try {
    await saveFile(`ruffino-financas-copia-navegador-${today()}.json`, JSON.stringify(readLegacyData(), null, 1), 'application/json');
  } catch {
    toast('Não foi possível baixar a cópia. Nada foi apagado.');
    return null;
  }
  return 'discard';
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
    const i = cloudInfo();
    const ok = await confirmSheet({
      title: 'Sair da conta?',
      text: i.cloudOnly ? 'Seus dados continuam salvos na sua conta, mas saem deste aparelho até você entrar de novo. Os comprovantes (fotos/PDF) continuam só neste aparelho.' : 'Os dados continuam neste aparelho, mas param de sincronizar até você entrar de novo.',
      options: [{ label: 'Sair', value: 'yes', danger: true }],
    });
    if (!ok) return;
    if (i.cloudOnly && i.dirty && !(await flushNow())) {
      const lose = await confirmSheet({
        title: 'Há alterações não enviadas',
        text: 'Não foi possível enviar as últimas alterações para a sua conta (sem conexão?). Se sair agora, elas serão perdidas.',
        options: [{ label: 'Sair e perder as alterações', value: 'yes', danger: true }],
      });
      if (!lose) return;
    }
    await signOut();
    toast(i.cloudOnly ? 'Você saiu da conta.' : 'Sincronização desligada neste aparelho.');
  },
});

onCloudChange((what) => {
  if (what !== 'data' && location.hash === '#/config') rerender();
});
