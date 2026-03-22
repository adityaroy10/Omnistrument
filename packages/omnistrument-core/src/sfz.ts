import { pitchToMidi } from './midi';

export interface SFZRegion {
  /** Relative path to the sample file inside the SFZ package (e.g. "samples/sample_0.wav") */
  sampleFile: string;
  /** Detected or assigned pitch of this sample in Hz */
  pitchHz: number;
  /** MIDI note number for the root pitch (pitch_keycenter). Auto-calculated if omitted. */
  pitchKeycenter?: number;
  /** Lowest MIDI key this region responds to. Auto-calculated if omitted. */
  lokey?: number;
  /** Highest MIDI key this region responds to. Auto-calculated if omitted. */
  hikey?: number;
  /** Enable sustain looping */
  loopEnabled?: boolean;
  /** Loop start frame (samples from the beginning) */
  loopStart?: number;
  /** Loop end frame */
  loopEnd?: number;
}

export interface SFZOptions {
  /** ADSR attack time in seconds (default: 0.01) */
  attack?: number;
  /** ADSR release time in seconds (default: 0.3) */
  release?: number;
  /** Attack curve shape */
  attackShape?: 'linear' | 'analog';
  /** Release curve shape */
  releaseShape?: 'linear' | 'analog';
}

/**
 * Calculate MIDI key zone boundaries for a sorted list of pitches (ascending Hz).
 * Each region gets a zone from the midpoint below to the midpoint above.
 */
export function calculateZones(
  regions: Pick<SFZRegion, 'pitchHz'>[]
): { lokey: number; hikey: number; pitchKeycenter: number }[] {
  const sorted = [...regions].map((r) => pitchToMidi(r.pitchHz));

  return sorted.map((midi, i) => {
    const lokey = i === 0 ? 0 : Math.ceil((midi + sorted[i - 1]) / 2);
    const hikey = i === sorted.length - 1 ? 127 : Math.floor((midi + sorted[i + 1]) / 2);
    return { pitchKeycenter: midi, lokey, hikey };
  });
}

/**
 * Build an SFZ instrument definition string from a list of regions.
 *
 * Key zone boundaries (lokey/hikey) are auto-calculated from pitchHz values
 * unless explicitly provided on each region.
 *
 * @example
 * const sfz = buildSFZ(
 *   [{ sampleFile: 'samples/kick.wav', pitchHz: 261.63 }],
 *   { attack: 0.01, release: 0.5 }
 * );
 */
export function buildSFZ(regions: SFZRegion[], options: SFZOptions = {}): string {
  const {
    attack = 0.01,
    release = 0.3,
    attackShape = 'linear',
    releaseShape = 'linear',
  } = options;

  if (regions.length === 0) return '';

  const sorted = [...regions].sort((a, b) => a.pitchHz - b.pitchHz);
  const zones = calculateZones(sorted);

  let sfz = `<control>\ndefault_path=samples/\n\n`;
  sfz += `<global>\n`;
  sfz += `ampeg_attack=${Math.max(0.001, attack).toFixed(3)}\n`;
  sfz += `ampeg_release=${Math.max(0.001, release).toFixed(3)}\n`;
  sfz += `ampeg_attack_shape=${attackShape === 'analog' ? 2 : 0}\n`;
  sfz += `ampeg_release_shape=${releaseShape === 'analog' ? -2 : 0}\n\n`;

  sorted.forEach((region, i) => {
    const zone = zones[i];
    const lokey = region.lokey ?? zone.lokey;
    const hikey = region.hikey ?? zone.hikey;
    const keycenter = region.pitchKeycenter ?? zone.pitchKeycenter;

    sfz += `<region>\n`;
    sfz += `sample=${region.sampleFile}\n`;
    sfz += `lokey=${lokey}\n`;
    sfz += `hikey=${hikey}\n`;
    sfz += `pitch_keycenter=${keycenter}\n`;

    if (region.loopEnabled) {
      sfz += `loop_mode=loop_continuous\n`;
      sfz += `loop_start=${region.loopStart ?? 0}\n`;
      sfz += `loop_end=${region.loopEnd ?? 0}\n`;
    }

    sfz += `\n`;
  });

  return sfz.trimEnd();
}
