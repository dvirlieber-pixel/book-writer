// App constants
export const STORAGE_KEY_V1 = 'sanderson-library-v1';
export const STORAGE_KEY = 'sanderson-library-v2';
export const IDB_NAME = 'seferiyat-hanetzach';
export const IDB_VERSION = 1;
export const IDB_STORE = 'kv';
export const GEMINI_FETCH_TIMEOUT_MS = 120000;
export const SAVE_DEBOUNCE_MS = 150;
export const IMPORT_MAX_BYTES = 50 * 1024 * 1024;
export const EXPORT_FORMAT_VERSION = 3;

export const GENRES = {
  fantasy: { label: 'פנטזיה אפית', blueprint: 'עולם מדומיין, מערכת כוח/קסם עם כללים, מסע גיבור' },
  scifi: { label: 'מדע בדיוני', blueprint: 'הגדרות טכנולוגיה/עתיד, השלכות חברתיות, תהיות מדעיות' },
  mystery: { label: 'מתח ובלשים', blueprint: 'זירה מוגדרת, רמזים, חשדות, חשיפה הדרגתית — לא עולם פנטזיה' },
  horror: { label: 'אימה ומסתורין', blueprint: 'מתח אטמוספרי, איום הולך וגובר, חוקי עולם מעצבים פחד' },
  romance: { label: 'רומן ודרמה', blueprint: 'קשת רגשית, דמויות ויחסים, קונפליקט פנימי וחיצוני' },
  historical: { label: 'היסטורי ואקשן', blueprint: 'תקופה ומקום, פוליטיקה, קונפליקטים מוסדיים, אקשן' }
};
export const TONES = {
  grimdark: 'אפל ובוגר — מורכבות מוסרית, השלכות, אווירה כבדה',
  classic: 'קלאסי וסוחף — הרפתקה ברורה, קצב מאוזן, מתאים לכל הגילאים',
  action: 'קצבי ומלא אקשן — משפטים קצרים, מתח גבוה, מעברים מהירים',
  humor: 'קליל והומוריסטי — שנון, אירוניה, קריצה — בלי לשבור את העלילה',
  philosophical: 'פילוסופי ועמוק — מונולוגים פנימיים, תיאור עשיר, שכבות משמעות'
};
export const AUTHORS = {
  sanderson: 'מבנה הדוק, מערכות כוח ברורות, תכנון עלילה — לא חיקוי',
  martin: 'פוליטיקה, נקודות מבט מרובות, הימור גבוה, גוון מבוגר',
  rowling: 'עולם משודר, דמויות חמות, גילוי הדרגתי — לא חיקוי',
  christie: 'רמזים הוגנים, חשדות, פתרון מסודר — מתח בלשי',
  dick: 'מציאות מעוותת, פרפרנויה, שאלות זהות — מדע בדיוני פסיכולוגי'
};
export const BOOK_REFS = {
  lotr: 'אפיק, מסע, עומק עולם — לא חיקוי דמויות או עלילה',
  harry: 'מסע צעיר, בית ספר/חינוך, קסם נגיש — לא חיקוי',
  thrones: 'פוליטיקה, בגידות, נקודות מבט — לא חיקוי',
  dune: 'פוליטיקה, אקולוגיה, מסחר בכוח — לא חיקוי',
  sherlock: 'בלש חד, רמזים, לוגיקה — לא חיקוי'
};
export const LENGTH_PRESETS = {
  short: { chapters: 15, label: 'קצר' },
  medium: { chapters: 30, label: 'בינוני' },
  long: { chapters: 50, label: 'ארוך' }
};

/** פרוזה — 3.5 Flash; Lite — 3.1 Flash-Lite לתכנון, זיכרון, סיכומים */
export const GEMINI_MODEL_PROSE = 'gemini-3.5-flash';
export const GEMINI_MODEL_LITE = 'gemini-3.1-flash-lite';
export const GEMINI_MODEL_FLASH_FALLBACK = 'gemini-2.5-flash';
export const GEMINI_PROSE_MODEL_CHAIN = [GEMINI_MODEL_PROSE, GEMINI_MODEL_FLASH_FALLBACK];
export const GEMINI_LITE_MODEL_CHAIN = [GEMINI_MODEL_LITE, GEMINI_MODEL_FLASH_FALLBACK];
export const GEMINI_MODEL_LABELS = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.5-flash': 'Gemini 3.5 Flash'
};
export const GEMINI_RATE_LIMITS_URL = 'https://aistudio.google.com/usage';

export const DEFAULT_TASTE_PROFILES = [
  { id: 'epic', name: 'אפי ארוך', genre: 'fantasy', tone: 'classic', lengthKey: 'long' },
  { id: 'classic', name: 'קלאסי', genre: 'fantasy', tone: 'classic', lengthKey: 'medium' },
  { id: 'mystery', name: 'מסתורין', genre: 'mystery', tone: 'action', lengthKey: 'medium' },
  { id: 'quick', name: 'קריאה מהירה', genre: 'romance', tone: 'humor', lengthKey: 'short' }
];

export const PENDING_AUTO_RESUME_MS = 30 * 60 * 1000;

export const LOADING_STATUS_MESSAGES = [
  'בוחר את שולחן הכתיבה...',
  'מכין את ההגדרה...',
  'מייצר דמויות...',
  'מתכנן את העלילה...',
  'מסדר את תוכן העניינים...'
];

export const MIN_CHAPTER_WORDS = 900;
export const PROSE_EXTEND_MAX_ROUNDS = 4;

