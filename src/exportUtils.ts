import JSZip from 'jszip';
import type { Sample } from './App';

// Helper to convert Web Audio API AudioBuffer to standard .wav specification
function audioBufferToWav(buffer: AudioBuffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);  // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16);         // length = 16
  setUint16(1);          // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16);         // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
}

export async function exportSfzInstrument(
  samples: Sample[],
  harmonicsGains: number[],
  attackData: number,
  releaseData: number,
  attackShape: 'linear' | 'analog',
  releaseShape: 'linear' | 'analog',
  fluxDepth: number,
  loopEnabled: boolean,
  loopStartRatio: number,
  loopEndRatio: number,
  eqLow: number,
  eqMid: number,
  eqHigh: number
) {
  const zip = new JSZip();

  let sfzText = `<control>
default_path=samples/

<global>
ampeg_attack=${Math.max(0.001, attackData).toFixed(3)}
ampeg_release=${Math.max(0.001, releaseData).toFixed(3)}
ampeg_attack_shape=${attackShape === 'analog' ? 2 : 0}
ampeg_release_shape=${releaseShape === 'analog' ? -2 : 0}
`;

  // Sort ascending by frequency so we can calculate zone boundaries
  const sortedSamples = [...samples].sort((a,b) => a.pitch - b.pitch);

  for (let i = 0; i < sortedSamples.length; i++) {
     const s = sortedSamples[i];
     
     // 1. Bake Offline Buffer
     const offlineCtx = new OfflineAudioContext(1, s.buffer.length, s.buffer.sampleRate);
     const source = offlineCtx.createBufferSource();
     source.buffer = s.buffer;
     
     // Duplicate the node chain (no master bus / reverb, just the pure timbre/overtones and flux modulation so it behaves as an instrument oscillator!)
     let lastNode: AudioNode = source;
     const hpFilter = offlineCtx.createBiquadFilter();
     hpFilter.type = 'highpass'; hpFilter.frequency.value = 40;
     lastNode.connect(hpFilter); lastNode = hpFilter;
     
     const lowEq = offlineCtx.createBiquadFilter();
     lowEq.type = 'lowshelf'; lowEq.frequency.value = 250; lowEq.gain.value = eqLow;
     lastNode.connect(lowEq); lastNode = lowEq;

     const midEq = offlineCtx.createBiquadFilter();
     midEq.type = 'peaking'; midEq.frequency.value = 1000; midEq.Q.value = 1.0; midEq.gain.value = eqMid;
     lastNode.connect(midEq); lastNode = midEq;

     const highEq = offlineCtx.createBiquadFilter();
     highEq.type = 'highshelf'; highEq.frequency.value = 4000; highEq.gain.value = eqHigh;
     lastNode.connect(highEq); lastNode = highEq;

     harmonicsGains.forEach((gainDb, index) => {
        const harmonicFreq = s.pitch * (index + 1);
        if (harmonicFreq < offlineCtx.sampleRate / 2) {
           const pf = offlineCtx.createBiquadFilter();
           pf.type = 'peaking'; pf.frequency.value = harmonicFreq;
           pf.Q.value = 8.0; pf.gain.value = gainDb;
           lastNode.connect(pf); lastNode = pf;
        }
     });

     if (fluxDepth > 0) {
       const fluxFilter = offlineCtx.createBiquadFilter();
       fluxFilter.type = 'lowpass'; fluxFilter.frequency.value = 3000; fluxFilter.Q.value = 3;
       const lfo = offlineCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.5;
       const lfoGain = offlineCtx.createGain(); lfoGain.gain.value = fluxDepth * 2500;
       lfo.connect(lfoGain); lfoGain.connect(fluxFilter.frequency); lfo.start(0);
       lastNode.connect(fluxFilter); lastNode = fluxFilter;
     }

     lastNode.connect(offlineCtx.destination);
     source.start(0);

     const renderedBuffer = await offlineCtx.startRendering();
     const wavBlob = audioBufferToWav(renderedBuffer);
     const fileName = `sample_${i}.wav`;
     zip.file(`samples/${fileName}`, wavBlob);
     
     // 2. Calculate SFZ Key Zones dynamically based on neighbors
     const pitchkeycenter = Math.round(69 + 12 * Math.log2(s.pitch / 440));
     
     let lokey = 0;
     if (i > 0) {
        const prevKey = Math.round(69 + 12 * Math.log2(sortedSamples[i-1].pitch / 440));
        lokey = Math.ceil((pitchkeycenter + prevKey) / 2);
     }
     
     let hikey = 127;
     if (i < sortedSamples.length - 1) {
        const nextKey = Math.round(69 + 12 * Math.log2(sortedSamples[i+1].pitch / 440));
        hikey = Math.floor((pitchkeycenter + nextKey) / 2);
     }
     
     let loopText = '';
     if (loopEnabled) {
         const loopStartFrame = Math.floor(loopStartRatio * s.buffer.length);
         const loopEndFrame = Math.floor(loopEndRatio * s.buffer.length);
         loopText = `\nloop_mode=loop_continuous\nloop_start=${loopStartFrame}\nloop_end=${loopEndFrame}\n`;
     }
     
     sfzText += `
<region>
sample=${fileName}
lokey=${lokey}
hikey=${hikey}
pitch_keycenter=${pitchkeycenter}${loopText}
`;
  }

  zip.file("instrument.sfz", sfzText);

  // Trigger download!
  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Timbre_Instrument.zip";
  link.click();
  URL.revokeObjectURL(url);
}
