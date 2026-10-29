// Leitura de extratos: CSV/planilha exportada como CSV e OFX (padrão dos bancos brasileiros).
import { pad } from './util.js';

/** Converte "05/10/2026", "05/10/26", "2026-10-05" ou "20261005" em AAAA-MM-DD. */
export function toIso(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/** "1.234,56", "-1234.56", "R$ 10,00", "(10,00)" → número com sinal. */
export function toNumber(s) {
  let v = String(s ?? '').trim();
  const negative = /^-|^\(|-$|\bD$/i.test(v);
  v = v.replace(/[^\d,.]/g, '');
  if (v.includes(',') && v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(/,/g, '');
  const n = parseFloat(v);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') (cur += '"'), i++;
      else q = !q;
    } else if (ch === sep && !q) (out.push(cur), (cur = ''));
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * CSV com colunas de data, descrição e valor (negativo = saída). Aceita também
 * colunas de tipo (Receita/Despesa/Transferência/Reembolso), categoria e tags. Detecta ";" ou "," e o cabeçalho.
 */
export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  let rows = lines.map((l) => splitLine(l, sep));
  const head = rows[0].map((h) => h.toLowerCase());
  const hasHeader = !toIso(rows[0][0]) && head.some((h) => /data|date|descri|hist|valor|amount/.test(h));
  const find = (re, fallback) => {
    const i = head.findIndex((h) => re.test(h));
    return hasHeader && i >= 0 ? i : fallback;
  };
  const iDate = find(/data|date/, 0);
  const iDesc = find(/descri|hist[oó]rico|lan[cç]amento|memo|estabelec|title|t[ií]tulo/, 1);
  const iVal = find(/valor|amount|quantia/, 2);
  const iType = hasHeader ? head.findIndex((h) => /^tipo|type|natureza/.test(h)) : -1;
  const iCat = hasHeader ? head.findIndex((h) => /categ/.test(h)) : -1;
  const iTags = hasHeader ? head.findIndex((h) => /^tags?$|etiqueta/.test(h)) : -1;
  if (hasHeader) rows = rows.slice(1);
  return rows
    .map((r) => {
      const date = toIso(r[iDate]);
      let amount = toNumber(r[iVal]);
      if (!date || amount == null || !amount) return null;
      if (iType >= 0 && /despesa|d[eé]bito|sa[ií]da|expense/i.test(r[iType]) && amount > 0) amount = -amount;
      return {
        date,
        desc: (r[iDesc] || '').slice(0, 80),
        amount,
        category: iCat >= 0 ? r[iCat] || '' : '',
        type: iType >= 0 ? r[iType] || '' : '',
        tags: iTags >= 0 ? (r[iTags] || '').split(/[\s,]+/).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean) : [],
      };
    })
    .filter(Boolean);
}

/**
 * Parcela informada na descrição da fatura: "LOJA PARC 03/10", "LOJA - Parcela 3 de 10",
 * "LOJA 03/10" (no final). Devolve { n, total, base } com a descrição sem a marca da parcela.
 */
export function parseInstallment(desc) {
  const s = String(desc || '');
  const patterns = [
    /\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s+de\s+(\d{1,2})\s*$/i,
    /\(?\b(\d{1,2})\s*\/\s*(\d{1,2})\)?\s*$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    const total = Number(m[2]);
    if (total < 2 || total > 72 || n < 1 || n > total) continue;
    const base = s.replace(m[0], ' ').replace(/[\s\-–·|,]+$/, '').replace(/\s{2,}/g, ' ').trim();
    return { n, total, base: base || s };
  }
  return null;
}

/** Linha de pagamento da fatura anterior (não é compra nem estorno). */
export const isInvoicePayment = (desc) => /pagamento (recebido|efetuado|da fatura)|pgto|pagto|^pagamento$/i.test(String(desc || ''));

/** OFX (SGML ou XML): cada <STMTTRN> vira uma linha; FITID evita duplicar na reimportação. */
export function parseOfx(text) {
  const tag = (block, name) => (block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i')) || [])[1]?.trim() || '';
  return (text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || [])
    .map((b) => {
      const amount = toNumber(tag(b, 'TRNAMT').replace(',', '.'));
      const date = toIso(tag(b, 'DTPOSTED'));
      if (!date || !amount) return null;
      return { date, desc: (tag(b, 'MEMO') || tag(b, 'NAME')).slice(0, 80), amount, fitid: tag(b, 'FITID') };
    })
    .filter(Boolean);
}
