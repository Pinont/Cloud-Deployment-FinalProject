const { isOpenAt, currentTime } = require('../../src/utils/hours');

describe('isOpenAt', () => {
  test.each([
    // same-day hours 10:00–22:00
    ['10:00', '22:00', '09:59', false],
    ['10:00', '22:00', '10:00', true],
    ['10:00', '22:00', '15:30', true],
    ['10:00', '22:00', '21:59', true],
    ['10:00', '22:00', '22:00', false],
    // closes after midnight 18:00–02:00
    ['18:00', '02:00', '17:59', false],
    ['18:00', '02:00', '18:00', true],
    ['18:00', '02:00', '23:59', true],
    ['18:00', '02:00', '00:00', true],
    ['18:00', '02:00', '01:59', true],
    ['18:00', '02:00', '02:00', false],
    ['18:00', '02:00', '12:00', false],
    // equal times → open 24 hours
    ['00:00', '00:00', '03:00', true],
  ])('open %s, close %s, at %s → %s', (open, close, time, expected) => {
    expect(isOpenAt(open, close, time)).toBe(expected);
  });

  test('no opening hours → not open', () => {
    expect(isOpenAt(undefined, undefined, '12:00')).toBe(false);
    expect(isOpenAt('10:00', undefined, '12:00')).toBe(false);
  });
});

describe('currentTime', () => {
  test('converts to the given time zone as HH:mm (24-hour)', () => {
    const date = new Date('2026-10-15T17:05:00Z');
    expect(currentTime(date, 'Asia/Bangkok')).toBe('00:05'); // UTC+7, next day
    expect(currentTime(date, 'UTC')).toBe('17:05');
  });

  test('defaults to Asia/Bangkok', () => {
    expect(currentTime(new Date('2026-10-15T03:00:00Z'))).toBe('10:00');
  });
});
