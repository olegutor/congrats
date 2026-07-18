/** UI strings and language preference for Congrads Steg. */

/** @typedef {'ru' | 'en'} AppLanguage */

const LANG_STORAGE_KEY = "congrads-steg.lang.v1";

/** @type {Record<AppLanguage, Record<string, string>>} */
const UI_STRINGS = Object.freeze({
  ru: Object.freeze({
    documentTitle: "Congrads Steg — открытки со стеганографией",
    subtitle: "Открытка + скрытое сообщение. Всё в браузере, без сервера.",
    tabEncode: "Спрятать",
    tabDecode: "Извлечь",
    rendererVersion: "Версия оформления",
    rendererV1: "v1 — классика",
    rendererV2: "v2 — градиенты",
    wishText: "Текст на открытке",
    signature: "Подпись",
    previewAria: "Превью",
    cardAria: "Открытка",
    loadingFonts: "Загрузка шрифтов…",
    generateCard: "Другая открытка",
    applyText: "Обновить текст",
    secretAria: "Секрет",
    secretMessage: "Секретное сообщение",
    secretPlaceholder: "Текст, который спрячется в PNG",
    orFile: "Или файл",
    encryption: "Шифрование",
    cryptoNone: "Без шифрования",
    cryptoPassword: "Пароль (gcmwrap)",
    cryptoPubkey: "Публичный ключ GPG",
    password: "Пароль",
    pubkeyArmor: "Публичный ключ (ASCII armor)",
    savedKeys: "Сохранённые ключи",
    savedKeysNone: "— нет сохранённых —",
    keyName: "Имя ключа",
    saveKey: "Сохранить ключ",
    deleteKey: "Удалить",
    hideAndDownload: "Спрятать и скачать PNG",
    stegoFile: "PNG со скрытыми данными",
    pasteImage: "Прочитать из буфера",
    decodePreviewAria: "Превью изображения",
    decodePreviewEmpty: "Нет изображения",
    clipboardNoImage: "в буфере нет изображения",
    decryption: "Расшифровка",
    decodeRaw: "Как есть (без пароля)",
    decodePassword: "Пароль",
    decodePgp: "Экспорт как PGP MESSAGE",
    extract: "Извлечь",
    result: "Результат",
    downloadBytes: "Скачать байты",
    copyResult: "Копировать",
    copyImage: "Копировать изображение",
    copied: "Скопировано",
    imageCopied: "Изображение скопировано",
    nothingToCopy: "нечего копировать",
    footer: "HILL + STC в PNG · crypto: gcmwrap / GPG + Feistel",
    embedding: "Встраивание…",
    extracting: "Извлечение…",
    enterSecret: "введите секретный текст или выберите файл",
    needPassword: "укажите пароль",
    needPubkey: "вставьте публичный ключ GPG",
    needPng: "выберите PNG файл или вставьте изображение из буфера",
    needKeyName: "укажите имя для сохранения ключа",
    keySaved: "Ключ сохранён",
    keyDeleted: "Ключ удалён",
    binaryData: "бинарные данные",
    capacity: "Ёмкость ~{bytes} байт секрета (α≈0.1, {width}×{height} PNG)",
    doneEncode: "Готово: {changed} пикс. изменено, α={alpha}, фрейм {framed} байт",
    doneDecode: "Извлечено {bytes} байт",
    doneDecodePgp: "Извлечено {bytes} байт (PGP MESSAGE)",
    langLabel: "Язык",
  }),
  en: Object.freeze({
    documentTitle: "Congrads Steg — steganography greeting cards",
    subtitle: "A postcard with a hidden message. All in the browser, no server.",
    tabEncode: "Hide",
    tabDecode: "Extract",
    rendererVersion: "Card style",
    rendererV1: "v1 — classic",
    rendererV2: "v2 — gradients",
    wishText: "Card text",
    signature: "Signature",
    previewAria: "Preview",
    cardAria: "Postcard",
    loadingFonts: "Loading fonts…",
    generateCard: "Another card",
    applyText: "Update text",
    secretAria: "Secret",
    secretMessage: "Secret message",
    secretPlaceholder: "Text that will be hidden in the PNG",
    orFile: "Or a file",
    encryption: "Encryption",
    cryptoNone: "No encryption",
    cryptoPassword: "Password (gcmwrap)",
    cryptoPubkey: "GPG public key",
    password: "Password",
    pubkeyArmor: "Public key (ASCII armor)",
    savedKeys: "Saved keys",
    savedKeysNone: "— none saved —",
    keyName: "Key name",
    saveKey: "Save key",
    deleteKey: "Delete",
    hideAndDownload: "Hide and download PNG",
    stegoFile: "PNG with hidden data",
    pasteImage: "Read from clipboard",
    decodePreviewAria: "Image preview",
    decodePreviewEmpty: "No image",
    clipboardNoImage: "no image in the clipboard",
    decryption: "Decryption",
    decodeRaw: "As-is (no password)",
    decodePassword: "Password",
    decodePgp: "Export as PGP MESSAGE",
    extract: "Extract",
    result: "Result",
    downloadBytes: "Download bytes",
    copyResult: "Copy",
    copyImage: "Copy image",
    copied: "Copied",
    imageCopied: "Image copied",
    nothingToCopy: "nothing to copy",
    footer: "HILL + STC in PNG · crypto: gcmwrap / GPG + Feistel",
    embedding: "Embedding…",
    extracting: "Extracting…",
    enterSecret: "enter a secret text or choose a file",
    needPassword: "enter a password",
    needPubkey: "paste a GPG public key",
    needPng: "choose a PNG file or paste an image from the clipboard",
    needKeyName: "enter a name to save the key",
    keySaved: "Key saved",
    keyDeleted: "Key deleted",
    binaryData: "binary data",
    capacity: "Capacity ~{bytes} bytes of secret (α≈0.1, {width}×{height} PNG)",
    doneEncode: "Done: {changed} pixels changed, α={alpha}, frame {framed} bytes",
    doneDecode: "Extracted {bytes} bytes",
    doneDecodePgp: "Extracted {bytes} bytes (PGP MESSAGE)",
    langLabel: "Language",
  }),
});

/**
 * @returns {AppLanguage}
 */
export function loadSavedLanguage() {
  if (typeof localStorage === "undefined") {
    return "ru";
  }
  const savedLanguage = localStorage.getItem(LANG_STORAGE_KEY);
  if (savedLanguage === "en" || savedLanguage === "ru") {
    return savedLanguage;
  }
  return "ru";
}

/**
 * side-effects: writes localStorage
 * @param {AppLanguage} language
 * @returns {void}
 */
export function saveLanguage(language) {
  assertLanguage(language);
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(LANG_STORAGE_KEY, language);
}

/**
 * @param {AppLanguage} language
 * @param {string} key
 * @param {Record<string, string | number>} [replacements]
 * @returns {string}
 */
export function t(language, key, replacements = {}) {
  assertLanguage(language);
  const table = UI_STRINGS[language];
  const template = table[key];
  assert(typeof template === "string", `missing i18n key "${key}" for ${language}`);
  return template.replace(/\{([a-zA-Z]+)\}/g, (_match, placeholderName) => {
    const replacementValue = replacements[placeholderName];
    assert(
      replacementValue !== undefined,
      `missing replacement {${placeholderName}} for i18n key "${key}"`,
    );
    return String(replacementValue);
  });
}

/**
 * Apply data-i18n / data-i18n-placeholder / data-i18n-aria on the document.
 *
 * side-effects: mutates DOM text and attributes
 * @param {AppLanguage} language
 * @returns {void}
 */
export function applyDocumentLanguage(language) {
  assertLanguage(language);
  document.documentElement.lang = language;
  document.title = t(language, "documentTitle");
  for (const element of document.querySelectorAll("[data-i18n]")) {
    const key = element.getAttribute("data-i18n");
    assert(key !== null && key !== "", "data-i18n must be non-empty");
    element.textContent = t(language, key);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = element.getAttribute("data-i18n-placeholder");
    assert(key !== null && key !== "", "data-i18n-placeholder must be non-empty");
    assert(
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement,
      "data-i18n-placeholder only on input/textarea",
    );
    element.placeholder = t(language, key);
  }
  for (const element of document.querySelectorAll("[data-i18n-aria]")) {
    const key = element.getAttribute("data-i18n-aria");
    assert(key !== null && key !== "", "data-i18n-aria must be non-empty");
    element.setAttribute("aria-label", t(language, key));
  }
}

/**
 * @param {string} language
 * @returns {asserts language is AppLanguage}
 */
function assertLanguage(language) {
  assert(language === "ru" || language === "en", `expected ru|en, got ${language}`);
}

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
