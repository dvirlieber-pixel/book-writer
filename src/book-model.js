export function defaultBookProfile() {
  return { genre: '', genreCustom: '', tone: '', toneCustom: '', author: '', authorCustom: '', bookRef: '', bookRefCustom: '', hook: '' };
}

export function createEmptyBookState() {
  return {
    id: null,
    bookProfile: defaultBookProfile(),
    readingLengthKey: 'short',
    apiKey: '',
    totalChapters: 15,
    book: null,
    chapters: [],
    eventLog: [],
    storySynopsis: '',
    memoryBook: null,
    writing: false,
    generatingIdx: null,
    lastReadChapter: 0,
    currentReadingChapter: 0,
    createdAt: null,
    parentBookId: null,
    seriesTitle: '',
    sequelIndex: 1,
    rating: 0,
    expandChapterList: false,
    lastReadScroll: 0
  };
}
