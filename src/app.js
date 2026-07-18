/**
 * Browser UI: generate postcard, embed secret into PNG, extract from PNG.
 */

import {
  CARD_HEIGHT,
  CARD_RENDERER_VERSION_LIST,
  CARD_WIDTH,
  assert,
  buildDownloadFilename,
  createRandomCardState,
  generateGreetingCard,
  pickRandomSignature,
} from "./card/index.js";
import {
  decodeBytesFromImageData,
  decodeImageDataToArmoredPgpMessage,
  encodeBytesIntoImageData,
  estimateMaxMessageBits,
} from "./payload/codec.js";
import { bytesToUtf8TextIfValid } from "./crypto/binary-payload.js";

/** @type {HTMLCanvasElement | null} */
let g_previewCanvas = null;

/** @type {HTMLParagraphElement | null} */
let g_loadingLabel = null;

/** @type {HTMLTextAreaElement | null} */
let g_wishTextInput = null;

/** @type {HTMLInputElement | null} */
let g_signatureInput = null;

/** @type {HTMLSelectElement | null} */
let g_rendererVersionSelect = null;

/** @type {HTMLButtonElement | null} */
let g_encodeDownloadButton = null;

/** @type {ReturnType<typeof createRandomCardState> & { exportBackgroundColor?: string } | null} */
let g_currentCardState = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let g_renderDebounceTimer = null;

/** @type {Uint8Array | null} */
let g_secretFileBytes = null;

/** @type {Uint8Array | null} */
let g_lastDecodedBytes = null;

/**
 * side-effects: loads fonts, binds UI, renders first card
 * @returns {Promise<void>}
 */
async function main() {
  g_previewCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("preview-canvas"));
  g_loadingLabel = /** @type {HTMLParagraphElement} */ (document.getElementById("loading-label"));
  g_wishTextInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("wish-text"));
  g_signatureInput = /** @type {HTMLInputElement} */ (document.getElementById("signature-text"));
  g_rendererVersionSelect = /** @type {HTMLSelectElement} */ (
    document.getElementById("renderer-version")
  );
  g_encodeDownloadButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("encode-download-button")
  );

  assert(g_previewCanvas !== null, "preview canvas missing");
  assert(g_loadingLabel !== null, "loading label missing");
  assert(g_wishTextInput !== null, "wish text missing");
  assert(g_signatureInput !== null, "signature missing");
  assert(g_rendererVersionSelect !== null, "renderer select missing");
  assert(g_encodeDownloadButton !== null, "encode button missing");

  bindTabs();
  bindEncodeCryptoMode();
  bindDecodeCryptoMode();
  updateCapacityLabel();

  document.getElementById("generate-button")?.addEventListener("click", () => {
    regenerateCard();
  });
  document.getElementById("apply-button")?.addEventListener("click", () => {
    applyTextEdits();
  });
  g_wishTextInput.addEventListener("input", scheduleRerenderFromInputs);
  g_signatureInput.addEventListener("input", scheduleRerenderFromInputs);
  g_rendererVersionSelect.addEventListener("change", () => {
    regenerateCard();
  });

  document.getElementById("secret-file")?.addEventListener("change", onSecretFileChange);
  document.getElementById("secret-text")?.addEventListener("input", () => {
    g_secretFileBytes = null;
  });
  g_encodeDownloadButton.addEventListener("click", () => {
    void encodeAndDownload();
  });
  document.getElementById("decode-button")?.addEventListener("click", () => {
    void decodeFromUpload();
  });
  document.getElementById("download-payload-button")?.addEventListener("click", downloadDecodedPayload);

  await waitForFontsReady();
  g_loadingLabel.hidden = true;
  g_previewCanvas.hidden = false;
  regenerateCard();
  g_encodeDownloadButton.disabled = false;
}

/**
 * @returns {Promise<void>}
 */
async function waitForFontsReady() {
  await document.fonts.load('96px "Playfair Display"');
  await document.fonts.load('124px "Caveat"');
  await document.fonts.load('56px "Montserrat"');
  await document.fonts.ready;
}

/**
 * @returns {void}
 */
function bindTabs() {
  const tabButtons = document.querySelectorAll(".tabs__btn");
  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      const tabName = button.getAttribute("data-tab");
      assert(tabName === "encode" || tabName === "decode", `bad tab ${tabName}`);
      for (const other of tabButtons) {
        const isActive = other === button;
        other.classList.toggle("tabs__btn--active", isActive);
        other.setAttribute("aria-selected", isActive ? "true" : "false");
      }
      for (const panel of document.querySelectorAll("[data-panel]")) {
        const match = panel.getAttribute("data-panel") === tabName;
        panel.hidden = !match;
        panel.classList.toggle("panel--hidden", !match);
      }
    });
  }
}

/**
 * @returns {void}
 */
function bindEncodeCryptoMode() {
  const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("encode-password"));
  const pubkeyInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("encode-pubkey"));
  assert(passwordInput !== null && pubkeyInput !== null, "encode crypto inputs missing");
  const radios = document.querySelectorAll('input[name="crypto-mode"]');
  const sync = () => {
    const mode = readRadioValue("crypto-mode");
    passwordInput.disabled = mode !== "password";
    pubkeyInput.disabled = mode !== "pubkey";
  };
  for (const radio of radios) {
    radio.addEventListener("change", sync);
  }
  sync();
}

/**
 * @returns {void}
 */
function bindDecodeCryptoMode() {
  const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("decode-password"));
  assert(passwordInput !== null, "decode password missing");
  const radios = document.querySelectorAll('input[name="decode-mode"]');
  const sync = () => {
    passwordInput.disabled = readRadioValue("decode-mode") !== "password";
  };
  for (const radio of radios) {
    radio.addEventListener("change", sync);
  }
  sync();
}

/**
 * @param {string} name
 * @returns {string}
 */
function readRadioValue(name) {
  const checked = /** @type {HTMLInputElement | null} */ (
    document.querySelector(`input[name="${name}"]:checked`)
  );
  assert(checked !== null, `no radio checked for ${name}`);
  return checked.value;
}

/**
 * @returns {void}
 */
function updateCapacityLabel() {
  const capacityLabel = document.getElementById("capacity-label");
  if (capacityLabel === null) {
    return;
  }
  const maxBits = estimateMaxMessageBits(CARD_WIDTH, CARD_HEIGHT);
  const maxBytes = Math.floor(maxBits / 8);
  capacityLabel.textContent = (
    `Ёмкость ~${maxBytes.toLocaleString("ru-RU")} байт секрета `
    + `(α≈0.1, ${CARD_WIDTH}×${CARD_HEIGHT} PNG)`
  );
}

/**
 * @returns {'v1' | 'v2'}
 */
function readSelectedRendererVersion() {
  assert(g_rendererVersionSelect !== null, "renderer select not ready");
  const selectedVersion = g_rendererVersionSelect.value;
  assert(
    CARD_RENDERER_VERSION_LIST.includes(/** @type {'v1'|'v2'} */ (selectedVersion)),
    `Unknown renderer version in UI: ${selectedVersion}`,
  );
  return /** @type {'v1' | 'v2'} */ (selectedVersion);
}

/**
 * @returns {void}
 */
function regenerateCard() {
  const cardState = createRandomCardState(readSelectedRendererVersion());
  renderCardState(cardState);
  syncTextInputsFromState(cardState);
}

/**
 * @returns {void}
 */
function applyTextEdits() {
  assert(g_currentCardState !== null, "no card state");
  const { text, signature } = readTextInputs();
  renderCardState({
    ...g_currentCardState,
    text,
    signature,
    rendererVersion: readSelectedRendererVersion(),
  });
}

/**
 * @returns {void}
 */
function scheduleRerenderFromInputs() {
  if (g_renderDebounceTimer !== null) {
    clearTimeout(g_renderDebounceTimer);
  }
  g_renderDebounceTimer = setTimeout(() => {
    applyTextEdits();
  }, 250);
}

/**
 * @param {ReturnType<typeof createRandomCardState>} cardState
 * @returns {void}
 */
function syncTextInputsFromState(cardState) {
  assert(g_wishTextInput !== null && g_signatureInput !== null && g_rendererVersionSelect !== null);
  g_wishTextInput.value = cardState.text;
  g_signatureInput.value = cardState.signature;
  g_rendererVersionSelect.value = cardState.rendererVersion;
}

/**
 * @returns {{ text: string, signature: string }}
 */
function readTextInputs() {
  assert(g_wishTextInput !== null && g_signatureInput !== null);
  return {
    text: g_wishTextInput.value.trim(),
    signature: g_signatureInput.value.trim() || pickRandomSignature(),
  };
}

/**
 * @param {ReturnType<typeof createRandomCardState>} cardState
 * @returns {void}
 */
function renderCardState(cardState) {
  assert(g_previewCanvas !== null, "preview canvas not ready");
  const { canvas, cardState: renderedState } = generateGreetingCard(cardState);
  const previewContext = g_previewCanvas.getContext("2d");
  assert(previewContext !== null, "preview 2d context unavailable");
  g_previewCanvas.width = canvas.width;
  g_previewCanvas.height = canvas.height;
  previewContext.clearRect(0, 0, g_previewCanvas.width, g_previewCanvas.height);
  previewContext.drawImage(canvas, 0, 0);
  const backgroundColor = renderedState.exportBackgroundColor
    ?? guessBackgroundFromPaletteCategory(renderedState.category);
  g_currentCardState = { ...renderedState, exportBackgroundColor: backgroundColor };
}

/**
 * Fallback if v1/v2 did not set exportBackgroundColor.
 *
 * @param {string} category
 * @returns {string}
 */
function guessBackgroundFromPaletteCategory(category) {
  void category;
  return "#ffffff";
}

/**
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function onSecretFileChange(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  if (!file) {
    g_secretFileBytes = null;
    return;
  }
  g_secretFileBytes = new Uint8Array(await file.arrayBuffer());
  const secretText = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("secret-text"));
  if (secretText !== null) {
    secretText.value = "";
  }
}

/**
 * @returns {Promise<Uint8Array>}
 */
async function readSecretPayloadBytes() {
  if (g_secretFileBytes !== null) {
    return g_secretFileBytes;
  }
  const secretText = /** @type {HTMLTextAreaElement} */ (document.getElementById("secret-text"));
  assert(secretText !== null, "secret text missing");
  const text = secretText.value;
  if (!text) {
    throw new Error("введите секретный текст или выберите файл");
  }
  return new TextEncoder().encode(text);
}

/**
 * @returns {Promise<void>}
 */
async function encodeAndDownload() {
  assert(g_previewCanvas !== null && g_currentCardState !== null && g_encodeDownloadButton !== null);
  const status = document.getElementById("encode-status");
  setStatus(status, "Встраивание…", null);
  g_encodeDownloadButton.disabled = true;
  try {
    const payloadBytes = await readSecretPayloadBytes();
    const cryptoOptions = readEncodeCryptoOptions();
    const imageData = readPreviewImageData();
    const result = await encodeBytesIntoImageData(imageData, payloadBytes, cryptoOptions);
    writePreviewImageData(imageData);
    const pngBlob = await canvasToPngBlob(g_previewCanvas);
    const filename = buildDownloadFilename(g_currentCardState.rendererVersion, "png")
      .replace(".png", "_steg.png");
    downloadBlob(pngBlob, filename);
    setStatus(
      status,
      `Готово: ${result.stegoStats.changedCount} пикс. изменено, `
        + `α=${result.stegoStats.embeddingRate.toFixed(3)}, `
        + `фрейм ${result.framedByteCount} байт`,
      "ok",
    );
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : String(error), "error");
  } finally {
    g_encodeDownloadButton.disabled = false;
  }
}

/**
 * @returns {{ password?: string, publicKeyArmored?: string }}
 */
function readEncodeCryptoOptions() {
  const mode = readRadioValue("crypto-mode");
  if (mode === "password") {
    const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("encode-password"));
    assert(passwordInput !== null);
    if (!passwordInput.value) {
      throw new Error("укажите пароль");
    }
    return { password: passwordInput.value };
  }
  if (mode === "pubkey") {
    const pubkeyInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("encode-pubkey"));
    assert(pubkeyInput !== null);
    if (!pubkeyInput.value.trim()) {
      throw new Error("вставьте публичный ключ GPG");
    }
    return { publicKeyArmored: pubkeyInput.value };
  }
  return {};
}

/**
 * @returns {ImageData}
 */
function readPreviewImageData() {
  assert(g_previewCanvas !== null);
  const context = g_previewCanvas.getContext("2d", { willReadFrequently: true });
  assert(context !== null, "2d context unavailable");
  return context.getImageData(0, 0, g_previewCanvas.width, g_previewCanvas.height);
}

/**
 * side-effects: writes pixels to preview canvas
 * @param {ImageData} imageData
 * @returns {void}
 */
function writePreviewImageData(imageData) {
  assert(g_previewCanvas !== null);
  const context = g_previewCanvas.getContext("2d");
  assert(context !== null, "2d context unavailable");
  context.putImageData(imageData, 0, 0);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("PNG export failed"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

/**
 * @param {Blob} blob
 * @param {string} filename
 * @returns {void}
 */
function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

/**
 * @returns {Promise<void>}
 */
async function decodeFromUpload() {
  const status = document.getElementById("decode-status");
  const output = /** @type {HTMLTextAreaElement} */ (document.getElementById("decode-output"));
  const downloadButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("download-payload-button")
  );
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById("stego-file"));
  assert(status !== null && output !== null && downloadButton !== null && fileInput !== null);
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus(status, "выберите PNG файл", "error");
    return;
  }
  setStatus(status, "Извлечение…", null);
  downloadButton.disabled = true;
  g_lastDecodedBytes = null;
  try {
    const imageData = await loadImageFileToImageData(file);
    const decodeMode = readRadioValue("decode-mode");
    if (decodeMode === "pgp") {
      const { armoredPgpMessage, embeddedBytes } = await decodeImageDataToArmoredPgpMessage(imageData);
      g_lastDecodedBytes = embeddedBytes;
      output.value = armoredPgpMessage;
      downloadButton.disabled = false;
      setStatus(status, `Извлечено ${embeddedBytes.length} байт (PGP MESSAGE)`, "ok");
      return;
    }
    /** @type {{ password?: string }} */
    const cryptoOptions = {};
    if (decodeMode === "password") {
      const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("decode-password"));
      assert(passwordInput !== null);
      if (!passwordInput.value) {
        throw new Error("укажите пароль");
      }
      cryptoOptions.password = passwordInput.value;
    }
    const { payloadBytes } = await decodeBytesFromImageData(imageData, cryptoOptions);
    g_lastDecodedBytes = payloadBytes;
    const asText = bytesToUtf8TextIfValid(payloadBytes);
    output.value = asText ?? `[бинарные данные, ${payloadBytes.length} байт]`;
    downloadButton.disabled = false;
    setStatus(status, `Извлечено ${payloadBytes.length} байт`, "ok");
  } catch (error) {
    output.value = "";
    setStatus(status, error instanceof Error ? error.message : String(error), "error");
  }
}

/**
 * @param {File} file
 * @returns {Promise<ImageData>}
 */
async function loadImageFileToImageData(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  assert(context !== null, "2d context unavailable");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * @returns {void}
 */
function downloadDecodedPayload() {
  if (g_lastDecodedBytes === null) {
    return;
  }
  const blob = new Blob([g_lastDecodedBytes], { type: "application/octet-stream" });
  downloadBlob(blob, "congrads_steg_payload.bin");
}

/**
 * @param {HTMLElement | null} element
 * @param {string} message
 * @param {'ok' | 'error' | null} kind
 * @returns {void}
 */
function setStatus(element, message, kind) {
  if (element === null) {
    return;
  }
  element.textContent = message;
  element.classList.toggle("status--ok", kind === "ok");
  element.classList.toggle("status--error", kind === "error");
}

void main();
