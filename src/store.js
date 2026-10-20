// Estado do app, persistência local e regras financeiras (saldos, faturas, orçamento).
import { uid, round2, sum, today, monthOf, addMonths, shiftDate, monthEnd, dateIn, thisMonth } from './util.js';

const KEY = 'ruffino-financas:v1';

export const COLORS = ['#C5A059', '#4CA3A0', '#E07A5F', '#8E7CC3', '#5B9BD5', '#5FAF6E', '#D46A8C', '#E3A73B', '#7F8C9A', '#B5835A', '#3E8E7E', '#C25B56'];

export const ACCOUNT_TYPES = { checking: 'Conta corrente', savings: 'Poupança', wallet: 'Carteira', investment: 'Investimento', other: 'Outra' };
export const ACCOUNT_ICONS = { checking: 'landmark', savings: 'piggy-bank', wallet: 'wallet', investment: 'trending-up', other: 'coins' };
export const SCOPES = { pf: 'Pessoal', pj: 'Empresa' };

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

function blank() {
  return {
    version: 1,
    settings: { theme: 'dark', hide: false, name: '', pinHash: null, onboarded: false },
    accounts: [],
    cards: [],
    categories: DEFAULT_CATEGORIES.map(([name, type, icon, color]) => ({ id: uid(), name, type, icon, color })),
    transactions: [],
    budgets: {},
    goals: [],
    stoppedGroups: [],
  };
}

function migrate(data) {
  const base = blank();
  const s = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
  for (const k of ['accounts', 'cards', 'categories', 'transactions', 'goals', 'stoppedGroups']) if (!Array.isArray(s[k])) s[k] = base[k];
  if (!s.budgets || typeof s.budgets !== 'object') s.budgets = {};
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

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    console.error('Falha ao salvar', e);
  }
}

export function replaceState(next) {
  S = migrate(next);
  save();
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
export const categoriesOf = (type) => S.categories.filter((c) => c.type === type);

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
export const accountsIn = (scope) => S.accounts.filter((a) => scope === 'all' || (a.scope || 'pf') === scope);
export const cardsIn = (scope) => S.cards.filter((c) => scope === 'all' || (c.scope || 'pf') === scope);

// ---------- saldos ----------
/**
 * Saldo de uma conta. Por padrão considera só o que já foi pago/recebido;
 * com `pendingUpTo` inclui também as pendências até essa data (saldo previsto).
 */
export function accountBalance(accId, pendingUpTo = null) {
  const a = account(accId);
  let b = a ? Number(a.initial) || 0 : 0;
  for (const t of S.transactions) {
    if (!t.paid && !(pendingUpTo && t.date <= pendingUpTo)) continue;
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

/** Saldo projetado (tudo lançado até a data, pago ou não), usado no gráfico de evolução. */
export function projectedBalanceAt(scope, iso) {
  const accs = accountsIn(scope);
  const ids = new Set(accs.map((a) => a.id));
  let b = sum(accs, (a) => Number(a.initial) || 0);
  for (const t of S.transactions) {
    if (t.date > iso) continue;
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
export const invoiceItems = (cardId, ym) =>
  S.transactions.filter((t) => t.type === 'expense' && t.cardId === cardId && t.invoice === ym).sort((a, b) => b.date.localeCompare(a.date));
export const invoiceTotal = (cardId, ym) => sum(invoiceItems(cardId, ym), (t) => t.amount);
export const invoicePaid = (cardId, ym) =>
  sum(S.transactions.filter((t) => t.type === 'payment' && t.cardId === cardId && t.invoice === ym), (t) => t.amount);
export function invoiceStatus(c, ym) {
  const total = invoiceTotal(c.id, ym);
  const paid = invoicePaid(c.id, ym);
  if (total > 0 && paid >= total - 0.004) return 'paga';
  if (today() >= invoiceCloseDate(c, ym)) return today() > invoiceDueDate(c, ym) && total > paid ? 'vencida' : 'fechada';
  return 'aberta';
}
export const currentInvoice = (c) => invoiceFor(c, today());
export function cardUsed(cardId) {
  const spent = sum(S.transactions.filter((t) => t.type === 'expense' && t.cardId === cardId), (t) => t.amount);
  const paid = sum(S.transactions.filter((t) => t.type === 'payment' && t.cardId === cardId), (t) => t.amount);
  return Math.max(0, round2(spent - paid));
}

// ---------- resumos do mês ----------
export const monthTx = (ym, scope) => S.transactions.filter((t) => monthOf(t.date) === ym && inScope(t, scope));

export function monthSummary(ym, scope) {
  const list = monthTx(ym, scope);
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

export function byCategory(ym, scope, type = 'expense') {
  const map = new Map();
  for (const t of monthTx(ym, scope)) {
    if (t.type !== type) continue;
    map.set(t.categoryId, round2((map.get(t.categoryId) || 0) + t.amount));
  }
  return [...map.entries()].map(([id, total]) => ({ cat: category(id), total })).sort((a, b) => b.total - a.total);
}

export function spentInCategory(catId, ym, scope = 'all') {
  return sum(monthTx(ym, scope).filter((t) => t.type === 'expense' && t.categoryId === catId), (t) => t.amount);
}

/** Média de gasto por categoria nos N meses anteriores ao mês informado. */
export function averageSpending(catId, ym, months = 3) {
  let total = 0;
  for (let i = 1; i <= months; i++) total += spentInCategory(catId, addMonths(ym, -i));
  return round2(total / months);
}

// ---------- transações ----------
/**
 * Cria uma transação. `repeat`: 'none' | 'fixed' (mensal, gerada 12 meses à frente
 * e estendida conforme o uso) | 'installments' (parcelada em `times` vezes).
 */
export function addTransaction(base, repeat = 'none', times = 1) {
  const groupId = repeat === 'none' ? null : uid();
  const n = repeat === 'installments' ? Math.max(2, times) : repeat === 'fixed' ? 12 : 1;
  const per = repeat === 'installments' ? round2(Math.floor((base.amount / n) * 100) / 100) : base.amount;
  const c = base.cardId ? card(base.cardId) : null;
  const firstInvoice = c ? invoiceFor(c, base.date) : null;
  for (let i = 0; i < n; i++) {
    const t = { ...base, id: uid(), date: shiftDate(base.date, i), groupId };
    if (repeat === 'installments') {
      t.amount = i === 0 ? round2(base.amount - per * (n - 1)) : per;
      t.installment = { n: i + 1, total: n };
    }
    if (repeat === 'fixed') t.fixed = true;
    if (c) {
      t.invoice = addMonths(firstInvoice, i);
      t.paid = true;
    } else if (i > 0) t.paid = false;
    S.transactions.push(t);
  }
  save();
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
      const t = { ...last, id: uid(), date: shiftDate(last.date, i), paid: last.cardId ? true : false };
      if (last.cardId) t.invoice = addMonths(last.invoice, i);
      S.transactions.push(t);
      i++;
      changed = true;
    }
  }
  if (changed) save();
}

export function updateTransaction(id, fields, applyToFuture = false) {
  const t = byId(S.transactions, id);
  if (!t) return;
  const prevDate = t.date;
  Object.assign(t, fields);
  if (t.cardId) t.invoice = fields.invoice || invoiceFor(card(t.cardId), t.date);
  if (applyToFuture && t.groupId) {
    const shared = { ...fields };
    delete shared.date;
    delete shared.paid;
    delete shared.invoice;
    for (const o of S.transactions) if (o.groupId === t.groupId && o.id !== t.id && o.date > prevDate) Object.assign(o, shared);
  }
  save();
}

export function deleteTransaction(id, mode = 'one') {
  const t = byId(S.transactions, id);
  if (!t) return;
  if (mode === 'one' || !t.groupId) S.transactions = S.transactions.filter((x) => x.id !== id);
  else if (mode === 'future') {
    S.transactions = S.transactions.filter((x) => !(x.groupId === t.groupId && x.date >= t.date));
    if (!S.stoppedGroups.includes(t.groupId)) S.stoppedGroups.push(t.groupId);
  } else {
    S.transactions = S.transactions.filter((x) => x.groupId !== t.groupId);
    S.stoppedGroups.push(t.groupId);
  }
  save();
}

export function togglePaid(id) {
  const t = byId(S.transactions, id);
  if (t && !t.cardId) {
    t.paid = !t.paid;
    save();
  }
}

export function pendingUntil(iso, scope) {
  return S.transactions
    .filter((t) => !t.paid && (t.type === 'expense' || t.type === 'income') && !t.cardId && t.date <= iso && inScope(t, scope))
    .sort((a, b) => a.date.localeCompare(b.date));
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

// ---------- objetivos ----------
export const goalSaved = (g) => sum(g.deposits || [], (d) => d.amount);

// ---------- dados de exemplo ----------
export function seedDemo(name = '') {
  S = blank();
  S.settings.onboarded = true;
  S.settings.name = name;
  const cat = (n, type = 'expense') => S.categories.find((c) => c.name === n && c.type === type).id;
  const wallet = { id: uid(), name: 'Carteira', type: 'wallet', scope: 'pf', initial: 120, color: '#C5A059' };
  const bank = { id: uid(), name: 'Banco principal', type: 'checking', scope: 'pf', initial: 2400, color: '#5B9BD5' };
  const pj = { id: uid(), name: 'Conta PJ', type: 'checking', scope: 'pj', initial: 6500, color: '#4CA3A0' };
  S.accounts.push(wallet, bank, pj);
  const gold = { id: uid(), name: 'Cartão Gold', limit: 6000, closeDay: 25, dueDay: 5, accountId: bank.id, scope: 'pf', color: '#C5A059' };
  S.cards.push(gold);

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
    ['Feira', 'Alimentação', [68, 74.5, 59]],
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
        const onCard = k % 2 === 1;
        addTransaction(t({ type: 'expense', amount: v, desc, date, categoryId: cat(c), ...(onCard ? { cardId: gold.id } : { accountId: bank.id }) }));
      });
    });
  }
  addTransaction(t({ type: 'transfer', amount: 300, desc: 'Saque', date: d(1, 2), accountId: bank.id, toAccountId: wallet.id }));
  addTransaction(t({ type: 'expense', amount: 42.5, desc: 'Padaria', date: d(1, 4), categoryId: cat('Alimentação'), accountId: wallet.id }));
  addTransaction(t({ type: 'expense', amount: 35, desc: 'Estacionamento', date: d(2, 3), categoryId: cat('Transporte'), accountId: wallet.id }));
  addTransaction(t({ type: 'transfer', amount: 1500, desc: 'Pró-labore', date: d(1, 28), accountId: pj.id, toAccountId: bank.id }));

  // paga as faturas já vencidas do cartão
  for (let m = 0; m < 3; m++) {
    const ym = addMonths(start, m);
    const total = invoiceTotal(gold.id, ym);
    if (total > 0 && invoiceDueDate(gold, ym) < today())
      S.transactions.push({ id: uid(), type: 'payment', amount: total, cardId: gold.id, invoice: ym, accountId: bank.id, date: invoiceDueDate(gold, ym), paid: true, desc: 'Pagamento de fatura' });
  }
  // no exemplo, o passado está pago e o futuro fica pendente
  for (const x of S.transactions) if (!x.cardId) x.paid = x.date <= today();

  S.budgets = { [cat('Supermercado')]: 900, [cat('Restaurante')]: 300, [cat('Lazer')]: 250, [cat('Transporte')]: 400, [cat('Alimentação')]: 250 };
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
