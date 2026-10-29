// Sincronização opcional com o Supabase (nuvem): mesmos dados no celular, no computador e no APK.
// Os dados do app ficam numa linha por usuário (tabela ruffino_financas_estado, ver supabase/schema.sql), protegida por RLS.
// Cada envio sobe o número da versão (rev): se outro aparelho salvou antes, o envio não sobrescreve
// e o app pergunta qual versão manter. Comprovantes (fotos/PDF) continuam só no aparelho.
import { S, onSave, replaceState } from './store.js';

const CFG_KEY = 'ruffino-financas:cloud';
const ENV = import.meta.env || {};
const ENV_URL = ENV.VITE_SUPABASE_URL || '';
const ENV_KEY = ENV.VITE_SUPABASE_ANON_KEY || '';
const TABLE = 'ruffino_financas_estado';

function loadCfg() {
  try {
    return { url: '', key: '', rev: 0, dirty: false, lastSync: null, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') };
  } catch {
    return { url: '', key: '', rev: 0, dirty: false, lastSync: null };
  }
}
let cfg = loadCfg();
const saveCfg = () => {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* sem armazenamento: segue em memória */
  }
};

const url = () => ENV_URL || cfg.url;
const key = () => ENV_KEY || cfg.key;

let client = null;
let session = null;
let state = 'off'; // off | signedOut | idle | busy | error
let lastError = '';
let pushTimer = null;
let running = null;
let conflictHandler = async () => 'cloud';
const listeners = new Set();

export const cloudConfigured = () => !!(url() && key());
export const cloudFromEnv = () => !!(ENV_URL && ENV_KEY);
export const onCloudChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
/** Recebe ('conflict', info) e deve devolver 'cloud' ou 'local'. */
export const setConflictHandler = (fn) => (conflictHandler = fn);
const emit = (what = 'status') => listeners.forEach((fn) => fn(what));

export function cloudInfo() {
  return {
    configured: cloudConfigured(),
    fromEnv: cloudFromEnv(),
    url: url(),
    email: session?.user?.email || '',
    signedIn: !!session,
    state,
    error: lastError,
    dirty: cfg.dirty,
    lastSync: cfg.lastSync,
  };
}

const setState = (s, err = '') => {
  state = s;
  lastError = err;
  emit();
};

function friendly(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme o e-mail pelo link que chegou na sua caixa de entrada e tente de novo.';
  if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem conta. Use “Entrar”.';
  if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Novos cadastros estão desativados no momento. Entre com uma conta que já existe.';
  if (/same.*password|different from the old/i.test(m)) return 'A senha nova precisa ser diferente da atual.';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/ruffino_financas_estado|42P01|PGRST205|schema cache/i.test(m)) return 'A tabela ruffino_financas_estado não existe no Supabase. Rode o arquivo supabase/schema.sql no SQL Editor.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o Supabase. Os dados ficam salvos no aparelho e sobem quando a internet voltar.';
  if (/Invalid API key|apikey/i.test(m)) return 'Chave do Supabase inválida. Confira a URL e a chave “anon/public”.';
  return m || 'Erro desconhecido.';
}

let creating = null; // evita dois clientes quando initCloud e sessionFromLink chegam juntos
async function getClient() {
  if (!cloudConfigured()) return null;
  if (!client)
    await (creating ||= import('@supabase/supabase-js').then(({ createClient }) => {
      client = createClient(url(), key(), { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ruffino-financas:auth' } });
      client.auth.onAuthStateChange((_ev, s) => {
        session = s;
        if (!s && state !== 'off') setState('signedOut');
        emit('auth');
      });
      creating = null;
    }));
  return client;
}

/** Salva URL e chave pública do projeto (quando não vierem do build). */
export async function setCloudConfig(newUrl, newKey) {
  cfg.url = String(newUrl || '').trim().replace(/\/+$/, '');
  cfg.key = String(newKey || '').trim();
  cfg.rev = 0;
  saveCfg();
  client = null;
  session = null;
  await initCloud();
}

/** Inicia: recupera a sessão salva e sincroniza. Chamado ao abrir o app. */
export async function initCloud() {
  if (!cloudConfigured()) return setState('off');
  try {
    const sb = await getClient();
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) return setState('signedOut');
    setState('idle');
    await syncNow();
  } catch (e) {
    setState('error', friendly(e));
  }
}

export async function signIn(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error));
  session = data.session;
  cfg.rev = 0; // aparelho novo nesta conta: compara com a nuvem antes de enviar
  saveCfg();
  setState('idle');
  return syncNow();
}

/**
 * Para onde voltam os links do e-mail (confirmação e nova senha): na web, esta página; no app
 * Android (https://localhost) vale a URL do site configurada no Supabase.
 */
const returnUrl = () => (location.hostname !== 'localhost' && /^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined);

/** Cria a conta. Se o projeto exige confirmação por e-mail, devolve { confirm: true }. */
export async function signUp(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: returnUrl() } });
  if (error) throw new Error(friendly(error));
  if (!data.session) return { confirm: true };
  session = data.session;
  cfg.rev = 0;
  saveCfg();
  setState('idle');
  await syncNow();
  return { confirm: false };
}

/** Envia o e-mail de redefinição de senha. */
export async function resetPassword(email) {
  const sb = await getClient();
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: returnUrl() });
  if (error) throw new Error(friendly(error));
}

/** Aberto por um link do e-mail (confirmação ou nova senha): recupera a sessão que veio na URL, sem sincronizar ainda. */
export async function sessionFromLink() {
  const sb = await getClient();
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  if (!data.session) return false;
  session = data.session;
  setState('idle');
  return true;
}

export async function updatePassword(password) {
  const sb = await getClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(friendly(error));
}

export async function signOut() {
  const sb = await getClient();
  if (sb) await sb.auth.signOut();
  session = null;
  cfg.rev = 0;
  cfg.lastSync = null;
  saveCfg();
  setState(cloudConfigured() ? 'signedOut' : 'off');
}

/** Tem dados de verdade neste aparelho (além do que vem num app recém-instalado)? */
const hasLocalData = () => S.settings.onboarded && (S.transactions.length > 0 || S.cards.length > 0 || S.accounts.length > 1 || S.goals.length > 0);

async function download(sb, uid) {
  const { data, error } = await sb.from(TABLE).select('data, rev').eq('user_id', uid).single();
  if (error) throw error;
  replaceState(data.data, { silent: true });
  cfg.rev = data.rev;
  cfg.dirty = false;
  emit('data');
}

async function upload(sb, uid, baseRev) {
  const payload = { data: S, rev: baseRev + 1, updated_at: new Date().toISOString(), device: navigator.userAgent.slice(0, 120) };
  if (!baseRev) {
    const { error } = await sb.from(TABLE).insert({ user_id: uid, ...payload });
    if (error) {
      if (error.code === '23505') return false; // outro aparelho criou a linha antes
      throw error;
    }
  } else {
    const { data, error } = await sb.from(TABLE).update(payload).eq('user_id', uid).eq('rev', baseRev).select('rev');
    if (error) throw error;
    if (!data?.length) return false; // mudou na nuvem desde a última leitura
  }
  cfg.rev = baseRev + 1;
  cfg.dirty = false;
  return true;
}

async function doSync() {
  const sb = await getClient();
  if (!sb || !session) return;
  const uid = session.user.id;
  setState('busy');
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await sb.from(TABLE).select('rev').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    const remoteRev = row?.rev || 0;
    if (!remoteRev) {
      // nuvem vazia: envia o que há aqui (se houver algo além do app recém-aberto)
      if (!S.settings.onboarded) break;
      if (await upload(sb, uid, 0)) break;
      continue;
    }
    if (remoteRev > cfg.rev) {
      // outro aparelho salvou depois da última sincronização daqui
      const localChanged = cfg.rev === 0 ? hasLocalData() : cfg.dirty;
      if (localChanged) {
        const choice = await conflictHandler({ firstTime: cfg.rev === 0 });
        if (choice === 'local') {
          if (await upload(sb, uid, remoteRev)) break;
          continue;
        }
        if (choice !== 'cloud') {
          setState('idle');
          return;
        }
      }
      await download(sb, uid);
      break;
    }
    if (cfg.dirty) {
      if (await upload(sb, uid, cfg.rev)) break;
      continue;
    }
    break;
  }
  cfg.lastSync = new Date().toISOString();
  saveCfg();
  setState('idle');
}

/** Sincroniza agora (uma por vez). */
export function syncNow() {
  if (!session) return Promise.resolve();
  if (running) return running;
  running = doSync()
    .catch((e) => setState('error', friendly(e)))
    .finally(() => {
      running = null;
      saveCfg();
    });
  return running;
}

// cada alteração local marca "pendente" e envia alguns segundos depois
onSave(() => {
  cfg.dirty = true;
  saveCfg();
  if (!session) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 2500);
});

// ao voltar para o app ou recuperar a internet, busca o que mudou em outros aparelhos
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow());
  window.addEventListener('online', () => syncNow());
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 120000);
}
