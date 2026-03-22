# Omnistrument Test Documentation

This document outlines the comprehensive test suite for the Omnistrument Core SDK. Our goal is 100% reliability for real-time pitch detection and instrument generation.

## Test Summary
- **Framework**: Jest
- **Total Test Cases**: 46
- **Status**: 100% Passing 🟢

---

## 🎹 1. Pitch Detection (YIN Algorithm)
*File: `src/__tests__/pitch.test.ts`*

We test the core YIN algorithm against a wide range of synthetic and real-world scenarios:
- **Frequency Accuracy**: Validates correct detection (±5 Hz) for standard musical pitches: A4 (440Hz), A3 (220Hz), A2 (110Hz), C4 (261.63Hz), and E2 (82.41Hz).
- **Silence Rejection**: Ensures the RMS gate correctly returns `null` for silent buffers to prevent accidental triggers.
- **Noise Rejection**: Validates that unpitched signals (White Noise) do not result in false positives.
- **Range Boundaries**: Confirms the algorithm correctly ignores frequencies below 20Hz or above 3000Hz (human vocal/instrument range).
- **Stability**: Ensures the code never returns `NaN` or `Infinity` even with empty or short buffers.

## 🎼 2. MIDI & Frequency Utilities
*File: `src/__tests__/midi.test.ts`*

Mathematical correctness for musical conversions:
- **Pitch-to-MIDI**: Verified against standard reference notes (A4=69, C4=60).
- **MIDI-to-Freq**: Verified with high precision (±0.01 Hz) across the full MIDI range (0–127).
- **Round-trip Stability**: Guarantees that `midiToFreq(pitchToMidi(x))` returns the original MIDI note without drift.
- **Note Naming**: Correct formatting for sharps (C#4) and boundary notes (C-1 to G9).
- **Clamping**: Ensuring MIDI values outside 0-127 are safely capped.

## 🛠 3. SFZ Instrument Generation
*File: `src/__tests__/sfz.test.ts`*

Ensures the generated instrument files are standard-compliant and playable:
- **Zone Boundary Math**:
    - **Single Sample**: Verified to span the full keyboard (MIDI 0–127).
    - **Multiple Samples**: Validates that zones are split perfectly at the midpoint between samples with no gaps and no overlaps.
- **SFZ Syntax**: Confirms the presence of required `<control>`, `<global>`, and `<region>` blocks.
- **Envelope Baking**: Ensures ADSR attack/release values and curves (analog vs linear) are correctly written.
- **Looping Logic**: Validates that loop markers and continuous-loop modes appear only when enabled.
- **Sorting**: Confirms regions are sorted by pitch (low to high) for DAW compatibility.

---

## How to Run Tests
To verify these results locally:
```bash
cd packages/omnistrument-core
npm test
```
