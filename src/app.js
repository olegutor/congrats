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
import { readPublicKeyMetadata } from "./crypto/gpg-crypto.js";
import {
  deletePublicKey,
  loadSavedPublicKeys,
  savePublicKey,
} from "./crypto/public-key-store.js";
import {
  applyDocumentLanguage,
  loadSavedLanguage,
  saveLanguage,
  t,
} from "./i18n.js";

/** @type {import("./i18n.js").AppLanguage} */
let g_language = loadSavedLanguage();

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

  bindLanguageSelect();
  applyUiLanguage(g_language, { regenerateCardText: false });
  bindTabs();
  bindEncodeCryptoMode();
  bindDecodeCryptoMode();
  bindPublicKeyStoreUi();
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
  document.getElementById("copy-payload-button")?.addEventListener("click", () => {
    void copyDecodedPayload();
  });

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
 * side-effects: binds language select
 * @returns {void}
 */
function bindLanguageSelect() {
  const languageSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("language-select")
  );
  assert(languageSelect !== null, "language select missing");
  languageSelect.value = g_language;
  languageSelect.addEventListener("change", () => {
    const selectedLanguage = languageSelect.value;
    assert(
      selectedLanguage === "ru" || selectedLanguage === "en",
      `expected ru|en, got ${selectedLanguage}`,
    );
    applyUiLanguage(selectedLanguage, { regenerateCardText: true });
  });
}

/**
 * side-effects: updates DOM language strings and optionally regenerates card text
 * @param {import("./i18n.js").AppLanguage} language
 * @param {{ regenerateCardText: boolean }} options
 * @returns {void}
 */
function applyUiLanguage(language, options) {
  g_language = language;
  saveLanguage(language);
  applyDocumentLanguage(language);
  refreshSavedPubkeySelect();
  updateCapacityLabel();
  if (options.regenerateCardText) {
    regenerateCard();
  }
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
  const savedKeySelect = /** @type {HTMLSelectElement} */ (
    document.getElementById("saved-pubkey-select")
  );
  const pubkeyNameInput = /** @type {HTMLInputElement} */ (document.getElementById("pubkey-name"));
  const saveKeyButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("save-pubkey-button")
  );
  const deleteKeyButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("delete-pubkey-button")
  );
  assert(passwordInput !== null && pubkeyInput !== null, "encode crypto inputs missing");
  assert(savedKeySelect !== null && pubkeyNameInput !== null, "pubkey store inputs missing");
  assert(saveKeyButton !== null && deleteKeyButton !== null, "pubkey store buttons missing");
  const radios = document.querySelectorAll('input[name="crypto-mode"]');
  const sync = () => {
    const mode = readRadioValue("crypto-mode");
    const pubkeyEnabled = mode === "pubkey";
    const passwordEnabled = mode === "password";
    passwordInput.disabled = !passwordEnabled;
    pubkeyInput.disabled = !pubkeyEnabled;
    savedKeySelect.disabled = !pubkeyEnabled;
    pubkeyNameInput.disabled = !pubkeyEnabled;
    saveKeyButton.disabled = !pubkeyEnabled;
    deleteKeyButton.disabled = !pubkeyEnabled;
    setFieldEnabled(passwordInput, passwordEnabled);
    setFieldEnabled(savedKeySelect, pubkeyEnabled);
    setFieldEnabled(pubkeyNameInput, pubkeyEnabled);
    setFieldEnabled(pubkeyInput, pubkeyEnabled);
    setGroupEnabled(saveKeyButton.parentElement, pubkeyEnabled);
  };
  for (const radio of radios) {
    radio.addEventListener("change", sync);
  }
  sync();
}

/**
 * Toggle visual enabled/disabled state on a field wrapper.
 * side-effects: may toggle class on closest .field
 * @param {HTMLElement} control
 * @param {boolean} enabled
 * @returns {void}
 */
function setFieldEnabled(control, enabled) {
  const field = control.closest(".field");
  if (field !== null) {
    field.classList.toggle("field--disabled", !enabled);
  }
}

/**
 * Toggle visual enabled/disabled state on a button group.
 * side-effects: may toggle class on group element
 * @param {HTMLElement | null} group
 * @param {boolean} enabled
 * @returns {void}
 */
function setGroupEnabled(group, enabled) {
  if (group === null) {
    return;
  }
  group.classList.toggle("controls--disabled", !enabled);
}

/**
 * side-effects: binds save/load/delete for GPG public keys
 * @returns {void}
 */
function bindPublicKeyStoreUi() {
  const savedKeySelect = /** @type {HTMLSelectElement} */ (
    document.getElementById("saved-pubkey-select")
  );
  const pubkeyInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("encode-pubkey"));
  const pubkeyNameInput = /** @type {HTMLInputElement} */ (document.getElementById("pubkey-name"));
  const saveKeyButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("save-pubkey-button")
  );
  const deleteKeyButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("delete-pubkey-button")
  );
  const status = document.getElementById("encode-status");
  assert(savedKeySelect !== null && pubkeyInput !== null && pubkeyNameInput !== null);
  assert(saveKeyButton !== null && deleteKeyButton !== null);

  refreshSavedPubkeySelect();

  /** @type {ReturnType<typeof setTimeout> | null} */
  let pubkeyNameFillTimer = null;
  /** @type {string} last auto-filled default name from key metadata */
  let lastAutoFilledKeyName = "";

  /**
   * Fill key name from armored public key user id / fingerprint.
   * side-effects: may write pubkeyNameInput
   * @returns {Promise<void>}
   */
  async function fillKeyNameFromArmoredKey() {
    const armoredKey = pubkeyInput.value.trim();
    if (!armoredKey.includes("BEGIN PGP PUBLIC KEY")) {
      return;
    }
    const keyMetadata = await readPublicKeyMetadata(armoredKey);
    const currentName = pubkeyNameInput.value.trim();
    const nameIsEmptyOrAuto =
      currentName === "" || currentName === lastAutoFilledKeyName;
    if (!nameIsEmptyOrAuto) {
      return;
    }
    pubkeyNameInput.value = keyMetadata.defaultName;
    lastAutoFilledKeyName = keyMetadata.defaultName;
  }

  pubkeyInput.addEventListener("input", () => {
    if (pubkeyNameFillTimer !== null) {
      clearTimeout(pubkeyNameFillTimer);
    }
    pubkeyNameFillTimer = setTimeout(() => {
      void fillKeyNameFromArmoredKey().catch(() => {
        /* incomplete paste — ignore parse errors while typing */
      });
    }, 300);
  });

  savedKeySelect.addEventListener("change", () => {
    const selectedName = savedKeySelect.value;
    if (!selectedName) {
      return;
    }
    const savedPublicKeys = loadSavedPublicKeys();
    const selectedKey = savedPublicKeys.find((entry) => entry.name === selectedName);
    assert(selectedKey !== undefined, `saved key not found: ${selectedName}`);
    pubkeyInput.value = selectedKey.armored;
    pubkeyNameInput.value = selectedKey.name;
    lastAutoFilledKeyName = selectedKey.name;
  });

  saveKeyButton.addEventListener("click", () => {
    void (async () => {
      try {
        const armoredKey = pubkeyInput.value.trim();
        if (!armoredKey) {
          throw new Error(t(g_language, "needPubkey"));
        }
        const keyMetadata = await readPublicKeyMetadata(armoredKey);
        const keyName = pubkeyNameInput.value.trim() || keyMetadata.defaultName;
        if (!keyName) {
          throw new Error(t(g_language, "needKeyName"));
        }
        pubkeyNameInput.value = keyName;
        lastAutoFilledKeyName = keyMetadata.defaultName;
        savePublicKey({
          name: keyName,
          armored: armoredKey,
          fingerprint: keyMetadata.fingerprint,
        });
        refreshSavedPubkeySelect(keyName);
        setStatus(status, t(g_language, "keySaved"), "ok");
      } catch (error) {
        setStatus(status, error instanceof Error ? error.message : String(error), "error");
      }
    })();
  });

  deleteKeyButton.addEventListener("click", () => {
    const selectedName = savedKeySelect.value || pubkeyNameInput.value.trim();
    if (!selectedName) {
      setStatus(status, t(g_language, "needKeyName"), "error");
      return;
    }
    deletePublicKey(selectedName);
    refreshSavedPubkeySelect();
    setStatus(status, t(g_language, "keyDeleted"), "ok");
  });
}

/**
 * side-effects: rebuilds saved-key <select> options
 * @param {string} [selectedName]
 * @returns {void}
 */
function refreshSavedPubkeySelect(selectedName) {
  const savedKeySelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("saved-pubkey-select")
  );
  if (savedKeySelect === null) {
    return;
  }
  const savedPublicKeys = loadSavedPublicKeys();
  const previousSelection = selectedName ?? savedKeySelect.value;
  savedKeySelect.replaceChildren();
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = t(g_language, "savedKeysNone");
  savedKeySelect.appendChild(emptyOption);
  for (const savedPublicKey of savedPublicKeys) {
    const option = document.createElement("option");
    option.value = savedPublicKey.name;
    option.textContent = savedPublicKey.name;
    savedKeySelect.appendChild(option);
  }
  if (previousSelection && savedPublicKeys.some((entry) => entry.name === previousSelection)) {
    savedKeySelect.value = previousSelection;
  }
}

/**
 * @returns {void}
 */
function bindDecodeCryptoMode() {
  const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("decode-password"));
  assert(passwordInput !== null, "decode password missing");
  const radios = document.querySelectorAll('input[name="decode-mode"]');
  const sync = () => {
    const passwordEnabled = readRadioValue("decode-mode") === "password";
    passwordInput.disabled = !passwordEnabled;
    setFieldEnabled(passwordInput, passwordEnabled);
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
  const locale = g_language === "en" ? "en-US" : "ru-RU";
  capacityLabel.textContent = t(g_language, "capacity", {
    bytes: maxBytes.toLocaleString(locale),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  });
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
  const cardState = createRandomCardState(readSelectedRendererVersion(), g_language);
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
    signature: g_signatureInput.value.trim() || pickRandomSignature(g_language),
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
    throw new Error(t(g_language, "enterSecret"));
  }
  return new TextEncoder().encode(text);
}

/**
 * @returns {Promise<void>}
 */
async function encodeAndDownload() {
  assert(g_previewCanvas !== null && g_currentCardState !== null && g_encodeDownloadButton !== null);
  const status = document.getElementById("encode-status");
  setStatus(status, t(g_language, "embedding"), null);
  g_encodeDownloadButton.disabled = true;
  try {
    const payloadBytes = await readSecretPayloadBytes();
    const cryptoOptions = readEncodeCryptoOptions();
    const imageData = readPreviewImageData();
    const result = await encodeBytesIntoImageData(imageData, payloadBytes, cryptoOptions);
    writePreviewImageData(imageData);
    const pngBlob = await canvasToPngBlob(g_previewCanvas);
    const filename = buildDownloadFilename(g_currentCardState.text, "png");
    downloadBlob(pngBlob, filename);
    setStatus(
      status,
      t(g_language, "doneEncode", {
        changed: result.stegoStats.changedCount,
        alpha: result.stegoStats.embeddingRate.toFixed(3),
        framed: result.framedByteCount,
      }),
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
      throw new Error(t(g_language, "needPassword"));
    }
    return { password: passwordInput.value };
  }
  if (mode === "pubkey") {
    const pubkeyInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("encode-pubkey"));
    assert(pubkeyInput !== null);
    if (!pubkeyInput.value.trim()) {
      throw new Error(t(g_language, "needPubkey"));
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
  const copyButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("copy-payload-button")
  );
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById("stego-file"));
  assert(status !== null && output !== null && downloadButton !== null && fileInput !== null);
  assert(copyButton !== null, "copy button missing");
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus(status, t(g_language, "needPng"), "error");
    return;
  }
  setStatus(status, t(g_language, "extracting"), null);
  downloadButton.disabled = true;
  copyButton.disabled = true;
  g_lastDecodedBytes = null;
  try {
    const imageData = await loadImageFileToImageData(file);
    const decodeMode = readRadioValue("decode-mode");
    if (decodeMode === "pgp") {
      const { armoredPgpMessage, embeddedBytes } = await decodeImageDataToArmoredPgpMessage(imageData);
      g_lastDecodedBytes = embeddedBytes;
      output.value = armoredPgpMessage;
      downloadButton.disabled = false;
      copyButton.disabled = false;
      setStatus(
        status,
        t(g_language, "doneDecodePgp", { bytes: embeddedBytes.length }),
        "ok",
      );
      return;
    }
    /** @type {{ password?: string }} */
    const cryptoOptions = {};
    if (decodeMode === "password") {
      const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("decode-password"));
      assert(passwordInput !== null);
      if (!passwordInput.value) {
        throw new Error(t(g_language, "needPassword"));
      }
      cryptoOptions.password = passwordInput.value;
    }
    const { payloadBytes } = await decodeBytesFromImageData(imageData, cryptoOptions);
    g_lastDecodedBytes = payloadBytes;
    const asText = bytesToUtf8TextIfValid(payloadBytes);
    output.value = asText ?? `[${t(g_language, "binaryData")}, ${payloadBytes.length} ${g_language === "en" ? "bytes" : "байт"}]`;
    downloadButton.disabled = false;
    copyButton.disabled = false;
    setStatus(status, t(g_language, "doneDecode", { bytes: payloadBytes.length }), "ok");
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
 * Copy decoded result text (or UTF-8 payload) to the clipboard.
 * side-effects: writes clipboard, updates decode status
 * @returns {Promise<void>}
 */
async function copyDecodedPayload() {
  const status = document.getElementById("decode-status");
  const output = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("decode-output"));
  assert(output !== null, "decode output missing");
  const textToCopy = output.value;
  if (!textToCopy && g_lastDecodedBytes === null) {
    setStatus(status, t(g_language, "nothingToCopy"), "error");
    return;
  }
  const clipboardText = textToCopy || new TextDecoder().decode(g_lastDecodedBytes);
  await navigator.clipboard.writeText(clipboardText);
  setStatus(status, t(g_language, "copied"), "ok");
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
