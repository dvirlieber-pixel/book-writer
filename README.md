# ספריית האינסוף

PWA בעברית ליצירת ספרים אישיים עם Gemini API.

## פיתוח

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # פלט ב-dist/
npm run preview  # תצוגה מקומית של הבילד
npm test         # בדיקות smoke
```

## מבנה

| נתיב | תפקיד |
|------|--------|
| `index.html` | מעטפת HTML |
| `styles.css` | עיצוב |
| `js/` | מקור לוגיקה (legacy modules) |
| `src/` | ESM — `app.js` נבנה אוטומטית מ-`js/` |
| `public/` | נכסי PWA: `sw.js`, `manifest`, אייקונים |

לאחר שינוי ב-`js/`:

```bash
npm run bundle   # או npm run build
```

קבצים ידניים ב-`src/`: `store.js`, `book-model.js`, `boot.js`, `bind-events.js`.

## פריסה

פרוס את תוכן `dist/` לשרת סטטי (או Vercel/Netlify). נדרש HTTPS ל-service worker ול-PWA.

מפתח Gemini נשמר מקומית במכשיר — לא נכלל בגיבוי JSON.
