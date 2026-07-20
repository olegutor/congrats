/** UI strings and language preference for Congrats Steg. */

/** @typedef {'ru' | 'en'} AppLanguage */

const LANG_STORAGE_KEY = "congrats-steg.lang.v1";

/** @type {Record<AppLanguage, Record<string, string>>} */
const UI_STRINGS = Object.freeze({
  ru: Object.freeze({
    documentTitle: "Congrats Steg — открытки со стеганографией",
    subtitle: "Открытка + скрытое сообщение. Всё в браузере, без сервера.",
    tabEncode: "Спрятать",
    tabDecode: "Извлечь",
    rendererVersion: "Версия оформления",
    rendererV1: "v1 — классика",
    rendererV2: "v2 — градиенты",
    rendererV3: "v3 — праздник",
    rendererV4: "v4 — живая вселенная",
    rendererV5: "v5 — ар-деко, золотой час",
    rendererV6: "v6 — витражный сад",
    wishText: "Текст на открытке",
    signature: "Подпись",
    previewAria: "Превью",
    cardAria: "Открытка",
    loadingFonts: "Загрузка шрифтов…",
    generateCard: "Другая открытка",
    applyText: "Обновить текст",
    secretAria: "Секрет",
    secretMessage: "Секретное сообщение",
    secretPlaceholder: "Текст, который спрячется в изображении",
    orFile: "Или секретный файл",
    orFileLimit: "Или секретный файл (макс. {bytes} байт)",
    orFileLimitUnknown: "Или секретный файл",
    secretUsage: "{used} / {max}",
    secretUsageUnknown: "{used} / —",
    encryption: "Шифрование",
    cryptoPassword: "Стегопароль + шифрование",
    cryptoPubkey: "Публичный ключ GPG (PNG, без стегопароля)",
    password: "Стегопароль",
    pubkeyArmor: "Публичный ключ (ASCII armor)",
    savedKeys: "Сохранённые ключи",
    savedKeysNone: "— нет сохранённых —",
    keyName: "Имя ключа",
    saveKey: "Сохранить ключ",
    deleteKey: "Удалить",
    hideSecret: "Спрятать",
    downloadImage: "Скачать",
    stegoFile: "Изображение со скрытыми данными",
    pasteImage: "Прочитать из буфера",
    decodePreviewAria: "Превью изображения",
    decodePreviewEmpty: "Нет изображения",
    clipboardNoImage: "в буфере нет изображения",
    decryption: "Расшифровка",
    decodePassword: "Пароль",
    decodePgp: "GPG по публичному ключу (PNG)",
    extract: "Извлечь",
    result: "Результат",
    downloadBytes: "Скачать байты",
    copyResult: "Копировать",
    copyImage: "Копировать изображение",
    copied: "Скопировано",
    imageCopied: "Изображение скопировано",
    imageShared: "Изображение отправлено",
    copyingImage: "Копирование…",
    copyImageFailed: "Не удалось скопировать изображение в буфер",
    copyImageVerifyFailed: "Буфер не содержит это изображение — попробуйте долгое нажатие",
    longPressToCopy: "Долгое нажатие на картинку → Копировать изображение",
    nothingToCopy: "нечего копировать",
    footer: "PNG: HILL+STC · JPEG: J-UNIWARD (phasm Ghost) · crypto: gcmwrap / GPG / Ghost AES",
    embedding: "Встраивание…",
    extracting: "Извлечение…",
    enterSecret: "введите секретный текст или выберите файл",
    needPassword: "укажите стегопароль",
    needPubkey: "вставьте публичный ключ GPG",
    gpgPngOnly: "режим GPG без стегопароля поддерживает только PNG",
    needPng: "выберите PNG/JPEG файл или вставьте изображение из буфера",
    needKeyName: "укажите имя для сохранения ключа",
    keySaved: "Ключ сохранён",
    keyDeleted: "Ключ удалён",
    binaryData: "бинарные данные",
    capacity: "Ёмкость ~{bytes} байт секрета (α≈0.1, {width}×{height} PNG)",
    capacityGpg: "GPG-буфер до {payloadBytes} байт (контейнер {containerBytes}), PNG ~{imageBytes} байт ({width}×{height})",
    capacityGpgTooSmall: "PNG {width}×{height} слишком мал для минимального GPG-профиля",
    capacityJpeg: "Ёмкость J-UNIWARD (Ghost) ~{bytes} байт сообщения",
    capacityJpegPending: "Ёмкость J-UNIWARD считается по JPEG-контейнеру…",
    doneEncode: "Готово: использовано {capacityPercent}% ёмкости, файл ~{fileSizeKb} КБ, изменено {changed} пикс., α={alpha}",
    doneEncodeGpg: "Готово: буфер {bufferPercent}%, изображение {imagePercent}%, файл ~{fileSizeKb} КБ, изменено {changed} пикс., α={alpha}",
    doneEncodeJpeg: "Готово: JPEG Ghost ~{fileSizeKb} КБ, payload {payloadBytes} байт (J-UNIWARD)",
    exportSize: "Размер / качество",
    exportSizeCompact: "Малый (~250 КБ PNG)",
    exportSizeMedium: "Средний (~400 КБ PNG)",
    exportSizeFull: "Полный (~2 МБ PNG)",
    exportSizeCompactJpeg: "Малый (~60 КБ, q72)",
    exportSizeMediumJpeg: "Средний (~120 КБ, q85)",
    exportSizeFullJpeg: "Полный (~350 КБ, q92)",
    exportFormat: "Формат файла",
    exportFormatPng: "PNG (HILL+STC в пикселях)",
    exportFormatJpeg: "JPEG (J-UNIWARD / Ghost)",
    coverSource: "Контейнер",
    coverSourceCard: "Сгенерированная открытка",
    coverSourceUpload: "Загрузить изображение",
    coverFile: "Файл-контейнер",
    jpegGridReset: "Сброс сетки блоков JPEG",
    jpegGridResetHint: "Лёгкий случайный crop + пересохранение JPEG перед стего (сдвигает решётку 8×8)",
    needCoverImage: "загрузите изображение-контейнер",
    doneDecode: "Извлечено {bytes} байт",
    doneDecodePgp: "Восстановлен PGP MESSAGE ({bytes} байт); скачайте .pgp или скопируйте armored и расшифруйте в Kleopatra/GnuPG",
    doneDecodePgpBinaryOnly: "Восстановлен PGP MESSAGE ({bytes} байт); armored слишком большой для экрана — скачайте .pgp",
    pgpReady: "PGP MESSAGE готов к скачиванию",
    langLabel: "Язык",
  }),
  en: Object.freeze({
    documentTitle: "Congrats Steg — steganography greeting cards",
    subtitle: "A postcard with a hidden message. All in the browser, no server.",
    tabEncode: "Hide",
    tabDecode: "Extract",
    rendererVersion: "Card style",
    rendererV1: "v1 — classic",
    rendererV2: "v2 — gradients",
    rendererV3: "v3 — celebration",
    rendererV4: "v4 — living universe",
    rendererV5: "v5 — art deco, golden hour",
    rendererV6: "v6 — stained-glass garden",
    wishText: "Card text",
    signature: "Signature",
    previewAria: "Preview",
    cardAria: "Postcard",
    loadingFonts: "Loading fonts…",
    generateCard: "Another card",
    applyText: "Update text",
    secretAria: "Secret",
    secretMessage: "Secret message",
    secretPlaceholder: "Text that will be hidden in the image",
    orFile: "Or a secret file",
    orFileLimit: "Or a secret file (max {bytes} bytes)",
    orFileLimitUnknown: "Or a secret file",
    secretUsage: "{used} / {max}",
    secretUsageUnknown: "{used} / —",
    encryption: "Encryption",
    cryptoPassword: "Stego passphrase + encryption",
    cryptoPubkey: "GPG public key (PNG, no stego passphrase)",
    password: "Stego passphrase",
    pubkeyArmor: "Public key (ASCII armor)",
    savedKeys: "Saved keys",
    savedKeysNone: "— none saved —",
    keyName: "Key name",
    saveKey: "Save key",
    deleteKey: "Delete",
    hideSecret: "Hide",
    downloadImage: "Download",
    stegoFile: "Image with hidden data",
    pasteImage: "Read from clipboard",
    decodePreviewAria: "Image preview",
    decodePreviewEmpty: "No image",
    clipboardNoImage: "no image in the clipboard",
    decryption: "Decryption",
    decodePassword: "Password",
    decodePgp: "GPG with public key (PNG)",
    extract: "Extract",
    result: "Result",
    downloadBytes: "Download bytes",
    copyResult: "Copy",
    copyImage: "Copy image",
    copied: "Copied",
    imageCopied: "Image copied",
    imageShared: "Image shared",
    copyingImage: "Copying…",
    copyImageFailed: "Could not copy the image to the clipboard",
    copyImageVerifyFailed: "Clipboard does not contain this image — try long-press",
    longPressToCopy: "Long-press the image → Copy image",
    nothingToCopy: "nothing to copy",
    footer: "PNG: HILL+STC · JPEG: J-UNIWARD (phasm Ghost) · crypto: gcmwrap / GPG / Ghost AES",
    embedding: "Embedding…",
    extracting: "Extracting…",
    enterSecret: "enter a secret text or choose a file",
    needPassword: "enter the stego passphrase",
    needPubkey: "paste a GPG public key",
    gpgPngOnly: "GPG mode without a stego passphrase supports PNG only",
    needPng: "choose a PNG/JPEG file or paste an image from the clipboard",
    needKeyName: "enter a name to save the key",
    keySaved: "Key saved",
    keyDeleted: "Key deleted",
    binaryData: "binary data",
    capacity: "Capacity ~{bytes} bytes of secret (α≈0.1, {width}×{height} PNG)",
    capacityGpg: "GPG buffer up to {payloadBytes} bytes (container {containerBytes}), PNG ~{imageBytes} bytes ({width}×{height})",
    capacityGpgTooSmall: "PNG {width}×{height} is too small for the minimum GPG profile",
    capacityJpeg: "J-UNIWARD (Ghost) capacity ~{bytes} message bytes",
    capacityJpegPending: "J-UNIWARD capacity is computed from the JPEG cover…",
    doneEncode: "Done: used {capacityPercent}% of capacity, file ~{fileSizeKb} KB, {changed} px changed, α={alpha}",
    doneEncodeGpg: "Done: buffer {bufferPercent}%, image {imagePercent}%, file ~{fileSizeKb} KB, {changed} px changed, α={alpha}",
    doneEncodeJpeg: "Done: JPEG Ghost ~{fileSizeKb} KB, payload {payloadBytes} bytes (J-UNIWARD)",
    exportSize: "Size / quality",
    exportSizeCompact: "Small (~250 KB PNG)",
    exportSizeMedium: "Medium (~400 KB PNG)",
    exportSizeFull: "Full (~2 MB PNG)",
    exportSizeCompactJpeg: "Small (~60 KB, q72)",
    exportSizeMediumJpeg: "Medium (~120 KB, q85)",
    exportSizeFullJpeg: "Full (~350 KB, q92)",
    exportFormat: "File format",
    exportFormatPng: "PNG (HILL+STC in pixels)",
    exportFormatJpeg: "JPEG (J-UNIWARD / Ghost)",
    coverSource: "Cover",
    coverSourceCard: "Generated card",
    coverSourceUpload: "Upload image",
    coverFile: "Cover file",
    jpegGridReset: "Reset JPEG block grid",
    jpegGridResetHint: "Mild random crop + JPEG resave before stego (shifts the 8×8 lattice)",
    needCoverImage: "upload a cover image",
    doneDecode: "Extracted {bytes} bytes",
    doneDecodePgp: "Rebuilt PGP MESSAGE ({bytes} bytes); download .pgp or copy armored and decrypt in Kleopatra/GnuPG",
    doneDecodePgpBinaryOnly: "Rebuilt PGP MESSAGE ({bytes} bytes); armored is too large to show — download the .pgp",
    pgpReady: "PGP MESSAGE is ready to download",
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
