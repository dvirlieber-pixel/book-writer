import * as bookModel from './book-model.js';

export const store = {
  idbPromise: null,
  saveTimer: null,
  welcomeDraft: bookModel.defaultBookProfile(),
  readingLengthKey: 'short',
  app: {
    apiKey: '',
    currentBookId: null,
    books: {},
    readingPrefs: { fontScale: 1, theme: 'dark', immersive: false },
    lastReadingSession: null
  },
  state: bookModel.createEmptyBookState(),
  pendingSequelSourceId: null,
  pendingSequelLengthKey: 'short',
  deferredInstallPrompt: null,
  waitingSwWorker: null,
  wakeLock: null,
  shelfFilter: 'all',
  shelfSort: 'recent',
  chapterGenQueue: [],
  chapterGenPumpActive: false,
  bookCreationInFlight: false,
  creationResumeRunning: false
};
