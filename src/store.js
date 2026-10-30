// Estado do app, persistência local e regras financeiras (saldos, faturas, orçamento).
import { uid, round2, sum, today, monthOf, addMonths, shiftDate, monthEnd, dateIn, thisMonth, money } from './util.js';

const KEY = 'ruffino-financas:v1';

export const COLORS = ['#C5A059', '#4CA3A0', '#E07A5F', '#8E7CC3', '#5B9BD5', '#5FAF6E', '#D46A8C', '#E3A73B', '#7F8C9A', '#B5835A', '#3E8E7E', '#C25B56'];

export const ACCOUNT_TYPES = { checking: 'Conta corrente', savings: 'Poupança', wallet: 'Carteira', investment: 'Investimento', other: 'Outra' };
export const ACCOUNT_ICONS = { checking: 'landmark', savings: 'piggy-bank', wallet: 'wallet', investment: 'trending-up', other: 'coins' };
export const SCOPES = { pf: 'Pessoal', pj: 'Empresa' };

/** Blocos da tela Início, na ordem em que aparecem (chave, nome, descrição). */
export const HOME_BLOCKS = [
  ['balance', 'Saldo geral', 'Saldo atual e previsão para o fim do mês'],
  ['summary', 'Receitas e despesas do mês', 'Os dois totais logo abaixo do saldo'],
  ['quick', 'Atalhos de lançamento', 'Botões de despesa, receita, transferência e cartão'],
  ['calendar', 'Calendário do mês', 'Cartão compacto com as contas do mês'],
  ['accounts', 'Contas', 'Saldo de cada conta'],
  ['cards', 'Cartões de crédito', 'Faturas, limite e melhor cartão para comprar'],
  ['categories', 'Despesas por categoria', 'Gráfico com as maiores categorias do mês'],
  ['planning', 'Planejamento', 'Gasto contra o limite planejado'],
  ['pending', 'Pendências até o fim do mês', 'Contas a pagar e a receber em aberto'],
  ['installments', 'Parcelamentos', 'O que falta pagar fora do cartão'],
  ['goals', 'Objetivos', 'Progresso das metas de economia'],
  ['tip', 'Dica da consultora', 'Dica do dia e contato com a consultora'],
];
/** Padrão: tudo ligado, menos o calendário. */
export const defaultHomeBlocks = () => Object.fromEntries(HOME_BLOCKS.map(([k]) => [k, k !== 'calendar']));
/** Blocos do Início na ordem escolhida em `settings.homeOrder` (chaves novas entram no fim, na ordem padrão). */
export function homeBlocksOrdered() {
  const saved = (S.settings.homeOrder || []).filter((k) => HOME_BLOCKS.some(([x]) => x === k));
  return [...saved, ...HOME_BLOCKS.map(([k]) => k).filter((k) => !saved.includes(k))].map((k) => HOME_BLOCKS.find(([x]) => x === k));
}

const DEFAULT_CATEGORIES = [
  ['Alimentação', 'expense', 'utensils', '#E07A5F'],
  ['Supermercado', 'expense', 'shopping-cart', '#E3A73B'],
  ['Restaurante', 'expense', 'coffee', '#C25B56'],
  ['Casa', 'expense', 'house', '#B5835A'],
  ['Contas da casa', 'expense', 'zap', '#5B9BD5'],
  ['Transporte', 'expense', 'car', '#4CA3A0'],
  ['Saúde', 'expense', 'heart-pulse', '#D46A8C'],
  ['Educação', 'expense', 'graduation-cap', '#8E7CC3'],
  ['Lazer', 'expense', 'gamepad-2', '#5FAF6E'],
  ['Vestuário', 'expense', 'shirt', '#C5A059'],
  ['Viagem', 'expense', 'plane', '#3E8E7E'],
  ['Serviços e assinaturas', 'expense', 'wrench', '#7F8C9A'],
  ['Eletrônicos', 'expense', 'smartphone', '#5B9BD5'],
  ['Impostos e taxas', 'expense', 'receipt', '#C25B56'],
  ['Empresa', 'expense', 'briefcase', '#C5A059'],
  ['Outros', 'expense', 'ellipsis', '#7F8C9A'],
  ['Salário', 'income', 'banknote', '#5FAF6E'],
  ['Pró-labore', 'income', 'briefcase', '#C5A059'],
  ['Vendas e serviços', 'income', 'store', '#4CA3A0'],
  ['Investimentos', 'income', 'trending-up', '#3E8E7E'],
  ['Presente', 'income', 'gift', '#D46A8C'],
  ['Outros', 'income', 'ellipsis', '#7F8C9A'],
];

/** Tipos de categoria que movimentam o saldo, mas não contam como receita nem despesa. */
export const NEUTRAL_TYPES = { transfer: 'Transferências', refund: 'Reembolsos' };
export const CATEGORY_TYPES = { expense: 'Despesas', income: 'Receitas', ...NEUTRAL_TYPES };

/** IDs fixos: cada aparelho cria as mesmas categorias e a sincronização não as duplica. */
function neutralDefaults() {
  return [
    ['neutro-transf-contas', 'Transferência entre contas', 'transfer', 'arrow-left-right', '#8FA3BF'],
    ['neutro-aplicacao', 'Aplicação e resgate', 'transfer', 'piggy-bank', '#3E8E7E'],
    ['neutro-emprestimo', 'Empréstimo a terceiros', 'transfer', 'hand-coins', '#7F8C9A'],
    ['neutro-reemb-despesas', 'Reembolso de despesas', 'refund', 'rotate-ccw', '#5FAF6E'],
    ['neutro-reemb-empresa', 'Reembolso da empresa', 'refund', 'briefcase', '#C5A059'],
  ].map(([id, name, type, icon, color]) => ({ id, name, type, icon, color }));
}

function blank() {
  return {
    version: 4,
    settings: { theme: 'dark', hide: false, name: '', pinHash: null, onboarded: false, autoPay: false, travelTag: '', smartAlert: true, payablesView: 'list', business: false, homeBlocks: defaultHomeBlocks() },
    accounts: [],
    cards: [],
    categories: [...DEFAULT_CATEGORIES.map(([name, type, icon, color]) => ({ id: uid(), name, type, icon, color })), ...neutralDefaults()],
    transactions: [],
    budgetMonths: {},
    goals: [],
    stoppedGroups: [],
  };
}

function migrate(data) {
  const base = blank();
  const s = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
  for (const k of ['accounts', 'cards', 'categories', 'transactions', 'goals', 'stoppedGroups']) if (!Array.isArray(s[k])) s[k] = base[k];
  if (!s.budgetMonths || typeof s.budgetMonths !== 'object') s.budgetMonths = {};
  // v1 guardava um único planejamento fixo; vira o planejamento do mês atual (e dos seguintes)
  if (s.budgets && Object.keys(s.budgets).length && !Object.keys(s.budgetMonths).length)
    s.budgetMonths[thisMonth()] = { cats: { ...s.budgets }, alert: 80, total: 0 };
  delete s.budgets;
  // v3: categorias de transferência e reembolso para quem já usava o app
  if ((s.version || 1) < 3) for (const c of neutralDefaults()) if (!s.categories.some((x) => x.id === c.id)) s.categories.push(c);
  // v4: parcelamentos viraram parte de "A pagar e receber"; parcelas já pagas guardam o vencimento (= data)
  if ((s.version || 1) < 4)
    for (const t of s.transactions) if (t.installment && t.groupId && !t.cardId && !t.prior && t.paid && !t.dueDate && (t.type === 'expense' || t.type === 'income')) t.dueDate = t.date;
  s.version = 4;
  s.settings.business = !!s.settings.business;
  // calendarHome virou o bloco "calendar" de homeBlocks (tela inicial personalizável)
  const saved = data.settings?.homeBlocks;
  s.settings.homeBlocks = { ...defaultHomeBlocks(), ...(saved && typeof saved === 'object' ? saved : { calendar: !!data.settings?.calendarHome }) };
  delete s.settings.calendarHome;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('Falha ao ler dados salvos', e);
  }
  return blank();
}

export let S = load();

/** O bloco está ligado na tela Início? */
export const homeBlockOn = (key) => S.settings.homeBlocks?.[key] ?? key !== 'calendar';

const saveListeners = new Set();
/** Avisa quem precisa saber que os dados mudaram (ex.: sincronização com a nuvem). */
export const onSave = (fn) => (saveListeners.add(fn), () => saveListeners.delete(fn));

export function save({ silent = false } = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    console.error('Falha ao salvar', e);
  }
  if (!silent) for (const fn of saveListeners) fn();
}

/** Troca todos os dados. `silent` não dispara a sincronização (dados que vieram da própria nuvem). */
export function replaceState(next, { silent = false } = {}) {
  S = migrate(next);
  save({ silent });
}
export function resetAll() {
  S = blank();
  save();
}

// ---------- consultas básicas ----------
export const byId = (list, id) => list.find((x) => x.id === id);
const UNKNOWN_CAT = { id: null, name: 'Sem categoria', icon: 'circle-help', color: '#7F8C9A', type: 'expense' };
export const category = (id) => byId(S.categories, id) || UNKNOWN_CAT;
export const account = (id) => byId(S.accounts, id);
export const card = (id) => byId(S.cards, id);
/** Categorias principais de um tipo (sem as subcategorias). */
export const categoriesOf = (type, { archived = false } = {}) =>
  S.categories.filter((c) => c.type === type && !c.parentId && (archived ? c.archived : !c.archived) && !hiddenBusinessCat(c));
/** Sem finanças da empresa, a categoria padrão "Empresa" some das escolhas se não tiver lançamentos. */
const hiddenBusinessCat = (c) =>
  !S.settings.business && c.type === 'expense' && c.name === 'Empresa' && !S.transactions.some((t) => t.categoryId === c.id);
export const subcategoriesOf = (id, { archived = false } = {}) => S.categories.filter((c) => c.parentId === id && (archived || !c.archived));
/** Categoria principal de uma (sub)categoria. */
export const rootId = (id) => category(id).parentId || id;
export const categoryLabel = (id) => {
  const c = category(id);
  return c.parentId ? `${category(c.parentId).name} › ${c.name}` : c.name;
};
/** Lançamento com categoria de transferência ou reembolso: mexe no saldo, mas não é receita nem despesa. */
export const isNeutral = (t) => !!t.categoryId && !!NEUTRAL_TYPES[category(t.categoryId).type];
/** Ignoradas e neutras continuam no saldo, mas ficam fora de receitas, despesas, relatórios e planejamento. */
export const counted = (t) => !t.ignored && !isNeutral(t);

/** Totais do mês das movimentações neutras, por categoria principal, com entradas e saídas. */
export function neutralSummary(ym, scope) {
  const map = new Map();
  for (const t of S.transactions) {
    if (monthOf(t.date) !== ym || !inScope(t, scope) || !isNeutral(t) || (t.type !== 'income' && t.type !== 'expense')) continue;
    const id = rootId(t.categoryId);
    const row = map.get(id) || { cat: category(id), in: 0, out: 0 };
    if (t.type === 'income') row.in = round2(row.in + t.amount);
    else row.out = round2(row.out + t.amount);
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.in + b.out - (a.in + a.out));
}
/**
 * Parcelas anteriores ao controle no app (compra já em andamento quando foi cadastrada):
 * ficam só no histórico da compra, fora de saldos, faturas, limite e relatórios.
 */
export const live = (t) => !t.prior;

/** Escopo de uma transação: Pessoal (pf) ou Empresa (pj), herdado da conta/cartão. */
export function txScope(t) {
  const holder = t.cardId ? card(t.cardId) : account(t.accountId);
  return holder?.scope || 'pf';
}
export function inScope(t, scope) {
  if (scope === 'all') return true;
  if (t.type === 'transfer') return account(t.accountId)?.scope === scope || account(t.toAccountId)?.scope === scope;
  return txScope(t) === scope;
}
export const accountsIn = (scope, { archived = false } = {}) =>
  S.accounts.filter((a) => (scope === 'all' || (a.scope || 'pf') === scope) && !!a.archived === archived);
export const cardsIn = (scope, { archived = false } = {}) =>
  S.cards.filter((c) => (scope === 'all' || (c.scope || 'pf') === scope) && !!c.archived === archived);

// ---------- efetivação automática ----------
/** Com a opção ligada, despesas e receitas pendentes viram pagas no dia do vencimento. */
export function applyAutoPay() {
  if (!S.settings.autoPay) return;
  const t0 = today();
  let changed = false;
  for (const t of S.transactions)
    if (!t.paid && !t.cardId && (t.type === 'expense' || t.type === 'transfer') && t.date <= t0) {
      t.paid = true;
      if (t.type !== 'transfer' && !t.prior) t.dueDate = t.date; // continua em A pagar e receber, como baixada
      changed = true;
    }
  if (changed) save();
}

// ---------- saldos ----------
/**
 * Saldo de uma conta. Por padrão considera só o que já foi pago/recebido;
 * com `pendingUpTo` inclui também as pendências até essa data (saldo previsto).
 */
export function accountBalance(accId, pendingUpTo = null) {
  const a = account(accId);
  let b = a ? Number(a.initial) || 0 : 0;
  for (const t of S.transactions) {
    if (t.prior || (!t.paid && !(pendingUpTo && t.date <= pendingUpTo))) continue;
    const v = t.amount;
    if (t.type === 'income' && t.accountId === accId) b += v;
    else if (t.type === 'expense' && !t.cardId && t.accountId === accId) b -= v;
    else if (t.type === 'payment' && t.accountId === accId) b -= v;
    else if (t.type === 'transfer') {
      if (t.accountId === accId) b -= v;
      if (t.toAccountId === accId) b += v;
    }
  }
  return round2(b);
}
export const totalBalance = (scope, pendingUpTo = null) => sum(accountsIn(scope), (a) => accountBalance(a.id, pendingUpTo));

/** Efeito de um lançamento no saldo de uma conta (+ entra, − sai, 0 não é desta conta). */
export function accountEffect(t, accId) {
  if (t.prior) return 0;
  if (t.type === 'income' && t.accountId === accId) return t.amount;
  if (((t.type === 'expense' && !t.cardId) || t.type === 'payment') && t.accountId === accId) return -t.amount;
  if (t.type === 'transfer') return (t.toAccountId === accId ? t.amount : 0) - (t.accountId === accId ? t.amount : 0);
  return 0;
}
/** Extrato de uma conta: só os lançamentos que mexem nela (compras no cartão ficam no cartão). */
export const accountTx = (accId) => S.transactions.filter((t) => accountEffect(t, accId) !== 0);
/** Saldo da conta ao fim de um dia, contando tudo o que está lançado até lá (pago ou pendente). */
export function accountBalanceAt(accId, iso) {
  const a = account(accId);
  let b = a ? Number(a.initial) || 0 : 0;
  for (const t of S.transactions) if (t.date <= iso) b += accountEffect(t, accId);
  return round2(b);
}

/** Saldo projetado (tudo lançado até a data, pago ou não), usado no gráfico de evolução. */
export function projectedBalanceAt(scope, iso) {
  const accs = accountsIn(scope);
  const ids = new Set(accs.map((a) => a.id));
  let b = sum(accs, (a) => Number(a.initial) || 0);
  for (const t of S.transactions) {
    if (t.date > iso || t.prior) continue;
    if (t.type === 'income' && ids.has(t.accountId)) b += t.amount;
    else if ((t.type === 'expense' && !t.cardId) || t.type === 'payment') {
      if (ids.has(t.accountId)) b -= t.amount;
    } else if (t.type === 'transfer') {
      if (ids.has(t.accountId)) b -= t.amount;
      if (ids.has(t.toAccountId)) b += t.amount;
    }
  }
  return round2(b);
}

/** Corrige o saldo atual criando um lançamento de reajuste (o saldo inicial não muda). */
export function adjustBalanceWithTransaction(accId, real) {
  const diff = round2(real - accountBalance(accId));
  if (!diff) return;
  S.transactions.push({
    id: uid(), type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), desc: 'Reajuste de saldo', date: today(),
    accountId: accId, paid: true, ignored: true, adjust: true, tags: [], note: 'Criado pelo reajuste de saldo',
    categoryId: (S.categories.find((c) => c.name === 'Outros' && c.type === (diff > 0 ? 'income' : 'expense')) || {}).id,
  });
  save();
}

/** Exclusão de conta: os lançamentos vão para `toId`; os reajustes de saldo da conta excluída são descartados. */
export function moveTransactions(fromId, toId) {
  S.transactions = S.transactions.filter((t) => !(t.adjust && t.accountId === fromId));
  for (const t of S.transactions) {
    if (t.accountId === fromId) t.accountId = toId;
    if (t.toAccountId === fromId) t.toAccountId = toId;
  }
  for (const c of S.cards) if (c.accountId === fromId) c.accountId = toId;
  save();
}

// ---------- cartões de crédito ----------
/** Mês (AAAA-MM) de vencimento da fatura em que cai uma compra feita na data. */
export function invoiceFor(c, iso) {
  let ym = monthOf(iso);
  if (Number(iso.slice(8, 10)) >= c.closeDay) ym = addMonths(ym, 1);
  if (c.dueDay <= c.closeDay) ym = addMonths(ym, 1);
  return ym;
}
export const invoiceDueDate = (c, ym) => dateIn(ym, c.dueDay);
export const invoiceCloseDate = (c, ym) => dateIn(c.dueDay <= c.closeDay ? addMonths(ym, -1) : ym, c.closeDay);
const CARD_ITEM_TYPES = new Set(['expense', 'refund', 'invoiceAdjust']);
/** Efeito de um item na fatura: compras somam, estornos subtraem, ajustes têm sinal próprio. */
export const invoiceEffect = (t) => (t.type === 'refund' ? -t.amount : t.type === 'invoiceAdjust' ? t.delta : t.amount);
const isCardItem = (t) => CARD_ITEM_TYPES.has(t.type) && !t.prior;
export const invoiceItems = (cardId, ym) =>
  S.transactions.filter((t) => isCardItem(t) && t.cardId === cardId && t.invoice === ym).sort((a, b) => b.date.localeCompare(a.date));
export const invoiceTotal = (cardId, ym) => sum(invoiceItems(cardId, ym), invoiceEffect);
export const invoicePaid = (cardId, ym) =>
  sum(S.transactions.filter((t) => t.type === 'payment' && t.cardId === cardId && t.invoice === ym), (t) => t.amount);
/** Status como no app de referência: aberta, fechada, vencida, paga parcialmente ou paga. */
export function invoiceStatus(c, ym) {
  const total = invoiceTotal(c.id, ym);
  const paid = invoicePaid(c.id, ym);
  if (total > 0 && paid >= total - 0.004) return 'paga';
  if (today() < invoiceCloseDate(c, ym)) return 'aberta';
  if (paid > 0) return 'parcial';
  return today() > invoiceDueDate(c, ym) && total > 0 ? 'vencida' : 'fechada';
}
export const currentInvoice = (c) => invoiceFor(c, today());
export function cardUsed(cardId) {
  const spent = sum(S.transactions.filter((t) => isCardItem(t) && t.cardId === cardId), invoiceEffect);
  const paid = sum(S.transactions.filter((t) => t.type === 'payment' && t.cardId === cardId), (t) => t.amount);
  return Math.max(0, round2(spent - paid + importedPending(cardId)));
}

/**
 * Compras parceladas trazidas pela importação da fatura: só existe a parcela de cada fatura importada.
 * As seguintes ainda "a importar" ocupam o limite e entram no quanto falta, sem aparecer em nenhum mês.
 */
function importedSeries(cardId = null) {
  const map = new Map();
  for (const t of S.transactions) {
    if (!t.importedSeries || !t.groupId || !t.installment || (cardId && t.cardId !== cardId)) continue;
    const g = map.get(t.groupId) || { maxN: 0, total: t.installment.total, per: t.amount };
    if (t.installment.n >= g.maxN) Object.assign(g, { maxN: t.installment.n, per: t.originalAmount || t.amount });
    map.set(t.groupId, g);
  }
  return map;
}
/** Quantas parcelas e quanto ainda falta importar numa compra (0 se não veio da importação). */
export function importedMissing(groupId) {
  const g = importedSeries().get(groupId);
  return g ? { count: Math.max(0, g.total - g.maxN), value: round2(Math.max(0, g.total - g.maxN) * g.per) } : { count: 0, value: 0 };
}
export const importedPending = (cardId) => sum([...importedSeries(cardId).values()], (g) => Math.max(0, g.total - g.maxN) * g.per);
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
export const daysToDue = (c, ym) => daysBetween(today(), invoiceDueDate(c, ym));
/** Melhor cartão para comprar hoje: o que dá mais dias até o vencimento da fatura da compra. */
export function bestCard(scope = 'all') {
  const list = cardsIn(scope).filter((c) => c.limit - cardUsed(c.id) > 0);
  if (list.length < 2) return null;
  return list
    .map((c) => ({ card: c, days: daysBetween(today(), invoiceDueDate(c, invoiceFor(c, today()))) }))
    .sort((a, b) => b.days - a.days)[0];
}
/** Parcelas futuras de compras no cartão que podem ser antecipadas para a fatura informada. */
export const anticipatable = (cardId, targetYm) =>
  S.transactions.filter((t) => t.type === 'expense' && t.cardId === cardId && t.installment && !t.prior && t.invoice > targetYm).sort((a, b) => a.invoice.localeCompare(b.invoice));
/** Antecipa parcelas para `targetYm`; fatura já fechada não recebe parcelas (vão para a fatura aberta). Devolve a fatura usada. */
export function anticipate(ids, targetYm, { discount = 0 } = {}) {
  const first = S.transactions.find((t) => ids.includes(t.id));
  const c = first && card(first.cardId);
  if (c && targetYm < currentInvoice(c)) targetYm = currentInvoice(c);
  const anticipationId = uid(); // liga as parcelas e o desconto desta antecipação (para desfazer)
  let moved = 0;
  for (const t of S.transactions) if (ids.includes(t.id) && t.invoice > targetYm) {
    t.anticipatedFrom ||= t.invoice;
    Object.assign(t, { invoice: targetYm, anticipated: true, anticipationId });
    moved++;
  }
  if (moved && c && discount > 0.004)
    S.transactions.push({ id: uid(), type: 'refund', amount: round2(discount), desc: 'Desconto da antecipação', cardId: c.id, invoice: targetYm, date: today(), paid: true, tags: [], anticipationId });
  save();
  return targetYm;
}

/** Desfaz uma antecipação: as parcelas voltam às faturas de origem e o desconto lançado sai. */
export function undoAnticipation(anticipationId) {
  if (!anticipationId) return 0;
  let n = 0;
  S.transactions = S.transactions.filter((t) => !(t.anticipationId === anticipationId && t.type === 'refund'));
  for (const t of S.transactions)
    if (t.anticipationId === anticipationId) {
      if (t.anticipatedFrom) t.invoice = t.anticipatedFrom;
      for (const k of ['anticipated', 'anticipatedFrom', 'anticipationId']) delete t[k];
      n++;
    }
  save();
  return n;
}

/**
 * Rotativo: o que ficou sem pagar na fatura `ym` vai para a fatura seguinte (dois ajustes ligados por
 * `carryId`); juros/encargos informados entram na fatura seguinte como despesa em "Juros e multas".
 */
export function carryInvoiceRest(cardId, ym, { interest = 0, date = today() } = {}) {
  const c = card(cardId);
  const rest = round2(invoiceTotal(cardId, ym) - invoicePaid(cardId, ym));
  if (!c || rest <= 0.004) return null;
  const next = addMonths(ym, 1);
  const carryId = uid();
  const base = { cardId, date, paid: true, tags: [], carryId };
  S.transactions.push(
    { ...base, id: uid(), type: 'invoiceAdjust', invoice: ym, delta: -rest, amount: rest, desc: 'Saldo levado para a próxima fatura' },
    { ...base, id: uid(), type: 'invoiceAdjust', invoice: next, delta: rest, amount: rest, desc: 'Saldo da fatura anterior (rotativo)' },
  );
  if (interest > 0.004) S.transactions.push({ ...base, id: uid(), type: 'expense', invoice: next, amount: round2(interest), desc: 'Juros e encargos do rotativo', categoryId: interestCategory('expense') });
  save();
  return { rest, next, carryId };
}
/** Desfaz o rotativo: tira os ajustes e os juros ligados ao mesmo `carryId`. */
export function undoCarry(carryId) {
  if (!carryId) return;
  S.transactions = S.transactions.filter((t) => t.carryId !== carryId);
  save();
}
/** Composição da fatura: compras à vista, parcelas do mês e créditos (estornos/ajustes). */
export function invoiceBreakdown(cardId, ym) {
  const items = invoiceItems(cardId, ym);
  const exp = items.filter((t) => t.type === 'expense');
  return {
    single: sum(exp.filter((t) => !t.installment), (t) => t.amount),
    installments: sum(exp.filter((t) => t.installment), (t) => t.amount),
    installmentCount: exp.filter((t) => t.installment).length,
    other: sum(items.filter((t) => t.type !== 'expense'), invoiceEffect),
  };
}
/** Parcelas que ainda vão entrar em faturas depois da informada (já ocupam o limite, mas não esta fatura). */
export const futureInstallments = (cardId, ym) =>
  round2(sum(S.transactions.filter((t) => t.type === 'expense' && t.cardId === cardId && t.installment && !t.prior && t.invoice > ym), (t) => t.amount) + importedPending(cardId));

// ---------- resumos do mês ----------
export const monthTx = (ym, scope) => S.transactions.filter((t) => !t.prior && monthOf(t.date) === ym && inScope(t, scope));

export function monthSummary(ym, scope) {
  const list = monthTx(ym, scope).filter(counted);
  const inc = list.filter((t) => t.type === 'income');
  const exp = list.filter((t) => t.type === 'expense');
  return {
    income: sum(inc, (t) => t.amount),
    expense: sum(exp, (t) => t.amount),
    incomePending: sum(inc.filter((t) => !t.paid), (t) => t.amount),
    expensePending: sum(exp.filter((t) => !t.paid && !t.cardId), (t) => t.amount),
    fixedExpense: sum(exp.filter((t) => t.fixed), (t) => t.amount),
  };
}

/** Totais por categoria principal (subcategorias somam na categoria-mãe). */
export function byCategory(ym, scope, type = 'expense') {
  const map = new Map();
  for (const t of monthTx(ym, scope)) {
    if (t.type !== type || !counted(t)) continue;
    const id = rootId(t.categoryId);
    map.set(id, round2((map.get(id) || 0) + t.amount));
  }
  return [...map.entries()].map(([id, total]) => ({ cat: category(id), total })).sort((a, b) => b.total - a.total);
}

/** Gasto do mês numa categoria (incluindo as subcategorias dela). */
export function spentInCategory(catId, ym, scope = 'all') {
  return sum(
    monthTx(ym, scope).filter((t) => t.type === 'expense' && counted(t) && (t.categoryId === catId || category(t.categoryId).parentId === catId)),
    (t) => t.amount,
  );
}

/** Média de gasto por categoria nos N meses anteriores ao mês informado. */
export function averageSpending(catId, ym, months = 3) {
  let total = 0;
  for (let i = 1; i <= months; i++) total += spentInCategory(catId, addMonths(ym, -i));
  return round2(total / months);
}

/** Média histórica de uma despesa pela descrição (para o alerta de gasto acima da média). */
export function averageForDescription(desc) {
  const key = desc.trim().toLowerCase();
  if (!key) return null;
  const list = S.transactions.filter((t) => t.type === 'expense' && (t.desc || '').trim().toLowerCase() === key && !t.installment);
  return list.length >= 2 ? { avg: sum(list, (t) => t.amount) / list.length, n: list.length } : null;
}

// ---------- planejamento mensal ----------
const EMPTY_PLAN = { cats: {}, alert: 80, total: 0 };
/** Planejamento do mês; sem um próprio, vale o do mês anterior mais próximo. */
export function budgetFor(ym) {
  if (S.budgetMonths[ym]) return S.budgetMonths[ym];
  const prev = Object.keys(S.budgetMonths).filter((k) => k < ym).sort().pop();
  return prev ? S.budgetMonths[prev] : EMPTY_PLAN;
}
export const budgetOrigin = (ym) => (S.budgetMonths[ym] ? ym : Object.keys(S.budgetMonths).filter((k) => k < ym).sort().pop() || null);
/** Planejamento editável: ao mexer num mês, ele ganha cópia própria (os meses seguintes herdam). */
export function editableBudget(ym) {
  if (!S.budgetMonths[ym]) S.budgetMonths[ym] = JSON.parse(JSON.stringify(budgetFor(ym)));
  return S.budgetMonths[ym];
}

// ---------- transações ----------
/**
 * Cria uma transação. `repeat`: 'none' | 'fixed' (mensal, gerada 12 meses à frente
 * e estendida conforme o uso) | 'installments' (parcelada em `times` vezes).
 * Parceladas:
 * - `perInstallment`: `base.amount` é o valor de cada parcela, não o total.
 * - `startAt`: número da parcela que cai na data informada (compra já em andamento).
 *   No cartão, essa parcela entra na fatura da data; fora dele, vence na data.
 *   As parcelas anteriores ficam marcadas como `prior` (já pagas antes do controle no app):
 *   aparecem no histórico da compra, mas não mexem em saldo, fatura, limite nem relatórios.
 * - `schedule`: [{ date, amount }] por parcela (fora do cartão, compra nova): vencimentos e valores
 *   ajustados à mão; substitui o cálculo mensal e a divisão igual.
 */
export function addTransaction(base, repeat = 'none', times = 1, { perInstallment = false, startAt = 1, schedule = null } = {}) {
  const groupId = repeat === 'none' ? null : uid();
  const n = repeat === 'installments' ? Math.max(2, times) : repeat === 'fixed' ? 12 : 1;
  const k = repeat === 'installments' ? Math.min(n, Math.max(1, Math.floor(startAt) || 1)) : 1;
  const total = repeat === 'installments' && perInstallment ? round2(base.amount * n) : base.amount;
  const per = repeat === 'installments' ? (perInstallment ? base.amount : round2(Math.floor((total / n) * 100) / 100)) : base.amount;
  const c = base.cardId ? card(base.cardId) : null;
  const baseInvoice = c ? invoiceFor(c, base.date) : null;
  const created = [];
  for (let i = 0; i < n; i++) {
    const offset = i - (k - 1); // meses em relação à data informada
    const t = { ...base, id: uid(), date: shiftDate(base.date, offset), groupId };
    if (repeat === 'installments') {
      t.amount = i === 0 ? round2(total - per * (n - 1)) : per;
      t.installment = { n: i + 1, total: n };
      if (schedule?.[i] && !c && k === 1) Object.assign(t, { date: schedule[i].date || t.date, amount: round2(schedule[i].amount) || t.amount });
    }
    if (repeat === 'fixed') t.fixed = true;
    if (c) {
      t.invoice = addMonths(baseInvoice, offset);
      t.paid = true;
    } else if (offset > 0) t.paid = false;
    if (offset < 0) Object.assign(t, { prior: true, paid: true });
    S.transactions.push(t);
    created.push(t);
  }
  save();
  return created;
}

/** Mantém as despesas/receitas fixas lançadas até o mês visualizado. */
export function ensureRecurring(ym) {
  const groups = new Map();
  for (const t of S.transactions) {
    if (!t.fixed || !t.groupId || S.stoppedGroups.includes(t.groupId)) continue;
    const last = groups.get(t.groupId);
    if (!last || t.date > last.date) groups.set(t.groupId, t);
  }
  let changed = false;
  for (const last of groups.values()) {
    let i = 1;
    while (monthOf(shiftDate(last.date, i)) <= ym) {
      const t = { ...last, id: uid(), date: shiftDate(last.date, i), paid: !!last.cardId };
      for (const k of ['receipt', 'dueDate', 'baixa', 'reconciled', 'fitid', 'importId']) delete t[k]; // marcas de baixa/importação não se repetem
      if (last.cardId) t.invoice = addMonths(last.invoice, i);
      S.transactions.push(t);
      i++;
      changed = true;
    }
  }
  if (changed) save();
}

/**
 * Atualiza um lançamento. Em séries (fixas e parcelas), `scope` diz o alcance: 'one' (só este),
 * 'future' (este e os próximos) ou 'all' (todos da série). `true` equivale a 'future' (versões antigas).
 * Data, situação, fatura e comprovante nunca se repetem; parcelas mantêm o próprio valor.
 */
export function updateTransaction(id, fields, scope = 'one') {
  if (scope === true) scope = 'future';
  const t = byId(S.transactions, id);
  if (!t) return;
  const prevDate = t.date;
  Object.assign(t, fields);
  if (t.cardId && !t.anticipated && !t.prior) t.invoice = fields.invoice || invoiceFor(card(t.cardId), t.date);
  if ((scope === 'future' || scope === 'all') && t.groupId) {
    const shared = { ...fields };
    for (const k of ['date', 'paid', 'invoice', 'receipt', 'dueDate']) delete shared[k];
    if (t.installment) delete shared.amount; // cada parcela mantém o próprio valor
    for (const o of S.transactions) if (o.groupId === t.groupId && o.id !== t.id && (scope === 'all' || o.date > prevDate)) Object.assign(o, shared);
  }
  save();
}

export function deleteTransaction(id, mode = 'one') {
  const t = byId(S.transactions, id);
  if (!t) return [];
  let removed;
  if (mode === 'one' || !t.groupId) removed = [t];
  else if (mode === 'future') {
    removed = S.transactions.filter((x) => x.groupId === t.groupId && x.date >= t.date);
    if (!S.stoppedGroups.includes(t.groupId)) S.stoppedGroups.push(t.groupId);
  } else {
    removed = S.transactions.filter((x) => x.groupId === t.groupId);
    S.stoppedGroups.push(t.groupId);
  }
  const ids = new Set(removed.map((x) => x.id));
  S.transactions = S.transactions.filter((x) => !ids.has(x.id));
  save();
  return removed;
}

/** Marca como pago/pendente na lista. Conta a pagar/receber marcada aqui continua na aba como baixada. */
export function togglePaid(id) {
  const t = byId(S.transactions, id);
  if (!t || t.cardId) return;
  if (t.paid && t.dueDate) return void unsettlePayable(id);
  t.paid = !t.paid;
  if (t.paid && (t.type === 'expense' || t.type === 'income') && !t.prior && !t.adjust) t.dueDate = t.date;
  save();
}

export function pendingUntil(iso, scope) {
  return S.transactions
    .filter((t) => !t.paid && (t.type === 'expense' || t.type === 'income') && !t.cardId && t.date <= iso && inScope(t, scope))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- contas a pagar e receber ----------
// Uma conta é uma despesa/receita fora do cartão, em aberto (`paid:false`, `date` = vencimento) ou já baixada
// (`paid:true` com `dueDate` = vencimento original, gravado na baixa quando a data muda).
export const isPayable = (t) =>
  (t.type === 'expense' || t.type === 'income') && !t.cardId && !t.prior && !t.adjust && (!t.paid || !!t.dueDate || !!t.fixed || !!t.installment);
export const dueOf = (t) => t.dueDate || t.date;
/** Situação: baixada | vencida | hoje | aberta. */
export function payableState(t, now = today()) {
  if (t.paid) return 'baixada';
  const due = dueOf(t);
  return due < now ? 'vencida' : due === now ? 'hoje' : 'aberta';
}
/** Contas com vencimento no mês. `kind`: 'pay' | 'rec' | 'all'. */
export const payablesOf = (ym, scope, kind = 'all') =>
  S.transactions
    .filter((t) => isPayable(t) && monthOf(dueOf(t)) === ym && inScope(t, scope) && (kind === 'all' || t.type === (kind === 'pay' ? 'expense' : 'income')))
    .sort((a, b) => dueOf(a).localeCompare(dueOf(b)) || (a.desc || '').localeCompare(b.desc || ''));
/** Contas em aberto vencidas antes do mês informado. */
export const overdueBefore = (ym, scope, kind = 'all') =>
  S.transactions.filter((t) => isPayable(t) && !t.paid && monthOf(dueOf(t)) < ym && dueOf(t) < today() && inScope(t, scope) && (kind === 'all' || t.type === (kind === 'pay' ? 'expense' : 'income')));

/** Categoria de juros: 'juros-pagos' (despesa) ou 'juros-recebidos' (receita), criada na primeira vez. */
function interestCategory(type) {
  const id = type === 'income' ? 'juros-recebidos' : 'juros-pagos';
  if (!S.categories.some((c) => c.id === id))
    S.categories.push({ id, name: type === 'income' ? 'Juros recebidos' : 'Juros e multas', type, icon: 'receipt', color: '#C25B56' });
  return id;
}

/**
 * Baixa de uma conta (à vista ou parcela): valor igual só marca como paga; maior registra a diferença
 * como juros/multa. Menor: `rest` 'open' deixa o restante numa nova conta pendente; 'discount' quita com
 * desconto (o previsto fica em `originalAmount`, como nas parcelas). Só esta conta é baixada.
 */
export function settlePayable(id, { date = today(), accountId, amount, rest = 'open' } = {}) {
  const t = byId(S.transactions, id);
  if (!t || !isPayable(t) || t.paid) return null;
  const due = dueOf(t);
  const value = round2(amount || t.amount);
  const diff = round2(value - t.amount);
  const baixa = { note: t.note || '', amount: t.amount, original: t.originalAmount };
  if (diff < -0.004 && rest === 'discount') {
    t.originalAmount ||= t.amount;
    t.note = [t.note, `Desconto: ${money(-diff)}`].filter(Boolean).join(' · ');
    t.amount = value;
  } else if (diff < -0.004) {
    const left = { ...t, id: uid(), amount: round2(-diff), paid: false, date: due, dueDate: due, restOf: t.id, note: `Restante de ${t.desc || category(t.categoryId).name}` };
    for (const k of ['baixa', 'reconciled', 'receipt', 'fitid', 'importId', 'originalAmount', 'groupId', 'fixed', 'installment']) delete left[k];
    S.transactions.push(left);
    baixa.splitId = left.id;
    t.amount = value;
  } else if (diff > 0.004) {
    // a diferença vira um lançamento próprio (Juros e multas), para aparecer separada nos relatórios
    const extra = { id: uid(), type: t.type, amount: diff, desc: `${t.type === 'income' ? 'Juros recebidos' : 'Juros/multa'} · ${t.desc || category(t.categoryId).name}`, categoryId: interestCategory(t.type), accountId: accountId || t.accountId, date, paid: true, tags: [...(t.tags || [])], note: '', interestOf: t.id };
    S.transactions.push(extra);
    baixa.interestId = extra.id;
  }
  Object.assign(t, { paid: true, date, dueDate: due, accountId: accountId || t.accountId, baixa });
  save();
  return t;
}

/** Volta ao que era antes de uma conciliação de extrato (usado ao desfazer a importação). */
export function restoreReconciled(t) {
  const prev = t.reconciled?.prev;
  if (!prev) return;
  for (const k of ['paid', 'date', 'amount', 'accountId', 'note', 'fitid', 'dueDate']) {
    if (prev[k] === undefined) delete t[k];
    else t[k] = prev[k];
  }
  delete t.reconciled;
  delete t.importId;
}

/** Estorna a baixa: volta a pendente no vencimento original (e desfaz o restante criado, se ainda em aberto). */
export function unsettlePayable(id) {
  const t = byId(S.transactions, id);
  if (!t || !t.paid || !t.dueDate) return false;
  if (t.reconciled) restoreReconciled(t);
  else {
    if (t.baixa) {
      t.amount = t.baixa.amount;
      t.note = t.baixa.note;
      if (t.baixa.original) t.originalAmount = t.baixa.original;
      else delete t.originalAmount;
      if (t.baixa.splitId) S.transactions = S.transactions.filter((x) => x.id !== t.baixa.splitId || x.paid);
      if (t.baixa.interestId) S.transactions = S.transactions.filter((x) => x.id !== t.baixa.interestId);
    }
    t.paid = false;
    t.date = t.dueDate;
    delete t.dueDate;
  }
  delete t.baixa;
  save();
  return true;
}

export function descriptionsIndex() {
  const map = new Map();
  for (const t of S.transactions) if (t.desc && (t.type === 'expense' || t.type === 'income')) map.set(t.desc, t.categoryId);
  return map;
}

export function allTags() {
  const set = new Set();
  for (const t of S.transactions) for (const tag of t.tags || []) set.add(tag);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ---------- compras parceladas ----------
/**
 * Parcela paga: anteriores ao app sempre; fora do cartão, quando marcada como paga; no cartão,
 * quando a fatura dela foi paga ou já venceu (compras antigas lançadas depois continuam corretas).
 */
export function installmentPaid(t) {
  if (t.prior) return true;
  if (!t.cardId) return !!t.paid;
  const c = card(t.cardId);
  return !!c && (invoiceStatus(c, t.invoice) === 'paga' || invoiceDueDate(c, t.invoice) < today());
}
/** Data em que a parcela é cobrada: vencimento da fatura (cartão) ou o vencimento da conta (mesmo depois de paga). */
export const installmentDue = (t) => (t.cardId && card(t.cardId) ? invoiceDueDate(card(t.cardId), t.invoice) : t.dueDate || t.date);

/**
 * Uma linha por compra parcelada, com parcelas pagas, valor pago, restante e próxima parcela.
 * `where`: 'all' | 'card' | 'outside'; `cardId` limita a um cartão.
 * Fora do cartão também entram as receitas parceladas (dinheiro a receber de alguém).
 */
export function installmentGroups(scope = 'all', { where = 'all', cardId = null } = {}) {
  const map = new Map();
  for (const t of S.transactions) {
    if ((t.type !== 'expense' && t.type !== 'income') || !t.installment || !t.groupId || !inScope(t, scope)) continue;
    if (t.type === 'income' && t.cardId) continue;
    if (where === 'card' && !t.cardId) continue;
    if (where === 'outside' && t.cardId) continue;
    if (cardId && t.cardId !== cardId) continue;
    if (!map.has(t.groupId)) map.set(t.groupId, []);
    map.get(t.groupId).push(t);
  }
  return [...map.entries()].map(([groupId, list]) => {
    list.sort((a, b) => a.installment.n - b.installment.n);
    const paid = list.filter(installmentPaid);
    const open = list.filter((t) => !installmentPaid(t)).sort((a, b) => installmentDue(a).localeCompare(installmentDue(b)));
    const first = list[0];
    const last = list[list.length - 1];
    const missing = importedMissing(groupId); // parcelas futuras ainda não importadas
    const total = round2(sum(list, (t) => t.amount) + missing.value);
    const paidValue = sum(paid, (t) => t.amount);
    const person = list.map((t) => t.person).find(Boolean) || '';
    return {
      groupId,
      list,
      desc: first.desc || person || category(first.categoryId).name,
      categoryId: first.categoryId,
      cardId: first.cardId || null,
      accountId: (open[0] || last).accountId || null,
      person,
      dir: first.type === 'income' ? 'receive' : 'pay',
      n: first.installment.total,
      count: list.length,
      paidCount: paid.length,
      priorCount: list.filter((t) => t.prior).length,
      total,
      paidValue,
      remaining: round2(total - paidValue),
      per: last.originalAmount || last.amount,
      // parcelas com valores diferentes (ajustadas à mão): a tela mostra a faixa em vez de "N× de"
      perMin: Math.min(...list.map((t) => t.originalAmount || t.amount)),
      perMax: Math.max(...list.map((t) => t.originalAmount || t.amount)),
      next: open[0] || null,
      start: installmentDue(first),
      end: installmentDue(last),
      discount: sum(list, (t) => (t.originalAmount ? t.originalAmount - t.amount : 0)),
      late: open.filter((t) => installmentDue(t) < today()).length,
      missing: missing.count,
      missingValue: missing.value,
      imported: list.some((t) => t.importedSeries),
      done: !open.length && !missing.count,
    };
  });
}
/** Parcela de uma compra do cartão que cai numa fatura (ou null). */
export const installmentIn = (g, ym) => g.list.find((t) => !t.prior && t.invoice === ym) || null;

/** Pessoas/lojas com parcelamentos fora do cartão: quanto falta pagar e receber de cada uma. */
export function installmentPeople(scope = 'all') {
  const map = new Map();
  for (const g of installmentGroups(scope, { where: 'outside' })) {
    const name = g.person || 'Sem pessoa informada';
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { name, pay: 0, receive: 0, active: 0, late: 0, groups: [] });
    const p = map.get(key);
    p[g.dir] = round2(p[g.dir] + g.remaining);
    if (!g.done) p.active++;
    p.late += g.late;
    p.groups.push(g);
  }
  return [...map.values()].sort((a, b) => b.pay + b.receive - (a.pay + a.receive));
}
export function knownPeople() {
  const set = new Map();
  for (const t of S.transactions) if (t.person) set.set(t.person.toLowerCase(), t.person);
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Quitação antecipada fora do cartão (só quando pedida): as parcelas escolhidas viram pagas na data e o
 * valor pago (com desconto, se houver) é distribuído entre elas na proporção do valor de cada uma. Cada parcela guarda o vencimento e o
 * valor original, então pode ser estornada sozinha como qualquer baixa.
 */
export function settleInstallments(groupId, amountPaid, accountId, date = today(), count = Infinity) {
  // `count`: quantas parcelas em aberto, a partir da próxima, entram na quitação (padrão: todas)
  const open = S.transactions
    .filter((t) => t.groupId === groupId && t.installment && !t.cardId && !t.paid && !t.prior)
    .sort((a, b) => a.installment.n - b.installment.n)
    .slice(0, count);
  if (!open.length) return 0;
  const original = sum(open, (t) => t.amount);
  const ratio = original ? amountPaid / original : 1;
  let left = round2(amountPaid);
  open.forEach((t, i) => {
    const value = i === open.length - 1 ? left : round2(t.amount * ratio);
    left = round2(left - value);
    t.baixa = { note: t.note || '', amount: t.amount, original: t.originalAmount };
    if (Math.abs(value - t.amount) > 0.004) t.originalAmount ||= t.amount;
    Object.assign(t, { amount: value, paid: true, dueDate: dueOf(t), date, accountId: accountId || t.accountId, note: [t.note, 'Quitação antecipada'].filter(Boolean).join(' · ') });
  });
  save();
  return round2(original - amountPaid);
}

// ---------- objetivos ----------
export const goalSaved = (g) => sum(g.deposits || [], (d) => d.amount);

// ---------- dados de exemplo ----------
export function seedDemo(name = '') {
  S = blank();
  S.settings.onboarded = true;
  S.settings.name = name;
  const cat = (n, type = 'expense') => S.categories.find((c) => c.name === n && c.type === type).id;
  const padaria = { id: uid(), name: 'Padaria', type: 'expense', icon: 'coffee', color: '#E07A5F', parentId: cat('Alimentação') };
  const feira = { id: uid(), name: 'Feira', type: 'expense', icon: 'shopping-bag', color: '#5FAF6E', parentId: cat('Alimentação') };
  S.categories.push(padaria, feira);
  const wallet = { id: uid(), name: 'Carteira', type: 'wallet', scope: 'pf', initial: 120, color: '#C5A059' };
  const bank = { id: uid(), name: 'Banco principal', type: 'checking', scope: 'pf', initial: 2400, color: '#5B9BD5' };
  const pj = { id: uid(), name: 'Conta PJ', type: 'checking', scope: 'pj', initial: 6500, color: '#4CA3A0' };
  S.accounts.push(wallet, bank, pj);
  const gold = { id: uid(), name: 'Cartão Gold', limit: 6000, closeDay: 25, dueDay: 5, accountId: bank.id, scope: 'pf', color: '#C5A059' };
  const roxo = { id: uid(), name: 'Cartão Roxo', limit: 3500, closeDay: 8, dueDay: 15, accountId: bank.id, scope: 'pf', color: '#8E7CC3' };
  S.cards.push(gold, roxo);

  const start = addMonths(thisMonth(), -2);
  const d = (offset, day) => dateIn(addMonths(start, offset), day);
  const t = (o) => ({ desc: '', tags: [], note: '', paid: true, ...o });

  addTransaction(t({ type: 'income', amount: 5800, desc: 'Salário', date: d(0, 5), categoryId: cat('Salário', 'income'), accountId: bank.id }), 'fixed');
  addTransaction(t({ type: 'income', amount: 4200, desc: 'Serviços de consultoria', date: d(0, 12), categoryId: cat('Vendas e serviços', 'income'), accountId: pj.id }), 'fixed');
  addTransaction(t({ type: 'expense', amount: 1650, desc: 'Aluguel', date: d(0, 10), categoryId: cat('Casa'), accountId: bank.id }), 'fixed');
  addTransaction(t({ type: 'expense', amount: 189.9, desc: 'Internet e celular', date: d(0, 15), categoryId: cat('Contas da casa'), accountId: bank.id }), 'fixed');
  addTransaction(t({ type: 'expense', amount: 76.6, desc: 'DAS MEI', date: d(0, 20), categoryId: cat('Impostos e taxas'), accountId: pj.id, tags: ['MEI'] }), 'fixed');
  addTransaction(t({ type: 'expense', amount: 55.9, desc: 'Streaming', date: d(0, 8), categoryId: cat('Serviços e assinaturas'), cardId: gold.id }), 'fixed');
  addTransaction(t({ type: 'expense', amount: 2400, desc: 'Notebook novo', date: d(1, 3), categoryId: cat('Eletrônicos'), cardId: gold.id, tags: ['trabalho'] }), 'installments', 6);

  const variable = [
    ['Supermercado', 'Supermercado', [380, 245.7, 312.4]],
    ['Feira', feira.id, [68, 74.5, 59]],
    ['Restaurante', 'Restaurante', [96, 142.8, 88.5]],
    ['Combustível', 'Transporte', [210, 185.3, 230]],
    ['Farmácia', 'Saúde', [64.9, 112]],
    ['Cinema', 'Lazer', [72, 95]],
  ];
  for (let m = 0; m < 3; m++) {
    variable.forEach(([desc, c, values], k) => {
      values.forEach((v, j) => {
        const day = 3 + ((k * 5 + j * 9 + m * 2) % 24);
        const date = d(m, day);
        if (date > today()) return;
        const holder = k % 2 === 1 ? { cardId: k === 3 ? roxo.id : gold.id } : { accountId: bank.id };
        addTransaction(t({ type: 'expense', amount: v, desc, date, categoryId: byId(S.categories, c) ? c : cat(c), ...holder }));
      });
    });
  }
  addTransaction(t({ type: 'transfer', amount: 300, desc: 'Saque', date: d(1, 2), accountId: bank.id, toAccountId: wallet.id }));
  addTransaction(t({ type: 'expense', amount: 42.5, desc: 'Padaria', date: d(1, 4), categoryId: padaria.id, accountId: wallet.id }));
  addTransaction(t({ type: 'expense', amount: 35, desc: 'Estacionamento', date: d(2, 3), categoryId: cat('Transporte'), accountId: wallet.id }));
  addTransaction(t({ type: 'transfer', amount: 1500, desc: 'Pró-labore', date: d(1, 28), accountId: pj.id, toAccountId: bank.id }));

  // compras parceladas fora do cartão: carnê em andamento (valor por parcela) e curso no boleto
  addTransaction(t({ type: 'expense', amount: 189.9, desc: 'Geladeira (carnê)', date: dateIn(addMonths(thisMonth(), -4), 10), categoryId: cat('Casa'), accountId: bank.id }), 'installments', 12, { perInstallment: true });
  addTransaction(t({ type: 'expense', amount: 5400, desc: 'Curso de pós-graduação', date: d(1, 15), categoryId: cat('Educação'), accountId: bank.id, tags: ['educação'] }), 'installments', 18);
  // parcelamentos com pessoas (a pagar e a receber) e compra no cartão que já estava em andamento
  addTransaction(t({ type: 'expense', amount: 350, desc: 'Moto usada', person: 'Carlos', date: dateIn(thisMonth(), 15), categoryId: cat('Transporte'), accountId: bank.id }), 'installments', 10, { startAt: 4, perInstallment: true });
  addTransaction(t({ type: 'income', amount: 1200, desc: 'Notebook antigo', person: 'Ana', date: dateIn(addMonths(thisMonth(), -1), 20), categoryId: cat('Vendas e serviços', 'income'), accountId: bank.id }), 'installments', 4);
  addTransaction(t({ type: 'expense', amount: 189, desc: 'Sofá retrátil', date: today(), categoryId: cat('Casa'), cardId: roxo.id }), 'installments', 12, { startAt: 7, perInstallment: true });

  // paga as faturas já vencidas dos cartões
  for (const c of S.cards)
    for (let m = 0; m < 3; m++) {
      const ym = addMonths(start, m);
      const total = invoiceTotal(c.id, ym);
      if (total > 0 && invoiceDueDate(c, ym) < today())
        S.transactions.push({ id: uid(), type: 'payment', amount: total, cardId: c.id, invoice: ym, accountId: bank.id, date: invoiceDueDate(c, ym), paid: true, desc: `Fatura ${c.name}` });
    }
  // no exemplo, o passado está pago e o futuro fica pendente
  for (const x of S.transactions) if (!x.cardId) x.paid = x.date <= today();

  S.budgetMonths[start] = {
    alert: 80,
    total: 3200,
    cats: { [cat('Supermercado')]: 900, [cat('Restaurante')]: 300, [cat('Lazer')]: 250, [cat('Transporte')]: 400, [cat('Alimentação')]: 250 },
  };
  S.goals.push(
    { id: uid(), name: 'Reserva de emergência', target: 18000, deadline: dateIn(addMonths(thisMonth(), 14), 1), icon: 'shield', color: '#C5A059', deposits: [{ date: d(0, 6), amount: 2500 }, { date: d(1, 6), amount: 800 }, { date: d(2, 6), amount: 800 }] },
    { id: uid(), name: 'Viagem de férias', target: 7000, deadline: dateIn(addMonths(thisMonth(), 8), 1), icon: 'plane', color: '#4CA3A0', deposits: [{ date: d(1, 15), amount: 900 }] },
  );
  ensureRecurring(addMonths(thisMonth(), 1));
  save();
}

export function startFromScratch(name = '') {
  S = blank();
  S.settings.onboarded = true;
  S.settings.name = name;
  S.accounts.push({ id: uid(), name: 'Carteira', type: 'wallet', scope: 'pf', initial: 0, color: '#C5A059' });
  save();
}

export { monthEnd };
