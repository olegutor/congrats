import { CARD_RENDERER_VERSIONS, createRandomCardState } from './generator-shared.js';
import { generateGreetingCardV1 } from './generator-v1.js';
import { generateGreetingCardV2 } from './generator-v2.js';
import { generateGreetingCardV3 } from './generator-v3.js';

/**
 * Фасад генератора открыток — выбор версии рендера.
 */

/**
 * Генерирует открытку выбранной версии.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3', postProcessSeed: number} | null} cardState
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3', postProcessSeed: number}}}
 */
export function generateGreetingCard(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v3);
  if (state.rendererVersion === CARD_RENDERER_VERSIONS.v1) {
    return generateGreetingCardV1(state);
  }
  if (state.rendererVersion === CARD_RENDERER_VERSIONS.v2) {
    return generateGreetingCardV2(state);
  }
  return generateGreetingCardV3(state);
}
