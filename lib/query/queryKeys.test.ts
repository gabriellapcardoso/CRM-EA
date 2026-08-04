import { describe, it, expect } from 'vitest';
import type { Query } from '@tanstack/react-query';
import { entityCachesExceptDetail } from './queryKeys';

function fakeQuery(queryKey: unknown): Query {
  return { queryKey } as Query;
}

describe('entityCachesExceptDetail', () => {
  const predicate = entityCachesExceptDetail('contacts');

  it('matches the base lists() key', () => {
    expect(predicate(fakeQuery(['contacts', 'list']))).toBe(true);
  });

  it('matches filtered list(filters) keys', () => {
    expect(predicate(fakeQuery(['contacts', 'list', { search: 'x' }]))).toBe(true);
  });

  it('matches custom sub-caches beyond lists/detail', () => {
    expect(predicate(fakeQuery(['contacts', 'paginated', { page: 1 }, undefined]))).toBe(true);
    expect(predicate(fakeQuery(['contacts', 'stageCounts']))).toBe(true);
  });

  it('excludes detail(id) keys', () => {
    expect(predicate(fakeQuery(['contacts', 'detail', 'contact-1']))).toBe(false);
  });

  it('excludes queries for a different entity', () => {
    expect(predicate(fakeQuery(['deals', 'list']))).toBe(false);
    expect(predicate(fakeQuery(['deals', 'detail', 'deal-1']))).toBe(false);
  });

  it('excludes non-array query keys', () => {
    expect(predicate(fakeQuery('contacts'))).toBe(false);
    expect(predicate(fakeQuery(undefined))).toBe(false);
  });

  it('does not accidentally match a prefix-substring entity name', () => {
    // 'contactsExtra' !== 'contacts' — the predicate must compare the whole
    // segment, not do substring matching.
    expect(predicate(fakeQuery(['contactsExtra', 'list']))).toBe(false);
  });
});
