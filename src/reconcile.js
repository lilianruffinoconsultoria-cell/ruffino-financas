// Conciliação de extrato: casa as linhas do arquivo com as contas a pagar/receber em aberto,
// por VALOR e DATA. Funções puras (sem acesso ao estado), para poder testar com dados de exemplo.
//
// Candidata: mesmo tipo (saída = despesa, entrada = receita), conta em aberto fora do cartão, na conta de
// destino (ou sem conta) e com vencimento a no máximo 10 dias da data da linha. Valor exato (diferença
// menor que R$ 0,01) vem pré-selecionado; diferença de até max(R$ 5, 5%) aparece só como sugestão.
// Desempate: menor distância de datas; a descrição só entra quando valor e data empatam.
import { daysBetween } from './util.js';

const MAX_DAYS = 10;
const words = (s) =>
  new Set(
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
/** Quantas palavras (3+ letras) as duas descrições têm em comum. */
export const sharedWords = (a, b) => {
  const wb = words(b);
  return [...words(a)].filter((w) => wb.has(w)).length;
};

/** Avalia uma linha do extrato contra uma conta em aberto; null se não for candidata. */
export function scorePair(row, t) {
  const diff = Math.round(Math.abs(Math.abs(row.amount) - t.amount) * 100) / 100;
  const exact = diff < 0.01;
  if (!exact && diff > Math.max(5, t.amount * 0.05) + 0.0001) return null;
  const days = Math.abs(daysBetween(t.dueDate || t.date, row.date));
  if (days > MAX_DAYS) return null;
  const sim = sharedWords(row.desc, `${t.desc || ''} ${t.categoryName || ''}`);
  return { tx: t, exact, diff, days, sim, auto: exact };
}

/** Ordem do melhor para o pior: valor exato, depois (se não exato) menor diferença, data mais próxima e, por fim, descrição. */
const byBest = (a, b) => b.exact - a.exact || (a.exact ? 0 : a.diff - b.diff) || a.days - b.days || b.sim - a.sim;

/**
 * Para cada linha: candidatos (do melhor ao pior), o melhor par (`pick`, cada conta só em uma linha)
 * e se ele deve vir selecionado (`auto`, só com valor exato). `open`: contas a pagar/receber (filtradas aqui
 * por situação e conta); `catName(t)` devolve o nome da categoria para o desempate pela descrição.
 */
export function matchRows(rows, open, { accountId, catName = () => '' } = {}) {
  const pool = open.filter((t) => !t.paid && !t.cardId && !t.prior && (!t.accountId || t.accountId === accountId));
  const result = rows.map(() => ({ cands: [], pick: null, auto: false }));
  const pairs = [];
  rows.forEach((row, i) => {
    if (row.skip) return;
    const type = row.amount > 0 ? 'income' : 'expense';
    for (const t of pool) {
      if (t.type !== type) continue;
      const p = scorePair(row, { ...t, categoryName: catName(t) });
      if (p) {
        result[i].cands.push(p);
        pairs.push({ i, p });
      }
    }
    result[i].cands.sort(byBest);
  });
  const usedRow = new Set();
  const usedTx = new Set();
  for (const { i, p } of pairs.sort((a, b) => byBest(a.p, b.p))) {
    if (usedRow.has(i) || usedTx.has(p.tx.id)) continue;
    usedRow.add(i);
    usedTx.add(p.tx.id);
    result[i].pick = p;
    result[i].auto = p.auto;
  }
  return result;
}
