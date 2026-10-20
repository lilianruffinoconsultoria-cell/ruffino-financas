// Relatórios: receitas x despesas, categorias, evolução do saldo e DRE simplificado do mês.
import { S, monthSummary, byCategory, projectedBalanceAt, monthTx, category, account, card, SCOPES } from '../store.js';
import { esc, icon, addMonths, monthEnd, monthLabel, shortDate, moneyPlain, saveFile, money } from '../util.js';
import { UI, $m, monthSwitcher, scopeChips, donut, barsChart, lineChart, empty, pct, on, rerender, toast } from '../ui.js';

function dre(ym, scope) {
  const s = monthSummary(ym, scope);
  const variable = s.expense - s.fixedExpense;
  const result = s.income - s.expense;
  return { ...s, variable, result, margin: s.income ? result / s.income : 0 };
}

export function renderReports() {
  const ym = UI.month;
  const sc = UI.scope;
  const months = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5));
  const series = months.map((m) => ({ label: monthLabel(m, { short: true, year: false }), ...monthSummary(m, sc) }));
  const cats = byCategory(ym, sc, UI.reportTab);
  const catTotal = cats.reduce((a, c) => a + c.total, 0);
  const d = dre(ym, sc);
  const balance = months.map((m) => ({ label: monthLabel(m, { short: true, year: false }), v: projectedBalanceAt(sc, monthEnd(m)) }));

  return `<section>
    <header class="page-head"><h1>Relatórios</h1><div class="head-right">${monthSwitcher()}</div></header>
    ${scopeChips()}
    <div class="grid">
      <article class="card">
        <header class="card-head"><h2>Resultado do mês (DRE simplificado)</h2></header>
        <table class="dre">
          <tr><td>Receitas</td><td class="pos">${$m(d.income)}</td></tr>
          <tr><td>(−) Despesas fixas</td><td class="neg">${$m(d.fixedExpense)}</td></tr>
          <tr><td>(−) Despesas variáveis</td><td class="neg">${$m(d.variable)}</td></tr>
          <tr class="total"><td>(=) Resultado</td><td class="${d.result >= 0 ? 'pos' : 'neg'}">${$m(d.result)}</td></tr>
          <tr><td>Taxa de poupança</td><td>${d.income ? `${(d.margin * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</td></tr>
        </table>
        <p class="hint">${d.income ? (d.margin >= 0.2 ? 'Ótimo! Você está guardando 20% ou mais da receita.' : d.margin >= 0 ? 'Resultado positivo. A meta saudável é guardar ao menos 20% da receita.' : 'As despesas superaram as receitas neste mês. Revise o planejamento.') : 'Sem receitas lançadas neste mês.'}</p>
        <div class="toolbar">
          <a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/5514996805832?text=${encodeURIComponent(summaryText(ym, sc, d))}">${icon('message-circle', 16)} Enviar à consultora</a>
          <button class="btn ghost sm" data-action="export-csv" data-scope="month">${icon('download', 16)} Exportar CSV do mês</button>
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
          <ul class="list compact">${cats.map((c) => `<li class="row"><i class="dot-c" style="background:${c.cat.color}"></i><span class="grow">${esc(c.cat.name)}</span><span class="muted small">${pct(c.total, catTotal)}</span><span class="num">${$m(c.total)}</span></li>`).join('')}</ul>`
          : empty('chart-pie', 'Sem dados', `Nenhuma ${UI.reportTab === 'expense' ? 'despesa' : 'receita'} em ${monthLabel(ym)}.`)}
      </article>

      <article class="card">
        <header class="card-head"><h2>Evolução do saldo</h2><span class="muted small">projetado ao fim de cada mês</span></header>
        ${lineChart(balance)}
      </article>
    </div>
  </section>`;
}

function summaryText(ym, sc, d) {
  const top = byCategory(ym, sc).slice(0, 5).map((c) => `• ${c.cat.name}: ${money(c.total)}`).join('\n');
  return `Olá, Lilian! Segue meu resumo financeiro de ${monthLabel(ym)}${sc !== 'all' ? ` (${SCOPES[sc]})` : ''}:
Receitas: ${money(d.income)}
Despesas fixas: ${money(d.fixedExpense)}
Despesas variáveis: ${money(d.variable)}
Resultado: ${money(d.result)}
Maiores gastos:
${top || '—'}
(Enviado pelo app Ruffino Finanças)`;
}

const TYPE_LABEL = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência', payment: 'Pagamento de fatura' };
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
      t.categoryId ? category(t.categoryId).name : '',
      t.cardId ? card(t.cardId)?.name : account(t.accountId)?.name,
      t.toAccountId ? account(t.toAccountId)?.name : '',
      (t.type === 'income' ? '' : t.type === 'transfer' ? '' : '-') + moneyPlain(t.amount),
      t.paid ? 'Pago' : 'Pendente',
      t.installment ? `${t.installment.n}/${t.installment.total}` : '',
      (t.tags || []).join(', '),
      t.note,
    ]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

on({
  'report-tab': (el) => ((UI.reportTab = el.dataset.v), rerender()),
  'export-csv': async (el) => {
    const month = el.dataset.scope === 'month';
    const list = month ? monthTx(UI.month, UI.scope) : S.transactions;
    if (!list.length) return toast('Não há transações para exportar.');
    await saveFile(`ruffino-financas-${month ? UI.month : 'completo'}.csv`, transactionsCsv(list), 'text/csv;charset=utf-8');
    toast('Arquivo CSV gerado.');
  },
});
