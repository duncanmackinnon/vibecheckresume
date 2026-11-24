/** @jest-environment node */
import { inputLocalDateTime, localDateTimeToIso } from '../time';

describe('interview scheduling across timezones', () => {
  it('stores Toronto daylight time in UTC and restores the wall time', () => {
    const iso = localDateTimeToIso('2026-09-15T09:30', 'America/Toronto');
    expect(iso).toBe('2026-09-15T13:30:00.000Z');
    expect(inputLocalDateTime(iso, 'America/Toronto')).toBe('2026-09-15T09:30');
  });
  it('respects winter offsets and zones with half-hour offsets', () => {
    expect(localDateTimeToIso('2026-01-15T09:30', 'America/Toronto')).toBe('2026-01-15T14:30:00.000Z');
    expect(localDateTimeToIso('2026-09-15T09:30', 'Asia/Kolkata')).toBe('2026-09-15T04:00:00.000Z');
  });
  it('rejects nonexistent spring-forward times instead of silently shifting the interview', () => {
    expect(() => localDateTimeToIso('2026-03-08T02:30', 'America/Toronto')).toThrow('daylight-saving');
  });
  it('consistently selects the earlier occurrence of an ambiguous fall-back time', () => {
    expect(localDateTimeToIso('2026-11-01T01:30', 'America/Toronto')).toBe('2026-11-01T05:30:00.000Z');
  });
  it('rejects invalid dates and invalid timezone identifiers', () => {
    expect(() => localDateTimeToIso('2026-02-30T10:00', 'UTC')).toThrow('valid interview');
    expect(() => localDateTimeToIso('2026-09-15T09:30', 'Moon/Crater')).toThrow();
  });
  it('restores the correct date across UTC midnight', () => {
    expect(inputLocalDateTime('2026-09-15T01:00:00.000Z', 'America/Los_Angeles')).toBe('2026-09-14T18:00');
  });
});
