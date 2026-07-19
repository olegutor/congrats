/**
 * Browser UI: generate postcard, embed secret into PNG, extract from PNG.
 */

import {
  CARD_RENDERER_VERSION_LIST,
  assert,
  buildDownloadFilename,
  createRandomCardState,
  generateGreetingCard,
} from "./card/index.js";
import {
  DEFAULT_EXPORT_SIZE_ID,
  getExportSizePreset,
  scaleCanvasToSize,
} from "./card/export-size.js";
import {
  decodeBytesFromImageData,
  decodeBytesFromJpegBytes,
  decodeImageDataToBinaryGpgMessage,
  encodeBytesIntoImageData,
  encodeBytesIntoJpegBytes,
  estimateJpegGhostCapacityBytes,
  estimateMaxMessageBits,
  isJpegByteArray,
  selectGpgProfileForImage,
} from "./payload/codec.js";
import { bytesToUtf8TextIfValid } from "./crypto/binary-payload.js";
import {
  binaryOpenPgpToArmoredMessage,
  readPublicKeyMetadata,
} from "./crypto/gpg-crypto.js";
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
let g_encodeButton = null;

/** @type {HTMLButtonElement | null} */
let g_downloadImageButton = null;

/** @type {HTMLButtonElement | null} */
let g_copyImageButton = null;

/** True after successful embed; preview shows stego as <img> for mobile copy. */
let g_previewHasStego = false;

/** @type {Blob | null} */
let g_lastStegoBlob = null;

/** @type {'png' | 'jpeg' | null} */
let g_lastStegoFormat = null;

/** @type {string | null} */
let g_encodePreviewObjectUrl = null;

/** @type {string | null} */
let g_decodePreviewObjectUrl = null;

/** @type {ReturnType<typeof createRandomCardState> & { exportBackgroundColor?: string } | null} */
let g_currentCardState = null;

/**
 * Uploaded cover image for encoding (optional).
 * @type {{
 *   originalBytes: Uint8Array,
 *   mimeType: string,
 *   width: number,
 *   height: number,
 *   filenameStem: string,
 * } | null}
 */
let g_uploadedCover = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let g_renderDebounceTimer = null;

/** @type {Uint8Array | null} */
let g_secretFileBytes = null;

/** @type {Uint8Array | null} */
let g_lastDecodedBytes = null;

/** @type {string} */
let g_lastDecodedFilename = "congrats_steg_payload.bin";

/**
 * Soft ceilings for putting armored PGP text into the page and clipboard.
 * Larger messages stay download-only.
 */
const MAX_ARMORED_DISPLAY_BINARY_BYTES = 96 * 1024;
const MAX_ARMORED_DISPLAY_CHARS = 160_000;

/** @type {ImageData | null} */
let g_decodeSourceImageData = null;

/** Raw file bytes for JPEG Ghost decode (clipboard pastes often re-encode). */
/** @type {Uint8Array | null} */
let g_decodeSourceBytes = null;

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
  g_encodeButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("encode-button")
  );
  g_downloadImageButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("download-image-button")
  );
  g_copyImageButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("copy-image-button")
  );

  assert(g_previewCanvas !== null, "preview canvas missing");
  assert(g_loadingLabel !== null, "loading label missing");
  assert(g_wishTextInput !== null, "wish text missing");
  assert(g_signatureInput !== null, "signature missing");
  assert(g_rendererVersionSelect !== null, "renderer select missing");
  assert(g_encodeButton !== null, "encode button missing");
  assert(g_downloadImageButton !== null, "download image button missing");
  assert(g_copyImageButton !== null, "copy image button missing");

  bindLanguageSelect();
  applyUiLanguage(g_language, { regenerateCardText: false });
  bindTabs();
  bindEncodeCryptoMode();
  bindDecodeCryptoMode();
  bindPublicKeyStoreUi();
  bindExportSizeSelect();
  bindExportFormatSelect();
  bindCoverSourceUi();
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

  document.getElementById("secret-file")?.addEventListener("change", (event) => {
    void onSecretFileChange(event);
  });
  document.getElementById("secret-text")?.addEventListener("input", () => {
    g_secretFileBytes = null;
    const secretFileInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById("secret-file")
    );
    if (secretFileInput !== null) {
      secretFileInput.value = "";
    }
    updateSecretUsageUi();
  });
  g_encodeButton.addEventListener("click", () => {
    void embedSecretIntoPreview();
  });
  g_downloadImageButton.addEventListener("click", () => {
    downloadStegoImage();
  });
  g_copyImageButton.addEventListener("click", () => {
    void copyPreviewImageToClipboard();
  });
  document.getElementById("decode-button")?.addEventListener("click", () => {
    void decodeLoadedImage();
  });
  document.getElementById("paste-image-button")?.addEventListener("click", () => {
    void pasteDecodeImageFromClipboard();
  });
  document.getElementById("stego-file")?.addEventListener("change", (event) => {
    void onStegoFileChange(event);
  });
  document.getElementById("download-payload-button")?.addEventListener("click", downloadDecodedPayload);
  document.getElementById("copy-payload-button")?.addEventListener("click", () => {
    void copyDecodedPayload();
  });

  await waitForFontsReady();
  g_loadingLabel.hidden = true;
  g_loadingLabel.classList.add("u-hidden");
  setEncodePreviewSurface("canvas");
  regenerateCard();
  g_encodeButton.disabled = false;
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
  syncExportSizeOptionLabels();
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
  const exportFormatSelect = /** @type {HTMLSelectElement} */ (
    document.getElementById("export-format")
  );
  assert(passwordInput !== null && pubkeyInput !== null, "encode crypto inputs missing");
  assert(savedKeySelect !== null && pubkeyNameInput !== null, "pubkey store inputs missing");
  assert(saveKeyButton !== null && deleteKeyButton !== null, "pubkey store buttons missing");
  assert(exportFormatSelect !== null, "export format select missing");
  const radios = document.querySelectorAll('input[name="crypto-mode"]');
  const sync = () => {
    const mode = readRadioValue("crypto-mode");
    const pubkeyEnabled = mode === "pubkey";
    passwordInput.disabled = pubkeyEnabled;
    pubkeyInput.disabled = !pubkeyEnabled;
    savedKeySelect.disabled = !pubkeyEnabled;
    pubkeyNameInput.disabled = !pubkeyEnabled;
    saveKeyButton.disabled = !pubkeyEnabled;
    deleteKeyButton.disabled = !pubkeyEnabled;
    setFieldEnabled(passwordInput, !pubkeyEnabled);
    setFieldEnabled(savedKeySelect, pubkeyEnabled);
    setFieldEnabled(pubkeyNameInput, pubkeyEnabled);
    setFieldEnabled(pubkeyInput, pubkeyEnabled);
    setGroupEnabled(saveKeyButton.parentElement, pubkeyEnabled);
    const jpegOption = exportFormatSelect.querySelector('option[value="jpeg"]');
    assert(jpegOption instanceof HTMLOptionElement, "JPEG export option missing");
    jpegOption.disabled = pubkeyEnabled;
    if (pubkeyEnabled && exportFormatSelect.value === "jpeg") {
      exportFormatSelect.value = "png";
    }
    updateCapacityLabel();
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
  const savedPublicKeys = loadSavedPublicKeys();
  for (const selectId of ["saved-pubkey-select", "decode-saved-pubkey-select"]) {
    const savedKeySelect = /** @type {HTMLSelectElement | null} */ (
      document.getElementById(selectId)
    );
    if (savedKeySelect === null) {
      continue;
    }
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
}

/**
 * @returns {void}
 */
function bindDecodeCryptoMode() {
  const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("decode-password"));
  const savedKeySelect = /** @type {HTMLSelectElement} */ (
    document.getElementById("decode-saved-pubkey-select")
  );
  const pubkeyInput = /** @type {HTMLTextAreaElement} */ (
    document.getElementById("decode-pubkey")
  );
  assert(passwordInput !== null, "decode password missing");
  assert(savedKeySelect !== null && pubkeyInput !== null, "decode public-key inputs missing");
  const sync = () => {
    const publicKeyEnabled = readRadioValue("decode-mode") === "pgp";
    passwordInput.disabled = publicKeyEnabled;
    savedKeySelect.disabled = !publicKeyEnabled;
    pubkeyInput.disabled = !publicKeyEnabled;
    setFieldEnabled(passwordInput, !publicKeyEnabled);
    setFieldEnabled(savedKeySelect, publicKeyEnabled);
    setFieldEnabled(pubkeyInput, publicKeyEnabled);
  };
  for (const radio of document.querySelectorAll('input[name="decode-mode"]')) {
    radio.addEventListener("change", sync);
  }
  savedKeySelect.addEventListener("change", () => {
    const selectedKey = loadSavedPublicKeys().find(
      (savedPublicKey) => savedPublicKey.name === savedKeySelect.value,
    );
    if (selectedKey !== undefined) {
      pubkeyInput.value = selectedKey.armored;
    }
  });
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
function bindExportSizeSelect() {
  const exportSizeSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("export-size")
  );
  assert(exportSizeSelect !== null, "export size select missing");
  exportSizeSelect.value = DEFAULT_EXPORT_SIZE_ID;
  exportSizeSelect.addEventListener("change", () => {
    updateCapacityLabel();
    invalidateEncodeStegoPreview();
  });
}

/**
 * @returns {void}
 */
function bindExportFormatSelect() {
  const exportFormatSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("export-format")
  );
  assert(exportFormatSelect !== null, "export format select missing");
  exportFormatSelect.addEventListener("change", () => {
    syncExportSizeOptionLabels();
    updateCapacityLabel();
    invalidateEncodeStegoPreview();
  });
}

/**
 * Swap size-preset option text for PNG vs JPEG hints.
 * side-effects: mutates #export-size option labels
 * @returns {void}
 */
function syncExportSizeOptionLabels() {
  const exportSizeSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("export-size")
  );
  assert(exportSizeSelect !== null, "export size select missing");
  const useJpegHints = readExportFormat() === "jpeg";
  /** @type {ReadonlyArray<[string, string, string]>} */
  const optionKeys = [
    ["compact", "exportSizeCompact", "exportSizeCompactJpeg"],
    ["medium", "exportSizeMedium", "exportSizeMediumJpeg"],
    ["full", "exportSizeFull", "exportSizeFullJpeg"],
  ];
  for (const [presetId, pngKey, jpegKey] of optionKeys) {
    const option = /** @type {HTMLOptionElement | null} */ (
      exportSizeSelect.querySelector(`option[value="${presetId}"]`)
    );
    assert(option !== null, `export size option missing: ${presetId}`);
    option.textContent = t(g_language, useJpegHints ? jpegKey : pngKey);
  }
}

/**
 * @returns {void}
 */
function bindCoverSourceUi() {
  const coverFileInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("cover-file")
  );
  assert(coverFileInput !== null, "cover file input missing");
  const coverSourceRadios = document.querySelectorAll('input[name="cover-source"]');
  assert(coverSourceRadios.length > 0, "cover source radios missing");
  for (const radio of coverSourceRadios) {
    radio.addEventListener("change", () => {
      syncCoverSourceControls();
      if (readCoverSource() === "card") {
        g_uploadedCover = null;
        coverFileInput.value = "";
        if (g_currentCardState !== null) {
          renderCardState(g_currentCardState);
        }
      }
      invalidateEncodeStegoPreview();
      updateCapacityLabel();
    });
  }
  coverFileInput.addEventListener("change", () => {
    void onCoverFileChange();
  });
  syncCoverSourceControls();
}

/**
 * Enable/disable card editors vs cover file input.
 * side-effects: DOM disabled state
 * @returns {void}
 */
function syncCoverSourceControls() {
  const usingUpload = readCoverSource() === "upload";
  const coverFileInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("cover-file")
  );
  assert(coverFileInput !== null, "cover file input missing");
  coverFileInput.disabled = !usingUpload;
  const cardControlIds = [
    "renderer-version",
    "wish-text",
    "signature-text",
    "generate-button",
    "apply-button",
  ];
  for (const controlId of cardControlIds) {
    const control = /** @type {HTMLElement | null} */ (document.getElementById(controlId));
    if (control !== null && "disabled" in control) {
      /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement} */ (
        control
      ).disabled = usingUpload;
    }
  }
}

/**
 * @returns {'card' | 'upload'}
 */
function readCoverSource() {
  const value = readRadioValue("cover-source");
  assert(value === "card" || value === "upload", `expected card|upload, got ${value}`);
  return value;
}

/**
 * @returns {'png' | 'jpeg'}
 */
function readExportFormat() {
  const exportFormatSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("export-format")
  );
  assert(exportFormatSelect !== null, "export format select missing");
  const value = exportFormatSelect.value;
  assert(value === "png" || value === "jpeg", `expected png|jpeg, got ${value}`);
  return value;
}

/**
 * Clear stego preview after cover/format/size edits.
 * side-effects: preview DOM, stego blob state
 * @returns {void}
 */
function invalidateEncodeStegoPreview() {
  if (!g_previewHasStego) {
    return;
  }
  clearEncodePreviewImage();
  setPreviewStegoState(false);
  if (readCoverSource() === "card" && g_currentCardState !== null) {
    renderCardState(g_currentCardState);
  } else if (readCoverSource() === "upload" && g_uploadedCover !== null) {
    void drawUploadedCoverToPreview();
  }
}

/**
 * @returns {Promise<void>}
 */
async function onCoverFileChange() {
  const coverFileInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("cover-file")
  );
  assert(coverFileInput !== null, "cover file input missing");
  const file = coverFileInput.files?.[0];
  const status = document.getElementById("encode-status");
  if (!file) {
    g_uploadedCover = null;
    updateCapacityLabel();
    return;
  }
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const imageBitmap = await createImageBitmap(file);
  const filenameStem = file.name.replace(/\.[^.]+$/, "") || "cover";
  g_uploadedCover = {
    originalBytes,
    mimeType: file.type || (isJpegByteArray(originalBytes) ? "image/jpeg" : "image/png"),
    width: imageBitmap.width,
    height: imageBitmap.height,
    filenameStem,
  };
  imageBitmap.close();
  clearEncodePreviewImage();
  setPreviewStegoState(false);
  await drawUploadedCoverToPreview();
  updateCapacityLabel();
  setStatus(status, "", null);
}

/**
 * Draw uploaded cover into the encode preview canvas.
 * side-effects: mutates preview canvas pixels
 * @returns {Promise<void>}
 */
async function drawUploadedCoverToPreview() {
  assert(g_previewCanvas !== null, "preview canvas not ready");
  assert(g_uploadedCover !== null, "uploaded cover missing");
  const blob = new Blob([g_uploadedCover.originalBytes], { type: g_uploadedCover.mimeType });
  const imageBitmap = await createImageBitmap(blob);
  const previewContext = g_previewCanvas.getContext("2d");
  assert(previewContext !== null, "preview 2d context unavailable");
  g_previewCanvas.width = imageBitmap.width;
  g_previewCanvas.height = imageBitmap.height;
  previewContext.clearRect(0, 0, g_previewCanvas.width, g_previewCanvas.height);
  previewContext.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();
  setEncodePreviewSurface("canvas");
}

/**
 * @returns {ReturnType<typeof getExportSizePreset>}
 */
function readSelectedExportSizePreset() {
  const exportSizeSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("export-size")
  );
  assert(exportSizeSelect !== null, "export size select missing");
  return getExportSizePreset(exportSizeSelect.value);
}

/**
 * Resolve current cover pixel size for capacity estimates.
 *
 * @returns {{ width: number, height: number } | null}
 */
function readCurrentCoverDimensions() {
  if (readCoverSource() === "upload") {
    if (g_uploadedCover === null) {
      return null;
    }
    return { width: g_uploadedCover.width, height: g_uploadedCover.height };
  }
  const exportSizePreset = readSelectedExportSizePreset();
  return { width: exportSizePreset.width, height: exportSizePreset.height };
}

/**
 * Synchronous secret-byte capacity for the current encode mode and cover.
 * JPEG Ghost capacity is async and returns null until measured separately.
 *
 * @returns {number | null}
 */
function readSyncSecretCapacityBytes() {
  if (readExportFormat() === "jpeg") {
    return null;
  }
  const dimensions = readCurrentCoverDimensions();
  if (dimensions === null) {
    return null;
  }
  const imageCapacityBytes = Math.floor(
    estimateMaxMessageBits(dimensions.width, dimensions.height) / 8,
  );
  if (readRadioValue("crypto-mode") === "pubkey") {
    if (imageCapacityBytes < 1024) {
      return 0;
    }
    return selectGpgProfileForImage(dimensions.width, dimensions.height).maxPayloadLength;
  }
  return imageCapacityBytes;
}

/**
 * Count UTF-8 bytes currently staged as the secret payload.
 *
 * @returns {number}
 */
function readCurrentSecretUsedBytes() {
  if (g_secretFileBytes !== null) {
    return g_secretFileBytes.length;
  }
  const secretText = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("secret-text")
  );
  if (secretText === null || secretText.value.length === 0) {
    return 0;
  }
  return new TextEncoder().encode(secretText.value).length;
}

/**
 * Update the secret-message N/Max counter and secret-file size limit label.
 *
 * side-effects: mutates secret-usage and secret-file-label text/classes
 *
 * @param {number | null} [capacityBytes]
 * @returns {void}
 */
function updateSecretUsageUi(capacityBytes = readSyncSecretCapacityBytes()) {
  const usageLabel = document.getElementById("secret-usage");
  const fileLabel = document.getElementById("secret-file-label");
  if (usageLabel === null || fileLabel === null) {
    return;
  }
  const locale = g_language === "en" ? "en-US" : "ru-RU";
  const usedBytes = readCurrentSecretUsedBytes();
  if (capacityBytes === null) {
    usageLabel.textContent = t(g_language, "secretUsageUnknown", {
      used: usedBytes.toLocaleString(locale),
    });
    usageLabel.classList.remove("field__counter--over");
    fileLabel.textContent = t(g_language, "orFileLimitUnknown");
    return;
  }
  usageLabel.textContent = t(g_language, "secretUsage", {
    used: usedBytes.toLocaleString(locale),
    max: capacityBytes.toLocaleString(locale),
  });
  usageLabel.classList.toggle("field__counter--over", usedBytes > capacityBytes);
  fileLabel.textContent = t(g_language, "orFileLimit", {
    bytes: capacityBytes.toLocaleString(locale),
  });
}

/**
 * @returns {void}
 */
function updateCapacityLabel() {
  const capacityLabel = document.getElementById("capacity-label");
  if (capacityLabel === null) {
    return;
  }
  const locale = g_language === "en" ? "en-US" : "ru-RU";
  if (readExportFormat() === "jpeg") {
    updateSecretUsageUi(null);
    void updateJpegCapacityLabel(capacityLabel, locale);
    return;
  }
  const dimensions = readCurrentCoverDimensions();
  if (dimensions === null) {
    capacityLabel.textContent = t(g_language, "needCoverImage");
    updateSecretUsageUi(null);
    return;
  }
  const { width, height } = dimensions;
  const maxBits = estimateMaxMessageBits(width, height);
  const maxBytes = Math.floor(maxBits / 8);
  if (readRadioValue("crypto-mode") === "pubkey") {
    if (maxBytes < 1024) {
      capacityLabel.textContent = t(g_language, "capacityGpgTooSmall", { width, height });
      updateSecretUsageUi(0);
      return;
    }
    const profile = selectGpgProfileForImage(width, height);
    capacityLabel.textContent = t(g_language, "capacityGpg", {
      payloadBytes: profile.maxPayloadLength.toLocaleString(locale),
      containerBytes: profile.embeddedLength.toLocaleString(locale),
      imageBytes: maxBytes.toLocaleString(locale),
      width,
      height,
    });
    updateSecretUsageUi(profile.maxPayloadLength);
    return;
  }
  capacityLabel.textContent = t(g_language, "capacity", {
    bytes: maxBytes.toLocaleString(locale),
    width,
    height,
  });
  updateSecretUsageUi(maxBytes);
}

/**
 * side-effects: capacity label text and secret usage UI
 * @param {HTMLElement} capacityLabel
 * @param {string} locale
 * @returns {Promise<void>}
 */
async function updateJpegCapacityLabel(capacityLabel, locale) {
  capacityLabel.textContent = t(g_language, "capacityJpegPending");
  updateSecretUsageUi(null);
  try {
    const jpegBytes = await prepareCoverJpegBytes();
    const maxBytes = await estimateJpegGhostCapacityBytes(jpegBytes);
    capacityLabel.textContent = t(g_language, "capacityJpeg", {
      bytes: maxBytes.toLocaleString(locale),
    });
    updateSecretUsageUi(maxBytes);
  } catch {
    capacityLabel.textContent = t(g_language, "capacityJpegPending");
    updateSecretUsageUi(null);
  }
}

/**
 * @returns {'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6'}
 */
function readSelectedRendererVersion() {
  assert(g_rendererVersionSelect !== null, "renderer select not ready");
  const selectedVersion = g_rendererVersionSelect.value;
  assert(
    CARD_RENDERER_VERSION_LIST.includes(/** @type {'v1'|'v2'|'v3'|'v4'|'v5'|'v6'} */ (selectedVersion)),
    `Unknown renderer version in UI: ${selectedVersion}`,
  );
  return /** @type {'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6'} */ (selectedVersion);
}

/**
 * @returns {void}
 */
function regenerateCard() {
  const cardState = createRandomCardState(readSelectedRendererVersion(), g_language);
  renderCardState(cardState);
  syncTextInputsFromState(cardState);
  clearEncodePreviewImage();
  setPreviewStegoState(false);
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
  clearEncodePreviewImage();
  setPreviewStegoState(false);
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
  assert(g_currentCardState !== null, "no card state");
  const signatureRaw = g_signatureInput.value.trim();
  return {
    text: g_wishTextInput.value.trim(),
    signature: signatureRaw.length > 0 ? signatureRaw : g_currentCardState.signature,
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
    updateSecretUsageUi();
    return;
  }
  g_secretFileBytes = new Uint8Array(await file.arrayBuffer());
  const secretText = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("secret-text"));
  if (secretText !== null) {
    secretText.value = "";
  }
  updateSecretUsageUi();
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
 * Embed the secret into the current cover without downloading.
 * @returns {Promise<void>}
 */
async function embedSecretIntoPreview() {
  assert(g_previewCanvas !== null && g_encodeButton !== null);
  const status = document.getElementById("encode-status");
  setStatus(status, t(g_language, "embedding"), null);
  g_encodeButton.disabled = true;
  try {
    clearEncodePreviewImage();
    setPreviewStegoState(false);
    const payloadBytes = await readSecretPayloadBytes();
    const cryptoOptions = readEncodeCryptoOptions();
    const exportFormat = readExportFormat();
    if (exportFormat === "jpeg") {
      await embedSecretAsJpeg(payloadBytes, cryptoOptions, status);
    } else {
      await embedSecretAsPng(payloadBytes, cryptoOptions, status);
    }
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : String(error), "error");
  } finally {
    g_encodeButton.disabled = false;
  }
}

/**
 * @param {Uint8Array} payloadBytes
 * @param {import("./payload/codec.js").PayloadEncryptOptions} cryptoOptions
 * @param {HTMLElement | null} status
 * @returns {Promise<void>}
 */
async function embedSecretAsPng(payloadBytes, cryptoOptions, status) {
  const exportCanvas = await prepareCoverCanvasForExport();
  const exportContext = exportCanvas.getContext("2d", { willReadFrequently: true });
  assert(exportContext !== null, "export 2d context unavailable");
  const imageData = exportContext.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
  const result = await encodeBytesIntoImageData(imageData, payloadBytes, cryptoOptions);
  exportContext.putImageData(imageData, 0, 0);
  const pngBlob = await canvasToPngBlob(exportCanvas);
  g_lastStegoBlob = pngBlob;
  g_lastStegoFormat = "png";
  showEncodePreviewImage(pngBlob);
  setPreviewStegoState(true);
  const maxBits = estimateMaxMessageBits(exportCanvas.width, exportCanvas.height);
  assert(maxBits > 0, `expected positive capacity, got ${maxBits}`);
  const imagePercent = ((100 * result.stegoStats.messageBitCount) / maxBits).toFixed(1);
  const fileSizeKb = (pngBlob.size / 1024).toFixed(0);
  if (cryptoOptions.publicKeyArmored) {
    const profile = selectGpgProfileForImage(exportCanvas.width, exportCanvas.height);
    assert(
      profile.maxPayloadLength > 0,
      `expected positive GPG buffer capacity, got ${profile.maxPayloadLength}`,
    );
    const bufferPercent = ((100 * payloadBytes.length) / profile.maxPayloadLength).toFixed(1);
    setStatus(
      status,
      t(g_language, "doneEncodeGpg", {
        bufferPercent,
        imagePercent,
        fileSizeKb,
        changed: result.stegoStats.changedCount,
        alpha: result.stegoStats.embeddingRate.toFixed(3),
      }),
      "ok",
    );
    return;
  }
  setStatus(
    status,
    t(g_language, "doneEncode", {
      capacityPercent: imagePercent,
      fileSizeKb,
      changed: result.stegoStats.changedCount,
      alpha: result.stegoStats.embeddingRate.toFixed(3),
    }),
    "ok",
  );
}

/**
 * @param {Uint8Array} payloadBytes
 * @param {import("./payload/codec.js").PayloadEncryptOptions} cryptoOptions
 * @param {HTMLElement | null} status
 * @returns {Promise<void>}
 */
async function embedSecretAsJpeg(payloadBytes, cryptoOptions, status) {
  const coverJpegBytes = await prepareCoverJpegBytes();
  const result = await encodeBytesIntoJpegBytes(coverJpegBytes, payloadBytes, cryptoOptions);
  const jpegBlob = new Blob([result.jpegBytes], { type: "image/jpeg" });
  g_lastStegoBlob = jpegBlob;
  g_lastStegoFormat = "jpeg";
  showEncodePreviewImage(jpegBlob);
  setPreviewStegoState(true);
  const fileSizeKb = (jpegBlob.size / 1024).toFixed(0);
  setStatus(
    status,
    t(g_language, "doneEncodeJpeg", {
      fileSizeKb,
      payloadBytes: result.embeddedByteCount,
    }),
    "ok",
  );
}

/**
 * Build a canvas with the cover pixels used for PNG spatial stego / JPEG re-encode.
 * Uses already-rasterized preview pixels only (no card re-render / font re-layout).
 * @returns {Promise<HTMLCanvasElement>}
 */
async function prepareCoverCanvasForExport() {
  assert(g_previewCanvas !== null, "preview canvas not ready");
  assert(
    g_previewCanvas.width > 0 && g_previewCanvas.height > 0,
    `expected non-empty preview canvas, got ${g_previewCanvas.width}×${g_previewCanvas.height}`,
  );
  if (readCoverSource() === "upload") {
    if (g_uploadedCover === null) {
      throw new Error(t(g_language, "needCoverImage"));
    }
    // Prefer pixels already on the preview canvas; reload from bytes only if empty.
    if (
      g_previewCanvas.width !== g_uploadedCover.width
      || g_previewCanvas.height !== g_uploadedCover.height
    ) {
      await drawUploadedCoverToPreview();
    }
    return snapshotCanvasPixels(g_previewCanvas);
  }
  assert(g_currentCardState !== null, "no card state");
  const exportSizePreset = readSelectedExportSizePreset();
  if (
    exportSizePreset.width === g_previewCanvas.width
    && exportSizePreset.height === g_previewCanvas.height
  ) {
    return snapshotCanvasPixels(g_previewCanvas);
  }
  return scaleCanvasToSize(g_previewCanvas, exportSizePreset.width, exportSizePreset.height);
}

/**
 * Copy canvas bitmap to a new canvas so stego/export can mutate without touching preview.
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {HTMLCanvasElement}
 */
function snapshotCanvasPixels(sourceCanvas) {
  assert(sourceCanvas.width > 0 && sourceCanvas.height > 0, "source canvas is empty");
  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = sourceCanvas.width;
  snapshotCanvas.height = sourceCanvas.height;
  const context = snapshotCanvas.getContext("2d", { willReadFrequently: true });
  assert(context !== null, "2d context unavailable");
  context.drawImage(sourceCanvas, 0, 0);
  return snapshotCanvas;
}

/**
 * JPEG cover bytes: keep original uploaded JPEG when possible, else canvas encode.
 * @returns {Promise<Uint8Array>}
 */
async function prepareCoverJpegBytes() {
  if (readCoverSource() === "upload") {
    if (g_uploadedCover === null) {
      throw new Error(t(g_language, "needCoverImage"));
    }
    if (isJpegByteArray(g_uploadedCover.originalBytes)) {
      return g_uploadedCover.originalBytes;
    }
  }
  const exportCanvas = await prepareCoverCanvasForExport();
  const jpegQuality = readSelectedExportSizePreset().jpegQuality;
  const jpegBlob = await canvasToJpegBlob(exportCanvas, jpegQuality);
  return new Uint8Array(await jpegBlob.arrayBuffer());
}

/**
 * Download the last stego image from preview.
 * side-effects: triggers browser download
 * @returns {void}
 */
function downloadStegoImage() {
  const status = document.getElementById("encode-status");
  if (!g_previewHasStego || g_lastStegoBlob === null || g_lastStegoFormat === null) {
    setStatus(status, t(g_language, "nothingToCopy"), "error");
    return;
  }
  const wishText = (
    readCoverSource() === "upload" && g_uploadedCover !== null
  )
    ? g_uploadedCover.filenameStem
    : (g_currentCardState?.text ?? "congrats");
  const filename = buildDownloadFilename(wishText, g_lastStegoFormat);
  downloadBlob(g_lastStegoBlob, filename);
}

/**
 * Mark whether preview currently shows embedded stego pixels.
 * side-effects: updates download/copy button disabled state
 * @param {boolean} hasStego
 * @returns {void}
 */
function setPreviewStegoState(hasStego) {
  g_previewHasStego = hasStego;
  if (g_copyImageButton !== null) {
    g_copyImageButton.disabled = !hasStego;
  }
  if (g_downloadImageButton !== null) {
    g_downloadImageButton.disabled = !hasStego;
  }
}

/**
 * Show stego image as a real <img> so mobile browsers allow long-press copy.
 * side-effects: object URL create/revoke, toggles canvas/img visibility
 * @param {Blob} imageBlob
 * @returns {void}
 */
function showEncodePreviewImage(imageBlob) {
  assert(g_previewCanvas !== null, "preview canvas not ready");
  const previewImage = /** @type {HTMLImageElement | null} */ (
    document.getElementById("preview-image")
  );
  assert(previewImage !== null, "preview image missing");
  if (g_encodePreviewObjectUrl !== null) {
    URL.revokeObjectURL(g_encodePreviewObjectUrl);
  }
  g_encodePreviewObjectUrl = URL.createObjectURL(imageBlob);
  previewImage.src = g_encodePreviewObjectUrl;
  previewImage.alt = (
    readCoverSource() === "upload" && g_uploadedCover !== null
  )
    ? g_uploadedCover.filenameStem
    : (g_currentCardState?.text?.split("\n")[0] ?? "stego");
  setEncodePreviewSurface("image");
}

/**
 * Restore canvas preview and drop stego <img> object URL.
 * side-effects: DOM visibility, revoke object URL
 * @returns {void}
 */
function clearEncodePreviewImage() {
  const previewImage = /** @type {HTMLImageElement | null} */ (
    document.getElementById("preview-image")
  );
  if (g_encodePreviewObjectUrl !== null) {
    URL.revokeObjectURL(g_encodePreviewObjectUrl);
    g_encodePreviewObjectUrl = null;
  }
  g_lastStegoBlob = null;
  g_lastStegoFormat = null;
  if (previewImage !== null) {
    previewImage.removeAttribute("src");
  }
  if (g_loadingLabel !== null && g_loadingLabel.hidden) {
    setEncodePreviewSurface("canvas");
  }
}

/**
 * Show either the editing canvas or the stego <img>, never both.
 * side-effects: toggles hidden/u-hidden on preview surfaces
 * @param {'canvas' | 'image'} surface
 * @returns {void}
 */
function setEncodePreviewSurface(surface) {
  assert(surface === "canvas" || surface === "image", `expected canvas|image, got ${surface}`);
  assert(g_previewCanvas !== null, "preview canvas not ready");
  const previewImage = /** @type {HTMLImageElement | null} */ (
    document.getElementById("preview-image")
  );
  assert(previewImage !== null, "preview image missing");
  const showCanvas = surface === "canvas";
  g_previewCanvas.hidden = !showCanvas;
  g_previewCanvas.classList.toggle("u-hidden", !showCanvas);
  previewImage.hidden = showCanvas;
  previewImage.classList.toggle("u-hidden", showCanvas);
}

/**
 * Copy stego image to clipboard and verify the clipboard holds the same pixels.
 * side-effects: clipboard write/read, status text
 * @returns {Promise<void>}
 */
async function copyPreviewImageToClipboard() {
  const status = document.getElementById("encode-status");
  if (!g_previewHasStego) {
    setStatus(status, t(g_language, "nothingToCopy"), "error");
    return;
  }
  const imageBlob = g_lastStegoBlob
    ?? (g_previewCanvas !== null ? await canvasToPngBlob(g_previewCanvas) : null);
  if (imageBlob === null) {
    setStatus(status, t(g_language, "nothingToCopy"), "error");
    return;
  }
  g_lastStegoBlob = imageBlob;
  if (g_lastStegoFormat === null) {
    g_lastStegoFormat = imageBlob.type === "image/jpeg" ? "jpeg" : "png";
  }
  showEncodePreviewImage(imageBlob);
  setStatus(status, t(g_language, "copyingImage"), null);

  const writeSucceeded = await tryWriteImageBlobToClipboard(imageBlob);
  if (!writeSucceeded) {
    setStatus(
      status,
      `${t(g_language, "copyImageFailed")}. ${t(g_language, "longPressToCopy")}`,
      "error",
    );
    return;
  }

  const verification = await verifyClipboardContainsSameImage(imageBlob);
  if (!verification.ok) {
    setStatus(
      status,
      `${t(g_language, "copyImageVerifyFailed")}${verification.detail ? ` (${verification.detail})` : ""}`,
      "error",
    );
    return;
  }
  setStatus(status, t(g_language, "imageCopied"), "ok");
}

/**
 * @param {Blob} pngBlob
 * @returns {Promise<boolean>}
 */
async function tryWriteImageBlobToClipboard(pngBlob) {
  if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard?.write !== "function") {
    return false;
  }
  const mimeType = pngBlob.type || "image/png";
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mimeType]: pngBlob })]);
    return true;
  } catch {
    // Safari / some Firefox builds require a Promise-valued ClipboardItem entry.
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [mimeType]: Promise.resolve(pngBlob) }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read clipboard and confirm it holds the same image pixels as expectedPngBlob.
 * @param {Blob} expectedPngBlob
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
async function verifyClipboardContainsSameImage(expectedPngBlob) {
  if (typeof navigator.clipboard?.read !== "function") {
    return { ok: false, detail: "clipboard.read unavailable" };
  }
  /** @type {ClipboardItems} */
  let clipboardItems;
  try {
    clipboardItems = await navigator.clipboard.read();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: message };
  }
  /** @type {Blob | null} */
  let clipboardImageBlob = null;
  for (const clipboardItem of clipboardItems) {
    const imageType = clipboardItem.types.find((typeName) => typeName.startsWith("image/"));
    if (imageType !== undefined) {
      clipboardImageBlob = await clipboardItem.getType(imageType);
      break;
    }
  }
  if (clipboardImageBlob === null) {
    return { ok: false, detail: "no image in clipboard" };
  }
  const pixelsMatch = await imageBlobsHaveEqualPixels(expectedPngBlob, clipboardImageBlob);
  if (!pixelsMatch) {
    return { ok: false, detail: "different image pixels" };
  }
  return { ok: true, detail: "" };
}

/**
 * Compare decoded bitmap pixels of two image blobs.
 * @param {Blob} leftBlob
 * @param {Blob} rightBlob
 * @returns {Promise<boolean>}
 */
async function imageBlobsHaveEqualPixels(leftBlob, rightBlob) {
  const leftBitmap = await createImageBitmap(leftBlob);
  const rightBitmap = await createImageBitmap(rightBlob);
  if (leftBitmap.width !== rightBitmap.width || leftBitmap.height !== rightBitmap.height) {
    leftBitmap.close();
    rightBitmap.close();
    return false;
  }
  const canvas = document.createElement("canvas");
  canvas.width = leftBitmap.width;
  canvas.height = leftBitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  assert(context !== null, "2d context unavailable");
  context.drawImage(leftBitmap, 0, 0);
  const leftPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(rightBitmap, 0, 0);
  const rightPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  leftBitmap.close();
  rightBitmap.close();
  if (leftPixels.length !== rightPixels.length) {
    return false;
  }
  for (let pixelIndex = 0; pixelIndex < leftPixels.length; pixelIndex += 1) {
    if (leftPixels[pixelIndex] !== rightPixels[pixelIndex]) {
      return false;
    }
  }
  return true;
}

/**
 * @returns {{ stegoPassphrase?: string, password?: string, publicKeyArmored?: string }}
 */
function readEncodeCryptoOptions() {
  const mode = readRadioValue("crypto-mode");
  if (mode === "pubkey") {
    const pubkeyInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("encode-pubkey"));
    assert(pubkeyInput !== null);
    if (!pubkeyInput.value.trim()) {
      throw new Error(t(g_language, "needPubkey"));
    }
    return { publicKeyArmored: pubkeyInput.value };
  }
  const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("encode-password"));
  assert(passwordInput !== null);
  if (!passwordInput.value) {
    throw new Error(t(g_language, "needPassword"));
  }
  const stegoPassphrase = passwordInput.value;
  if (mode === "password") {
    return { stegoPassphrase, password: stegoPassphrase };
  }
  return { stegoPassphrase };
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
  const context = g_previewCanvas.getContext("2d", { willReadFrequently: true });
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
 * @param {HTMLCanvasElement} canvas
 * @param {number} jpegQuality
 * @returns {Promise<Blob>}
 */
function canvasToJpegBlob(canvas, jpegQuality) {
  assert(
    jpegQuality >= 0 && jpegQuality <= 1,
    `expected jpegQuality in [0,1], got ${jpegQuality}`,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("JPEG export failed"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", jpegQuality);
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
async function decodeLoadedImage() {
  const status = document.getElementById("decode-status");
  const output = /** @type {HTMLTextAreaElement} */ (document.getElementById("decode-output"));
  const downloadButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("download-payload-button")
  );
  const copyButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("copy-payload-button")
  );
  assert(status !== null && output !== null && downloadButton !== null);
  assert(copyButton !== null, "copy button missing");
  if (g_decodeSourceImageData === null && g_decodeSourceBytes === null) {
    setStatus(status, t(g_language, "needPng"), "error");
    return;
  }
  setStatus(status, t(g_language, "extracting"), null);
  downloadButton.disabled = true;
  copyButton.disabled = true;
  g_lastDecodedBytes = null;
  g_lastDecodedFilename = "congrats_steg_payload.bin";
  try {
    const decodeMode = readRadioValue("decode-mode");
    const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById("decode-password"));
    assert(passwordInput !== null);
    const useJpegChannel = (
      g_decodeSourceBytes !== null && isJpegByteArray(g_decodeSourceBytes)
    );
    if (decodeMode === "pgp") {
      if (useJpegChannel) {
        throw new Error(t(g_language, "gpgPngOnly"));
      }
      const pubkeyInput = /** @type {HTMLTextAreaElement} */ (
        document.getElementById("decode-pubkey")
      );
      assert(pubkeyInput !== null, "decode public key input missing");
      if (!pubkeyInput.value.trim()) {
        throw new Error(t(g_language, "needPubkey"));
      }
      const { binaryPgpMessage } = await decodeImageDataToBinaryGpgMessage(
        /** @type {ImageData} */ (g_decodeSourceImageData),
        pubkeyInput.value,
      );
      g_lastDecodedBytes = binaryPgpMessage;
      g_lastDecodedFilename = "congrats_steg_message.pgp";
      downloadButton.disabled = false;
      const canShowArmored = binaryPgpMessage.length <= MAX_ARMORED_DISPLAY_BINARY_BYTES;
      const armoredPgpMessage = canShowArmored
        ? await binaryOpenPgpToArmoredMessage(binaryPgpMessage)
        : "";
      if (canShowArmored && armoredPgpMessage.length <= MAX_ARMORED_DISPLAY_CHARS) {
        output.value = armoredPgpMessage;
        copyButton.disabled = false;
        setStatus(
          status,
          t(g_language, "doneDecodePgp", { bytes: binaryPgpMessage.length }),
          "ok",
        );
      } else {
        output.value = t(g_language, "pgpReady");
        copyButton.disabled = true;
        setStatus(
          status,
          t(g_language, "doneDecodePgpBinaryOnly", { bytes: binaryPgpMessage.length }),
          "ok",
        );
      }
      return;
    }
    if (!passwordInput.value) {
      throw new Error(t(g_language, "needPassword"));
    }
    const stegoPassphrase = passwordInput.value;
    /** @type {{ stegoPassphrase: string, password?: string }} */
    const cryptoOptions = { stegoPassphrase };
    if (decodeMode === "password") {
      cryptoOptions.password = stegoPassphrase;
    }
    const { payloadBytes } = useJpegChannel
      ? await decodeBytesFromJpegBytes(g_decodeSourceBytes, cryptoOptions)
      : await decodeBytesFromImageData(
        /** @type {ImageData} */ (g_decodeSourceImageData),
        cryptoOptions,
      );
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
 * side-effects: loads file into decode preview
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function onStegoFileChange(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  const status = document.getElementById("decode-status");
  if (!file) {
    return;
  }
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const imageData = await loadImageBlobToImageData(file);
  await setDecodeSourceImage(imageData, originalBytes);
  setStatus(status, "", null);
}

/**
 * Read an image from the system clipboard into the decode preview.
 * side-effects: clipboard read, decode preview update
 * @returns {Promise<void>}
 */
async function pasteDecodeImageFromClipboard() {
  const status = document.getElementById("decode-status");
  assert(typeof navigator.clipboard?.read === "function", "clipboard read is not available");
  const clipboardItems = await navigator.clipboard.read();
  /** @type {Blob | null} */
  let imageBlob = null;
  for (const clipboardItem of clipboardItems) {
    const imageType = clipboardItem.types.find((typeName) => typeName.startsWith("image/"));
    if (imageType !== undefined) {
      imageBlob = await clipboardItem.getType(imageType);
      break;
    }
  }
  if (imageBlob === null) {
    setStatus(status, t(g_language, "clipboardNoImage"), "error");
    return;
  }
  const originalBytes = new Uint8Array(await imageBlob.arrayBuffer());
  const imageData = await loadImageBlobToImageData(imageBlob);
  await setDecodeSourceImage(imageData, originalBytes);
  const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById("stego-file"));
  if (fileInput !== null) {
    fileInput.value = "";
  }
  setStatus(status, "", null);
}

/**
 * Show decode-source pixels on the decode preview as <img> (mobile long-press).
 * side-effects: mutates decode preview DOM and g_decodeSourceImageData / bytes
 * @param {ImageData} imageData
 * @param {Uint8Array | null} [originalBytes]
 * @returns {Promise<void>}
 */
async function setDecodeSourceImage(imageData, originalBytes = null) {
  const previewCanvas = /** @type {HTMLCanvasElement | null} */ (
    document.getElementById("decode-preview-canvas")
  );
  const previewImage = /** @type {HTMLImageElement | null} */ (
    document.getElementById("decode-preview-image")
  );
  const emptyLabel = /** @type {HTMLParagraphElement | null} */ (
    document.getElementById("decode-preview-empty")
  );
  assert(previewCanvas !== null, "decode preview canvas missing");
  assert(previewImage !== null, "decode preview image missing");
  assert(emptyLabel !== null, "decode preview empty label missing");
  const context = previewCanvas.getContext("2d", { willReadFrequently: true });
  assert(context !== null, "decode preview 2d context unavailable");
  previewCanvas.width = imageData.width;
  previewCanvas.height = imageData.height;
  context.putImageData(imageData, 0, 0);
  const previewBlob = (
    originalBytes !== null && isJpegByteArray(originalBytes)
  )
    ? new Blob([originalBytes], { type: "image/jpeg" })
    : await canvasToPngBlob(previewCanvas);
  if (g_decodePreviewObjectUrl !== null) {
    URL.revokeObjectURL(g_decodePreviewObjectUrl);
  }
  g_decodePreviewObjectUrl = URL.createObjectURL(previewBlob);
  previewImage.src = g_decodePreviewObjectUrl;
  previewImage.hidden = false;
  previewImage.classList.remove("u-hidden");
  previewCanvas.hidden = true;
  previewCanvas.classList.add("u-hidden");
  emptyLabel.hidden = true;
  emptyLabel.classList.add("u-hidden");
  g_decodeSourceImageData = imageData;
  g_decodeSourceBytes = originalBytes;
}

/**
 * @param {Blob} imageBlob
 * @returns {Promise<ImageData>}
 */
async function loadImageBlobToImageData(imageBlob) {
  const bitmap = await createImageBitmap(imageBlob);
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
  downloadBlob(blob, g_lastDecodedFilename);
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
