// Estado de tela, registro de ações, painéis (bottom sheets), avisos e gráficos em SVG.
import { S } from './store.js';
import { money, esc, icon, monthLabel, thisMonth, round2 } from './util.js';

export const UI = {
  month: thisMonth(),
  scope: 'all',
  hide: S.settings.hide,
  txType: 'all',
  txQuery: '',
  pendingOnly: false,
  catTab: 'expense',
  invoice: {},
  reportTab: 'expense',
};

/** Ações acionadas por data-action="nome" nos elementos (delegação de eventos). */
export const ACTIONS = {};
export const on = (map) => Object.assign(ACTIONS, map);

let rerenderFn = () => {};
export const setRerender = (fn) => (rerenderFn = fn);
export const rerender = () => rerenderFn();

export const $m = (v) => (UI.hide ? 'R$ •••••' : money(v));
export const go = (hash) => (location.hash = hash);

// ---------- componentes ----------
export function monthSwitcher() {
  return `<div class="month-switch">
    <button class="icon-btn" data-action="month" data-step="-1" aria-label="Mês anterior">${icon('chevron-left')}</button>
    <button class="month-label" data-action="month" data-step="0" title="Voltar para o mês atual">${monthLabel(UI.month)}</button>
    <button class="icon-btn" data-action="month" data-step="1" aria-label="Próximo mês">${icon('chevron-right')}</button>
  </div>`;
}

export function scopeChips() {
  const opts = [['all', 'Tudo'], ['pf', 'Pessoal'], ['pj', 'Empresa']];
  return `<div class="chips" role="tablist" aria-label="Escopo">${opts
    .map(([v, l]) => `<button class="chip ${UI.scope === v ? 'on' : ''}" role="tab" aria-selected="${UI.scope === v}" data-action="scope" data-v="${v}">${l}</button>`)
    .join('')}</div>`;
}

export function pageHead(title, { back = null, right = '' } = {}) {
  return `<header class="page-head">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Voltar">${icon('chevron-left')}</a>` : ''}
    <h1>${esc(title)}</h1><div class="head-right">${right}</div></header>`;
}

export const catBadge = (c, size = 40) =>
  `<span class="cat-badge" style="--c:${c.color};width:${size}px;height:${size}px">${icon(c.icon, Math.round(size * 0.48))}</span>`;

export function progress(value, max, { warn = 0.8 } = {}) {
  const r = max > 0 ? value / max : 0;
  const state = r > 1 ? 'over' : r >= warn ? 'warn' : 'ok';
  return `<div class="bar ${state}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(r, 1) * 100)}"><span style="width:${Math.min(r, 1) * 100}%"></span></div>`;
}

export const empty = (ic, title, text, cta = '') =>
  `<div class="empty">${icon(ic, 34)}<h3>${title}</h3><p>${text}</p>${cta}</div>`;

// ---------- painel inferior (sheet) ----------
let sheetCleanup = null;
export function openSheet(html, { onMount, wide = false } = {}) {
  const root = document.getElementById('sheet-root');
  const wasOpen = !!root.firstChild;
  if (wasOpen && typeof sheetCleanup === 'function') sheetCleanup();
  sheetCleanup = null;
  root.innerHTML = `<div class="sheet-backdrop" data-sheet-close><div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="sheet-grip" aria-hidden="true"></div>${html}</div></div>`;
  document.body.classList.add('no-scroll');
  if (!wasOpen) history.pushState({ sheet: true }, '');
  const sheet = root.querySelector('.sheet');
  const first = sheet.querySelector('[autofocus]') || sheet.querySelector('input,select,textarea,button');
  setTimeout(() => first?.focus({ preventScroll: true }), 60);
  sheetCleanup = onMount ? onMount(sheet) : null;
  return sheet;
}
export function removeSheet() {
  const root = document.getElementById('sheet-root');
  if (!root.firstChild) return;
  if (typeof sheetCleanup === 'function') sheetCleanup();
  sheetCleanup = null;
  root.innerHTML = '';
  document.body.classList.remove('no-scroll');
}
export function closeSheet() {
  if (history.state?.sheet) history.back();
  else removeSheet();
}
export const sheetOpen = () => !!document.getElementById('sheet-root').firstChild;

export function confirmSheet({ title, text = '', options }) {
  return new Promise((resolve) => {
    openSheet(
      `<h2 class="sheet-title">${esc(title)}</h2>${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="stack">${options.map((o, i) => `<button class="btn ${o.danger ? 'danger' : i === 0 ? 'primary' : 'ghost'}" data-choice="${o.value}">${esc(o.label)}</button>`).join('')}
      <button class="btn ghost" data-choice="">Cancelar</button></div>`,
      {
        onMount(el) {
          let chosen = null;
          el.addEventListener('click', (e) => {
            const b = e.target.closest('[data-choice]');
            if (!b) return;
            chosen = b.dataset.choice || null;
            closeSheet();
          });
          return () => resolve(chosen);
        },
      },
    );
  });
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- gráficos ----------
export function donut(segments, { size = 168, thickness = 20, label = '', value = '' } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const gap = segments.length > 1 ? 2 : 0;
  const arcs = total
    ? segments
        .map((s) => {
          const len = Math.max((s.value / total) * C - gap, 0.5);
          const el = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${s.color}" stroke-width="${thickness}"
            stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}"><title>${esc(s.label)}: ${money(s.value)}</title></circle>`;
          acc += (s.value / total) * C;
          return el;
        })
        .join('')
    : '';
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--track)" stroke-width="${thickness}"/>
    <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
    <text x="50%" y="46%" text-anchor="middle" class="donut-k">${esc(label)}</text>
    <text x="50%" y="60%" text-anchor="middle" class="donut-v">${esc(value)}</text></svg>`;
}

/** Barras agrupadas: [{ label, a, b }] (a = receitas, b = despesas). */
export function barsChart(data, { h = 190 } = {}) {
  const w = 340;
  const pad = { t: 12, b: 26, l: 6, r: 6 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const slot = (w - pad.l - pad.r) / data.length;
  const bw = Math.min(16, slot / 3.2);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const bars = data
    .map((d, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const ya = y(d.a);
      const yb = y(d.b);
      return `<rect x="${cx - bw - 1.5}" y="${ya}" width="${bw}" height="${h - pad.b - ya}" rx="3" class="b-inc"><title>Receitas ${d.label}: ${money(d.a)}</title></rect>
        <rect x="${cx + 1.5}" y="${yb}" width="${bw}" height="${h - pad.b - yb}" rx="3" class="b-exp"><title>Despesas ${d.label}: ${money(d.b)}</title></rect>
        <text x="${cx}" y="${h - 8}" text-anchor="middle" class="axis">${esc(d.label)}</text>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Receitas e despesas por mês">
    <line x1="0" x2="${w}" y1="${h - pad.b}" y2="${h - pad.b}" class="grid"/>${bars}</svg>`;
}

/** Linha com área: [{ label, v }]. */
export function lineChart(points, { h = 170 } = {}) {
  const w = 340;
  const pad = { t: 16, b: 26, l: 8, r: 8 };
  const vals = points.map((p) => p.v);
  let min = Math.min(...vals, 0);
  let max = Math.max(...vals, 1);
  if (max === min) max = min + 1;
  const x = (i) => pad.l + ((w - pad.l - pad.r) * i) / Math.max(1, points.length - 1);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${h - pad.b} L${x(0)},${h - pad.b} Z`;
  const zero = min < 0 ? `<line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" class="grid dashed"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolução do saldo">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".35"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    ${zero}<path d="${area}" fill="url(#lg)"/><path d="${path}" class="line"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.5" class="dot"><title>${esc(p.label)}: ${money(p.v)}</title></circle>
      <text x="${x(i)}" y="${h - 8}" text-anchor="middle" class="axis">${esc(p.label)}</text>`).join('')}</svg>`;
}

export const pct = (part, total) => (total > 0 ? `${round2((part / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%');
