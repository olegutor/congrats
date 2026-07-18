/**
 * База поздравлений и пожеланий — типичные формулировки из мессенджеров.
 * Категории влияют на палитру и декор открытки.
 */
export const WISH_CATEGORIES = Object.freeze({
  morning: 'morning',
  day: 'day',
  evening: 'evening',
  health: 'health',
  success: 'success',
  mood: 'mood',
  friendship: 'friendship',
  warmth: 'warmth',
  gratitude: 'gratitude',
  holiday: 'holiday',
});

/** @type {ReadonlyArray<{text: string, category: string, signature?: string}>} */
export const WISHES_DATABASE = Object.freeze([
  // Доброе утро
  { text: 'Доброе утро!\nПусть день начнётся\nс хорошего настроения.', category: WISH_CATEGORIES.morning },
  { text: 'С добрым утром!\nЖелаю лёгкого дня\nи приятных новостей.', category: WISH_CATEGORIES.morning },
  { text: 'Доброе утро, солнышко!\nПусть сегодня\nвсё складывается легко.', category: WISH_CATEGORIES.morning },
  { text: 'Доброе утро!\nПусть этот день\nбудет добрым к тебе.', category: WISH_CATEGORIES.morning },
  { text: 'С утра хочу пожелать\nтепла, улыбок\nи хорошего настроения.', category: WISH_CATEGORIES.morning },
  { text: 'Доброе утро!\nНачни день с улыбки —\nостальное приложится.', category: WISH_CATEGORIES.morning },
  { text: 'Доброе утро!\nЖелаю бодрости,\nсил и отличного дня.', category: WISH_CATEGORIES.morning },
  { text: 'С добрым утром!\nПусть сегодня\nсбудется хотя бы одно желание.', category: WISH_CATEGORIES.morning },

  // Добрый день
  { text: 'Добрый день!\nЖелаю спокойствия,\nудачи и хороших людей рядом.', category: WISH_CATEGORIES.day },
  { text: 'Хорошего дня!\nПусть всё идёт\nкак надо.', category: WISH_CATEGORIES.day },
  { text: 'Добрый день!\nПусть работа\nне утомляет, а радует.', category: WISH_CATEGORIES.day },
  { text: 'Желаю прекрасного дня!\nПусть он будет\nнаполнен приятными моментами.', category: WISH_CATEGORIES.day },
  { text: 'Добрый день!\nБереги себя\nи не забывай отдыхать.', category: WISH_CATEGORIES.day },
  { text: 'Хорошего и лёгкого дня!\nПусть всё получится\nс первого раза.', category: WISH_CATEGORIES.day },
  { text: 'Добрый день!\nЖелаю удачи\nво всех делах.', category: WISH_CATEGORIES.day },
  { text: 'Пусть сегодняшний день\nбудет добрым\nи щедрым на радость.', category: WISH_CATEGORIES.day },

  // Добрый вечер
  { text: 'Добрый вечер!\nПусть вечер\nбудет спокойным и уютным.', category: WISH_CATEGORIES.evening },
  { text: 'Хорошего вечера!\nОтдыхай\nи набирайся сил.', category: WISH_CATEGORIES.evening },
  { text: 'Добрый вечер!\nПусть за окном\nтишина, а дома — тепло.', category: WISH_CATEGORIES.evening },
  { text: 'Спокойного вечера!\nЖелаю приятного\nотдыха после рабочего дня.', category: WISH_CATEGORIES.evening },
  { text: 'Добрый вечер!\nПусть сегодня\nостались только хорошие воспоминания.', category: WISH_CATEGORIES.evening },

  // Здоровье
  { text: 'Желаю крепкого здоровья,\nбодрости\nи хорошего самочувствия!', category: WISH_CATEGORIES.health },
  { text: 'Будь здорова!\nПусть сил хватит\nна всё задуманное.', category: WISH_CATEGORIES.health },
  { text: 'Желаю здоровья\nи энергии\nна каждый день.', category: WISH_CATEGORIES.health },
  { text: 'Крепкого здоровья!\nБереги себя\nи близких.', category: WISH_CATEGORIES.health },
  { text: 'Пусть здоровье\nне подводит,\nа настроение\nвсегда будет отличным.', category: WISH_CATEGORIES.health },
  { text: 'Желаю вам\nкрепкого здоровья,\nдолгих лет\nи радости.', category: WISH_CATEGORIES.health },
  { text: 'Здоровья тебе\nи всей семье!\nЭто главное\nв нашей жизни.', category: WISH_CATEGORIES.health },
  { text: 'Пусть болезни\nобходят стороной,\nа силы\nне иссякают.', category: WISH_CATEGORIES.health },

  // Успехи
  { text: 'Желаю успехов\nво всех начинаниях!\nТы справишься.', category: WISH_CATEGORIES.success },
  { text: 'Удачи и успехов!\nПусть все мечты\nсбываются.', category: WISH_CATEGORIES.success },
  { text: 'Желаю карьерного роста,\nновых побед\nи признания.', category: WISH_CATEGORIES.success },
  { text: 'Пусть удача\nсопутствует\nво всём!', category: WISH_CATEGORIES.success },
  { text: 'Успехов в делах!\nВерю в тебя\nи твои силы.', category: WISH_CATEGORIES.success },
  { text: 'Желаю процветания,\nстабильности\nи новых возможностей.', category: WISH_CATEGORIES.success },
  { text: 'Пусть каждый шаг\nприближает\nк цели.', category: WISH_CATEGORIES.success },
  { text: 'Удачи на экзаменах!\nВсё получится —\nты хорошо готовилась.', category: WISH_CATEGORIES.success },

  // Настроение
  { text: 'Желаю отличного\nнастроения\nна весь день!', category: WISH_CATEGORIES.mood },
  { text: 'Пусть улыбка\nне сходит\nс лица.', category: WISH_CATEGORIES.mood },
  { text: 'Хорошего настроения!\nПусть радость\nбудет с тобой.', category: WISH_CATEGORIES.mood },
  { text: 'Желаю солнечного\nнастроения,\nдаже если\nза окном дождь.', category: WISH_CATEGORIES.mood },
  { text: 'Пусть каждый день\nприносит\nмаленькие радости.', category: WISH_CATEGORIES.mood },
  { text: 'Будь счастлива!\nТы этого\nдействительно достойна.', category: WISH_CATEGORIES.mood },
  { text: 'Желаю лёгкости\nна душе\nи тепла в сердце.', category: WISH_CATEGORIES.mood },

  // Дружба
  { text: 'Спасибо, что ты есть!\nЦеню нашу\nдружбу.', category: WISH_CATEGORIES.friendship },
  { text: 'Ты — замечательный\nчеловек.\nРада, что мы знакомы.', category: WISH_CATEGORIES.friendship },
  { text: 'Желаю тебе\nверных друзей\nи тёплого общения.', category: WISH_CATEGORIES.friendship },
  { text: 'Пусть рядом\nвсегда будут\nте, кто поддержит.', category: WISH_CATEGORIES.friendship },
  { text: 'Дружба — это когда\nможно молчать\nи всё равно понимать друг друга.', category: WISH_CATEGORIES.friendship },
  { text: 'Спасибо за поддержку!\nТы настоящий\nдруг.', category: WISH_CATEGORIES.friendship },

  // Тепло и любовь (нейтральные, без романтики)
  { text: 'Пусть дом\nбудет полной\nчашей.', category: WISH_CATEGORIES.warmth },
  { text: 'Желаю семейного\nтепла\nи уюта.', category: WISH_CATEGORIES.warmth },
  { text: 'Пусть в доме\nцарит\nлюбовь и согласие.', category: WISH_CATEGORIES.warmth },
  { text: 'Обнимаю!\nЖелаю\nвсего самого доброго.', category: WISH_CATEGORIES.warmth },
  { text: 'Шлю тёплые\nобъятия\nна расстоянии.', category: WISH_CATEGORIES.warmth },
  { text: 'Пусть рядом\nбудут те,\nкто дорог.', category: WISH_CATEGORIES.warmth },

  // Благодарность
  { text: 'Спасибо\nза всё!\nТы делаешь\nмир лучше.', category: WISH_CATEGORIES.gratitude },
  { text: 'Благодарю\nза помощь\nи поддержку.', category: WISH_CATEGORIES.gratitude },
  { text: 'Спасибо\nза доброту\nи внимание.', category: WISH_CATEGORIES.gratitude },
  { text: 'Очень ценю\nваше участие.\nСпасибо!', category: WISH_CATEGORIES.gratitude },

  // Универсальные праздничные / открытки
  { text: 'С праздником!\nЖелаю счастья,\nздоровья и радости.', category: WISH_CATEGORIES.holiday },
  { text: 'Поздравляю!\nПусть этот день\nзапомнится надолго.', category: WISH_CATEGORIES.holiday },
  { text: 'С праздником!\nПусть сбудутся\nсамые заветные мечты.', category: WISH_CATEGORIES.holiday },
  { text: 'От всей души\nпоздравляю!\nБудьте счастливы.', category: WISH_CATEGORIES.holiday },
  { text: 'Желаю вам\nвсего наилучшего\nв этот особенный день.', category: WISH_CATEGORIES.holiday },
  { text: 'Пусть жизнь\nдарит только\nприятные сюрпризы.', category: WISH_CATEGORIES.holiday },
  { text: 'С наступающим!\nПусть новый год\nпринесёт только хорошее.', category: WISH_CATEGORIES.holiday },
  { text: 'С днём рождения!\nСчастья, здоровья\nи исполнения желаний.', category: WISH_CATEGORIES.holiday },
  { text: 'Пусть каждый\nновый день\nбудет лучше предыдущего.', category: WISH_CATEGORIES.holiday },
  { text: 'Желаю мира,\nдобра\nи спокойствия.', category: WISH_CATEGORIES.holiday },

  // Классика WhatsApp-рассылок
  { text: 'Пусть ангел-хранитель\nбережёт вас\nкаждый день.', category: WISH_CATEGORIES.warmth },
  { text: 'Желаю, чтобы\nвсе проблемы\nрешались сами собой.', category: WISH_CATEGORIES.mood },
  { text: 'Пусть фортуна\nулыбнётся\nименно вам.', category: WISH_CATEGORIES.success },
  { text: 'Храни вас Бог!\nВсего доброго.', category: WISH_CATEGORIES.warmth },
  { text: 'Желаю, чтобы\nжизнь была\nпохожа на сказку.', category: WISH_CATEGORIES.mood },
  { text: 'Пусть дом\nнаполнится\nсмехом и радостью.', category: WISH_CATEGORIES.warmth },
  { text: 'Сил тебе,\nтерпения\nи мудрости.', category: WISH_CATEGORIES.mood },
  { text: 'Желаю, чтобы\nмечты не оставались\nмечтами.', category: WISH_CATEGORIES.success },
  { text: 'Пусть в жизни\nбудет больше\nповодов для радости.', category: WISH_CATEGORIES.mood },
  { text: 'От души\nжелаю\nсчастья и благополучия.', category: WISH_CATEGORIES.warmth },

  // Радость и эмоции
  { text: 'Ты — солнышко!\nПусть каждый день\nсияет ярче!', category: WISH_CATEGORIES.mood },
  { text: 'Обнимаю!\nЖелаю море\nсчастья и смеха!', category: WISH_CATEGORIES.warmth },
  { text: 'Ты потрясающая!\nПусть жизнь\nдарит только радость!', category: WISH_CATEGORIES.mood },
  { text: 'Счастья тебе!\nПусть сердце\nпоёт от радости!', category: WISH_CATEGORIES.mood },
  { text: 'Ты заслуживаешь\nсамого лучшего!\nВерь в себя!', category: WISH_CATEGORIES.mood },
  { text: 'Пусть сегодня\nбудет волшебным!\nУлыбайся чаще!', category: WISH_CATEGORIES.day },
  { text: 'Желаю тебе\nокеан позитива\nи гору радости!', category: WISH_CATEGORIES.mood },
  { text: 'Ты — чудо!\nПусть мир\nулыбается тебе!', category: WISH_CATEGORIES.mood },
  { text: 'Супер-день\nтебе!\nВсё получится!', category: WISH_CATEGORIES.day },
  { text: 'Пусть душа\nнаполнится\nсветом и теплом!', category: WISH_CATEGORIES.warmth },
  { text: 'Ты — умница!\nГоржусь тобой\nи верю в тебя!', category: WISH_CATEGORIES.friendship },
  { text: 'Желаю волшебства\nв каждом мгновении!\nТы этого достойна!', category: WISH_CATEGORIES.mood },
  { text: 'Пусть радость\nбурлит\nкак родник!', category: WISH_CATEGORIES.mood },
  { text: 'Счастливого дня!\nПусть всё\nскладывается идеально!', category: WISH_CATEGORIES.day },
  { text: 'Ты — лучик\nсвета!\nСияй ярче всех!', category: WISH_CATEGORIES.mood },
  { text: 'Желаю тебе\nсчастья без границ!\nОбнимаю!', category: WISH_CATEGORIES.warmth },
  { text: 'Пусть каждая минута\nнаполняет\nсердце радостью!', category: WISH_CATEGORIES.mood },
  { text: 'Ты — замечательная!\nЖелаю\nтолько приятных сюрпризов!', category: WISH_CATEGORIES.mood },
  { text: 'Ура!\nПусть сегодня\nбудет лучшим днём!', category: WISH_CATEGORIES.day },
  { text: 'Желаю тебе\nискренних улыбок\nи тёплых объятий!', category: WISH_CATEGORIES.warmth },

  // Утренний заряд энергии
  { text: 'Доброе утро!\nПросыпайся\nс улыбкой и надеждой!', category: WISH_CATEGORIES.morning },
  { text: 'С добрым утром!\nНовый день —\nновые возможности!', category: WISH_CATEGORIES.morning },
  { text: 'Доброе утро, красавица!\nПусть день\nбудет чудесным!', category: WISH_CATEGORIES.morning },
  { text: 'Доброе утро!\nЖелаю заряда\nэнергии и радости!', category: WISH_CATEGORIES.morning },
  { text: 'С утра шлю\nсамые тёплые\nи светлые мысли!', category: WISH_CATEGORIES.morning },

  // Здоровье с теплом
  { text: 'Крепкого здоровья!\nПусть энергия\nне иссякает никогда!', category: WISH_CATEGORIES.health },
  { text: 'Будь здорова\nи счастлива!\nЭто главное!', category: WISH_CATEGORIES.health },
  { text: 'Желаю бодрости,\nсил и отличного\nсамочувствия!', category: WISH_CATEGORIES.health },
  { text: 'Пусть здоровье\nбудет крепче\nкамня!', category: WISH_CATEGORIES.health },

  // Успехи с верой
  { text: 'Ты справишься!\nЖелаю побед\nи триумфа!', category: WISH_CATEGORIES.success },
  { text: 'Удачи!\nПусть мечты\nстановятся реальностью!', category: WISH_CATEGORIES.success },
  { text: 'Верю в тебя!\nЖелаю успехов\nи признания!', category: WISH_CATEGORIES.success },
  { text: 'Пусть удача\nидёт с тобой\nрука об руку!', category: WISH_CATEGORIES.success },
  { text: 'Ты — победитель!\nЖелаю новых\nвершин!', category: WISH_CATEGORIES.success },

  // Дружба и поддержка
  { text: 'Ты — лучший\nдруг!\nСпасибо, что ты есть!', category: WISH_CATEGORIES.friendship },
  { text: 'Ценю тебя!\nПусть рядом\nвсегда будут свои!', category: WISH_CATEGORIES.friendship },
  { text: 'Ты — надёжная\nопора!\nОбнимаю крепко!', category: WISH_CATEGORIES.friendship },
  { text: 'Спасибо\nза твоё тепло\nи доброту!', category: WISH_CATEGORIES.gratitude },

  // Семейное тепло
  { text: 'Пусть дом\nсияет\nсчастьем и смехом!', category: WISH_CATEGORIES.warmth },
  { text: 'Желаю семье\nлюбви, мира\nи согласия!', category: WISH_CATEGORIES.warmth },
  { text: 'Пусть дома\nждут\nобъятия и уют!', category: WISH_CATEGORIES.warmth },
  { text: 'Счастья\nвашей семье!\nЛюбви и тепла!', category: WISH_CATEGORIES.warmth },

  // Праздничный восторг
  { text: 'С праздником!\nЖелаю\nсчастья и волшебства!', category: WISH_CATEGORIES.holiday },
  { text: 'Поздравляю!\nПусть этот день\nбудет незабываемым!', category: WISH_CATEGORIES.holiday },
  { text: 'С днём рождения!\nСчастья, любви\nи исполнения мечты!', category: WISH_CATEGORIES.holiday },
  { text: 'С праздником!\nПусть сердце\nпереполняет радость!', category: WISH_CATEGORIES.holiday },
  { text: 'От всей души\nпоздравляю!\nБудьте счастливы!', category: WISH_CATEGORIES.holiday },

  // Вечерний уют
  { text: 'Добрый вечер!\nПусть вечер\nбудет тёплым и уютным!', category: WISH_CATEGORIES.evening },
  { text: 'Спокойной ночи\nзаранее!\nСладких снов!', category: WISH_CATEGORIES.evening },
  { text: 'Хорошего вечера!\nОтдыхай\nс удовольствием!', category: WISH_CATEGORIES.evening },

  // Классика с душой
  { text: 'Пусть ангел-хранитель\nоберегает вас\nкаждый день!', category: WISH_CATEGORIES.warmth },
  { text: 'Желаю, чтобы\nсердце\nсветилось радостью!', category: WISH_CATEGORIES.mood },
  { text: 'Пусть жизнь\nбудет\nпраздником каждый день!', category: WISH_CATEGORIES.mood },
  { text: 'Сил, терпения\nи море\nпозитива!', category: WISH_CATEGORIES.mood },
  { text: 'Пусть мечты\nсбываются\nлегко и радостно!', category: WISH_CATEGORIES.success },
  { text: 'Желаю\nсчастья,\nлюбви и процветания!', category: WISH_CATEGORIES.warmth },
  { text: 'Пусть каждый день\nприносит\nновые радости!', category: WISH_CATEGORIES.mood },
  { text: 'Тепла,\nсвета\nи добра вам!', category: WISH_CATEGORIES.warmth },
  { text: 'Желаю\nокеана\nсчастья!', category: WISH_CATEGORIES.mood },
  { text: 'Пусть удача\nсопутствует\nвсегда!', category: WISH_CATEGORIES.success },
]);

/**
 * Возвращает случайное пожелание из базы.
 * @returns {{text: string, category: string, signature?: string}}
 */
export function pickRandomWish() {
  const index = Math.floor(Math.random() * WISHES_DATABASE.length);
  return WISHES_DATABASE[index];
}
