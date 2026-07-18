import { CARD_RENDERER_VERSIONS, createRandomCardState } from './generator-shared.js';
import { generateGreetingCardV1 } from './generator-v1.js';
import { generateGreetingCardV2 } from './generator-v2.js';
import { generateGreetingCardV3 } from './generator-v3.js';
import { generateGreetingCardV4 } from './generator-v4.js';
import { generateGreetingCardV5 } from './generator-v5.js';
import { generateGreetingCardV6 } from './generator-v6.js';

/**
 * Фасад генератора открыток — выбор версии рендера.
 */

/**
 * Генерирует открытку выбранной версии.
 * @param {{text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6', postProcessSeed: number} | null} cardState
 * @returns {{canvas: HTMLCanvasElement, cardState: {text: string, category: string, signature: string, layout: string, fontStyle: string, rendererVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6', postProcessSeed: number}}}
 */
export function generateGreetingCard(cardState) {
  const state = cardState ?? createRandomCardState(CARD_RENDERER_VERSIONS.v6);
  if (state.rendererVersion === CARD_RENDERER_VERSIONS.v1) {
    return generateGreetingCardV1(state);
  }
  if (state.rendererVersion === CARD_RENDERER_VERSIONS.v2) {
    return generateGreetingCardV2(state);
  }
  if (state.rendererVersion === CARD_RENDERER_VERSIONS.v3) {
    return generateGreetingCardV3(state);
  }
  if (state.rendererVersion === CARD_RENDERER_VERSIONS.v4) {
    return generateGreetingCardV4(state);
  }
  if (state.rendererVersion === CARD_RENDERER_VERSIONS.v5) {
    return generateGreetingCardV5(state);
  }
  assertKnownRendererVersion(state.rendererVersion);
  return generateGreetingCardV6(state);
}

/**
 * @param {string} rendererVersion
 * @returns {asserts rendererVersion is 'v6'}
 */
function assertKnownRendererVersion(rendererVersion) {
  if (rendererVersion !== CARD_RENDERER_VERSIONS.v6) {
    throw new Error(`Unknown renderer version: ${rendererVersion}`);
  }
}
