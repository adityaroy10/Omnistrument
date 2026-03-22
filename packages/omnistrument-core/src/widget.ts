/**
 * <omnistrument-widget> Web Component
 *
 * A self-contained, framework-agnostic embeddable widget for real-time
 * pitch detection and keyboard playback. Uses Shadow DOM for full style isolation.
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/omnistrument-core/dist/widget.js"></script>
 *   <omnistrument-widget theme="dark"></omnistrument-widget>
 *
 * Attributes:
 *   theme        "dark" | "light"   (default: "dark")
 *   show-export  "true" | "false"   (default: "true")
 *
 * Emitted Events:
 *   omnistrument:pitchDetected  — detail: { hz: number, midi: number, noteName: string }
 *   omnistrument:sfzReady       — detail: { sfzText: string }
 */

import { detectPitch } from './pitch';
import { pitchToMidi, midiToNoteName } from './midi';
import { buildSFZ } from './sfz';

const DARK_STYLES = `
  :host { display: block; font-family: system-ui, sans-serif; }
  .widget { background: #0d1117; border: 1px solid #30363d; border-radius: 12px; padding: 16px; color: #e6edf3; }
  .status { font-size: 14px; color: #8b949e; margin-bottom: 12px; }
  .pitch-display { font-size: 36px; font-weight: 700; color: #58a6ff; margin-bottom: 12px; min-height: 44px; }
  .controls { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  button { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity 0.2s; }
  button:hover { opacity: 0.85; }
  .btn-record { background: #da3633; color: #fff; }
  .btn-record.recording { background: #f85149; }
  .btn-export { background: #238636; color: #fff; }
  .keys { display: flex; gap: 2px; flex-wrap: wrap; }
  .key { width: 28px; height: 70px; background: #21262d; border: 1px solid #30363d; border-radius: 4px; cursor: pointer; transition: background 0.1s; font-size: 9px; color: #8b949e; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; }
  .key.black { background: #161b22; height: 44px; }
  .key.active { background: #58a6ff !important; color: #0d1117; }
`;

const LIGHT_STYLES = `
  :host { display: block; font-family: system-ui, sans-serif; }
  .widget { background: #ffffff; border: 1px solid #d0d7de; border-radius: 12px; padding: 16px; color: #1f2328; }
  .status { font-size: 14px; color: #57606a; margin-bottom: 12px; }
  .pitch-display { font-size: 36px; font-weight: 700; color: #0969da; margin-bottom: 12px; min-height: 44px; }
  .controls { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  button { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity 0.2s; }
  button:hover { opacity: 0.85; }
  .btn-record { background: #cf222e; color: #fff; }
  .btn-record.recording { background: #a40e26; }
  .btn-export { background: #1a7f37; color: #fff; }
  .keys { display: flex; gap: 2px; flex-wrap: wrap; }
  .key { width: 28px; height: 70px; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 4px; cursor: pointer; transition: background 0.1s; font-size: 9px; color: #57606a; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; }
  .key.black { background: #e1e4e8; height: 44px; }
  .key.active { background: #0969da !important; color: #ffffff; }
`;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class OmnistrumentWidget extends HTMLElement {
  private shadow: ShadowRoot;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrame: number | null = null;
  private recording = false;
  private lastPitchHz: number | null = null;
  private activeMidi: number | null = null;
  private recordedSamples: { sampleFile: string; pitchHz: number }[] = [];

  static get observedAttributes() { return ['theme', 'show-export']; }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  private get theme() { return this.getAttribute('theme') || 'dark'; }
  private get showExport() { return this.getAttribute('show-export') !== 'false'; }

  private render() {
    const styleTag = this.theme === 'light' ? LIGHT_STYLES : DARK_STYLES;

    // Build 2-octave mini keyboard (C3 to C5)
    const keys = Array.from({ length: 25 }, (_, i) => {
      const midi = 48 + i;
      const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
      const label = NOTE_NAMES[midi % 12];
      return { midi, label, isBlack };
    });

    const keysHTML = keys.map(k =>
      `<div class="key${k.isBlack ? ' black' : ''}" data-midi="${k.midi}" id="key-${k.midi}">${k.label}</div>`
    ).join('');

    this.shadow.innerHTML = `
      <style>${styleTag}</style>
      <div class="widget">
        <div class="status" id="status">Click Record to detect pitch</div>
        <div class="pitch-display" id="pitch-display">--</div>
        <div class="controls">
          <button class="btn-record" id="btn-record">Record</button>
          ${this.showExport ? '<button class="btn-export" id="btn-export">Export SFZ</button>' : ''}
        </div>
        <div class="keys" id="keys">${keysHTML}</div>
      </div>
    `;

    this.shadow.getElementById('btn-record')?.addEventListener('click', () => this.toggleRecord());
    this.shadow.getElementById('btn-export')?.addEventListener('click', () => this.exportSFZ());
  }

  private async toggleRecord() {
    if (this.recording) {
      this.stopRecord();
    } else {
      await this.startRecord();
    }
  }

  private async startRecord() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 4096;
      source.connect(this.analyser);
      this.recording = true;
      const btn = this.shadow.getElementById('btn-record');
      if (btn) { btn.textContent = 'Stop'; btn.classList.add('recording'); }
      this.shadow.getElementById('status')!.textContent = 'Listening...';
      this.detect();
    } catch {
      this.shadow.getElementById('status')!.textContent = 'Microphone access denied.';
    }
  }

  private stopRecord() {
    this.recording = false;
    this.mediaStream?.getTracks().forEach(t => t.stop());
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    const btn = this.shadow.getElementById('btn-record');
    if (btn) { btn.textContent = 'Record'; btn.classList.remove('recording'); }

    const statusEl = this.shadow.getElementById('status')!;
    if (this.lastPitchHz) {
      const midi = pitchToMidi(this.lastPitchHz);
      this.recordedSamples.push({ sampleFile: `sample_${this.recordedSamples.length}.wav`, pitchHz: this.lastPitchHz });
      statusEl.textContent = `Captured ${midiToNoteName(midi)} (${this.lastPitchHz.toFixed(1)} Hz). Record again to add more.`;
    } else {
      statusEl.textContent = 'No pitch detected. Try again.';
    }
  }

  private detect() {
    if (!this.recording || !this.analyser || !this.audioCtx) return;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    const pitch = detectPitch(buffer, this.audioCtx.sampleRate);

    if (pitch !== null) {
      this.lastPitchHz = pitch;
      const midi = pitchToMidi(pitch);
      const note = midiToNoteName(midi);
      this.shadow.getElementById('pitch-display')!.textContent = `${note}  ${pitch.toFixed(1)} Hz`;
      this.highlightKey(midi);
      this.dispatchEvent(new CustomEvent('omnistrument:pitchDetected', {
        bubbles: true, composed: true, detail: { hz: pitch, midi, noteName: note }
      }));
    }

    this.animFrame = requestAnimationFrame(() => this.detect());
  }

  private highlightKey(midi: number) {
    if (this.activeMidi !== null) {
      this.shadow.getElementById(`key-${this.activeMidi}`)?.classList.remove('active');
    }
    this.shadow.getElementById(`key-${midi}`)?.classList.add('active');
    this.activeMidi = midi;
  }

  private exportSFZ() {
    if (this.recordedSamples.length === 0) {
      this.shadow.getElementById('status')!.textContent = 'Record at least one sample first.';
      return;
    }
    const sfzText = buildSFZ(this.recordedSamples);
    this.dispatchEvent(new CustomEvent('omnistrument:sfzReady', {
      bubbles: true, composed: true, detail: { sfzText }
    }));
    // Offer the SFZ as a plain text download
    const blob = new Blob([sfzText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'instrument.sfz'; a.click();
    URL.revokeObjectURL(url);
    this.shadow.getElementById('status')!.textContent = 'SFZ exported!';
  }
}

if (!customElements.get('omnistrument-widget')) {
  customElements.define('omnistrument-widget', OmnistrumentWidget);
}
