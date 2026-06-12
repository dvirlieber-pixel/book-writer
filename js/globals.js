// Runtime mutable state (after book.js for hoisted helpers)
let idbPromise = null;
let saveTimer = null;
let welcomeDraft = defaultBookProfile();
let readingLengthKey = 'short';

let app = { apiKey: '', currentBookId: null, books: {}, readingPrefs: { fontScale: 1, theme: 'dark', immersive: false }, lastReadingSession: null };
let state = createEmptyBookState();
let pendingSequelSourceId = null;
let pendingSequelLengthKey = 'short';
let deferredInstallPrompt = null;
let waitingSwWorker = null;
let wakeLock = null;
let shelfFilter = 'all';
let shelfSort = 'recent';
const chapterGenQueue = [];
let chapterGenPumpActive = false;
let bookCreationInFlight = false;
