'use strict';

/**
 * Ilustraciones de producto en SVG plano, con la paleta de Globo.
 * Sustituir por fotografía real cambiando el campo `imagen` de cada artículo.
 */

const FONDOS = ['#FBDCE8', '#D8F4EC', '#EBE0F6', '#FCEFD6'];

function fondo(indice, tinte) {
  const f = FONDOS[indice % FONDOS.length];
  return `
  <rect width="600" height="750" fill="${f}"/>
  <circle cx="300" cy="335" r="215" fill="#FFFFFF" opacity=".75"/>
  <g opacity=".5" fill="none" stroke="${tinte}" stroke-width="1.6">
    <circle cx="300" cy="335" r="216"/>
  </g>`;
}

/* Los globos del logotipo, como firma discreta en cada ficha. */
function globos(tinte) {
  return `
  <g opacity=".5">
    <path d="M92 112c0 16-11 27-19 27s-19-11-19-27a19 19 0 0 1 38 0Z" fill="#F4A9C5"/>
    <path d="M73 139c2 10-4 14-2 24" stroke="#DCB6CA" stroke-width="1.6" fill="none"/>
    <path d="M132 96c0 15-10 26-18 26s-18-11-18-26a18 18 0 0 1 36 0Z" fill="#C1AAD4"/>
    <path d="M114 122c2 12-5 18-3 30" stroke="#DCB6CA" stroke-width="1.6" fill="none"/>
    <path d="M166 120c0 14-9 24-16 24s-16-10-16-24a16 16 0 0 1 32 0Z" fill="#8BDCC6"/>
    <path d="M150 144c2 9-4 14-2 22" stroke="#DCB6CA" stroke-width="1.6" fill="none"/>
  </g>`;
}

function sombra() {
  return `<ellipse cx="300" cy="616" rx="146" ry="16" fill="#4A4550" opacity=".045"/>`;
}

const PRENDAS = {
  camiseta: (c, d) => `
    <path d="M225 175 L180 150 L120 200 L165 258 L200 232 L200 500 Q300 516 400 500 L400 232 L435 258 L480 200 L420 150 L375 175 Q300 214 225 175Z" fill="${c}"/>
    <path d="M225 175 Q300 214 375 175 Q300 200 225 175Z" fill="${d}"/>
    <path d="M200 430 Q300 446 400 430 L400 448 Q300 464 200 448Z" fill="${d}" opacity=".75"/>`,

  sudadera: (c, d) => `
    <path d="M215 185 L165 158 L104 214 L156 272 L196 240 L196 520 Q300 538 404 520 L404 240 L444 272 L496 214 L435 158 L385 185 Q300 226 215 185Z" fill="${c}"/>
    <path d="M215 185 Q252 128 300 128 Q348 128 385 185 Q300 226 215 185Z" fill="${d}"/>
    <path d="M244 452 h112 a10 10 0 0 1 10 10 v40 a10 10 0 0 1 -10 10 h-112 a10 10 0 0 1 -10 -10 v-40 a10 10 0 0 1 10 -10Z" fill="${d}" opacity=".85"/>
    <path d="M282 150 v54M318 150 v54" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" fill="none"/>`,

  chaqueta: (c, d) => `
    <path d="M212 178 L162 152 L100 210 L154 268 L194 236 L194 524 Q300 542 406 524 L406 236 L446 268 L500 210 L438 152 L388 178 Q300 220 212 178Z" fill="${c}"/>
    <path d="M292 190 h16 v340 h-16Z" fill="#FFFFFF" opacity=".9"/>
    <path d="M212 178 Q300 220 388 178 L376 206 Q300 244 224 206Z" fill="${d}"/>
    <circle cx="300" cy="196" r="11" fill="${d}"/>`,

  vestido: (c, d) => `
    <path d="M232 178 L196 156 L146 202 L188 250 L216 228 L166 540 Q300 578 434 540 L384 228 L412 250 L454 202 L404 156 L368 178 Q300 214 232 178Z" fill="${c}"/>
    <path d="M232 178 Q300 214 368 178 Q300 202 232 178Z" fill="${d}"/>
    <path d="M204 386 Q300 414 396 386 L404 424 Q300 452 196 424Z" fill="${d}" opacity=".8"/>`,

  falda: (c, d) => `
    <path d="M198 250 h204 l52 288 Q300 574 146 538Z" fill="${c}"/>
    <rect x="192" y="222" width="216" height="42" rx="18" fill="${d}"/>
    <path d="M258 264 l-22 282M342 264 l22 282" stroke="#FFFFFF" stroke-width="5" opacity=".5" fill="none"/>`,

  pantalon: (c, d) => `
    <path d="M204 210 h192 l16 128 -8 232 h-78 l-26 -230 -26 230 h-78 l-8 -232Z" fill="${c}"/>
    <rect x="198" y="188" width="204" height="40" rx="16" fill="${d}"/>
    <path d="M300 340 v-96" stroke="#FFFFFF" stroke-width="5" opacity=".45" fill="none"/>`,

  body: (c, d) => `
    <path d="M228 196 L188 172 L132 222 L176 274 L210 248 L210 400 Q210 486 300 512 Q390 486 390 400 L390 248 L424 274 L468 222 L412 172 L372 196 Q300 232 228 196Z" fill="${c}"/>
    <path d="M228 196 Q300 232 372 196 Q300 218 228 196Z" fill="${d}"/>
    <g fill="#FFFFFF"><circle cx="268" cy="470" r="8"/><circle cx="300" cy="482" r="8"/><circle cx="332" cy="470" r="8"/></g>`,

  pelele: (c, d) => `
    <path d="M232 186 L190 160 L136 214 L182 268 L214 240 L214 350 L196 560 h84 l20 -170 20 170 h84 L386 350 L386 240 L418 268 L464 214 L410 160 L368 186 Q300 222 232 186Z" fill="${c}"/>
    <path d="M232 186 Q300 222 368 186 Q300 208 232 186Z" fill="${d}"/>
    <path d="M196 560 h84 a42 22 0 0 1 -84 0ZM320 560 h84 a42 22 0 0 1 -84 0Z" fill="${d}"/>`,

  ranita: (c, d) => `
    <path d="M236 200 L200 176 L152 226 L196 272 L224 250 L224 386 Q224 452 300 470 Q376 452 376 386 L376 250 L404 272 L448 226 L400 176 L364 200 Q300 232 236 200Z" fill="${c}"/>
    <path d="M236 200 Q300 232 364 200 Q300 220 236 200Z" fill="${d}"/>
    <path d="M228 400 q72 26 144 0 l-8 44 q-64 22 -128 0Z" fill="${d}" opacity=".8"/>`,

  banador: (c, d) => `
    <path d="M186 244 h228 l-14 168 h-84 l-16 -84 -16 84 h-84Z" fill="${c}"/>
    <rect x="180" y="222" width="240" height="38" rx="18" fill="${d}"/>
    <path d="M186 300 h228" stroke="#FFFFFF" stroke-width="6" opacity=".45" fill="none"/>`,

  zapato: (c, d) => `
    <path d="M136 466 q4 -74 62 -104 l72 -38 q22 -12 40 4 l34 30 q18 16 44 22 l96 22 q40 10 42 44 l2 26 q0 22 -24 22 H166 q-30 0 -30 -28Z" fill="${c}"/>
    <path d="M136 470 h348 q24 0 24 22 v14 q0 12 -14 12 H160 q-24 0 -24 -22Z" fill="${d}"/>
    <path d="M244 386 l64 34M268 352 l64 34" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" fill="none"/>`,

  gorro: (c, d) => `
    <path d="M300 202 q96 0 108 132 h-216 q12 -132 108 -132Z" fill="${c}"/>
    <path d="M112 334 q188 -34 376 0 q-4 40 -188 40 q-184 0 -188 -40Z" fill="${d}"/>
    <path d="M204 300 q96 -22 192 0" stroke="#FFFFFF" stroke-width="9" fill="none" stroke-linecap="round"/>`,

  lazo: (c, d) => `
    <path d="M300 330 q-70 -78 -118 -40 q-42 34 6 76 q34 30 112 26Z" fill="${c}"/>
    <path d="M300 330 q70 -78 118 -40 q42 34 -6 76 q-34 30 -112 26Z" fill="${c}"/>
    <circle cx="300" cy="336" r="30" fill="${d}"/>
    <path d="M282 366 l-26 96M318 366 l26 96" stroke="${c}" stroke-width="20" stroke-linecap="round" fill="none"/>`,

  mochila: (c, d) => `
    <rect x="180" y="248" width="240" height="286" rx="54" fill="${c}"/>
    <path d="M228 262 q0 -74 72 -74 q72 0 72 74" stroke="${d}" stroke-width="18" fill="none"/>
    <rect x="180" y="392" width="240" height="96" rx="30" fill="${d}"/>
    <rect x="278" y="424" width="44" height="30" rx="10" fill="#FFFFFF"/>`
};

/** @returns {string} SVG completo de 600×750 */
function generarSVG(tipo, color, colorOscuro, indice = 0) {
  const dibujar = PRENDAS[tipo] || PRENDAS.camiseta;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750" role="img">
${fondo(indice, colorOscuro)}
${globos(colorOscuro)}
${sombra()}
${dibujar(color, colorOscuro)}
</svg>`;
}

module.exports = { generarSVG, TIPOS: Object.keys(PRENDAS) };
