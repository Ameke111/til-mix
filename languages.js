export const LANGUAGES = {
  kk: { name: 'Казахский', native: 'Қазақша', voice: 'kk-KZ', letters: 'әғқңөұүһі', greeting: 'Сәлем! Қалайсың?' },
  en: { name: 'Английский', native: 'English', voice: 'en-GB', letters: '', greeting: 'Hello! How are you?' },
  tr: { name: 'Турецкий', native: 'Türkçe', voice: 'tr-TR', letters: 'çğıöşü', greeting: 'Merhaba! Nasılsın?' }
};

export function storyLanguage(story) { return story.language || 'kk'; }
