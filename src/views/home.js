// Tela inicial: saldo geral, resumo do mês, contas, cartões, categorias, pendências, metas e dica.
// Cada bloco pode ser ligado, desligado e reordenado em Mais > Personalizar tela inicial
// (settings.homeBlocks e settings.homeOrder); a ordem vem de homeBlocksOrdered().
import {
  S, accountsIn, cardsIn, accountBalance, totalBalance, monthSummary, byCategory, currentInvoice, invoiceTotal, invoiceDueDate,
  cardUsed, pendingUntil, goalSaved, spentInCategory, ACCOUNT_ICONS, ACCOUNT_TYPES, category, budgetFor, bestCard, installmentGroups, homeBlocksOrdered, homeBlockOn,
} from '../store.js';
import { esc, icon, monthEnd, monthLabel, shortDate, today } from '../util.js';
import { UI, $m, monthSwitcher, scopeChips, donut, progress, catBadge, empty } from '../ui.js';
import { TIPS } from '../tips.js';
import { calendarWidget } from './calendar.js';
import { unpaidClosed, unpaidText, negBadge } from './accounts.js';

function greeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return S.settings.name ? `${g}, ${esc(S.settings.name)}` : g;
}

export function renderHome() {
  const ym = UI.month;
  const sc = UI.scope;
  const sum = monthSummary(ym, sc);
  const keys = homeBlocksOrdered().map(([k]) => k).filter(homeBlockOn);

  // um pedaço por bloco (mesma chave de HOME_BLOCKS)
  const BLOCKS = {
    balance: () => {
      const bal = totalBalance(sc);
      const prev = totalBalance(sc, monthEnd(ym));
      return `<p class="hero-k">Saldo geral</p>
      <p class="hero-v ${bal < -0.004 ? 'neg' : ''}">${$m(bal)}</p>
      <p class="hero-sub">Previsto para ${monthEnd(ym).slice(8)}/${ym.slice(5)}: <strong class="${prev < -0.004 ? 'neg' : ''}">${$m(prev)}</strong></p>`;
    },
    summary: () => `<div class="hero-pills">
        <a href="#/transacoes" data-action="tx-filter" data-v="income" class="pill inc"><span>${icon('arrow-up', 16)}</span><div><small>Receitas</small><b>${$m(sum.income)}</b></div></a>
        <a href="#/transacoes" data-action="tx-filter" data-v="expense" class="pill exp"><span>${icon('arrow-down', 16)}</span><div><small>Despesas</small><b>${$m(sum.expense)}</b></div></a>
      </div>`,
    quick: () => `<div class="quick-row">
      <button data-action="new-tx" data-kind="expense" class="t-expense">${icon('trending-down')}<span>Despesa</span></button>
      <button data-action="new-tx" data-kind="income" class="t-income">${icon('trending-up')}<span>Receita</span></button>
      <button data-action="new-tx" data-kind="transfer" class="t-transfer">${icon('arrow-left-right')}<span>Transferir</span></button>
      <button data-action="new-tx" data-kind="card" class="t-card">${icon('credit-card')}<span>Cartão</span></button>
    </div>`,
    calendar: () => `<article class="card">
        <header class="card-head"><h2>${icon('calendar-clock', 18)} Calendário do mês</h2><a href="#/pagar-receber" data-action="cal-open" class="link">Abrir</a></header>
        ${calendarWidget({ ym, scope: sc, compact: true })}
      </article>`,
    accounts: () => {
      const accounts = accountsIn(sc);
      return `<article class="card">
        <header class="card-head"><h2>Contas</h2><a href="#/contas" class="link">Gerenciar</a></header>
        ${accounts.length ? `<ul class="list">${accounts.map((a) => {
          const bal = accountBalance(a.id);
          return `
          <li><a class="row" href="#/transacoes" data-action="open-statement" data-id="${a.id}">
            <span class="cat-badge" style="--c:${a.color}">${icon(ACCOUNT_ICONS[a.type] || 'wallet', 18)}</span>
            <span class="grow"><b>${esc(a.name)} ${negBadge(bal)}</b><small>${S.settings.business ? (a.scope === 'pj' ? 'Empresa' : 'Pessoal') : ACCOUNT_TYPES[a.type] || 'Conta'}</small></span>
            <span class="num ${bal < -0.004 ? 'neg' : ''}">${$m(bal)}</span></a></li>`;
        }).join('')}</ul>`
          : empty('landmark', 'Nenhuma conta', 'Cadastre suas contas para acompanhar os saldos.', '<a class="btn primary sm" href="#/contas">Adicionar conta</a>')}
      </article>`;
    },
    cards: () => {
      const cards = cardsIn(sc);
      const best = bestCard(sc);
      return `<article class="card">
        <header class="card-head"><h2>Cartões de crédito</h2><a href="#/cartoes" class="link">Ver todos</a></header>
        ${best ? `<p class="best-card sm">${icon('star', 16)}<span>Melhor cartão para comprar hoje: <b>${esc(best.card.name)}</b> (${best.days} dias até vencer)</span></p>` : ''}
        ${cards.length ? `<ul class="list">${cards.map((c) => {
          const inv = currentInvoice(c);
          const used = cardUsed(c.id);
          // fatura fechada e ainda não paga aparece antes da aberta
          const owed = unpaidClosed(c).map((f) => `<small ${f.days < 0 ? 'class="late"' : 'style="color:var(--warn);font-weight:600"'}>${icon('triangle-alert', 12)} ${unpaidText(f)}</small>`).join('');
          return `<li><a class="row col" href="#/cartao/${c.id}">
            <div class="row-in"><span class="cat-badge" style="--c:${c.color}">${icon('credit-card', 18)}</span>
              <span class="grow"><b>${esc(c.name)}</b>${owed}<small>Fatura de ${monthLabel(inv, { short: true })} · vence ${shortDate(invoiceDueDate(c, inv)).slice(0, 5)}</small></span>
              <span class="num">${$m(invoiceTotal(c.id, inv))}</span></div>
            ${progress(used, c.limit)}<small class="muted">Disponível ${$m(c.limit - used)} de ${$m(c.limit)}</small></a></li>`;
        }).join('')}</ul>`
          : empty('credit-card', 'Nenhum cartão', 'Adicione seus cartões para controlar as faturas.', '<a class="btn primary sm" href="#/cartoes">Adicionar cartão</a>')}
      </article>`;
    },
    categories: () => {
      const cats = byCategory(ym, sc).slice(0, 5);
      const catTotal = cats.reduce((a, c) => a + c.total, 0);
      return `<article class="card">
        <header class="card-head"><h2>Despesas por categoria</h2><a href="#/relatorios" class="link">Relatórios</a></header>
        ${cats.length ? `<div class="donut-wrap">${donut(cats.map((c) => ({ value: c.total, color: c.cat.color, label: c.cat.name })), { label: 'Total', value: UI.hide ? '•••' : $m(sum.expense) })}
          <ul class="legend">${cats.map((c) => `<li><i style="background:${c.cat.color}"></i><span>${esc(c.cat.name)}</span><b>${catTotal ? Math.round((c.total / catTotal) * 100) : 0}%</b></li>`).join('')}</ul></div>`
          : empty('chart-pie', 'Sem despesas no mês', `Nada lançado em ${monthLabel(ym)}.`)}
      </article>`;
    },
    planning: () => {
      const plan = budgetFor(ym);
      const budgetIds = Object.keys(plan.cats).filter((id) => !category(id).parentId && category(id).id);
      const planned = plan.total || budgetIds.reduce((a, id) => a + plan.cats[id], 0);
      const plannedSpent = plan.total ? sum.expense : budgetIds.reduce((a, id) => a + spentInCategory(id, ym, sc), 0);
      return `<article class="card">
        <header class="card-head"><h2>Planejamento</h2><a href="#/planejamento" class="link">Abrir</a></header>
        ${planned ? `<div class="plan-sum"><div><small>Gasto</small><b>${$m(plannedSpent)}</b></div><div><small>Planejado</small><b>${$m(planned)}</b></div></div>
          ${progress(plannedSpent, planned)}
          <ul class="list compact">${budgetIds.map((id) => ({ id, spent: spentInCategory(id, ym, sc), limit: plan.cats[id] }))
            .sort((a, b) => b.spent / b.limit - a.spent / a.limit).slice(0, 3)
            .map((b) => `<li class="row">${catBadge(category(b.id), 30)}<span class="grow"><b>${esc(category(b.id).name)}</b>${progress(b.spent, b.limit)}</span><span class="num sm">${Math.round((b.spent / b.limit) * 100)}%</span></li>`).join('')}</ul>`
          : empty('target', 'Sem planejamento', 'Defina limites de gasto por categoria.', '<a class="btn primary sm" href="#/planejamento">Planejar mês</a>')}
      </article>`;
    },
    pending: () => {
      const pend = pendingUntil(monthEnd(ym), sc).slice(0, 5);
      return `<article class="card">
        <header class="card-head"><h2>Pendências até o fim do mês</h2><a href="#/transacoes" data-action="tx-pending" class="link">Ver todas</a></header>
        ${pend.length ? `<ul class="list">${pend.map((t) => {
          const c = category(t.categoryId);
          const late = t.date < today();
          return `<li class="row">${catBadge(c, 34)}
            <button class="grow linklike" data-action="edit-tx" data-id="${t.id}"><b>${esc(t.desc || c.name)}</b><small class="${late ? 'late' : ''}">${late ? 'Atrasado · ' : ''}${shortDate(t.date)}</small></button>
            <span class="num ${t.type === 'income' ? 'pos' : 'neg'}">${$m(t.amount)}</span>
            <button class="icon-btn check" data-action="toggle-paid" data-id="${t.id}" aria-label="Marcar como ${t.type === 'income' ? 'recebido' : 'pago'}">${icon('circle', 20)}</button></li>`;
        }).join('')}</ul>`
          : empty('circle-check', 'Tudo em dia', 'Nenhuma conta a pagar ou receber pendente.')}
      </article>`;
    },
    installments: () => {
      // só os parcelamentos fora do cartão (os do cartão ficam em cada cartão)
      const inst = installmentGroups(sc, { where: 'outside' }).filter((g) => !g.done && g.dir === 'pay').sort((a, b) => b.remaining - a.remaining);
      if (!inst.length) return '';
      const instLeft = inst.reduce((a, g) => a + g.remaining, 0);
      return `<article class="card">
        <header class="card-head"><h2>Parcelamentos</h2><a href="#/parcelamentos" class="link">Ver todos</a></header>
        <div class="plan-sum"><div><small>Falta pagar (${inst.length} parcelamento(s) fora do cartão)</small><b>${$m(instLeft)}</b></div></div>
        <ul class="list compact">${inst.slice(0, 3).map((g) => `<li><button class="row col linklike" data-action="inst-open" data-id="${g.groupId}"><div class="row-in">${catBadge(category(g.categoryId), 30)}
          <span class="grow"><b>${esc(g.desc)}</b><small>${g.paidCount}/${g.n} pagas · falta ${$m(g.remaining)}${g.person ? ` · ${esc(g.person)}` : ''}</small></span></div>${progress(g.paidValue, g.total, { warn: 2 })}</button></li>`).join('')}</ul>
      </article>`;
    },
    goals: () => `<article class="card">
        <header class="card-head"><h2>Objetivos</h2><a href="#/objetivos" class="link">Ver todos</a></header>
        ${S.goals.length ? `<ul class="list">${S.goals.slice(0, 3).map((g) => {
          const saved = goalSaved(g);
          return `<li><a class="row col" href="#/objetivos"><div class="row-in">${catBadge({ color: g.color, icon: g.icon }, 34)}
            <span class="grow"><b>${esc(g.name)}</b><small>${$m(saved)} de ${$m(g.target)}</small></span><span class="num sm">${Math.round((saved / g.target) * 100)}%</span></div>${progress(saved, g.target, { warn: 2 })}</a></li>`;
        }).join('')}</ul>`
          : empty('target', 'Sem objetivos', 'Crie metas como reserva de emergência ou viagem.', '<a class="btn primary sm" href="#/objetivos">Criar objetivo</a>')}
      </article>`,
    tip: () => `<article class="card tip">
        <header class="card-head"><h2>${icon('lightbulb', 18)} Dica da consultora</h2></header>
        <p>${esc(TIPS[(new Date().getDate() + new Date().getMonth()) % TIPS.length])}</p>
        <a class="btn ghost sm" href="https://wa.me/5514996805832?text=${encodeURIComponent('Olá, Lilian! Vim pelo app Ruffino Finanças e gostaria de uma orientação financeira.')}" target="_blank" rel="noopener">${icon('message-circle', 16)} Falar com a consultora</a>
      </article>`,
  };

  // monta na ordem escolhida: saldo e resumo vizinhos dividem o mesmo cartão escuro; o cartão escuro e os
  // atalhos ocupam a largura toda; os demais blocos vão para a grade (duas colunas no computador)
  const parts = [];
  let grid = [];
  const flush = () => {
    if (grid.length) parts.push(`<div class="grid">${grid.join('')}</div>`);
    grid = [];
  };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === 'balance' || k === 'summary') {
      const pair = keys[i + 1] === (k === 'balance' ? 'summary' : 'balance');
      if (pair) i++;
      flush();
      parts.push(`<article class="hero">${k === 'balance' || pair ? BLOCKS.balance() : ''}${k === 'summary' || pair ? BLOCKS.summary() : ''}</article>`);
    } else if (k === 'quick') {
      flush();
      parts.push(BLOCKS.quick());
    } else {
      const html = BLOCKS[k]?.() || '';
      if (html) grid.push(html);
    }
  }
  flush();

  return `
  <section class="home">
    <header class="home-top">
      <div><p class="eyebrow">${greeting()}</p>${monthSwitcher()}</div>
      <button class="icon-btn" data-action="toggle-hide" aria-label="${UI.hide ? 'Mostrar valores' : 'Ocultar valores'}">${icon(UI.hide ? 'eye-off' : 'eye')}</button>
    </header>
    ${scopeChips()}
    ${S.settings.travelTag ? `<a class="badge-line" href="#/tags">${icon('plane', 14)} Modo viagem ativo · novos lançamentos recebem a tag <b>#${esc(S.settings.travelTag)}</b></a>` : ''}
    ${keys.length ? parts.join('\n    ') : `<article class="card">${empty('layout-dashboard', 'Tela inicial vazia', 'Você desligou todos os blocos do Início.', '<a class="btn primary sm" href="#/personalizar-inicio">Personalizar tela inicial</a>')}</article>`}
  </section>`;
}
