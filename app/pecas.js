// MIRA · peças visuais em React (etiqueta de nível e etiqueta de situação).
// A tela (mira-ui.js) monta o HTML em texto; estas peças são componentes React de verdade, transformados em
// HTML com renderToStaticMarkup para entrar no mesmo caminho. O React escapa o texto sozinho, sem esc().
// Escritas com createElement (sem JSX) porque os testes carregam a tela direto no Node, sem compilador.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Etiqueta da faixa de nível do risco (cores da Figura 5 do MGR, pelos tokens --m0..--m4).
// faixa: 0 Irrelevante … 4 Extremo; nome: nome da faixa; nivel: o número (1 a 25).
export function NivelTag({ faixa, nome, nivel }) {
  return h('span', { className: 'lv lv' + faixa }, nome + ' · ' + nivel);
}

// Etiqueta de situação com tom (ok, warn, bad, info ou neutro). O tom nunca vem sozinho: o texto diz o estado.
export function Etiqueta({ tom, children }) {
  return h('span', { className: 'st' + (tom ? ' ' + tom : '') }, children);
}

// Transforma uma peça React em HTML para a tela montada em texto.
export const html = el => renderToStaticMarkup(el);
