// Each phrase contains a Russian translation followed by English and Turkish.
const lessons = [
  {
    id: 'cafe', title: 'Закажи в кафе', category: 'daily', speaker: 'Бариста', word: ['Coffee', 'Kahve'],
    description: 'Выбери напиток, размер и добавки.',
    opening: ['Что будете пить?', 'What would you like to drink?', 'Ne içmek istersiniz?'],
    branches: [
      [['Кофе, пожалуйста.', 'A coffee, please.', 'Bir kahve, lütfen.'], ['Большой или маленький?', 'Large or small?', 'Büyük mü, küçük mü?'],
        [['Большой, пожалуйста.', 'Large, please.', 'Büyük olsun, lütfen.'], ['Маленький, пожалуйста.', 'Small, please.', 'Küçük olsun, lütfen.']]],
      [['Чай, пожалуйста.', 'A tea, please.', 'Bir çay, lütfen.'], ['Хотите сахар?', 'Would you like sugar?', 'Şeker ister misiniz?'],
        [['Да, пожалуйста.', 'Yes, please.', 'Evet, lütfen.'], ['Без сахара, спасибо.', 'No sugar, thank you.', 'Şekersiz olsun, teşekkür ederim.']]]
    ]
  },
  {
    id: 'hello', title: 'Познакомься', category: 'campus', speaker: 'Новый знакомый', word: ['Hello', 'Merhaba'],
    description: 'Представься и расскажи, откуда ты приехал.',
    opening: ['Привет! Как тебя зовут?', 'Hi! What is your name?', 'Merhaba! Adın ne?'],
    branches: [
      [['Меня зовут Алия.', 'My name is Aliya.', 'Benim adım Aliya.'], ['Откуда ты?', 'Where are you from?', 'Nerelisin?'],
        [['Я из Казахстана.', 'I am from Kazakhstan.', 'Kazakistanlıyım.'], ['Я из Алматы.', 'I am from Almaty.', 'Almatılıyım.']]],
      [['Я Данияр. Приятно познакомиться.', 'I am Daniyar. Nice to meet you.', 'Ben Daniyar. Tanıştığımıza memnun oldum.'], ['Ты здесь учишься?', 'Do you study here?', 'Burada mı okuyorsun?'],
        [['Да, я студент.', 'Yes, I am a student.', 'Evet, öğrenciyim.'], ['Нет, я здесь работаю.', 'No, I work here.', 'Hayır, burada çalışıyorum.']]]
    ]
  },
  {
    id: 'shop', title: 'Купи продукты', category: 'daily', speaker: 'Продавец', word: ['Market', 'Market'],
    description: 'Попроси нужное количество и уточни оплату.',
    opening: ['Что вы ищете?', 'What are you looking for?', 'Ne arıyorsunuz?'],
    branches: [
      [['Мне нужны яблоки.', 'I need some apples.', 'Elma almak istiyorum.'], ['Сколько килограммов?', 'How many kilos?', 'Kaç kilo?'],
        [['Один килограмм, пожалуйста.', 'One kilo, please.', 'Bir kilo, lütfen.'], ['Полкилограмма, пожалуйста.', 'Half a kilo, please.', 'Yarım kilo, lütfen.']]],
      [['У вас есть хлеб?', 'Do you have any bread?', 'Ekmeğiniz var mı?'], ['Да. Как вы будете платить?', 'Yes. How would you like to pay?', 'Evet. Nasıl ödemek istersiniz?'],
        [['Я заплачу картой.', 'I will pay by card.', 'Kartla ödeyeceğim.'], ['Я заплачу наличными.', 'I will pay in cash.', 'Nakit ödeyeceğim.']]]
    ]
  },
  {
    id: 'directions', title: 'Спроси дорогу', category: 'city', speaker: 'Прохожий', word: ['Where?', 'Nerede?'],
    description: 'Найди станцию или парк и уточни направление.',
    opening: ['Вам помочь?', 'Can I help you?', 'Size yardımcı olabilir miyim?'],
    branches: [
      [['Где станция?', 'Where is the station?', 'İstasyon nerede?'], ['Идите прямо, затем налево.', 'Go straight, then turn left.', 'Düz gidin, sonra sola dönün.'],
        [['Это далеко?', 'Is it far?', 'Uzak mı?'], ['Можно дойти пешком?', 'Can I walk there?', 'Yürüyerek gidebilir miyim?']]],
      [['Как пройти в парк?', 'How do I get to the park?', 'Parka nasıl gidebilirim?'], ['Парк рядом с музеем.', 'The park is next to the museum.', 'Park müzenin yanında.'],
        [['А где музей?', 'Where is the museum?', 'Müze nerede?'], ['Спасибо за помощь.', 'Thank you for your help.', 'Yardımınız için teşekkür ederim.']]]
    ]
  },
  {
    id: 'bus', title: 'Поезжай на автобусе', category: 'city', speaker: 'Водитель', word: ['Bus', 'Otobüs'],
    description: 'Уточни маршрут, остановку и оплату проезда.',
    opening: ['Куда вы едете?', 'Where are you going?', 'Nereye gidiyorsunuz?'],
    branches: [
      [['В центр города.', 'To the city centre.', 'Şehir merkezine.'], ['Выходите на следующей остановке.', 'Get off at the next stop.', 'Bir sonraki durakta inin.'],
        [['Скажите мне, пожалуйста, когда выходить.', 'Please tell me when to get off.', 'Lütfen nerede ineceğimi söyleyin.'], ['Большое спасибо.', 'Thank you very much.', 'Çok teşekkür ederim.']]],
      [['В университет.', 'To the university.', 'Üniversiteye.'], ['Билет можно купить здесь.', 'You can buy a ticket here.', 'Buradan bilet alabilirsiniz.'],
        [['Сколько стоит билет?', 'How much is a ticket?', 'Bilet ne kadar?'], ['Можно оплатить картой?', 'Can I pay by card?', 'Kartla ödeyebilir miyim?']]]
    ]
  },
  {
    id: 'meeting', title: 'Договорись о встрече', category: 'leisure', speaker: 'Друг', word: ['Meet up', 'Buluşalım'],
    description: 'Выбери время встречи и предложи место.',
    opening: ['Встретимся завтра?', 'Shall we meet tomorrow?', 'Yarın buluşalım mı?'],
    branches: [
      [['Да, я свободен после обеда.', 'Yes, I am free in the afternoon.', 'Evet, öğleden sonra müsaitim.'], ['Где встретимся?', 'Where shall we meet?', 'Nerede buluşalım?'],
        [['Перед библиотекой.', 'In front of the library.', 'Kütüphanenin önünde.'], ['В кафе рядом с парком.', 'At the café near the park.', 'Parkın yakınındaki kafede.']]],
      [['Завтра не могу. Как насчёт субботы?', 'I cannot make it tomorrow. How about Saturday?', 'Yarın gelemem. Cumartesi olur mu?'], ['В какое время тебе удобно?', 'What time works for you?', 'Saat kaç senin için uygun?'],
        [['В десять утра.', 'At ten in the morning.', 'Sabah saat onda.'], ['В шесть вечера.', 'At six in the evening.', 'Akşam saat altıda.']]]
    ]
  },
  {
    id: 'hotel', title: 'Заселись в гостиницу', category: 'travel', speaker: 'Администратор', word: ['Check in', 'Giriş'],
    description: 'Подтверди бронь и спроси об услугах.',
    opening: ['У вас есть бронь?', 'Do you have a reservation?', 'Rezervasyonunuz var mı?'],
    branches: [
      [['Да, на имя Алия.', 'Yes, under the name Aliya.', 'Evet, Aliya adına.'], ['Ваш номер готов.', 'Your room is ready.', 'Odanız hazır.'],
        [['Во сколько завтрак?', 'What time is breakfast?', 'Kahvaltı saat kaçta?'], ['Какой пароль от Wi-Fi?', 'What is the Wi-Fi password?', 'Wi-Fi şifresi nedir?']]],
      [['Нет. У вас есть свободный номер?', 'No. Do you have a room available?', 'Hayır. Boş odanız var mı?'], ['На сколько ночей?', 'For how many nights?', 'Kaç gecelik?'],
        [['На одну ночь.', 'For one night.', 'Bir gecelik.'], ['На три ночи.', 'For three nights.', 'Üç gecelik.']]]
    ]
  },
  {
    id: 'train', title: 'Купи билет на поезд', category: 'travel', speaker: 'Кассир', word: ['Ticket', 'Bilet'],
    description: 'Назови дату поездки и выбери билет.',
    opening: ['На какой день нужен билет?', 'What day would you like a ticket for?', 'Hangi gün için bilet istiyorsunuz?'],
    branches: [
      [['На сегодня, пожалуйста.', 'For today, please.', 'Bugün için, lütfen.'], ['Утром или вечером?', 'In the morning or in the evening?', 'Sabah mı, akşam mı?'],
        [['Утром.', 'In the morning.', 'Sabah.'], ['Вечером.', 'In the evening.', 'Akşam.']]],
      [['На завтра.', 'For tomorrow.', 'Yarın için.'], ['В одну сторону или туда и обратно?', 'Single or return?', 'Tek yön mü, gidiş dönüş mü?'],
        [['В одну сторону, пожалуйста.', 'Single, please.', 'Tek yön, lütfen.'], ['Туда и обратно, пожалуйста.', 'Return, please.', 'Gidiş dönüş, lütfen.']]]
    ]
  },
  {
    id: 'restaurant', title: 'Поужинай в ресторане', category: 'daily', speaker: 'Официант', word: ['Dinner', 'Akşam yemeği'],
    description: 'Закажи блюдо и сообщи о предпочтениях.',
    opening: ['Вы готовы заказать?', 'Are you ready to order?', 'Sipariş vermeye hazır mısınız?'],
    branches: [
      [['Суп, пожалуйста.', 'The soup, please.', 'Çorba, lütfen.'], ['Принести хлеб?', 'Would you like some bread?', 'Ekmek ister misiniz?'],
        [['Да, немного, пожалуйста.', 'Yes, a little, please.', 'Evet, biraz lütfen.'], ['Нет, спасибо.', 'No, thank you.', 'Hayır, teşekkür ederim.']]],
      [['У вас есть вегетарианские блюда?', 'Do you have any vegetarian dishes?', 'Vejetaryen yemekleriniz var mı?'], ['Есть салат и овощи.', 'We have salad and vegetables.', 'Salata ve sebze yemeklerimiz var.'],
        [['Салат без сыра, пожалуйста.', 'A salad without cheese, please.', 'Peynirsiz salata, lütfen.'], ['Я возьму овощи.', 'I will have the vegetables.', 'Sebze yemeği alayım.']]]
    ]
  },
  {
    id: 'study', title: 'Обсуди учёбу', category: 'campus', speaker: 'Одногруппник', word: ['Study', 'Ders'],
    description: 'Расскажи о специальности и договорись о подготовке.',
    opening: ['Что ты изучаешь?', 'What do you study?', 'Ne okuyorsun?'],
    branches: [
      [['Я изучаю информатику.', 'I study computer science.', 'Bilgisayar bilimi okuyorum.'], ['Хочешь заниматься вместе?', 'Would you like to study together?', 'Birlikte ders çalışmak ister misin?'],
        [['Да, после занятий.', 'Yes, after class.', 'Evet, dersten sonra.'], ['Давай встретимся в библиотеке.', 'Let us meet at the library.', 'Kütüphanede buluşalım.']]],
      [['Я изучаю языки.', 'I study languages.', 'Dil okuyorum.'], ['Как ты практикуешься?', 'How do you practise?', 'Nasıl pratik yapıyorsun?'],
        [['Я каждый день слушаю подкасты.', 'I listen to podcasts every day.', 'Her gün podcast dinliyorum.'], ['Я разговариваю с друзьями.', 'I talk to my friends.', 'Arkadaşlarımla konuşuyorum.']]]
    ]
  },
  {
    id: 'work', title: 'Расскажи о своей работе', category: 'work', speaker: 'Новый коллега', word: ['Work', 'İş'],
    description: 'Обсуди задачи, график и совместную работу.',
    opening: ['Над чем ты работаешь?', 'What are you working on?', 'Ne üzerinde çalışıyorsun?'],
    branches: [
      [['Я делаю сайт.', 'I am building a website.', 'Bir web sitesi yapıyorum.'], ['Тебе нужна помощь?', 'Do you need any help?', 'Yardıma ihtiyacın var mı?'],
        [['Да, можешь проверить эту страницу?', 'Yes, could you check this page?', 'Evet, bu sayfayı kontrol edebilir misin?'], ['Спасибо, я пока справляюсь.', 'Thanks, I am managing for now.', 'Teşekkürler, şimdilik hallediyorum.']]],
      [['Я готовлю презентацию.', 'I am preparing a presentation.', 'Bir sunum hazırlıyorum.'], ['Когда встреча?', 'When is the meeting?', 'Toplantı ne zaman?'],
        [['Завтра в девять.', 'Tomorrow at nine.', 'Yarın saat dokuzda.'], ['В пятницу после обеда.', 'On Friday afternoon.', 'Cuma öğleden sonra.']]]
    ]
  },
  {
    id: 'plans', title: 'Спланируй выходные', category: 'leisure', speaker: 'Друг', word: ['Weekend', 'Hafta sonu'],
    description: 'Предложи занятие и согласуй детали.',
    opening: ['Что будем делать в выходные?', 'What shall we do this weekend?', 'Bu hafta sonu ne yapalım?'],
    branches: [
      [['Давай пойдём в кино.', 'Let us go to the cinema.', 'Sinemaya gidelim.'], ['Какой фильм хочешь посмотреть?', 'What film would you like to see?', 'Hangi filmi izlemek istersin?'],
        [['Давай посмотрим комедию.', 'Let us watch a comedy.', 'Bir komedi izleyelim.'], ['Мне нравятся приключенческие фильмы.', 'I like adventure films.', 'Macera filmlerini severim.']]],
      [['Давай прогуляемся в парке.', 'Let us go for a walk in the park.', 'Parkta yürüyüş yapalım.'], ['Возьмём что-нибудь с собой?', 'Shall we bring anything?', 'Yanımıza bir şey alalım mı?'],
        [['Я возьму воду.', 'I will bring some water.', 'Su getireceğim.'], ['Давай возьмём еду для пикника.', 'Let us bring some food for a picnic.', 'Piknik için yiyecek getirelim.']]]
    ]
  }
];

const closings = {
  cafe: [
    ['Вот ваш большой кофе.', 'Here is your large coffee.', 'Büyük kahveniz hazır.'],
    ['Вот ваш маленький кофе.', 'Here is your small coffee.', 'Küçük kahveniz hazır.'],
    ['Вот ваш чай и сахар.', 'Here is your tea and sugar.', 'Çayınız ve şekeriniz hazır.'],
    ['Вот ваш чай без сахара.', 'Here is your tea without sugar.', 'Şekersiz çayınız hazır.']
  ],
  hello: [
    ['Рад познакомиться!', 'Nice to meet you!', 'Tanıştığımıza memnun oldum!'],
    ['Я тоже из Алматы!', 'I am from Almaty too!', 'Ben de Almatılıyım!'],
    ['Я тоже здесь учусь.', 'I study here too.', 'Ben de burada okuyorum.'],
    ['Удачи на работе!', 'Good luck at work!', 'İşinde başarılar!']
  ],
  directions: [
    ['Нет, всего пять минут пешком.', 'No, it is only a five-minute walk.', 'Hayır, yürüyerek sadece beş dakika.'],
    ['Да, пешком примерно пять минут.', 'Yes, it is about five minutes on foot.', 'Evet, yürüyerek yaklaşık beş dakika.'],
    ['Музей напротив библиотеки.', 'The museum is opposite the library.', 'Müze kütüphanenin karşısında.'],
    ['Пожалуйста! Хорошего дня.', 'You are welcome! Have a good day.', 'Rica ederim! İyi günler.']
  ],
  bus: [
    ['Конечно, я вам скажу.', 'Of course, I will let you know.', 'Tabii, size haber veririm.'],
    ['Пожалуйста! Хорошей поездки.', 'You are welcome! Enjoy your trip.', 'Rica ederim! İyi yolculuklar.'],
    ['Стоимость указана на табло.', 'The fare is shown on the board.', 'Ücret tabelada yazıyor.'],
    ['Да, приложите карту сюда.', 'Yes, tap your card here.', 'Evet, kartınızı buraya okutun.']
  ],
  hotel: [
    ['Завтрак с семи до десяти.', 'Breakfast is from seven to ten.', 'Kahvaltı yediden ona kadar.'],
    ['Пароль написан на этой карточке.', 'The password is on this card.', 'Şifre bu kartta yazıyor.'],
    ['Хорошо. Можно ваш паспорт?', 'All right. May I see your passport?', 'Tamam. Pasaportunuzu görebilir miyim?'],
    ['Хорошо. Можно ваш паспорт?', 'All right. May I see your passport?', 'Tamam. Pasaportunuzu görebilir miyim?']
  ]
};
const defaultClosing = {
  shop: ['Пожалуйста. Хорошего дня!', 'Here you are. Have a good day!', 'Buyurun. İyi günler!'],
  meeting: ['Договорились. До встречи!', 'Agreed. See you then!', 'Anlaştık. Görüşürüz!'],
  train: ['Вот ваш билет. Хорошей поездки!', 'Here is your ticket. Have a good trip!', 'Biletiniz burada. İyi yolculuklar!'],
  restaurant: ['Хорошо, сейчас принесу.', 'Of course, I will bring it right away.', 'Tabii, hemen getiriyorum.'],
  study: ['Отличная идея!', 'That is a great idea!', 'Harika bir fikir!'],
  work: ['Хорошо, я на связи.', 'All right, I am here if you need me.', 'Tamam, ihtiyacın olursa buradayım.'],
  plans: ['Отлично, договорились!', 'Great, it is a plan!', 'Harika, anlaştık!']
};

export const INTERNATIONAL_STORIES = ['en', 'tr'].flatMap((language, index) => lessons.map((lesson, order) => {
  const pair = (line) => [line[index + 1], line[0]];
  const scenes = { start: { context: lesson.description, line: pair(lesson.opening), choices: [] } };
  lesson.branches.forEach(([entry, question, replies], branch) => {
    const key = 'branch' + branch;
    scenes.start.choices.push([...pair(entry), key, 'Подходящая реплика. Продолжим диалог.']);
    scenes[key] = { context: 'Ответь собеседнику и заверши разговор.', line: pair(question), choices: [] };
    replies.forEach((reply, ending) => {
      const end = key + '-end' + ending;
      scenes[key].choices.push([...pair(reply), end, 'Ты ответил на вопрос собеседника.']);
      scenes[end] = { line: pair(closings[lesson.id]?.[branch * 2 + ending] ?? defaultClosing[lesson.id]), end: reply[0] };
    });
  });
  return { id: language + '-' + lesson.id, language, title: lesson.title, category: lesson.category,
    speaker: lesson.speaker, word: lesson.word[index], description: lesson.description,
    level: order < 6 ? 'A1' : 'A2', minutes: 3, tone: ['peach', 'lime', 'blue', 'lilac'][order % 4], scenes };
}));

export const INTERNATIONAL_ROUTE = ['en', 'tr'].flatMap((language) => [
  ['basics', 'Первые разговоры', ['cafe', 'hello', 'shop']],
  ['city', 'В городе', ['directions', 'bus', 'meeting']],
  ['travel', 'В поездке', ['hotel', 'train', 'restaurant']],
  ['life', 'Учёба, работа и планы', ['study', 'work', 'plans']]
].map(([id, title, ids], index) => ({ id: language + '-' + id, language, title,
  level: index < 2 ? 'A1' : 'A2', ids: ids.map((id) => language + '-' + id) })));
