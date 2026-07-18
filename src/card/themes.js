import { randomInt } from './rng.js';

/**
 * Палитры и декоративные профили открыток.
 * Цвета подобраны под реальные бумажные открытки — приглушённые, тёплые.
 */

/** @type {Readonly<Record<string, {background: string[], accent: string, text: string, textShadow: string, decor: string}>>} */
export const CATEGORY_PALETTES = Object.freeze({
  morning: {
    background: ['#FFF8F0', '#FFE8C8', '#FFD4A8'],
    accent: '#C4785A',
    text: '#4A3728',
    textShadow: 'rgba(74, 55, 40, 0.08)',
    decor: '#E8A87C',
  },
  day: {
    background: ['#F5F9FC', '#E3EEF5', '#D4E4ED'],
    accent: '#6B8FAD',
    text: '#2C3E50',
    textShadow: 'rgba(44, 62, 80, 0.08)',
    decor: '#98B4C8',
  },
  evening: {
    background: ['#F3EFF8', '#E4DCF0', '#D5CBE8'],
    accent: '#7B6B9A',
    text: '#3D3452',
    textShadow: 'rgba(61, 52, 82, 0.1)',
    decor: '#A898C0',
  },
  health: {
    background: ['#F2F8F4', '#E0EFE6', '#C8E0D0'],
    accent: '#5A8F6E',
    text: '#2D4A38',
    textShadow: 'rgba(45, 74, 56, 0.08)',
    decor: '#7BA88A',
  },
  success: {
    background: ['#FFFBF0', '#F5EDD8', '#EBE0C0'],
    accent: '#B8923A',
    text: '#4A4028',
    textShadow: 'rgba(74, 64, 40, 0.1)',
    decor: '#C9A84C',
  },
  mood: {
    background: ['#FFF5F8', '#FFE8EF', '#FFD6E3'],
    accent: '#C76B8A',
    text: '#4A3040',
    textShadow: 'rgba(74, 48, 64, 0.08)',
    decor: '#E098B0',
  },
  friendship: {
    background: ['#F8F6F2', '#EDE8DF', '#E0D8CC'],
    accent: '#8B7355',
    text: '#3E3428',
    textShadow: 'rgba(62, 52, 40, 0.08)',
    decor: '#A89070',
  },
  warmth: {
    background: ['#FFF6F2', '#FFEAE0', '#FFD8C8'],
    accent: '#C46850',
    text: '#4A3028',
    textShadow: 'rgba(74, 48, 40, 0.08)',
    decor: '#E09078',
  },
  gratitude: {
    background: ['#F6F4F0', '#EBE6DE', '#DDD6CA'],
    accent: '#7A6B58',
    text: '#3A342C',
    textShadow: 'rgba(58, 52, 44, 0.08)',
    decor: '#9A8870',
  },
  holiday: {
    background: ['#FFF8F5', '#FFEDE5', '#FFE0D4'],
    accent: '#B85C48',
    text: '#4A2820',
    textShadow: 'rgba(74, 40, 32, 0.1)',
    decor: '#D08068',
  },
});

/** @type {ReadonlyArray<'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'>} */
export const LAYOUT_VARIANTS = Object.freeze([
  'classic',
  'corner',
  'minimal',
  'ribbon',
  'botanical',
]);

/** @type {ReadonlyArray<'serif' | 'script' | 'mixed'>} */
export const FONT_VARIANTS = Object.freeze(['serif', 'script', 'mixed']);

/**
 * Возвращает палитру для категории пожелания.
 * @param {string} category
 * @returns {{background: string[], accent: string, text: string, textShadow: string, decor: string}}
 */
export function getPaletteForCategory(category) {
  const palette = CATEGORY_PALETTES[category];
  if (palette !== undefined) {
    return palette;
  }
  return CATEGORY_PALETTES.day;
}

/**
 * Случайный вариант оформления.
 * @returns {'classic' | 'corner' | 'minimal' | 'ribbon' | 'botanical'}
 */
export function pickRandomLayout() {
  const index = randomInt(0, LAYOUT_VARIANTS.length - 1);
  return LAYOUT_VARIANTS[index];
}

/**
 * Случайный набор шрифтов.
 * @returns {'serif' | 'script' | 'mixed'}
 */
export function pickRandomFontStyle() {
  const index = randomInt(0, FONT_VARIANTS.length - 1);
  return FONT_VARIANTS[index];
}
