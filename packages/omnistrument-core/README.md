# omnistrument-core

Core SDK for [Omnistrument](https://omnistrument.vercel.app) — real-time YIN pitch detection and SFZ multi-sampler instrument generation. Zero dependencies, framework-agnostic, runs in Node and the browser.

## Install

```bash
npm install omnistrument-core
```

## API

```ts
import { detectPitch, buildSFZ, pitchToMidi, midiToFreq, midiToNoteName } from 'omnistrument-core';
```

### `detectPitch(buffer, sampleRate)`

Detects the fundamental frequency of a monophonic audio signal using the YIN algorithm.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Float32Array` | Raw PCM audio samples |
| `sampleRate` | `number` | Sample rate in Hz (e.g. 44100) |

Returns `number | null` — frequency in Hz, or `null` if no pitch is detected.

```ts
const hz = detectPitch(myBuffer, 44100);
// → 440.3 (A4) or null
```

### `buildSFZ(regions, options?)`

Generates a complete SFZ instrument definition string from an array of sample regions. Key zones are calculated automatically.

```ts
const sfz = buildSFZ([
  { sampleFile: 'samples/low.wav', pitchHz: 130.81 },
  { sampleFile: 'samples/mid.wav', pitchHz: 440 },
  { sampleFile: 'samples/high.wav', pitchHz: 880 },
], { attack: 0.01, release: 0.5 });
```

### `pitchToMidi(hz)` / `midiToFreq(midi)` / `midiToNoteName(midi)`

Standard pitch/MIDI conversion utilities.

```ts
pitchToMidi(440)     // → 69
midiToFreq(69)       // → 440.0
midiToNoteName(69)   // → "A4"
```

---

## Embeddable Widget

Drop the widget into any web page with no build step:

```html
<script src="https://cdn.jsdelivr.net/npm/omnistrument-core/dist/widget.js"></script>
<omnistrument-widget theme="dark"></omnistrument-widget>
```

### Attributes

| Attribute | Values | Default | Description |
|---|---|---|---|
| `theme` | `"dark"` / `"light"` | `"dark"` | Widget colour scheme |
| `show-export` | `"true"` / `"false"` | `"true"` | Show the SFZ export button |

### Events

```js
document.querySelector('omnistrument-widget')
  .addEventListener('omnistrument:pitchDetected', e => {
    console.log(e.detail); // { hz: 440, midi: 69, noteName: "A4" }
  });
```

| Event | Detail | Description |
|---|---|---|
| `omnistrument:pitchDetected` | `{ hz, midi, noteName }` | Fired on every detected pitch frame |
| `omnistrument:sfzReady` | `{ sfzText }` | Fired when user exports SFZ |

---

## Running Tests

```bash
cd packages/omnistrument-core
npm install
npm test
```

### Test Coverage

| File | Tests | What's covered |
|---|---|---|
| `pitch.test.ts` | 12 | YIN accuracy at A4/A3/A2/C4/E2, silence rejection, noise rejection, out-of-range rejection, edge cases |
| `midi.test.ts` | 17 | `pitchToMidi`, `midiToFreq`, round-trips, `midiToNoteName`, `clampMidi` |
| `sfz.test.ts` | 11 | Zone boundary math, SFZ block presence, attack/release baking, loop flags, sort order |
| **Total** | **40** | |

### What Each Test Group Validates

**`pitch.test.ts`**
- Correct Hz detection for standard musical pitches (A4, A3, A2, C4, guitar low E)
- RMS gate correctly rejects silence
- Noise produces null (no false positives)
- Pitches out of the 20–3000 Hz range return null
- No crashes on undersized or empty buffers
- Output is always a finite number or null (never NaN/Infinity)

**`midi.test.ts`**
- Standard reference pitches (A4=69, C4=60, etc.)
- Boundary cases: MIDI 0 (C-1) and MIDI 127 (G9)
- Round-trip stability: `midiToFreq(pitchToMidi(x))` stays at same MIDI note
- Note name formatting for naturals and sharps
- `clampMidi` boundary clamping

**`sfz.test.ts`**
- Single-region spans full keyboard (lokey=0, hikey=127)
- Two regions split at the correct midpoint MIDI note
- Three regions produce non-overlapping, gapless zones
- SFZ output contains all required blocks
- Attack/release values are correctly formatted
- Analog vs. linear shape values (2 vs. 0)
- Loop directives appear/disappear based on `loopEnabled`
- Regions are sorted ascending by pitch
- Zero-attack/release is clamped to 0.001 (SFZ minimum)

---

## Build

```bash
npm run build
# → dist/index.js  (CJS)
# → dist/index.mjs (ESM)
# → dist/index.d.ts (types)
# → dist/widget.js (IIFE, drop-in script tag)
```

## License

Copyright (c) 2026 Aditya Roy. All Rights Reserved. See [LICENSE](../../app/LICENSE).
