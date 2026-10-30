// Categoria sugerida na importação: primeiro o que você já lançou (aprendizado), depois palavras-chave.
import { S, categoriesOf, NEUTRAL_TYPES } from './store.js';

/** Minúsculas, sem acentos e só letras/números separados por espaço. */
export const plain = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// prefixos que o banco põe antes do estabelecimento (os mais longos primeiro)
const BANK_PREFIXES = ['pagamento com qr pix', 'pagamento com pix', 'pix enviado', 'pix recebido', 'compra elo debito vista', 'compra no debito', 'debito de cartao', 'pagamento'];
const NOISE = new Set(['ltda', 'sa', 'me', 'eireli', 'epp', 'com', 'br', 'www', 'de', 'da', 'do', 'das', 'dos', 'e']);

/** Chave do estabelecimento: as 2 primeiras palavras que importam ("Pix enviado - CPFL SANTA CRUZ" → "cpfl santa"). */
export function merchantKey(desc) {
  // CNPJ, CPF e números longos saem antes de tirar a pontuação
  let s = plain(String(desc || '').replace(/\d[\d.\/-]{5,}\d/g, ' '));
  for (let again = true; again; ) {
    again = false;
    for (const p of BANK_PREFIXES)
      if (s === p || s.startsWith(`${p} `)) {
        s = s.slice(p.length).trim();
        again = true;
      }
  }
  return s.split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w) && !NOISE.has(w)).slice(0, 2).join(' ');
}

// palavra-chave → nome da categoria padrão (vale a primeira que existir no app)
const KEYWORDS = {
  expense: [
    [['mercado', 'supermerc', 'atacad', 'assai', 'carrefour', 'pao de acucar', 'savegnago', 'hortifruti'], ['Supermercado']],
    [['farmacia', 'drogaria', 'droga raia', 'drogasil', 'pague menos'], ['Saúde']],
    [['academia', 'total pass', 'totalpass', 'gympass', 'wellhub', 'smart fit', 'smartfit'], ['Saúde']],
    [['uber', '99app', '99 pop', 'taxi', 'cabify', 'posto', 'autoposto', 'gasolina', 'combust', 'ipiranga', 'shell', 'estacionamento', 'pedagio', 'sem parar'], ['Transporte']],
    [['ifood', 'rappi', 'restaurante', 'lanchonete', 'lanches', 'pizza', 'burger', 'mc donalds', 'mcdonalds', 'bk', 'outback', 'steakhouse', 'churrasc'], ['Restaurante']],
    [['padaria', 'doceria', 'cafe', 'cafeteria', 'coffee'], ['Alimentação']],
    [['netflix', 'spotify', 'youtube', 'prime video', 'disney', 'hbo', 'max', 'globoplay', 'apple com', 'google storage', 'icloud', 'openrouter', 'chatgpt', 'openai'], ['Serviços e assinaturas']],
    [['cpfl', 'enel', 'light', 'sabesp', 'copasa', 'energia', 'luz', 'agua', 'gas', 'vivo', 'claro', 'tim', 'oi', 'internet', 'net virtua'], ['Contas da casa']],
    [['escola', 'faculdade', 'curso', 'udemy', 'alura'], ['Educação']],
    [['cinema', 'cinemark', 'ingresso', 'show', 'teatro'], ['Lazer']],
  ],
  income: [
    [['salario', 'folha'], ['Salário', 'Pró-labore']],
    [['pro labore', 'prolabore'], ['Pró-labore', 'Salário']],
    [['rendimento', 'juros', 'cdb'], ['Investimentos']],
  ],
};

/** A palavra aparece no começo de uma palavra da descrição; as curtas (oi, tim, uber…) só valem inteiras. */
const hasWord = (text, kw) => (kw.length <= 4 ? ` ${text} `.includes(` ${kw} `) : ` ${text}`.includes(` ${kw}`));

/** Nome da categoria padrão sugerida pelas palavras-chave (ou null). */
export function keywordCategory(desc, type) {
  const text = plain(desc).replace(/\bmercado ?(pago|livre)\b/g, ' '); // carteira/loja, não é supermercado
  return (KEYWORDS[type] || []).find(([kws]) => kws.some((kw) => hasWord(text, kw)))?.[1] || null;
}

/** Histórico para sugerir: descrição exata (como o descriptionsIndex) e contagem por estabelecimento. */
export function historyOf(transactions = S.transactions) {
  const index = new Map();
  const keys = new Map();
  for (const t of transactions) {
    if (!t.desc || (t.type !== 'expense' && t.type !== 'income')) continue;
    index.set(t.desc, t.categoryId);
    const key = !t.prior && t.categoryId && merchantKey(t.desc);
    if (!key) continue;
    const k = `${t.type}|${key}`;
    if (!keys.has(k)) keys.set(k, new Map());
    keys.get(k).set(t.categoryId, (keys.get(k).get(t.categoryId) || 0) + 1);
  }
  return { index, keys };
}

/**
 * Categoria sugerida para uma linha importada: { id, how } ou null.
 * how: 'exact' (mesma descrição já lançada), 'merchant' (mesmo estabelecimento) ou 'keyword' (dicionário).
 */
export function suggestCategory(desc, type, hist = historyOf(), { categories = S.categories, choices = categoriesOf } = {}) {
  const fits = (id) => {
    const c = categories.find((x) => x.id === id);
    return !!c && !c.archived && (c.type === type || !!NEUTRAL_TYPES[c.type]);
  };
  const known = hist.index.get(desc);
  if (known && fits(known)) return { id: known, how: 'exact' };
  const key = merchantKey(desc);
  const counts = key && hist.keys.get(`${type}|${key}`);
  const best = counts && [...counts.entries()].filter(([id]) => fits(id)).sort((a, b) => b[1] - a[1])[0];
  if (best) return { id: best[0], how: 'merchant' };
  const names = keywordCategory(desc, type);
  for (const name of names || []) {
    const c = choices(type).find((x) => plain(x.name) === plain(name));
    if (c) return { id: c.id, how: 'keyword' };
  }
  return null;
}
