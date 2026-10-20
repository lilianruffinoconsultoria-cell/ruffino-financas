// Gera os ícones (PWA e Android) e a tela de abertura a partir do logo em SVG.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { LOGO_INNER } from '../src/brand.js';

const BG = `<radialGradient id="bg" cx="30%" cy="20%" r="95%"><stop offset="0" stop-color="#2A2C2F"/><stop offset=".6" stop-color="#17181B"/><stop offset="1" stop-color="#0F1012"/></radialGradient>`;

/** Logo centralizado ocupando `scale` do quadro, com ou sem fundo grafite. */
const svg = (size, scale, withBg = true) => {
  const s = size * scale;
  const o = (size - s) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>${BG}</defs>${withBg ? `<rect width="${size}" height="${size}" fill="url(#bg)"/>` : ''}
    <svg x="${o}" y="${o}" width="${s}" height="${s}" viewBox="0 0 64 64">${LOGO_INNER}</svg></svg>`);
};

const out = async (buf, file, size) => {
  await sharp(buf).resize(size, size).png().toFile(file);
  console.log('ok', file);
};

mkdirSync('public/icons', { recursive: true });
mkdirSync('assets', { recursive: true });

await out(svg(512, 0.62), 'public/icons/icon-512.png', 512);
await out(svg(512, 0.62), 'public/icons/icon-192.png', 192);
await out(svg(512, 0.5), 'public/icons/icon-maskable-512.png', 512);
await out(svg(512, 0.62), 'public/icons/apple-touch-icon.png', 180);
// fontes para o @capacitor/assets gerar os ícones e a splash do Android
await out(svg(1024, 0.6), 'assets/icon-only.png', 1024);
await out(svg(1024, 0.42, false), 'assets/icon-foreground.png', 1024);
await out(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs>${BG}</defs><rect width="1024" height="1024" fill="url(#bg)"/></svg>`), 'assets/icon-background.png', 1024);
await out(svg(2732, 0.18), 'assets/splash.png', 2732);
await out(svg(2732, 0.18), 'assets/splash-dark.png', 2732);
