import { pitchToMidi, midiToFreq, midiToNoteName, clampMidi } from '../midi';

describe('pitchToMidi', () => {
  test('A4 (440 Hz) → MIDI 69', () => {
    expect(pitchToMidi(440)).toBe(69);
  });

  test('A3 (220 Hz) → MIDI 57', () => {
    expect(pitchToMidi(220)).toBe(57);
  });

  test('C4 (261.63 Hz) → MIDI 60', () => {
    expect(pitchToMidi(261.63)).toBe(60);
  });

  test('C-1 (8.18 Hz) → MIDI 0 (boundary)', () => {
    expect(pitchToMidi(8.1758)).toBe(0);
  });

  test('G9 (12543.9 Hz) → MIDI 127 (boundary)', () => {
    expect(pitchToMidi(12543.85)).toBe(127);
  });

  test('returns an integer', () => {
    expect(Number.isInteger(pitchToMidi(440))).toBe(true);
  });
});

describe('midiToFreq', () => {
  test('MIDI 69 → 440 Hz (A4)', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 2);
  });

  test('MIDI 60 → 261.63 Hz (C4)', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.63, 2);
  });

  test('MIDI 57 → 220 Hz (A3)', () => {
    expect(midiToFreq(57)).toBeCloseTo(220, 2);
  });

  test('MIDI 0 → 8.18 Hz (C-1)', () => {
    expect(midiToFreq(0)).toBeCloseTo(8.1758, 2);
  });

  test('MIDI 127 → 12543.85 Hz (G9)', () => {
    expect(midiToFreq(127)).toBeCloseTo(12543.85, 1);
  });
});

describe('round-trip: pitchToMidi → midiToFreq', () => {
  test('C4 round-trip stays at MIDI 60', () => {
    const freq = midiToFreq(60);
    expect(pitchToMidi(freq)).toBe(60);
  });

  test('A4 round-trip stays at MIDI 69', () => {
    const freq = midiToFreq(69);
    expect(pitchToMidi(freq)).toBe(69);
  });

  test('C6 (MIDI 84) round-trip is stable', () => {
    const freq = midiToFreq(84);
    expect(pitchToMidi(freq)).toBe(84);
  });
});

describe('midiToNoteName', () => {
  test('MIDI 69 → "A4"', () => {
    expect(midiToNoteName(69)).toBe('A4');
  });

  test('MIDI 60 → "C4"', () => {
    expect(midiToNoteName(60)).toBe('C4');
  });

  test('MIDI 61 → "C#4"', () => {
    expect(midiToNoteName(61)).toBe('C#4');
  });

  test('MIDI 0 → "C-1"', () => {
    expect(midiToNoteName(0)).toBe('C-1');
  });

  test('MIDI 127 → "G9"', () => {
    expect(midiToNoteName(127)).toBe('G9');
  });
});

describe('clampMidi', () => {
  test('clamps below 0 to 0', () => {
    expect(clampMidi(-5)).toBe(0);
  });

  test('clamps above 127 to 127', () => {
    expect(clampMidi(200)).toBe(127);
  });

  test('passes through valid values unchanged', () => {
    expect(clampMidi(64)).toBe(64);
  });
});
