// Marca: barras de crescimento com seta, em dourado (mesma linguagem do logo da consultoria).
export const LOGO_INNER = `
  <defs><linearGradient id="rf-gold" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#B38F1F"/><stop offset=".55" stop-color="#D4AF37"/><stop offset="1" stop-color="#E5C378"/></linearGradient></defs>
  <rect x="10" y="40" width="8" height="14" rx="1.5" fill="url(#rf-gold)"/>
  <rect x="22" y="33" width="8" height="21" rx="1.5" fill="url(#rf-gold)"/>
  <rect x="34" y="26" width="8" height="28" rx="1.5" fill="url(#rf-gold)"/>
  <rect x="46" y="19" width="8" height="35" rx="1.5" fill="url(#rf-gold)"/>
  <path d="M8 33 L22 23 L32 26 L52 9" fill="none" stroke="url(#rf-gold)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M43 8.5 L53.5 8 L53 18.5" fill="none" stroke="url(#rf-gold)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;

export const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">${LOGO_INNER}</svg>`;
