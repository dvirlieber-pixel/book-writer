// App constants
export const STORAGE_KEY_V1 = 'sanderson-library-v1';
export const STORAGE_KEY = 'sanderson-library-v2';
export const IDB_NAME = 'seferiyat-hanetzach';
export const IDB_VERSION = 1;
export const IDB_STORE = 'kv';
/** IndexedDB layout v3: app settings in one record, each book in its own record */
export const IDB_META_KEY = 'app-v3';
export const IDB_BOOK_PREFIX = 'book:';
export const GEMINI_FETCH_TIMEOUT_MS = 120000;
/** A long chapter takes longer to generate: the timeout grows with the output budget */
export const GEMINI_TIMEOUT_MS_PER_TOKEN = 12;
/** Free-tier prose-model requests per day — an estimate; the API reports no usage until it refuses */
export const GEMINI_PROSE_DAILY_LIMIT = 20;
/** Typical prose requests per chapter (the write plus a continuation or a fix) */
export const PROSE_CALLS_PER_CHAPTER = 2;
export const BACKUP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** מרווח מינימלי בין בקשות — שומר מתחת למכסת RPM החינמית */
export const GEMINI_MIN_REQUEST_GAP_MS = 2800;
/** מקסימום בקשות בדקה (חלון גלישה) */
export const GEMINI_MAX_REQUESTS_PER_MINUTE = 12;
/** השהיה אחרי 429 מקומי (RPM) לפני ניסיון חוזר */
export const GEMINI_RATE_LIMIT_PAUSE_MS = 45000;
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
/** Thinking tokens allowed per prose call (they count toward maxOutputTokens) */
export const PROSE_THINKING_BUDGET = 1024;
/** Output budget for a whole chapter in one call (~2,000 Hebrew words is ~6k tokens) */
export const CHAPTER_MAX_TOKENS = 16384;
/** Full-chapter rewrites after a failed review; each costs a prose-model request (free tier: ~20/day) */
export const MAX_CHAPTER_FIXES = 1;
export const PROSE_EXTEND_MAX_ROUNDS = 4;

