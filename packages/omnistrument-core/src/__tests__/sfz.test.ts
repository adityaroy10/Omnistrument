import { buildSFZ, calculateZones } from '../sfz';
import type { SFZRegion } from '../sfz';

// ─── calculateZones ───────────────────────────────────────────────────────────

describe('calculateZones', () => {
  test('single region spans the full keyboard (0–127)', () => {
    const zones = calculateZones([{ pitchHz: 440 }]); // A4 = MIDI 69
    expect(zones).toHaveLength(1);
    expect(zones[0].lokey).toBe(0);
    expect(zones[0].hikey).toBe(127);
    expect(zones[0].pitchKeycenter).toBe(69);
  });

  test('two regions split at the midpoint MIDI note', () => {
    // C3 (MIDI 48) and C5 (MIDI 72)  → midpoint = 60
    const zones = calculateZones([
      { pitchHz: 130.81 }, // C3 ≈ MIDI 48
      { pitchHz: 523.25 }, // C5 ≈ MIDI 72
    ]);
    expect(zones[0].lokey).toBe(0);
    expect(zones[0].hikey).toBe(60);
    expect(zones[1].lokey).toBe(60);
    expect(zones[1].hikey).toBe(127);
  });

  test('three regions produce non-overlapping, gapless zones', () => {
    const zones = calculateZones([
      { pitchHz: 130.81 }, // C3 = MIDI 48
      { pitchHz: 440 },    // A4 = MIDI 69
      { pitchHz: 1046.5 }, // C6 = MIDI 84
    ]);
    expect(zones[0].lokey).toBe(0);
    expect(zones[2].hikey).toBe(127);
    // No gap: each zone's hikey + 1 === next zone's lokey
    expect(zones[0].hikey + 1).toBe(zones[1].lokey);
    expect(zones[1].hikey + 1).toBe(zones[2].lokey);
  });
});

// ─── buildSFZ ────────────────────────────────────────────────────────────────

describe('buildSFZ', () => {
  test('returns empty string for an empty regions array', () => {
    expect(buildSFZ([])).toBe('');
  });

  test('includes <control>, <global>, and <region> blocks', () => {
    const sfz = buildSFZ([{ sampleFile: 'samples/kick.wav', pitchHz: 440 }]);
    expect(sfz).toContain('<control>');
    expect(sfz).toContain('<global>');
    expect(sfz).toContain('<region>');
  });

  test('bakes attack and release into <global>', () => {
    const sfz = buildSFZ(
      [{ sampleFile: 'samples/pad.wav', pitchHz: 440 }],
      { attack: 0.5, release: 1.0 }
    );
    expect(sfz).toContain('ampeg_attack=0.500');
    expect(sfz).toContain('ampeg_release=1.000');
  });

  test('analog attack shape writes shape value 2', () => {
    const sfz = buildSFZ(
      [{ sampleFile: 's.wav', pitchHz: 440 }],
      { attackShape: 'analog' }
    );
    expect(sfz).toContain('ampeg_attack_shape=2');
  });

  test('linear release shape writes shape value 0', () => {
    const sfz = buildSFZ(
      [{ sampleFile: 's.wav', pitchHz: 440 }],
      { releaseShape: 'linear' }
    );
    expect(sfz).toContain('ampeg_release_shape=0');
  });

  test('loop_mode=loop_continuous appears when loopEnabled is true', () => {
    const region: SFZRegion = {
      sampleFile: 'samples/pad.wav',
      pitchHz: 440,
      loopEnabled: true,
      loopStart: 1000,
      loopEnd: 44000,
    };
    const sfz = buildSFZ([region]);
    expect(sfz).toContain('loop_mode=loop_continuous');
    expect(sfz).toContain('loop_start=1000');
    expect(sfz).toContain('loop_end=44000');
  });

  test('no loop directives when loopEnabled is false', () => {
    const region: SFZRegion = {
      sampleFile: 'samples/pad.wav',
      pitchHz: 440,
      loopEnabled: false,
    };
    const sfz = buildSFZ([region]);
    expect(sfz).not.toContain('loop_mode');
  });

  test('regions are sorted ascending by pitch (low samples first)', () => {
    const regions: SFZRegion[] = [
      { sampleFile: 'high.wav', pitchHz: 880 },
      { sampleFile: 'low.wav', pitchHz: 220 },
    ];
    const sfz = buildSFZ(regions);
    const lowIdx = sfz.indexOf('low.wav');
    const highIdx = sfz.indexOf('high.wav');
    expect(lowIdx).toBeLessThan(highIdx);
  });

  test('attack clamped to minimum 0.001 when 0 is passed', () => {
    const sfz = buildSFZ(
      [{ sampleFile: 's.wav', pitchHz: 440 }],
      { attack: 0, release: 0 }
    );
    expect(sfz).toContain('ampeg_attack=0.001');
    expect(sfz).toContain('ampeg_release=0.001');
  });
});
