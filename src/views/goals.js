// Objetivos (metas de economia) com depósitos, retiradas e quanto guardar por mês.
import { S, save, goalSaved, COLORS } from '../store.js';
import { esc, icon, uid, parseMoney, moneyPlain, today, monthOf, round2, shortDate, PICKABLE_ICONS } from '../util.js';
import { $m, pageHead, progress, catBadge, empty, on, rerender, openSheet, closeSheet, toast, confirmSheet } from '../ui.js';

const monthsUntil = (iso) => {
  const [y1, m1] = monthOf(today()).split('-').map(Number);
  const [y2, m2] = monthOf(iso).split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};

export function renderGoals() {
  return `<section>
    ${pageHead('Objetivos', { back: '#/mais', right: `<button class="btn primary sm" data-action="goal-form">${icon('plus', 16)} Novo</button>` })}
    ${S.goals.length ? `<div class="grid">${S.goals.map((g) => {
      const saved = goalSaved(g);
      const left = Math.max(0, g.target - saved);
      const months = g.deadline ? monthsUntil(g.deadline) : 0;
      const done = saved >= g.target;
      return `<article class="card goal">
        <header class="row">${catBadge({ color: g.color, icon: g.icon }, 42)}
          <span class="grow"><b>${esc(g.name)}</b><small>${g.deadline ? `Até ${shortDate(g.deadline)}` : 'Sem prazo'}</small></span>
          <button class="icon-btn" data-action="goal-form" data-id="${g.id}" aria-label="Editar objetivo">${icon('pencil', 18)}</button></header>
        <div class="goal-nums"><b>${$m(saved)}</b><span class="muted">de ${$m(g.target)}</span><span class="num sm">${Math.min(100, Math.round((saved / g.target) * 100))}%</span></div>
        ${progress(saved, g.target, { warn: 2 })}
        <p class="hint">${done ? `${icon('circle-check', 16, 'pos')} <b>Objetivo alcançado!</b>` : months > 0 ? `Guarde <b>${$m(left / months)}</b> por mês para chegar lá em ${months} ${months === 1 ? 'mês' : 'meses'}.` : g.deadline ? `Prazo encerrado · faltam ${$m(left)}.` : `Faltam ${$m(left)}.`}</p>
        <div class="toolbar"><button class="btn primary sm" data-action="goal-move" data-id="${g.id}" data-dir="1">${icon('plus', 16)} Depositar</button>
          <button class="btn ghost sm" data-action="goal-move" data-id="${g.id}" data-dir="-1">Retirar</button></div>
      </article>`;
    }).join('')}</div>` : `<article class="card">${empty('target', 'Nenhum objetivo ainda', 'Reserva de emergência, viagem, troca de carro… Defina um valor e um prazo e acompanhe o progresso.', `<button class="btn primary sm" data-action="goal-form">Criar objetivo</button>`)}</article>`}
  </section>`;
}

on({
  'goal-form': (el) => {
    const g = el.dataset.id ? S.goals.find((x) => x.id === el.dataset.id) : null;
    const v = g || { icon: 'target', color: COLORS[S.goals.length % COLORS.length] };
    openSheet(`<form class="tx-form"><h2 class="sheet-title">${g ? 'Editar objetivo' : 'Novo objetivo'}</h2>
      <label class="field"><span>Nome</span><input name="name" maxlength="40" value="${esc(v.name || '')}" placeholder="Ex.: Reserva de emergência" autofocus></label>
      <label class="amount-field"><span>Valor do objetivo</span><div><em>R$</em><input name="target" inputmode="decimal" value="${v.target ? moneyPlain(v.target) : ''}" placeholder="0,00"></div></label>
      <label class="field"><span>Prazo (opcional)</span><input type="date" name="deadline" value="${v.deadline || ''}"></label>
      <fieldset class="field"><legend>Ícone</legend><div class="icon-grid">${PICKABLE_ICONS.map((i) => `<label><input type="radio" name="icon" value="${i}" ${i === v.icon ? 'checked' : ''}><span>${icon(i, 18)}</span></label>`).join('')}</div></fieldset>
      <div class="field"><span>Cor</span><div class="swatches">${COLORS.map((c) => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === v.color ? 'checked' : ''}><span></span></label>`).join('')}</div></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="form-actions">${g ? `<button type="button" class="btn ghost danger" data-del>${icon('trash-2', 18)} Excluir</button>` : ''}<button class="btn primary">${icon('check', 18)} Salvar</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const target = parseMoney(f.target.value);
          if (!f.name.value.trim() || !target) {
            const er = f.querySelector('.form-error');
            er.textContent = 'Informe o nome e o valor do objetivo.';
            er.hidden = false;
            return;
          }
          const data = { name: f.name.value.trim(), target, deadline: f.deadline.value || null, icon: f.icon.value || 'target', color: f.color.value };
          if (g) Object.assign(g, data);
          else S.goals.push({ id: uid(), deposits: [], ...data });
          save();
          closeSheet();
          toast('Objetivo salvo.');
          rerender();
        });
        sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
          if (!(await confirmSheet({ title: `Excluir “${g.name}”?`, options: [{ label: 'Excluir', value: 'yes', danger: true }] }))) return;
          S.goals = S.goals.filter((x) => x.id !== g.id);
          save();
          rerender();
        });
      },
    });
  },
  'goal-move': (el) => {
    const g = S.goals.find((x) => x.id === el.dataset.id);
    const dir = Number(el.dataset.dir);
    openSheet(`<form class="tx-form"><h2 class="sheet-title">${dir > 0 ? 'Depositar em' : 'Retirar de'} ${esc(g.name)}</h2>
      <label class="amount-field"><span>Valor</span><div><em>R$</em><input name="amount" inputmode="decimal" placeholder="0,00" autofocus></div></label>
      <label class="field"><span>Data</span><input type="date" name="date" value="${today()}"></label>
      <p class="hint">Saldo guardado: ${$m(goalSaved(g))}. O valor fica registrado só no objetivo; se movimentou dinheiro entre contas, lance também uma transferência.</p>
      <div class="form-actions"><button class="btn primary">${icon('check', 18)} Confirmar</button></div></form>`, {
      onMount(sheet) {
        const f = sheet.querySelector('form');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const amount = parseMoney(f.amount.value);
          if (!amount) return;
          g.deposits.push({ date: f.date.value || today(), amount: round2(amount * dir) });
          save();
          closeSheet();
          toast(dir > 0 ? 'Depósito registrado.' : 'Retirada registrada.');
          rerender();
        });
      },
    });
  },
});
