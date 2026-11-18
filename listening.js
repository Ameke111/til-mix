import { TIL_STORIES } from './stories.js';

const lessons = new Map(TIL_STORIES.map((story) => [story.id, story]));
const exercises = [
  ['coffee-order', 'coffee', 'start', 'Здравствуйте! Что будете пить?', 'Здравствуйте! Как оплатите заказ?'],
  ['campus-subject', 'campus', 'study', 'На каком курсе ты учишься?', 'В каком корпусе у тебя занятия?'],
  ['bakery-bread', 'bakery', 'bread', 'Свежий или вчерашний хлеб?', 'Хлеб или баурсаки?'],
  ['bus-stop', 'bus', 'centre', 'На какой остановке вы сели?', 'До какой остановки едет автобус?'],
  ['bike-helmet', 'bike-rental', 'duration', 'Вам нужен велосипед?', 'У вас есть шлем?'],
  ['bike-hours', 'bike-rental', 'price', 'На полчаса или на час?', 'На два часа или на три?'],
  ['exchange-language', 'language-exchange', 'start', 'На каком языке вы уже говорите?', 'Какой язык вы изучали в школе?'],
  ['exchange-date', 'language-exchange', 'group', 'Сможете прийти завтра или послезавтра?', 'Сможете прийти утром или вечером?'],
  ['coworking-desk', 'coworking', 'desk', 'У окна или рядом со входом?', 'У стола или рядом с дверью?'],
  ['coworking-team', 'coworking', 'room', 'Во сколько начнётся встреча?', 'Сколько комнат нужно для встречи?'],
  ['volunteer-shift', 'volunteer', 'guests', 'Когда заканчивается смена?', 'Какие задачи будут на смене?'],
  ['hackathon-project', 'hackathon', 'problem', 'Кто работал над вашим проектом?', 'Чем отличается ваш проект?'],
  ['reschedule-time', 'reschedule', 'start', 'На завтра есть свободное время?', 'На сегодня всё занято?', 0],
  ['return-request', 'return-order', 'start', 'Хочу купить этот товар.', 'Хочу обменять этот товар.', 2],
  ['workshop-supplies', 'workshop', 'start', 'Когда мне нужно прийти?', 'Что можно взять у вас?', 2]
];

export const LISTENING_CLIPS = exercises.map(([id, lesson, scene, first, second, choiceIndex]) => {
  const story = lessons.get(lesson);
  const dialogue = story.scenes[scene];
  const [kk, ru] = choiceIndex === undefined ? dialogue.line : dialogue.choices[choiceIndex];
  return { id, lesson, title: story.title, level: story.level, kk, ru, distractors: [first, second] };
});

const clipIds = new Set(LISTENING_CLIPS.map(({ id }) => id));

export function readListening(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => clipIds.has(id)))] : [];
}

export function listeningRound({ level, solved, shuffle, size = 5 }) {
  const played = new Set(solved);
  const pool = LISTENING_CLIPS.filter((clip) => level === 'all' || clip.level === level);
  return [
    ...shuffle(pool.filter(({ id }) => !played.has(id))),
    ...shuffle(pool.filter(({ id }) => played.has(id)))
  ].slice(0, size).map((clip) => ({ ...clip, options: shuffle([clip.ru, ...clip.distractors]) }));
}
