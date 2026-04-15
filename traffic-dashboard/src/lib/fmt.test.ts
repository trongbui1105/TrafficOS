import { num, fmtSpeed, fmtPct } from './fmt';

describe('num', () => {
  it('returns the number for valid input', () => {
    expect(num(42)).toBe(42);
    expect(num('12.5')).toBe(12.5);
    expect(num(0)).toBe(0);
  });

  it('returns 0 for null / undefined', () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
  });

  it('returns 0 for NaN string and non-finite values', () => {
    expect(num('NaN')).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num(Infinity)).toBe(0);
    expect(num(-Infinity)).toBe(0);
  });

  it('returns 0 for non-numeric strings', () => {
    expect(num('hello')).toBe(0);
    expect(num({})).toBe(0);
  });
});

describe('fmtSpeed', () => {
  it('formats finite numbers with km/h unit', () => {
    expect(fmtSpeed(25)).toBe('25.0 km/h');
    expect(fmtSpeed(25.567)).toBe('25.6 km/h');
    expect(fmtSpeed(25.567, 2)).toBe('25.57 km/h');
    expect(fmtSpeed(0)).toBe('0.0 km/h');
  });

  it('returns em-dash for null / undefined', () => {
    expect(fmtSpeed(null)).toBe('—');
    expect(fmtSpeed(undefined)).toBe('—');
  });

  it('returns em-dash for NaN string', () => {
    expect(fmtSpeed('NaN')).toBe('—');
    expect(fmtSpeed('not a number')).toBe('—');
  });

  it('accepts string numbers', () => {
    expect(fmtSpeed('25.5')).toBe('25.5 km/h');
  });
});

describe('fmtPct', () => {
  it('formats finite numbers with percent', () => {
    expect(fmtPct(42)).toBe('42.0%');
    expect(fmtPct(42.567, 2)).toBe('42.57%');
  });

  it('returns em-dash for null / undefined', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(undefined)).toBe('—');
  });

  it('returns em-dash for NaN', () => {
    expect(fmtPct('NaN')).toBe('—');
    expect(fmtPct(NaN)).toBe('—');
  });
});
