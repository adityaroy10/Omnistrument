/**
 * omnistrument-core
 *
 * Core SDK for Omnistrument — real-time YIN pitch detection
 * and SFZ multi-sampler instrument generation.
 *
 * @example
 * import { detectPitch, buildSFZ, pitchToMidi, midiToFreq } from 'omnistrument-core';
 */

export { detectPitch } from './pitch';
export { pitchToMidi, midiToFreq, midiToNoteName, clampMidi } from './midi';
export { buildSFZ, calculateZones } from './sfz';
export type { SFZRegion, SFZOptions } from './sfz';
