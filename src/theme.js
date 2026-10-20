// Aplica o tema (escuro, claro ou automático) e a cor das barras do sistema.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { S } from './store.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0F1012' : '#F9F9FF');
  if (Capacitor.isNativePlatform()) SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

media.addEventListener?.('change', () => S.settings.theme === 'auto' && applyTheme());
