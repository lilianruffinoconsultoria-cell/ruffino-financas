// Funções utilitárias: formatação de moeda e datas, ícones e arquivos.
import {
  House, ArrowLeftRight, Plus, Target, ChartPie, Ellipsis, Wallet, CreditCard, Landmark, PiggyBank, TrendingUp,
  TrendingDown, Eye, EyeOff, ChevronLeft, ChevronRight, Search, Settings, Tag, Trash2, Pencil, Check, X, Calendar,
  Download, Upload, Lock, Sun, Moon, Utensils, ShoppingCart, Car, HeartPulse, GraduationCap, Shirt, Plane, Gamepad2,
  Wrench, Smartphone, Receipt, Briefcase, PawPrint, Gift, Banknote, Store, Coffee, Fuel, BookOpen, Dumbbell, Baby, Zap,
  Wifi, Coins, CircleHelp, ArrowUp, ArrowDown, Repeat, Layers, ChartColumn, FileText, Lightbulb, Building2, User,
  Delete, CircleCheck, Circle, Info, Sparkles, HandCoins, CalendarClock, Clock, Shield, Palette, Music, Bus, Pill,
  Scissors, Sofa, Laptop, Popcorn, Package, ShoppingBag, Heart, Rocket, Star, ScrollText, Scale, MessageCircle,
  Database, RotateCcw, Contrast, Handshake, UserRound, ArrowUpRight, ArrowDownLeft, TriangleAlert, Cloud, CloudOff, RefreshCw, LogOut, Mail, KeyRound,
} from 'lucide';
import { Capacitor } from '@capacitor/core';

const L = {
  House, ArrowLeftRight, Plus, Target, ChartPie, Ellipsis, Wallet, CreditCard, Landmark, PiggyBank, TrendingUp,
  TrendingDown, Eye, EyeOff, ChevronLeft, ChevronRight, Search, Settings, Tag, Trash2, Pencil, Check, X, Calendar,
  Download, Upload, Lock, Sun, Moon, Utensils, ShoppingCart, Car, HeartPulse, GraduationCap, Shirt, Plane, Gamepad2,
  Wrench, Smartphone, Receipt, Briefcase, PawPrint, Gift, Banknote, Store, Coffee, Fuel, BookOpen, Dumbbell, Baby, Zap,
  Wifi, Coins, CircleHelp, ArrowUp, ArrowDown, Repeat, Layers, ChartColumn, FileText, Lightbulb, Building2, User,
  Delete, CircleCheck, Circle, Info, Sparkles, HandCoins, CalendarClock, Clock, Shield, Palette, Music, Bus, Pill,
  Scissors, Sofa, Laptop, Popcorn, Package, ShoppingBag, Heart, Rocket, Star, ScrollText, Scale, MessageCircle,
  Database, RotateCcw, Contrast, Handshake, UserRound, ArrowUpRight, ArrowDownLeft, TriangleAlert, Cloud, CloudOff, RefreshCw, LogOut, Mail, KeyRound,
};

/** Ícones que o usuário pode escolher para categorias e objetivos. */
export const PICKABLE_ICONS = [
  'utensils', 'coffee', 'shopping-cart', 'shopping-bag', 'house', 'sofa', 'zap', 'wifi', 'car', 'fuel', 'bus', 'plane',
  'heart-pulse', 'pill', 'graduation-cap', 'book-open', 'shirt', 'scissors', 'gamepad-2', 'popcorn', 'music',
  'dumbbell', 'baby', 'paw-print', 'gift', 'heart', 'wrench', 'smartphone', 'laptop', 'receipt', 'scroll-text',
  'briefcase', 'building-2', 'store', 'package', 'banknote', 'coins', 'hand-coins', 'trending-up', 'piggy-bank',
  'landmark', 'wallet', 'rocket', 'star', 'target', 'ellipsis',
];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
export const sum = (list, fn = (x) => x) => round2(list.reduce((a, x) => a + fn(x), 0));

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (v) => BRL.format(round2(v || 0));
export const moneyPlain = (v) => round2(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Aceita "1.234,56", "1234,5", "1234.56" e "R$ 10". */
export function parseMoney(str) {
  let s = String(str ?? '').trim().replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? round2(Math.abs(n)) : 0;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- datas (sempre em texto ISO local: AAAA-MM-DD / AAAA-MM) ----------
export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const monthOf = (iso) => iso.slice(0, 7);
export const thisMonth = () => monthOf(today());

export function addMonths(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
export const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const monthEnd = (ym) => `${ym}-${pad(lastDay(ym))}`;
export const dateIn = (ym, day) => `${ym}-${pad(Math.min(day, lastDay(ym)))}`;
/** Avança uma data em meses mantendo o dia (limitado ao fim do mês). */
export const shiftDate = (iso, months) => dateIn(addMonths(monthOf(iso), months), Number(iso.slice(8, 10)));

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function monthLabel(ym, { short = false, year = true } = {}) {
  const [y, m] = ym.split('-').map(Number);
  const name = short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1];
  return cap(name) + (year ? (short ? `/${String(y).slice(2)}` : ` ${y}`) : '');
}
export function dayLabel(iso) {
  const t = today();
  if (iso === t) return 'Hoje';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === isoDate(y)) return 'Ontem';
  const [yy, mm, dd] = iso.split('-').map(Number);
  const d = new Date(yy, mm - 1, dd);
  return `${cap(WEEK[d.getDay()])}, ${dd} de ${MONTHS[mm - 1]}`;
}
export const shortDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ---------- ícones (Lucide, renderizados como texto SVG) ----------
const pascal = (n) => n.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
export function icon(name, size = 20, cls = '') {
  const node = L[pascal(name)] || L.CircleHelp;
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// ---------- arquivos ----------
export const isNative = () => Capacitor.isNativePlatform();

/** Baixa o arquivo no navegador; no app Android grava no cache e abre o compartilhamento. */
export async function saveFile(name, content, mime) {
  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const r = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [r.uri] });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
