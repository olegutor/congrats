/**
 * Энтропия и детерминированный PRNG для генерации открыток.
 * Вне «карточного» seed — только crypto.getRandomValues (не Date/Math.random).
 */

/** @type {(() => number) | null} */
let g_cardSeededRandom = null;

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Случайное число в [0, 1) из CSPRNG.
 * @returns {number}
 */
export function secureUnitRandom() {
  const entropyWords = new Uint32Array(1);
  crypto.getRandomValues(entropyWords);
  return entropyWords[0] / 4294967296;
}

/**
 * 32-битный seed из CSPRNG (два слова XOR/mix — запас энтропии на коллизии).
 * @returns {number} uint32
 */
export function createEntropySeed() {
  const entropyWords = new Uint32Array(2);
  crypto.getRandomValues(entropyWords);
  return (entropyWords[0] ^ Math.imul(entropyWords[1], 0x9E3779B9)) >>> 0;
}

/**
 * Воспроизводимый генератор [0, 1) по uint32 seed (Mulberry32).
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRandom(seed) {
  assert(Number.isFinite(seed), `Expected finite seed, got ${seed}`);
  let currentState = seed >>> 0;
  return () => {
    currentState = (currentState + 0x6D2B79F5) >>> 0;
    let mixedState = currentState;
    mixedState = Math.imul(mixedState ^ (mixedState >>> 15), mixedState | 1);
    mixedState ^= mixedState + Math.imul(mixedState ^ (mixedState >>> 7), mixedState | 61);
    return ((mixedState ^ (mixedState >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} seededRandom
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
export function seededRange(seededRandom, minimum, maximum) {
  assert(maximum > minimum, `Expected maximum > minimum, got ${maximum} <= ${minimum}`);
  return minimum + seededRandom() * (maximum - minimum);
}

/**
 * @param {() => number} seededRandom
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
export function seededInt(seededRandom, minimum, maximum) {
  assert(
    Number.isInteger(minimum) && Number.isInteger(maximum),
    `Expected integer bounds, got ${minimum}..${maximum}`,
  );
  assert(maximum >= minimum, `Expected maximum >= minimum, got ${maximum} < ${minimum}`);
  return minimum + Math.floor(seededRandom() * (maximum - minimum + 1));
}

/**
 * Выполняет callback с активным карточным seed: randomRange/randomInt становятся детерминированными.
 * @template T
 * @param {number} seed — uint32
 * @param {() => T} callback
 * @returns {T}
 * side-effects: временно подменяет g_cardSeededRandom
 */
export function runWithCardSeed(seed, callback) {
  assert(g_cardSeededRandom === null, 'nested runWithCardSeed is not supported');
  g_cardSeededRandom = createSeededRandom(seed);
  try {
    return callback();
  } finally {
    g_cardSeededRandom = null;
  }
}

/**
 * Псевдослучайное число в [min, max). Под seed карточки — детерминировано, иначе CSPRNG.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomRange(min, max) {
  const unitSample = g_cardSeededRandom !== null ? g_cardSeededRandom() : secureUnitRandom();
  return min + unitSample * (max - min);
}

/**
 * Случайное целое в [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}
