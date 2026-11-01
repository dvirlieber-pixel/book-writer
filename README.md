# ספריית האינסוף

PWA בעברית ליצירת ספרים אישיים עם Gemini API.

## פיתוח

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # פלט ב-dist/
npm run preview  # תצוגה מקומית של הבילד
npm test         # בדיקות (vitest)
```

## מבנה

| נתיב | תפקיד |
|------|--------|
| `index.html` | מעטפת HTML; כפתורים מסומנים ב-`data-action="<שם פונקציה>"` |
| `styles.css` | עיצוב |
| `src/` | קוד המקור — מודולי ES רגילים, בלי שלב בנייה נוסף |
| `public/` | נכסי PWA: `sw.js`, `manifest`, אייקונים, `dl-splash.js` / `dl-watermark.js` |
| `tests/` | בדיקות vitest |

### `src/`

| קובץ | תפקיד |
|------|--------|
| `main.js` | נקודת כניסה: `bindEvents` + `boot` |
| `boot.js` | טעינה, אירועי חלון, רישום service worker |
| `bind-events.js` | מפנה `data-action` לפונקציה המיוצאת מ-`app.js` |
| `app.js` | מייצא מחדש את כל המודולים (ה-API הציבורי של הכפתורים) |
| `store.js` | מצב משותף: `store.app` (כל הספרייה) ו-`store.state` (הספר הפתוח) |
| `constants.js` | קבועים, ז'אנרים, מודלים, מגבלות קצב |
| `book-model.js` | מבנה ספר ריק ופרופיל ברירת מחדל |
| `api.js` | קריאות Gemini, תור ומגבלת קצב, ולידציית טקסט |
| `book-create.js` / `creation-resume.js` | יצירת ספר והמשך, המשך יצירה שנקטעה, מפתח API |
| `blueprint.js` | תוכנית הספר: תנ"ך סיפור (מערכות, קשתות דמויות, חוטים, סיום, דף סגנון) ותקצירי פרקים במנות, וההקשר שהם נותנים לכתיבה |
| `chapters.js` | צינור כתיבת פרק: תכנון, סצנות, ביקורת, זיכרון |
| `book.js` | פרופיל ספר, ניקוי נתונים, snapshot, ייצוא HTML/EPUB |
| `storage.js` | IndexedDB / localStorage ומיגרציות |
| `shelf.js` / `library.js` / `reading.js` / `screens.js` | מסכי המדף, הספר, הקריאה (כולל פרק שנכתב בשידור חי) והאשף |
| `world-dictionary.js` | מילון העולם |
| `prefs-export.js` | העדפות קריאה, PWA, גיבוי JSON |
| `quota.js` | הערכת המכסה היומית של Gemini (לפי יום Pacific) והתצוגה שלה |
| `utils.js` | עזרים משותפים (`escapeHtml`, `showError`, ...) |

מצב משותף תמיד דרך `store.app` / `store.state` — לא משתנים גלובליים. כפתור חדש: הוסף `data-action` ב-HTML וייצא פונקציה באותו שם מאחד המודולים.

## פריסה

פרוס את תוכן `dist/` לשרת סטטי (או Vercel/Netlify). נדרש HTTPS ל-service worker ול-PWA.

מפתח Gemini נשמר מקומית במכשיר — לא נכלל בגיבוי JSON.
