import { useEffect, useRef } from 'react';
import type { Sample } from './App';

export function useSynthPlayback(
  audioContext: AudioContext | null,
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
  reverbMix: number,
  delayMix: number,
  eqLow: number,
  eqMid: number,
  eqHigh: number
) {
  const activeVoicesRef = useRef<Map<number, { source: AudioBufferSourceNode, gain: GainNode }>>(new Map());
  const masterBusRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const reverbGainRef = useRef<GainNode | null>(null);
  const delayGainRef = useRef<GainNode | null>(null);

  // Setup Master Bus & Analyser
  useEffect(() => {
    if (!audioContext) return;
    if (!masterBusRef.current) {
        masterBusRef.current = audioContext.createGain();
        analyserRef.current = audioContext.createAnalyser();
        analyserRef.current.fftSize = 2048;
        
        masterBusRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContext.destination);

        // Build Synthetic Vibe FX (Reverb/Delay)
        const sampleRate = audioContext.sampleRate;
        const length = sampleRate * 2.5; 
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        for (let i = 0; i < 2; i++) {
           const channel = impulse.getChannelData(i);
           for (let j = 0; j < length; j++) {
              channel[j] = (Math.random() * 2 - 1) * Math.exp(-j / (sampleRate * 0.5)); 
           }
        }
        const convolver = audioContext.createConvolver();
        convolver.buffer = impulse;
        reverbGainRef.current = audioContext.createGain();
        reverbGainRef.current.gain.value = reverbMix;
        
        masterBusRef.current.connect(convolver);
        convolver.connect(reverbGainRef.current);
        reverbGainRef.current.connect(analyserRef.current);

        const delay = audioContext.createDelay(2.0);
        delay.delayTime.value = 0.33; 
        const feedback = audioContext.createGain();
        feedback.gain.value = 0.4;
        delayGainRef.current = audioContext.createGain();
        delayGainRef.current.gain.value = delayMix;

        masterBusRef.current.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(delayGainRef.current);
        delayGainRef.current.connect(analyserRef.current);
    }
  }, [audioContext]);

  // Bind FX levels dynamically without re-instantiating nodes
  useEffect(() => {
     if (reverbGainRef.current && audioContext) reverbGainRef.current.gain.setTargetAtTime(reverbMix, audioContext.currentTime, 0.05);
     if (delayGainRef.current && audioContext) delayGainRef.current.gain.setTargetAtTime(delayMix, audioContext.currentTime, 0.05);
  }, [reverbMix, delayMix, audioContext]);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;

    navigator.requestMIDIAccess().then(access => {
      for (let input of access.inputs.values()) {
        input.onmidimessage = handleMidiMessage;
      }
      access.onstatechange = () => {
         for (let input of access.inputs.values()) {
            input.onmidimessage = handleMidiMessage;
         }
      };
    });

    return () => {
      if (activeVoicesRef.current) {
         activeVoicesRef.current.forEach(voice => {
           try { voice.source.stop(); } catch(e){}
         });
      }
    };
  }, [audioContext, samples, harmonicsGains, attackData, releaseData, attackShape, releaseShape, fluxDepth, loopEnabled, loopStartRatio, loopEndRatio, eqLow, eqMid, eqHigh]);

  const handleMidiMessage = (e: any) => {
    const [command, note, velocity] = e.data;
    if (command === 144 && velocity > 0) noteOn(note, velocity);
    else if (command === 128 || (command === 144 && velocity === 0)) noteOff(note);
  };

  const noteOn = (note: number, velocity: number) => {
    if (!audioContext || samples.length === 0 || !masterBusRef.current) return;
    
    const targetFreq = 440 * Math.pow(2, (note - 69) / 12);
    
    let bestSample = samples[0];
    let minLogDist = Infinity;
    for (const s of samples) {
       const logDist = Math.abs(Math.log2(targetFreq / s.pitch));
       if (logDist < minLogDist) {
           minLogDist = logDist;
           bestSample = s;
       }
    }

    const source = audioContext.createBufferSource();
    source.buffer = bestSample.buffer;
    source.playbackRate.value = targetFreq / bestSample.pitch;

    if (loopEnabled) {
       source.loop = true;
       source.loopStart = loopStartRatio * bestSample.buffer.duration;
       source.loopEnd = loopEndRatio * bestSample.buffer.duration;
    }

    let lastNode: AudioNode = source;
    
    const hpFilter = audioContext.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 40;
    lastNode.connect(hpFilter);
    lastNode = hpFilter;

    const lowEq = audioContext.createBiquadFilter();
    lowEq.type = 'lowshelf'; lowEq.frequency.value = 250; lowEq.gain.value = eqLow;
    lastNode.connect(lowEq); lastNode = lowEq;

    const midEq = audioContext.createBiquadFilter();
    midEq.type = 'peaking'; midEq.frequency.value = 1000; midEq.Q.value = 1.0; midEq.gain.value = eqMid;
    lastNode.connect(midEq); lastNode = midEq;

    const highEq = audioContext.createBiquadFilter();
    highEq.type = 'highshelf'; highEq.frequency.value = 4000; highEq.gain.value = eqHigh;
    lastNode.connect(highEq); lastNode = highEq;

    harmonicsGains.forEach((gainDb, index) => {
       const harmonicFreq = targetFreq * (index + 1); 
       if (harmonicFreq < audioContext.sampleRate / 2) {
         const peakFilter = audioContext.createBiquadFilter();
         peakFilter.type = 'peaking';
         peakFilter.frequency.value = harmonicFreq;
         peakFilter.Q.value = 8.0; 
         peakFilter.gain.value = gainDb;
         lastNode.connect(peakFilter);
         lastNode = peakFilter;
       }
    });

    if (fluxDepth > 0) {
       const fluxFilter = audioContext.createBiquadFilter();
       fluxFilter.type = 'lowpass';
       fluxFilter.frequency.value = 3000;
       fluxFilter.Q.value = 3;
       
       const lfo = audioContext.createOscillator();
       lfo.type = 'sine';
       lfo.frequency.value = 0.5; 
       
       const lfoGain = audioContext.createGain();
       lfoGain.gain.value = fluxDepth * 2500; 
       
       lfo.connect(lfoGain);
       lfoGain.connect(fluxFilter.frequency);
       lfo.start();
       
       lastNode.connect(fluxFilter);
       lastNode = fluxFilter;
    }

    const gainNode = audioContext.createGain();
    const now = audioContext.currentTime;
    const maxVol = (velocity / 127) * 0.6; 
    const safeAttack = Math.max(0.01, attackData);
    
    if (attackShape === 'analog') {
      gainNode.gain.setValueAtTime(0.001, now); 
      gainNode.gain.exponentialRampToValueAtTime(maxVol, now + safeAttack);
    } else {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(maxVol, now + safeAttack);
    }

    lastNode.connect(gainNode);
    gainNode.connect(masterBusRef.current);

    source.start();
    activeVoicesRef.current.set(note, { source, gain: gainNode });
  };

  const noteOff = (note: number) => {
    if (!audioContext) return;
    const voice = activeVoicesRef.current.get(note);
    if (voice) {
       const releaseTime = Math.max(0.01, releaseData);
       const now = audioContext.currentTime;
       voice.gain.gain.cancelScheduledValues(now);
       const currentVol = Math.max(0.001, voice.gain.gain.value);
       voice.gain.gain.setValueAtTime(currentVol, now);
       
       if (releaseShape === 'analog') {
         voice.gain.gain.setTargetAtTime(0, now, releaseTime / 5);
       } else {
         voice.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
       }
       
       voice.source.stop(now + releaseTime + 0.5);
       activeVoicesRef.current.delete(note);
    }
  };

  return { noteOn, noteOff, analyser: analyserRef.current };
}
