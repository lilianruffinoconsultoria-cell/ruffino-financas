// Leitura de notificações/SMS de bancos: extrai valor, estabelecimento, data e tipo do texto.
// Segue a mesma técnica do app de referência (marcadores por banco em volta do estabelecimento,
// valor por "R$ 0,00"/"US$"/número com vírgula e data em dd/mm[/aa[aa]]), adaptada para texto colado.
import { pad, today } from './util.js';

const BANKS = [
  ['Nubank', /nubank|nu pagamentos|\bnu\b/i],
  ['Inter', /\binter\b|banco inter/i],
  ['Banco do Brasil', /\bBB\b|banco do brasil/i],
  ['C6', /\bc6\b/i],
  ['Bradesco', /bradesco|\bnext\b/i],
  ['Santander', /santander|\bway\b/i],
  ['Itaú', /ita[uú]/i],
  ['Caixa', /\bcaixa\b/i],
  ['Neon', /\bneon\b/i],
  ['Digio', /digio/i],
  ['Sicoob', /sicoob|cabal/i],
  ['PicPay', /picpay/i],
  ['Mercado Pago', /mercado ?pago/i],
  ['Samsung Pay', /samsung/i],
];

// Expressões que antecedem o estabelecimento em cada banco, da mais específica para a mais genérica.
const MERCHANT_BEFORE = [
  /(?:Estab\.?|Estabelecimento:?|Local:)\s*/i, // Digio, C6
  /APROVADA em\s+/i, // C6
  /(?:d[ée]bito|cr[ée]dito)\s+(?:no|na|em)\s+/i, // Inter
  /(?:compra|Compra)\s+(?:aprovada\s+)?(?:em|no|na)\s+/i, // BB, Santander
  /(?:pix|transfer[eê]ncia|ted|doc)\b[^\n]*?R\$\s?[\d.]+,\d{2}\s+(?:de|para)\s+/i, // Pix: "R$ 500,00 de MARIA"
  /R\$\s?[\d.]+,\d{2}\s+(?:em|no|na)\s+/i, // Nubank, Neon: "R$ 25,90 em PADARIA"
  /\bem\s+/i,
];
// O que costuma vir logo depois do estabelecimento (fim do trecho).
const MERCHANT_AFTER = /\s+(?:o valor|no valor|valor|de R\$|R\$|US\$|em \d{1,2}\/|\d{1,2}\/\d{1,2}|no dia|dia \d|para o cart|com o cart|cart[aã]o|final \d|às|as \d{1,2}[:h])|[.,;\n]|\s-\s|$/i;

function parseValue(text) {
  const clean = text.replace(/(\d)\.(?=\d{3}\b)/g, '$1'); // tira separador de milhar
  const m = clean.match(/(R\$|US\$|U\$|\$)\s?(\d+,\d{2})/i) || clean.match(/(\d+,\d{2})/);
  if (!m) return null;
  const num = (m[2] || m[1]).replace(',', '.');
  return { amount: Math.round(parseFloat(num) * 100) / 100, foreign: /US|U\$/i.test(m[1] || '') };
}

function parseMerchant(text) {
  for (const before of MERCHANT_BEFORE) {
    const m = text.match(before);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length);
    const end = rest.search(MERCHANT_AFTER);
    const name = (end >= 0 ? rest.slice(0, end) : rest).replace(/\s+/g, ' ').trim();
    if (name && name.length <= 40 && !/^\d/.test(name) && !/^R\$/.test(name)) return name;
  }
  return '';
}

function parseDate(text) {
  const y = today().slice(0, 4);
  let m = text.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/((?:19|20)\d\d)\b/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = text.match(/\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](\d\d)\b/);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  m = text.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\b/);
  if (m) {
    const iso = `${y}-${pad(m[2])}-${pad(m[1])}`;
    return iso > today() ? `${Number(y) - 1}${iso.slice(4)}` : iso; // dd/mm no futuro = ano passado
  }
  return today();
}

function parseKind(text) {
  if (/recebemos seu pagamento|pagamento da fatura/i.test(text)) return 'invoicePayment';
  if (/pix recebido|recebeu (um )?pix|transfer[eê]ncia recebida|dep[oó]sito|cr[eé]dito em conta|voc[eê] recebeu|sal[aá]rio/i.test(text)) return 'income';
  if (/estorno|reembolso|cancelamento da compra/i.test(text)) return 'refund';
  if (/pix (enviado|realizado)|transfer[eê]ncia (enviada|realizada)|d[eé]bito|boleto|pagamento (realizado|efetuado)|saque/i.test(text)) return 'expense';
  if (/compra|aprovad|cart[aã]o|cr[eé]dito/i.test(text)) return 'card';
  return 'expense';
}

/** Interpreta o texto de uma notificação ou SMS de banco. Devolve null se não achar valor. */
export function parseBankMessage(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const value = parseValue(t);
  if (!value) return null;
  const bank = (BANKS.find(([, re]) => re.test(t)) || [''])[0];
  return { ...value, merchant: parseMerchant(t), date: parseDate(t), kind: parseKind(t), bank, raw: t };
}
