import { describe, it, expect } from 'vitest';
import { defaultBookProfile, createEmptyBookState } from '../src/book-model.js';

describe('book-model', () => {
  it('defaultBookProfile returns empty taste fields', () => {
    const p = defaultBookProfile();
    expect(p.genre).toBe('');
    expect(p.hook).toBe('');
  });

  it('createEmptyBookState has sane defaults', () => {
    const s = createEmptyBookState();
    expect(s.chapters).toEqual([]);
    expect(s.totalChapters).toBe(15);
    expect(s.bookProfile).toEqual(defaultBookProfile());
    expect(s.writing).toBe(false);
  });
});
