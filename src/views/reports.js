// Relatórios: receitas x despesas, categorias, evolução do saldo e DRE simplificado do período.
import { S, monthSummary, byCategory, projectedBalanceAt, monthTx, categoryLabel, account, card, SCOPES, neutralSummary, CATEGORY_TYPES, counted, rootId, category } from '../store.js';
import { esc, icon, addMonths, monthEnd, monthLabel, shortDate, moneyPlain, saveFile, money, round2 } from '../util.js';
import { UI, $m, monthSwitcher, scopeChips, donut, barsChart, lineChart, empty, pct, on, rerender, toast, openSheet, closeSheet } from '../ui.js';
import { txRow } from './transactions.js';

// ---------- período ----------
const PERIODS = [['month', 'Mês'], ['3m', 'Últimos 3 meses'], ['6m', 'Últimos 6 meses'], ['12m', 'Últimos 12 meses'], ['year', 'Ano']];
const period = () => UI.repPeriod || 'month';

/** Meses do período, do mais antigo ao mais recente (o mês selecionado é a referência). */
function periodMonths(ym = UI.month, p = period()) {
  if (p === 'year') return Array.from({ length: 12 }, (_, i) => `${ym.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`);
  const n = { month: 1, '3m': 3, '6m': 6, '12m': 12 }[p] || 1;
  return Array.from({ length: n }, (_, i) => addMonths(ym, i - n + 1));
}
/** Período anterior equivalente (mês anterior, 3 meses antes, ano anterior...). */
const previousMonths = (months) => months.map((m) => addMonths(m, -months.length));

function periodLabel(months = periodMonths(), p = period()) {
  if (p === 'month') return monthLabel(months[0]);
  if (p === 'year') return `Ano de ${months[0].slice(0, 4)}`;
  return `${monthLabel(months[0], { short: true })} a ${monthLabel(months[months.length - 1], { short: true })}`;
}

// ---------- agregação por período (soma das funções mensais de store.js) ----------
function periodSummary(months, sc) {
  const out = { income: 0, expense: 0, incomePending: 0, expensePending: 0, fixedExpense: 0 };
  for (const m of months) {
    const s = monthSummary(m, sc);
    for (const k of Object.keys(out)) out[k] = round2(out[k] + s[k]);
  }
  return out;
}
function periodByCategory(months, sc, type = 'expense') {
  const map = new Map();
  for (const m of months)
    for (const c of byCategory(m, sc, type)) {
      const row = map.get(c.cat.id) || { cat: c.cat, total: 0 };
      row.total = round2(row.total + c.total);
      map.set(c.cat.id, row);
    }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
function periodNeutral(months, sc) {
  const map = new Map();
  for (const m of months)
    for (const n of neutralSummary(m, sc)) {
      const row = map.get(n.cat.id) || { cat: n.cat, in: 0, out: 0 };
      row.in = round2(row.in + n.in);
      row.out = round2(row.out + n.out);
      map.set(n.cat.id, row);
    }
  return [...map.values()].sort((a, b) => b.in + b.out - (a.in + a.out));
}
const periodTx = (months, sc) => months.flatMap((m) => monthTx(m, sc));

function dre(months, sc) {
  const s = periodSummary(months, sc);
  const variable = round2(s.expense - s.fixedExpense);
  const result = round2(s.income - s.expense);
  return { ...s, variable, result, margin: s.income ? result / s.income : 0 };
}

export function renderReports() {
  const ym = UI.month;
  const sc = UI.scope;
  const p = period();
  const months = periodMonths(ym, p);
  const single = p === 'month';
  const label = periodLabel(months, p);
  // gráficos: no modo mês, os 6 meses até o selecionado; nos demais, os meses do período
  const chartMonths = single ? periodMonths(ym, '6m') : months;
  const series = chartMonths.map((m) => ({ label: monthLabel(m, { short: true, year: false }), ...monthSummary(m, sc) }));
  const cats = periodByCategory(months, sc, UI.reportTab);
  const catTotal = cats.reduce((a, c) => a + c.total, 0);
  const prevMonths = previousMonths(months);
  const prev = new Map(periodByCategory(prevMonths, sc, UI.reportTab).map((c) => [c.cat.id, c.total]));
  const prevLabel = single ? monthLabel(prevMonths[0], { short: true, year: false }) : 'período anterior';
  const d = dre(months, sc);
  const balance = chartMonths.map((m) => ({ label: monthLabel(m, { short: true, year: false }), v: projectedBalanceAt(sc, monthEnd(m)) }));
  const neutral = periodNeutral(months, sc);
  const word = single ? 'mês' : 'período';
  const dreRow = (kind, text, value, cls) =>
    `<tr class="dre-link" data-action="report-drill" data-kind="${kind}" title="Ver lançamentos"><td><button type="button" class="dre-btn">${text} ${icon('chevron-right', 14, 'muted no-print')}</button></td><td class="${cls}">${$m(value)}</td></tr>`;

  return `<section class="reports">
    <header class="page-head"><h1>Relatórios</h1><div class="head-right">${monthSwitcher()}</div></header>
    <div class="chips scroll rep-periods" role="tablist" aria-label="Período">${PERIODS.map(([v, l]) => `<button class="chip ${p === v ? 'on' : ''}" role="tab" aria-selected="${p === v}" data-action="report-period" data-v="${v}">${l}</button>`).join('')}</div>
    ${scopeChips()}
    <p class="rep-period-line">${icon('calendar', 14)} <b>${esc(label)}</b>${single ? '' : ` · ${months.length} meses`}${sc !== 'all' ? ` · ${SCOPES[sc]}` : ''}</p>
    <p class="print-only rep-print-head">Ruffino Finanças · Relatório de ${esc(label)}${sc !== 'all' ? ` (${SCOPES[sc]})` : ''} · gerado em ${shortDate(new Date().toISOString().slice(0, 10))}</p>
    <div class="grid">
      <article class="card">
        <header class="card-head"><h2>Resultado do ${word} (DRE simplificado)</h2></header>
        <table class="dre">
          ${dreRow('income', 'Receitas', d.income, 'pos')}
          ${dreRow('fixed', '(−) Despesas fixas', d.fixedExpense, 'neg')}
          ${dreRow('variable', '(−) Despesas variáveis', d.variable, 'neg')}
          <tr class="total"><td>(=) Resultado</td><td class="${d.result >= 0 ? 'pos' : 'neg'}">${$m(d.result)}</td></tr>
          <tr><td>Taxa de poupança</td><td>${d.income ? `${(d.margin * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</td></tr>
        </table>
        <p class="hint">${d.income ? (d.margin >= 0.2 ? 'Ótimo! Você está guardando 20% ou mais da receita.' : d.margin >= 0 ? 'Resultado positivo. A meta saudável é guardar ao menos 20% da receita.' : `As despesas superaram as receitas neste ${word}. Revise o planejamento.`) : `Sem receitas lançadas neste ${word}.`}</p>
        <div class="toolbar no-print">
          <button class="btn ghost sm" data-action="report-send">${icon('message-circle', 16)} Enviar à consultora</button>
          <button class="btn ghost sm" data-action="export-csv" data-scope="period">${icon('download', 16)} Exportar CSV do ${word}</button>
          <button class="btn ghost sm" data-action="report-print">${icon('file-text', 16)} Imprimir / PDF</button>
        </div>
      </article>

      <article class="card">
        <header class="card-head"><h2>Receitas x despesas</h2><span class="legend-inline"><i class="inc"></i>Receitas <i class="exp"></i>Despesas</span></header>
        ${barsChart(series.map((s) => ({ label: s.label, a: s.income, b: s.expense })))}
      </article>

      <article class="card">
        <header class="card-head"><h2>Por categoria</h2>
          <div class="chips small">${[['expense', 'Despesas'], ['income', 'Receitas']].map(([v, l]) => `<button class="chip ${UI.reportTab === v ? 'on' : ''}" data-action="report-tab" data-v="${v}">${l}</button>`).join('')}</div></header>
        ${cats.length ? `<div class="donut-wrap">${donut(cats.map((c) => ({ value: c.total, color: c.cat.color, label: c.cat.name })), { label: 'Total', value: UI.hide ? '•••' : money(catTotal) })}</div>
          <ul class="list compact">${cats.map((c) => {
            const before = prev.get(c.cat.id) || 0;
            const diff = before ? Math.round((c.total / before - 1) * 100) : null;
            const bad = UI.reportTab === 'expense' ? diff > 0 : diff < 0;
            return `<li><button class="row linklike rep-cat" data-action="report-drill" data-kind="cat" data-id="${c.cat.id ?? ''}" title="Ver lançamentos de ${esc(c.cat.name)}"><i class="dot-c" style="background:${c.cat.color}"></i><span class="grow">${esc(c.cat.name)}<small>${diff == null ? `novo no ${word}` : `${diff > 0 ? '▲' : diff < 0 ? '▼' : '='} ${Math.abs(diff)}% vs ${prevLabel}`}</small></span><span class="muted small">${pct(c.total, catTotal)}</span><span class="num ${diff ? (bad ? 'neg' : 'pos') : ''}">${$m(c.total)}</span>${icon('chevron-right', 16, 'muted no-print')}</button></li>`;
          }).join('')}</ul>
          <p class="hint no-print">Toque numa categoria para ver os lançamentos.</p>`
          : empty('chart-pie', 'Sem dados', `Nenhuma ${UI.reportTab === 'expense' ? 'despesa' : 'receita'} em ${esc(label)}.`)}
      </article>

      ${neutral.length ? `<article class="card">
        <header class="card-head"><h2>Transferências e reembolsos</h2><span class="muted small">fora do resultado</span></header>
        <ul class="list compact">${neutral.map((n) => `<li class="row"><i class="dot-c" style="background:${n.cat.color}"></i><span class="grow">${esc(n.cat.name)}<small>${CATEGORY_TYPES[n.cat.type]}</small></span>
          ${n.in ? `<span class="num pos">+ ${$m(n.in)}</span>` : ''}${n.out ? `<span class="num neg">− ${$m(n.out)}</span>` : ''}</li>`).join('')}</ul>
        <p class="hint">Estes valores mexem no saldo das contas, mas não entram nas receitas, despesas nem no DRE.</p>
      </article>` : ''}

      <article class="card">
        <header class="card-head"><h2>Evolução do saldo</h2><span class="muted small">projetado ao fim de cada mês</span></header>
        ${lineChart(balance)}
      </article>
    </div>
  </section>`;
}

function summaryText(months, sc, d) {
  const top = periodByCategory(months, sc).slice(0, 5).map((c) => `• ${c.cat.name}: ${money(c.total)}`).join('\n');
  const label = periodLabel(months);
  return `Olá, Lilian! Segue meu resumo financeiro de ${period() === 'month' ? label : label.charAt(0).toLowerCase() + label.slice(1)}${sc !== 'all' ? ` (${SCOPES[sc]})` : ''}:
Receitas: ${money(d.income)}
Despesas fixas: ${money(d.fixedExpense)}
Despesas variáveis: ${money(d.variable)}
Resultado: ${money(d.result)}
Maiores gastos:
${top || '—'}
(Enviado pelo app Ruffino Finanças)`;
}

// ---------- drill-down: lançamentos de uma categoria ou linha do DRE no período ----------
function drillList(kind, id) {
  const list = periodTx(periodMonths(), UI.scope).filter(counted);
  if (kind === 'income') return { title: 'Receitas', list: list.filter((t) => t.type === 'income') };
  if (kind === 'fixed') return { title: 'Despesas fixas', list: list.filter((t) => t.type === 'expense' && t.fixed) };
  if (kind === 'variable') return { title: 'Despesas variáveis', list: list.filter((t) => t.type === 'expense' && !t.fixed) };
  const cat = category(id || null);
  return { title: cat.name, cat, list: list.filter((t) => t.type === UI.reportTab && (rootId(t.categoryId) ?? '') === (id || '')) };
}

function openDrill(kind, id) {
  const { title, cat, list } = drillList(kind, id);
  const sorted = list.slice().sort((a, b) => b.date.localeCompare(a.date));
  const total = round2(sorted.reduce((a, t) => a + t.amount, 0));
  const income = kind === 'income' || (kind === 'cat' && UI.reportTab === 'income');
  openSheet(`<div class="rep-drill">
    <h2 class="sheet-title">${cat ? `<i class="dot-c" style="background:${cat.color}"></i>` : icon(income ? 'trending-up' : 'trending-down', 20)} ${esc(title)}</h2>
    <p class="muted small">${esc(periodLabel())} · ${sorted.length} lançamento(s)${UI.scope !== 'all' ? ` · ${SCOPES[UI.scope]}` : ''}</p>
    <div class="rep-drill-total"><span>Total</span><b class="${income ? 'pos' : 'neg'}">${$m(total)}</b></div>
    ${sorted.length ? `<ul class="list">${sorted.map((t) => txRow(t, { showDate: true })).join('')}</ul>` : empty('list-ordered', 'Nenhum lançamento', 'Não há lançamentos neste período.')}
    <p class="hint">Toque num lançamento para editar.</p>
    <button class="btn ghost block" data-close>Fechar</button></div>`, {
    onMount(sheet) {
      sheet.querySelector('[data-close]').addEventListener('click', () => closeSheet());
      // marcar como pago muda o lançamento: redesenha o painel com o dado novo
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="toggle-paid"]')) setTimeout(() => openDrill(kind, id), 0);
      });
    },
  });
}

// ---------- envio à consultora (mostra o texto antes de abrir o WhatsApp) ----------
function openSend() {
  const months = periodMonths();
  const text = summaryText(months, UI.scope, dre(months, UI.scope));
  const href = `https://wa.me/5514996805832?text=${encodeURIComponent(text)}`;
  openSheet(`<h2 class="sheet-title">${icon('message-circle', 20)} Enviar à consultora</h2>
    <p class="muted">Este resumo será aberto no WhatsApp para você enviar à Lilian Ruffino. Confira o texto: nada é enviado sem você confirmar no WhatsApp.</p>
    <pre class="wa-preview">${esc(text)}</pre>
    <div class="stack"><a class="btn primary" target="_blank" rel="noopener" href="${href}" data-send>${icon('message-circle', 18)} Abrir no WhatsApp</a>
      <button class="btn ghost" data-close>Cancelar</button></div>`, {
    onMount(sheet) {
      sheet.querySelector('[data-close]').addEventListener('click', () => closeSheet());
      sheet.querySelector('[data-send]').addEventListener('click', () => setTimeout(() => closeSheet(), 0));
    },
  });
}

const TYPE_LABEL = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência', payment: 'Pagamento de fatura', refund: 'Estorno', invoiceAdjust: 'Ajuste de fatura' };
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function transactionsCsv(list) {
  const head = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta/Cartão', 'Destino', 'Valor', 'Situação', 'Parcela', 'Tags', 'Observação'];
  const rows = list
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [
      shortDate(t.date),
      TYPE_LABEL[t.type],
      t.desc,
      t.categoryId ? categoryLabel(t.categoryId) : '',
      t.cardId ? card(t.cardId)?.name : account(t.accountId)?.name,
      t.toAccountId ? account(t.toAccountId)?.name : '',
      t.type === 'invoiceAdjust' ? moneyPlain(t.delta) : (t.type === 'income' || t.type === 'refund' || t.type === 'transfer' ? '' : '-') + moneyPlain(t.amount),
      `${t.paid ? 'Pago' : 'Pendente'}${t.ignored ? ' (ignorada)' : ''}`,
      t.installment ? `${t.installment.n}/${t.installment.total}` : '',
      (t.tags || []).join(', '),
      t.note,
    ]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

on({
  'report-tab': (el) => ((UI.reportTab = el.dataset.v), rerender()),
  'report-period': (el) => ((UI.repPeriod = el.dataset.v), rerender()),
  'report-drill': (el) => openDrill(el.dataset.kind, el.dataset.id),
  'report-send': () => openSend(),
  'report-print': () => window.print(),
  'export-csv': async (el) => {
    const scoped = el.dataset.scope === 'period' || el.dataset.scope === 'month';
    const months = periodMonths();
    const list = scoped ? periodTx(months, UI.scope) : S.transactions;
    if (!list.length) return toast('Não há transações para exportar.');
    const name = !scoped ? 'completo' : months.length === 1 ? months[0] : `${months[0]}_a_${months[months.length - 1]}`;
    await saveFile(`ruffino-financas-${name}.csv`, transactionsCsv(list), 'text/csv;charset=utf-8');
    toast('Arquivo CSV gerado.');
  },
});
