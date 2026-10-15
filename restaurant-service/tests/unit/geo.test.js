const { distanceKm, isLatitude, isLongitude } = require('../../src/utils/geo');

const SIAM = { lat: 13.7456, lng: 100.5341 };
const SILOM = { lat: 13.7286, lng: 100.534 };
const CHIANG_MAI = { lat: 18.7883, lng: 98.9853 };

describe('distanceKm', () => {
  test('same point → 0', () => {
    expect(distanceKm(SIAM, SIAM)).toBe(0);
  });

  test('Siam → Silom is about 1.9 km', () => {
    expect(distanceKm(SIAM, SILOM)).toBeCloseTo(1.89, 1);
  });

  test('Bangkok → Chiang Mai is about 580 km', () => {
    const d = distanceKm(SIAM, CHIANG_MAI);
    expect(d).toBeGreaterThan(570);
    expect(d).toBeLessThan(590);
  });

  test('is symmetric', () => {
    expect(distanceKm(SIAM, CHIANG_MAI)).toBeCloseTo(distanceKm(CHIANG_MAI, SIAM), 9);
  });
});

describe('coordinate ranges', () => {
  test.each([[-90, true], [90, true], [13.7, true], [90.1, false], [NaN, false]])(
    'isLatitude(%p) → %p',
    (n, ok) => expect(isLatitude(n)).toBe(ok),
  );

  test.each([[-180, true], [180, true], [100.5, true], [-180.1, false], [Infinity, false]])(
    'isLongitude(%p) → %p',
    (n, ok) => expect(isLongitude(n)).toBe(ok),
  );
});
