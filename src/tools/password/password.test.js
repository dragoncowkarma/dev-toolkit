import { describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_SETS,
  DEFAULT_OPTIONS,
  MAX_BATCH_SIZE,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  calculateEntropy,
  generatePassword,
  generatePasswordBatch,
  getCharacterPool,
  getPasswordStrength,
  getUnbiasedRandomIndex,
} from './password.utils.js';

function deterministicRandom(values) {
  let index = 0;
  return (target) => {
    target[0] = values[index % values.length];
    index += 1;
    return target;
  };
}

describe('password character pools', () => {
  it.each([
    ['lowercase', CHARACTER_SETS.lowercase],
    ['uppercase', CHARACTER_SETS.uppercase],
    ['numbers', CHARACTER_SETS.numbers],
    ['symbols', CHARACTER_SETS.symbols],
  ])('generates only the selected %s characters', (selection, allowedCharacters) => {
    const password = generatePassword({
      length: 32,
      options: {
        ...DEFAULT_OPTIONS,
        lowercase: false,
        uppercase: false,
        numbers: false,
        symbols: false,
        [selection]: true,
      },
      getRandomValues: deterministicRandom([0, 1, 2, 3, 4, 5]),
    });

    expect([...password].every((character) => allowedCharacters.includes(character))).toBe(true);
  });

  it('removes ambiguous characters from the selected pool', () => {
    const pool = getCharacterPool({ ...DEFAULT_OPTIONS, symbols: false, excludeAmbiguous: true });

    expect(pool).not.toMatch(/[0O1lI]/);
    expect(pool).toContain('a');
    expect(pool).toContain('Z');
  });
});

describe('secure random selection', () => {
  it('uses rejection sampling instead of modulo reduction for rejected byte values', () => {
    const randomValues = vi.fn(deterministicRandom([255, 5]));

    expect(getUnbiasedRandomIndex(10, randomValues)).toBe(5);
    expect(randomValues).toHaveBeenCalledTimes(2);
  });

  it('uses the supplied secure random source for every password character', () => {
    const randomValues = vi.fn(deterministicRandom([0]));
    generatePassword({
      length: 4,
      options: {
        ...DEFAULT_OPTIONS,
        uppercase: false,
        numbers: false,
        symbols: false,
      },
      getRandomValues: randomValues,
    });

    expect(randomValues).toHaveBeenCalledTimes(4);
  });
});

describe('password boundaries and entropy', () => {
  it('supports minimum and maximum lengths and batch sizes', () => {
    const randomValues = deterministicRandom([0]);
    expect(
      generatePassword({ length: MIN_PASSWORD_LENGTH, getRandomValues: randomValues })
    ).toHaveLength(MIN_PASSWORD_LENGTH);
    expect(
      generatePassword({ length: MAX_PASSWORD_LENGTH, getRandomValues: randomValues })
    ).toHaveLength(MAX_PASSWORD_LENGTH);
    expect(
      generatePasswordBatch({ batchSize: MAX_BATCH_SIZE, getRandomValues: randomValues })
    ).toHaveLength(MAX_BATCH_SIZE);
  });

  it('rejects invalid lengths, batch sizes, and an empty character selection', () => {
    expect(() => generatePassword({ length: MIN_PASSWORD_LENGTH - 1 })).toThrow(RangeError);
    expect(() => generatePassword({ length: MAX_PASSWORD_LENGTH + 1 })).toThrow(RangeError);
    expect(() => generatePasswordBatch({ batchSize: 0 })).toThrow(RangeError);
    expect(() =>
      generatePassword({
        options: {
          ...DEFAULT_OPTIONS,
          lowercase: false,
          uppercase: false,
          numbers: false,
          symbols: false,
        },
      })
    ).toThrow(/Select at least one/);
  });

  it('calculates entropy and assigns strength thresholds', () => {
    expect(calculateEntropy(10, 2)).toBe(10);
    expect(calculateEntropy(16, 64)).toBe(96);
    expect(getPasswordStrength(39.9)).toBe('Weak');
    expect(getPasswordStrength(40)).toBe('Fair');
    expect(getPasswordStrength(60)).toBe('Strong');
    expect(getPasswordStrength(80)).toBe('Very Strong');
  });
});
