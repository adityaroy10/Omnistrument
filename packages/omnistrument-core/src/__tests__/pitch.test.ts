import { detectPitch } from '../pitch';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a pure sine wave as a Float32Array at a given frequency and sample rate */
function generateSine(frequencyHz: number, sampleRate: number, numSamples = 4096): Float32Array {
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    buffer[i] = Math.sin(2 * Math.PI * frequencyHz * (i / sampleRate));
  }
  return buffer;
}

/** Generate white noise */
function generateNoise(numSamples = 4096, amplitude = 0.5): Float32Array {
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    buffer[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return buffer;
}

/** Generate silence */
function generateSilence(numSamples = 4096): Float32Array {
  return new Float32Array(numSamples);
}

const SR = 44100; // Standard sample rate

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('detectPitch (YIN algorithm)', () => {
  // ── Detects standard musical pitches ───────────────────────────────────────

  test('detects A4 (440 Hz) within ±5 Hz', () => {
    const result = detectPitch(generateSine(440, SR), SR);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(440, -1); // within ±5 Hz
  });

  test('detects A3 (220 Hz) within ±5 Hz', () => {
    const result = detectPitch(generateSine(220, SR), SR);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(220, -1);
  });

  test('detects A2 (110 Hz) within ±5 Hz', () => {
    const result = detectPitch(generateSine(110, SR), SR);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(110, -1);
  });

  test('detects C4 (261.63 Hz) within ±5 Hz', () => {
    const result = detectPitch(generateSine(261.63, SR), SR);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(261.63, -1);
  });

  test('detects E2 (82.41 Hz) — guitar low E — within ±5 Hz', () => {
    const result = detectPitch(generateSine(82.41, SR), SR);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(82.41, -1);
  });

  // ── Rejects unpitched / out-of-range signals ────────────────────────────────

  test('returns null for complete silence (RMS gate)', () => {
    const result = detectPitch(generateSilence(), SR);
    expect(result).toBeNull();
  });

  test('returns null for white noise (no stable periodicity)', () => {
    // Run 10 times — noise should almost always return null
    let nullCount = 0;
    for (let i = 0; i < 10; i++) {
      if (detectPitch(generateNoise(4096, 0.3), SR) === null) nullCount++;
    }
    expect(nullCount).toBeGreaterThanOrEqual(7);
  });

  test('returns null for 10 Hz (below 20 Hz floor)', () => {
    const result = detectPitch(generateSine(10, SR), SR);
    expect(result).toBeNull();
  });

  test('returns null for 5000 Hz (above 3000 Hz ceiling)', () => {
    const result = detectPitch(generateSine(5000, SR), SR);
    expect(result).toBeNull();
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  test('does not throw on a 64-sample buffer (smaller than window)', () => {
    expect(() => detectPitch(generateSine(440, SR, 64), SR)).not.toThrow();
  });

  test('does not throw on an empty buffer', () => {
    expect(() => detectPitch(new Float32Array(0), SR)).not.toThrow();
  });

  test('returns a number or null (never NaN or Infinity)', () => {
    const result = detectPitch(generateSine(440, SR), SR);
    if (result !== null) {
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    }
  });
});
