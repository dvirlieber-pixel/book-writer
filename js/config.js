// Constants & presets
const STORAGE_KEY_V1 = 'sanderson-library-v1';
const STORAGE_KEY = 'sanderson-library-v2';
const IDB_NAME = 'seferiyat-hanetzach';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';
const GEMINI_FETCH_TIMEOUT_MS = 120000;
const SAVE_DEBOUNCE_MS = 150;
const IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const EXPORT_FORMAT_VERSION = 3;

let idbPromise = null;
let saveTimer = null;

const GENRES = {
  fantasy: { label: 'פנטזיה אפית', blueprint: 'עולם מדומיין, מערכת כוח/קסם עם כללים, מסע גיבור' },
  scifi: { label: 'מדע בדיוני', blueprint: 'הגדרות טכנולוגיה/עתיד, השלכות חברתיות, תהיות מדעיות' },
  mystery: { label: 'מתח ובלשים', blueprint: 'זירה מוגדרת, רמזים, חשדות, חשיפה הדרגתית — לא עולם פנטזיה' },
  horror: { label: 'אימה ומסתורין', blueprint: 'מתח אטמוספרי, איום הולך וגובר, חוקי עולם מעצבים פחד' },
  romance: { label: 'רומן ודרמה', blueprint: 'קשת רגשית, דמויות ויחסים, קונפליקט פנימי וחיצוני' },
  historical: { label: 'היסטורי ואקשן', blueprint: 'תקופה ומקום, פוליטיקה, קונפליקטים מוסדיים, אקשן' }
};
const TONES = {
  grimdark: 'אפל ובוגר — מורכבות מוסרית, השלכות, אווירה כבדה',
  classic: 'קלאסי וסוחף — הרפתקה ברורה, קצב מאוזן, מתאים לכל הגילאים',
  action: 'קצבי ומלא אקשן — משפטים קצרים, מתח גבוה, מעברים מהירים',
  humor: 'קליל והומוריסטי — שנון, אירוניה, קריצה — בלי לשבור את העלילה',
  philosophical: 'פילוסופי ועמוק — מונולוגים פנימיים, תיאור עשיר, שכבות משמעות'
};
const AUTHORS = {
  sanderson: 'מבנה הדוק, מערכות כוח ברורות, תכנון עלילה — לא חיקוי',
  martin: 'פוליטיקה, נקודות מבט מרובות, הימור גבוה, גוון מבוגר',
  rowling: 'עולם משודר, דמויות חמות, גילוי הדרגתי — לא חיקוי',
  christie: 'רמזים הוגנים, חשדות, פתרון מסודר — מתח בלשי',
  dick: 'מציאות מעוותת, פרפרנויה, שאלות זהות — מדע בדיוני פסיכולוגי'
};
const BOOK_REFS = {
  lotr: 'אפיק, מסע, עומק עולם — לא חיקוי דמויות או עלילה',
  harry: 'מסע צעיר, בית ספר/חינוך, קסם נגיש — לא חיקוי',
  thrones: 'פוליטיקה, בגידות, נקודות מבט — לא חיקוי',
  dune: 'פוליטיקה, אקולוגיה, מסחר בכוח — לא חיקוי',
  sherlock: 'בלש חד, רמזים, לוגיקה — לא חיקוי'
};
const LENGTH_PRESETS = {
  short: { chapters: 15, label: 'קצר' },
  medium: { chapters: 30, label: 'בינוני' },
  long: { chapters: 50, label: 'ארוך' }
};

/** פרוזה — 3.5 Flash; Lite — 3.1 Flash-Lite לתכנון, זיכרון, סיכומים */
const GEMINI_MODEL_PROSE = 'gemini-3.5-flash';
const GEMINI_MODEL_LITE = 'gemini-3.1-flash-lite';
const GEMINI_MODEL_FLASH_FALLBACK = 'gemini-2.5-flash';
const GEMINI_PROSE_MODEL_CHAIN = [GEMINI_MODEL_PROSE, GEMINI_MODEL_FLASH_FALLBACK];
const GEMINI_LITE_MODEL_CHAIN = [GEMINI_MODEL_LITE, GEMINI_MODEL_FLASH_FALLBACK];
const GEMINI_MODEL_LABELS = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.5-flash': 'Gemini 3.5 Flash'
};
const GEMINI_RATE_LIMITS_URL = 'https://aistudio.google.com/usage';

const DEFAULT_TASTE_PROFILES = [
  { id: 'epic', name: 'אפי ארוך', genre: 'fantasy', tone: 'classic', lengthKey: 'long' },
  { id: 'classic', name: 'קלאסי', genre: 'fantasy', tone: 'classic', lengthKey: 'medium' },
  { id: 'mystery', name: 'מסתורין', genre: 'mystery', tone: 'action', lengthKey: 'medium' },
  { id: 'quick', name: 'קריאה מהירה', genre: 'romance', tone: 'humor', lengthKey: 'short' }
];
