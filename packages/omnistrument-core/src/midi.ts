const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Convert a frequency in Hz to the nearest MIDI note number (0–127).
 * A4 = 440 Hz = MIDI 69.
 */
export function pitchToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

/**
 * Convert a MIDI note number to its frequency in Hz.
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert a MIDI note number to a human-readable note name (e.g. 69 → "A4").
 */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + octave;
}

/**
 * Clamp a MIDI note to the valid 0–127 range.
 */
export function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, midi));
}
