import { TIL_STORIES } from './stories.js';
import { storyLanguage } from './languages.js';

const prompts = [
  ['coffee-order', 'coffee', 'Маған бір латте, өтінемін.', '«Маған» — «мне». Число стоит перед названием напитка.', ['Өтінемін, маған бір латте.']],
  ['bakery-count', 'bakery', 'Үш бауырсақ беріңізші.', '«Үш» ставится перед «бауырсақ». Вежливая просьба заканчивается на «беріңізші».'],
  ['market-price', 'market', 'Алманың бір килосы қанша тұрады?', 'Сначала называем товар, потом спрашиваем цену через «қанша тұрады?».'],
  ['pharmacy-need', 'pharmacy', 'Маған пластырь керек.', '«Маған … керек» — «мне нужно …».'],
  ['campus-year', 'campus', 'Иә, мен де бірінші курста оқимын.', 'Держи «мен де» («я тоже») и «бірінші курста» («на первом курсе») вместе.'],
  ['library-room', 'library', 'Оқу залы қайда?', '«Оқу залы» — читальный зал. Вопросительное «қайда?» идёт в конце.'],
  ['library-quiet', 'library', 'Маған тыныш жер керек.', '«Тыныш» описывает «жер», поэтому стоит перед ним.'],
  ['club-debate', 'club', 'Маған пікірсайыс ұнайды.', 'После «маған» назови то, что нравится. «Ұнайды» завершает фразу.'],
  ['way-park', 'way', 'Саябаққа қалай баруға болады?', '«Саябаққа» называет направление, а «қалай баруға болады?» спрашивает, как туда добраться.'],
  ['bus-stops', 'bus', 'Театрға дейін екі аялдама бар.', '«Театрға дейін» — «до театра». «Екі аялдама» — «две остановки».'],
  ['meeting-place', 'meeting', 'Университеттің алдында кездесейік.', '«Университеттің алдында» — «перед университетом». «Кездесейік» — предложение встретиться.'],
  ['parcel-screen', 'parcel', 'Кодты телефоннан көрсетсем бола ма?', 'Вопрос «көрсетсем бола ма?» означает «можно я покажу?».'],
  ['cinema-language', 'cinema', 'Қазақ тіліндегі сеанс бар ма?', '«Қазақ тіліндегі» целиком описывает сеанс. Вопрос о наличии заканчивается на «бар ма?».'],
  ['cinema-seats', 'cinema', 'Соңғы қатарда бос орын бар ма?', '«Соңғы қатарда» означает «в последнем ряду», «бос орын» — «свободное место».'],
  ['sport-sunday', 'sport', 'Жексенбіде бірге жүгірейік.', 'Здесь фраза начинается со времени. «Жүгірейік» — «давай побегаем».', ['Бірге жексенбіде жүгірейік.']],
  ['sport-park', 'sport', 'Саябақтағы алаңда ойнайық.', '«Саябақтағы» указывает, где находится площадка. «Ойнайық» — «давай сыграем».'],
  ['interview-slide', 'interview', 'Сайттың дизайнын жасадым.', '«Сайттың дизайнын» называет, что именно ты сделал.'],
  ['interview-guests', 'interview', 'Қонақтарды қарсы алдым.', '«Қарсы алдым» — единое выражение «встретил».'],
  ['teamwork-day', 'teamwork', 'Маған тағы бір күн керек.', '«Тағы бір күн» — «ещё один день». Ставим этот блок перед «керек».'],
  ['teamwork-online', 'teamwork', 'Бүгін кешке онлайн жаттығайық.', '«Бүгін кешке» — «сегодня вечером». «Жаттығайық» приглашает порепетировать вместе.'],
  ['station-ticket', 'station', 'Ертеңге бір билет беріңізші.', '«Ертеңге» задаёт день поездки. «Бір билет» — один билет.'],
  ['hotel-breakfast', 'hotel', 'Таңғы ас сағат нешеде басталады?', '«Таңғы ас» — завтрак. «Сағат нешеде?» помогает спросить точное время.'],
  ['trip-mountain', 'trip', 'Жылы күрте алайық.', '«Жылы» описывает «күрте». «Алайық» — «давай возьмём».'],
  ['trip-time', 'trip', 'Онда таңғы сегізде жолға шығайық.', '«Таңғы сегізде» — «в восемь утра», «жолға шығайық» — «давай выедем».'],
  ['volunteer-prepare', 'volunteer', 'Дайындыққа көмектескім келеді.', '«Дайындыққа» — «с подготовкой». «Көмектескім келеді» выражает желание помочь.'],
  ['volunteer-morning', 'volunteer', 'Таңертең келе аламын.', '«Таңертең» указывает время, «келе аламын» — «могу прийти».'],
  ['hackathon-problem', 'hackathon', 'Алдымен мәселені түсіндіремін.', '«Алдымен» задаёт порядок действий. «Мәселені» — то, что ты объяснишь.'],
  ['hackathon-students', 'hackathon', 'Бұл қосымша студенттерге көмектеседі.', '«Студенттерге» отвечает на вопрос «кому?».'],
  ['lost-found-bag', 'lost-found', 'Мен сөмкемді жоғалтып алдым.', '«Сөмкемді» — «свою сумку». «Жоғалтып алдым» означает «потерял».'],
  ['lost-found-exit', 'lost-found', 'Шығатын есіктің жанында көрдім.', '«Шығатын есіктің жанында» — «у выхода». «Көрдім» — «видел».'],
  ['bike-hour', 'bike-rental', 'Велосипедті бір сағатқа алғым келеді.', '«Бір сағатқа» отвечает на вопрос «на сколько?».'],
  ['bike-helmet', 'bike-rental', 'Сізге дулыға керек пе?', '«Сізге» — «вам». Вопрос заканчивается частицей «пе?».'],
  ['exchange-language', 'language-exchange', 'Қазақша сөйлескім келеді.', '«Қазақша» указывает язык общения. «Сөйлескім келеді» означает «хочу поговорить».'],
  ['exchange-music', 'language-exchange', 'Музыка туралы сөйлесейік.', '«Музыка туралы» — «о музыке». «Сөйлесейік» приглашает поговорить вместе.'],
  ['coworking-room', 'coworking', 'Кездесуге бөлме керек.', '«Кездесуге» называет цель, а «бөлме керек» значит «нужна комната».'],
  ['coworking-window', 'coworking', 'Терезенің жанында отырғым келеді.', '«Терезенің жанында» — «у окна». Держи эти слова вместе.'],
  ['reschedule-today', 'reschedule', 'Бүгін басқа уақыт бар ма?', '«Бүгін» — сегодня. Вопрос о наличии заканчивается на «бар ма?».'],
  ['reschedule-afternoon', 'reschedule', 'Түстен кейін келемін.', '«Түстен кейін» вместе означает «после обеда».'],
  ['return-size', 'return-order', 'Басқа өлшемге ауыстырғым келеді.', '«Басқа өлшемге» — на другой размер. Оборот «ауыстырғым келеді» выражает желание.'],
  ['return-item', 'return-order', 'Осы тауарды қайтарғым келеді.', '«Осы тауарды» — этот товар. «Қайтарғым келеді» — хочу вернуть.'],
  ['workshop-first', 'workshop', 'Жоқ, бұл менің алғашқы сабағым.', '«Алғашқы» стоит перед словом «сабағым» — мой урок.'],
  ['workshop-supplies', 'workshop', 'Өзіммен не әкелуім керек?', '«Өзіммен» — с собой, а «әкелуім керек» — мне нужно принести.']
];

const byLesson = new Map(TIL_STORIES.map((story) => [story.id, story]));
for (const story of TIL_STORIES.filter((story) => story.language)) {
  const choices = Object.values(story.scenes).flatMap((scene) => scene.choices ?? [])
    .filter(([text, , next]) => next && phraseWords(text).length >= 2).slice(0, 2);
  choices.forEach(([text, , , tip], index) => {
    prompts.push([story.id + '-' + index, story.id, text, tip]);
  });
}
const masterPoints = 3;

export function phraseWords(sentence, language = 'kk') {
  return sentence.normalize('NFC').toLocaleLowerCase(language).match(/[\p{L}\p{M}\p{N}]+(?:[-‑][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}

export const STUDIO_PROMPTS = prompts.map(([id, lesson, kk, tip, alternatives = []]) => {
  const story = byLesson.get(lesson);
  const dialogue = Object.values(story.scenes).flatMap((scene) => [
    scene.line, ...((scene.choices ?? []).filter((choice) => choice[2]))
  ]);
  const [, ru] = dialogue.find((line) => line[0] === kk);
  return { id, lesson, language: storyLanguage(story), category: story.category, title: story.title, kk, ru, tip, solutions: [kk, ...alternatives].map((text) => phraseWords(text, storyLanguage(story))) };
});
const studioIds = new Set(STUDIO_PROMPTS.map(({ id }) => id));

export function readStudio(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => studioIds.has(id)))] : [];
}

export function pickStudioRound({ lesson, category, solved, shuffle, size = 4, language }) {
  const pool = STUDIO_PROMPTS.filter((exercise) => (!language || exercise.language === language) && (lesson
    ? exercise.lesson === lesson
    : category === 'all' || exercise.category === category));
  const mastered = new Set(solved);
  return [
    ...shuffle(pool.filter(({ id }) => !mastered.has(id))),
    ...shuffle(pool.filter(({ id }) => mastered.has(id)))
  ].slice(0, size);
}

export function mixStudioWords(exercise, shuffle) {
  const original = exercise.solutions[0].map((text, id) => ({ id, text }));
  const mixed = shuffle(original);
  // Try the shuffle first, then rotate if it happens to be a valid order.
  for (let offset = 0; offset < mixed.length; offset++) {
    const tiles = [...mixed.slice(offset), ...mixed.slice(0, offset)];
    if (!checkStudioAnswer(exercise, tiles, tiles.map(({ id }) => id))) return tiles;
  }
  return mixed;
}

export function checkStudioAnswer(exercise, tiles, answer) {
  if (answer.length !== exercise.solutions[0].length || new Set(answer).size !== answer.length) return false;
  const words = answer.map((id) => tiles.find((tile) => tile.id === id)?.text);
  return matchesSolution(exercise, words);
}

function matchesSolution(exercise, words) {
  return exercise.solutions.some((solution) => words.length === solution.length && solution.every((word, index) => word === words[index]));
}

export function checkWrittenAnswer(exercise, answer) {
  return matchesSolution(exercise, phraseWords(answer, exercise.language));
}

export function masterStudio(solved, id, clean, mode = 'tiles') {
  if (!clean || !studioIds.has(id) || solved.includes(id)) return 0;
  solved.push(id);
  return mode === 'typing' ? 5 : masterPoints;
}

export function studioXp(solved = [], written = []) {
  return masterPoints * solved.length + 5 * written.length;
}
