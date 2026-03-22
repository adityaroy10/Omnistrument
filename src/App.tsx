import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import { useAudioEngine } from './useAudioEngine';
import { detectPitch, drawWaveformCanvas } from './pitchDetect';
import { useSynthPlayback } from './useSynthPlayback';
import { exportSfzInstrument } from './exportUtils';

export interface Sample {
  id: string;
  buffer: AudioBuffer;
  pitch: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const KEYS = Array.from({length: 37}, (_, i) => {
   const note = 48 + i; // Start from C3 (Midi 48) up to C6
   const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
   const label = NOTE_NAMES[note % 12];
   return { note, label, black: isBlack };
});
const PRESET_NOTES = Array.from({length: 61}, (_, i) => {
  const midi = i + 36; // C2 to C7
  const name = NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1);
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  return { midi, name, freq };
});

function getClosestNoteFreq(hz: number) {
  let closest = PRESET_NOTES[0];
  let minDiff = Infinity;
  for (const n of PRESET_NOTES) {
    const diff = Math.abs(n.freq - hz);
    if (diff < minDiff) { minDiff = diff; closest = n; }
  }
  return closest.freq;
}

const tutorialSteps = [
  { targetId: null, title: "Welcome to Timbre.", content: "This is a full-featured Pro Studio for designing virtual instruments right in your browser. Let's walk through how to build your first synth." },
  { targetId: "tour-plots", title: "1. Capture a Sound", content: "Hit the red record button and sing a note, pluck a guitar string, or hit a wine glass. The engine will instantly detect the pitch and map it across the 3-octave virtual keyboard at the bottom of your screen!" },
  { targetId: "tour-eq", title: "2. The Magic of Overtones", content: "Every sound has a hidden fingerprint of overtones (harmonics). Use the 'OVERTONES' sliders in the middle panel to selectively boost or crush the raw harmonics of your recording in real-time." },
  { targetId: "tour-processing", title: "3. Multi-Sample Layouts", content: "Record a low note, and then record a high note. Timbre will automatically calculate the optimal split-points and build a multi-sampled instrument layout to prevent extreme chipmunk-pitch stretching." },
  { targetId: "tour-envelope", title: "4. Sustain Looping & FX", content: "Build endless orchestral pads using the Sustain Looping bars, sculpt the sound with the Master EQ, and dive into huge acoustic spaces using the Reverb & Delay knobs." },
  { targetId: "tour-header", title: "5. Export and Play", content: "When your sound is perfect, hit 'Export Multi-Sample .sfz'. We will instantly compile a professional standard instrument package that you can load into any DAW (like Ableton, FL Studio, or Logic) using a free plugin like Sforzando!" }
];

function NumInput({ value, onChange, min, max, suffix = '' }: any) {
  const [local, setLocal] = useState(typeof value === 'number' ? Number.isInteger(value) ? value.toString() : value.toFixed(2) : value.toString());

  useEffect(() => {
    setLocal(typeof value === 'number' ? Number.isInteger(value) ? value.toString() : value.toFixed(2) : value.toString());
  }, [value]);

  const handleBlur = () => {
    let parsed = parseFloat(local);
    if (!isNaN(parsed)) {
      parsed = Math.max(min, Math.min(max, parsed));
      if (onChange) onChange(parsed);
      setLocal(parsed.toString());
    } else {
      setLocal(value.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  return (
    <div style={{display: 'inline-flex', alignItems: 'baseline'}}>
      <input 
        type="text" 
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        title={`Range: ${min} to ${max}`}
        style={{
           background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', 
           width: '42px', textAlign: 'center', borderRadius: 4, padding: '2px 4px', 
           fontFamily: 'monospace', fontSize: 11, outline: 'none', transition: 'all 0.2s'
        }}
        onFocus={(e) => { e.target.style.background = 'rgba(255,255,255,0.15)'; e.target.style.borderColor = 'var(--accent)'; e.target.select(); }}
        onBlurCapture={(e) => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
      />
      {suffix && <span style={{marginLeft: 4, color: 'var(--text-secondary)', fontSize: 11}}>{suffix}</span>}
    </div>
  );
}

function GraphicEQ({ low, mid, high, setLow, setMid, setHigh }: { 
  low: number; mid: number; high: number; 
  setLow: (v: number) => void; setMid: (v: number) => void; setHigh: (v: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragNode, setDragNode] = useState<'low'|'mid'|'high'|null>(null);

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!dragNode || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let val = 24 - (y / rect.height) * 48; 
      val = Math.max(-24, Math.min(24, Math.round(val)));
      if (dragNode === 'low') setLow(val);
      if (dragNode === 'mid') setMid(val);
      if (dragNode === 'high') setHigh(val);
  };

  const handlePointerUp = () => setDragNode(null);

  const yL = 50 - (low / 24) * 40;
  const yM = 50 - (mid / 24) * 40;
  const yH = 50 - (high / 24) * 40;
  const pathD = `M 0,50 C 25,50 25,${yL} 50,${yL} C 100,${yL} 100,${yM} 150,${yM} C 200,${yM} 200,${yH} 250,${yH} C 275,${yH} 275,50 300,50`;

  return (
    <div style={{ position: 'relative', width: '100%', height: '160px', minHeight: '160px', flexShrink: 0, background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid var(--panel-border)', overflow: 'hidden', marginTop: 16 }}>
      <div style={{position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none'}} />
      <svg 
        ref={svgRef}
        viewBox="0 0 300 100" 
        preserveAspectRatio="none"
        style={{width: '100%', height: '100%', display: 'block', touchAction: 'none'}}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
         <path d={`${pathD} L 300,100 L 0,100 Z`} fill="rgba(59, 130, 246, 0.15)" />
         <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="3" />
         
         <circle cx="50" cy={yL} r="8" fill="#fff" cursor="pointer" 
            onPointerDown={(e) => { setDragNode('low'); e.currentTarget.setPointerCapture(e.pointerId); }} />
         <circle cx="150" cy={yM} r="8" fill="#fff" cursor="pointer" 
            onPointerDown={(e) => { setDragNode('mid'); e.currentTarget.setPointerCapture(e.pointerId); }} />
         <circle cx="250" cy={yH} r="8" fill="#fff" cursor="pointer" 
            onPointerDown={(e) => { setDragNode('high'); e.currentTarget.setPointerCapture(e.pointerId); }} />
         
         <text x="50" y={yL > 50 ? yL - 14 : yL + 20} fill="rgba(255,255,255,0.7)" fontSize="9" textAnchor="middle" pointerEvents="none">{low > 0 ? '+' : ''}{low} dB</text>
         <text x="150" y={yM > 50 ? yM - 14 : yM + 20} fill="rgba(255,255,255,0.7)" fontSize="9" textAnchor="middle" pointerEvents="none">{mid > 0 ? '+' : ''}{mid} dB</text>
         <text x="250" y={yH > 50 ? yH - 14 : yH + 20} fill="rgba(255,255,255,0.7)" fontSize="9" textAnchor="middle" pointerEvents="none">{high > 0 ? '+' : ''}{high} dB</text>
      </svg>
      <div style={{position:'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'space-around', fontSize: 10, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none'}}>
         <span>LOW (300Hz)</span>
         <span>MID (1kHz)</span>
         <span>HIGH (3kHz)</span>
      </div>
    </div>
  );
}

function App() {
  // Tutorial State
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('hasSeenTutorial'));
  const [tutorialStep, setTutorialStep] = useState(0);
  const [modalStyle, setModalStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    if (!showTutorial) return;
    const step = tutorialSteps[tutorialStep];
    
    const positionModal = () => {
      if (!step.targetId) {
         setModalStyle({ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '450px', opacity: 1, transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' });
         return;
      }
      const el = document.getElementById(step.targetId);
      if (!el) return;
      
      const rect = el.getBoundingClientRect();
      const modalWidth = 400;
      const modalHeight = 250; 
      let top = Math.max(16, rect.top);
      let left = rect.right + 24;

      if (left + modalWidth > window.innerWidth) {
         left = rect.left - modalWidth - 24;
         if (left < 16) {
            left = window.innerWidth / 2 - modalWidth / 2;
            top = rect.bottom + 24;
            if (top + modalHeight > window.innerHeight) {
               top = Math.max(16, rect.top - modalHeight - 24);
            }
         }
      }
      if (top + modalHeight > window.innerHeight) {
         top = Math.max(16, window.innerHeight - modalHeight - 24);
      }
      setModalStyle({ position: 'absolute', top: `${top}px`, left: `${left}px`, width: `${modalWidth}px`, transform: 'none', opacity: 1, transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' });
    };

    positionModal();
    window.addEventListener('resize', positionModal);
    return () => window.removeEventListener('resize', positionModal);
  }, [showTutorial, tutorialStep]);

  const activeTarget = showTutorial ? tutorialSteps[tutorialStep].targetId : null;

  const [samples, setSamples] = useState<Sample[]>([]);
  const [activeSampleId, setActiveSampleId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Timbre & Envelope State
  const [noiseGate, setNoiseGate] = useState(-60);
  const [harmonics, setHarmonics] = useState<number[]>([0, 0, 0, 0, 0]); 
  const [attack, setAttack] = useState(0.01);
  const [release, setRelease] = useState(1.0); 
  const [attackShape, setAttackShape] = useState<'linear' | 'analog'>('analog');
  const [releaseShape, setReleaseShape] = useState<'linear' | 'analog'>('analog');
  const [flux, setFlux] = useState(0.5);

  // Phase 2: Loops and FX
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStartRatio, setLoopStartRatio] = useState(0.2);
  const [loopEndRatio, setLoopEndRatio] = useState(0.8);
  const [reverbMix, setReverbMix] = useState(0.0);
  const [delayMix, setDelayMix] = useState(0.0);
  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const specCanvasRef = useRef<HTMLCanvasElement>(null);

  const onRecordingComplete = (buffer: AudioBuffer) => {
      setIsAnalyzing(true);
      setTimeout(() => {
         let p = detectPitch(buffer.getChannelData(0), buffer.sampleRate);
         if (p === null) {
            console.log("No pitch detected, defaulting to C4");
            p = PRESET_NOTES.find(n => n.name === 'C4')!.freq; 
         } else {
            p = getClosestNoteFreq(p);
         }
         const newSample: Sample = { id: Date.now().toString(), buffer, pitch: p };
         setSamples(prev => {
            const next = [...prev, newSample];
            return next;
         });
         setActiveSampleId(newSample.id);
         setIsAnalyzing(false);
      }, 50);
  };

  const { isRecording, startRecording, stopRecording, audioContext } = useAudioEngine(onRecordingComplete);

  const { noteOn, noteOff, analyser } = useSynthPlayback(
     audioContext, 
     samples, 
     harmonics, 
     attack, 
     release,
     attackShape,
     releaseShape,
     flux,
     loopEnabled,
     loopStartRatio,
     loopEndRatio,
     reverbMix,
     delayMix,
     eqLow,
     eqMid,
     eqHigh
  );

  const activeSample = samples.find(s => s.id === activeSampleId) || null;
  const hasRecorded = samples.length > 0;

  // Draw Canvases
  useEffect(() => {
    if (activeSample && canvasRef.current) {
        drawWaveformCanvas(canvasRef.current, activeSample.buffer);
    } else if (!activeSample && canvasRef.current && specCanvasRef.current) {
        const ctxW = canvasRef.current.getContext('2d');
        const ctxS = specCanvasRef.current.getContext('2d');
        ctxW?.clearRect(0,0, canvasRef.current.width, canvasRef.current.height);
        ctxS?.clearRect(0,0, specCanvasRef.current.width, specCanvasRef.current.height);
    }
  }, [activeSample]);

  // Real-time Frequency Spectrum Analyzer
  useEffect(() => {
    if (!analyser || !specCanvasRef.current) return;
    const canvas = specCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const visibleBins = Math.floor(analyser.frequencyBinCount * 0.25);
      const barWidth = (canvas.width / visibleBins) * 1.5; 
      let x = 0;

      for (let i = 0; i < visibleBins; i++) {
         const barHeight = (dataArray[i] / 255) * canvas.height;
         const r = 96 + (barHeight / canvas.height) * 50;
         const g = 165 + (barHeight / canvas.height) * 20;
         const b = 250;
         ctx.fillStyle = `rgb(${r},${g},${b})`;
         ctx.fillRect(x, canvas.height - barHeight, barWidth - 0.5, barHeight);
         x += barWidth;
      }
    };
    
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser]);

  const handleReset = () => {
    setSamples([]);
    setActiveSampleId(null);
    setHarmonics([0, 0, 0, 0, 0]);
    setNoiseGate(-60);
    setAttack(0.01);
    setRelease(1.0);
    setAttackShape('analog');
    setReleaseShape('analog');
    setFlux(0.5);
    setLoopEnabled(false);
    setReverbMix(0.0);
    setDelayMix(0.0);
    setEqLow(0);
    setEqMid(0);
    setEqHigh(0);
  };

  const removeSample = (e: React.MouseEvent, id: string) => {
     e.stopPropagation();
     const newS = samples.filter(s => s.id !== id);
     setSamples(newS);
     if (activeSampleId === id) setActiveSampleId(newS[0]?.id || null);
  };

  const handlePitchChange = (id: string, newPitch: number) => {
     setSamples(prev => prev.map(s => s.id === id ? { ...s, pitch: newPitch } : s));
  };

  const closeTutorial = () => {
    localStorage.setItem('hasSeenTutorial', 'true');
    setShowTutorial(false);
  };

  return (
    <div className="app-container">
      {showTutorial && (
        <div className="tutorial-overlay">
           <div className="tutorial-modal glass-panel" style={modalStyle}>
              <h2>{tutorialSteps[tutorialStep].title}</h2>
              <p>{tutorialSteps[tutorialStep].content}</p>
              <div className="tutorial-nav">
                 <button 
                    onClick={closeTutorial} 
                    style={{background:'transparent', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', padding: '8px 0'}}
                 >
                    Skip Tutorial
                 </button>
                 <div style={{display:'flex', gap: 12}}>
                   <button 
                     disabled={tutorialStep === 0} 
                     onClick={() => setTutorialStep(s => s - 1)}
                     style={{background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '8px 16px', cursor: tutorialStep === 0 ? 'default' : 'pointer', opacity: tutorialStep === 0 ? 0.3 : 1}}
                   >
                     Back
                   </button>
                   {tutorialStep < tutorialSteps.length - 1 ? (
                      <button 
                         className="btn-primary" 
                         onClick={() => setTutorialStep(s => s + 1)}
                         style={{padding: '8px 24px', borderRadius: 8}}
                      >
                         Next
                      </button>
                   ) : (
                      <button 
                         className="btn-primary" 
                         onClick={closeTutorial}
                         style={{padding: '8px 24px', borderRadius: 8, background: 'var(--success)'}}
                      >
                         Get Started!
                      </button>
                   )}
                 </div>
              </div>
           </div>
        </div>
      )}

      <header id="tour-header" className={`app-header glass-panel ${activeTarget === 'tour-header' ? 'tour-highlight' : ''}`}>
        <div className="logo">Timbre<span className="dot">.</span></div>
        <div className="header-actions">
           <button 
             className="btn-secondary" 
             onClick={() => { setTutorialStep(0); setShowTutorial(true); }}
             style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', marginRight: 8, transition: 'background 0.2s'}}
           >
             Tour
           </button>
           <button 
             className="btn-secondary" 
             onClick={handleReset}
             disabled={!hasRecorded || isRecording}
             style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', marginRight: 8, transition: 'background 0.2s', ...((!hasRecorded || isRecording) ? {pointerEvents:'none', opacity:0.3} : {})}}
           >
             Reset Everything
           </button>
           <button 
             className="btn-primary" 
             disabled={!hasRecorded || isAnalyzing}
             onClick={() => exportSfzInstrument(samples, harmonics, attack, release, attackShape, releaseShape, flux, loopEnabled, loopStartRatio, loopEndRatio, eqLow, eqMid, eqHigh)}
           >
             Export Multi-Sample .sfz
           </button>
        </div>
      </header>

      <main className="main-workspace">
        <div id="tour-plots" className={`visualizer-section glass-panel ${activeTarget === 'tour-plots' ? 'tour-highlight' : ''}`} style={{marginBottom: 0}}>
          <div className="visualizers-wrapper" style={{flex: 1}}>
             <div className="visualizer-placeholder">
                <div className="viz-label">Waveform</div>
                <canvas 
                   ref={canvasRef} 
                   width={400} 
                   height={200} 
                   style={{ width: '100%', height: '100%', position: 'absolute' }} 
                />
                {loopEnabled && hasRecorded && (
                  <>
                    <div style={{position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--success)', left: `${loopStartRatio * 100}%`, pointerEvents: 'none'}} />
                    <div style={{position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--danger)', left: `${loopEndRatio * 100}%`, pointerEvents: 'none'}} />
                    <div style={{position: 'absolute', top: 0, bottom: 0, left: `${loopStartRatio * 100}%`, right: `${100 - loopEndRatio * 100}%`, background: 'var(--success)', opacity: 0.1, pointerEvents: 'none'}} />
                  </>
                )}
             </div>
             <div className="visualizer-placeholder spectrogram">
                <div className="viz-label">Frequency Spectrum (Realtime)</div>
                <canvas 
                   ref={specCanvasRef} 
                   width={400} 
                   height={200} 
                   style={{ width: '100%', height: '100%', position: 'absolute' }} 
                />
             </div>
          </div>
          
          <div className="samples-list">
             {samples.length === 0 && <span style={{color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center'}}>No samples recorded yet. (Record multiple notes to build advanced key-range zones!)</span>}
             {samples.map((s, i) => {
                 const nName = PRESET_NOTES.find(n => n.freq === s.pitch)?.name || 'Hz';
                 return (
                   <div 
                      key={s.id} 
                      className={`sample-badge ${s.id === activeSampleId ? 'active' : ''}`}
                      onClick={() => setActiveSampleId(s.id)}
                   >
                     Sample {i+1} [{nName}]
                     <button className="delete-btn" onClick={(e) => removeSample(e, s.id)}>×</button>
                   </div>
                 );
             })}
          </div>

          {!hasRecorded && !isRecording && !isAnalyzing && 
             <div className="waiting-text overlay-notice" style={{top: '30%'}}>Ready to record (Press circle button below)</div>
          }
          {isRecording && 
             <div className="waiting-text overlay-notice" style={{color: '#ef4444', top: '30%'}}>Recording...</div>
          }
          {isAnalyzing && (
            <div className="overlay-notice" style={{top: '30%'}}>
               <div className="waiting-text">Analyzing Frequencies...</div>
               <div className="loading-bar-container" style={{position: 'relative', top: 10, left: 0, transform: 'none'}}><div className="loading-bar-fill"></div></div>
            </div>
          )}

          <div className="transport-controls" style={{bottom: 16}}>
            <button 
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={() => isRecording ? stopRecording() : startRecording()}
              disabled={isAnalyzing}
            >
              <div className="record-icon"></div>
            </button>
          </div>
        </div>

        <div className="controls-grid">
           {/* Cleanup Controls & Keyboard */}
           <div id="tour-processing" className={`control-panel glass-panel ${activeTarget === 'tour-processing' ? 'tour-highlight' : ''}`} style={{gridColumn: 'span 1'}}>
              <h3>Processing & Preview</h3>

              {activeSample !== null && (
                 <div className="control-group" style={{marginBottom: 8}}>
                   <label>Active Sample Root Tuning</label>
                   <div style={{display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: 6, border: '1px solid var(--panel-border)', padding: '4px 12px'}}>
                     <select 
                        value={activeSample.pitch} 
                        onChange={e => handlePitchChange(activeSample.id, Number(e.target.value))}
                        style={{flex: 1, background: 'transparent', border: 'none', color: 'var(--success)', fontWeight: 'bold', fontSize: '16px', outline: 'none', padding: '6px 0', cursor: 'pointer', appearance: 'none'}}
                     >
                       {PRESET_NOTES.map(n => (
                         <option key={n.midi} value={n.freq} style={{background: '#0b0f19', color: '#fff'}}>
                           {n.name}
                         </option>
                       ))}
                     </select>
                   </div>
                 </div>
              )}

              <div className="control-group">
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  Noise Gate Threshold
                  <NumInput value={noiseGate} onChange={setNoiseGate} min={-100} max={0} suffix="dB" />
                </label>
                <input 
                  type="range" min="-100" max="0" 
                  value={noiseGate} 
                  onChange={e => setNoiseGate(Number(e.target.value))} 
                />
              </div>

              <div className="control-group" style={{marginTop: 8}}>
                <label style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <span>Sustain Looping</span>
                  <input type="checkbox" checked={loopEnabled} onChange={e => setLoopEnabled(e.target.checked)} />
                </label>
                {loopEnabled && (
                  <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                    <div style={{flex: 1}}>
                       <label style={{fontSize: 10, color: 'var(--success)'}}>Start</label>
                       <input type="range" min="0" max="0.99" step="0.01" value={loopStartRatio} onChange={e => { const v=Number(e.target.value); if(v<loopEndRatio)setLoopStartRatio(v); }} />
                    </div>
                    <div style={{flex: 1}}>
                       <label style={{fontSize: 10, color: 'var(--danger)'}}>End</label>
                       <input type="range" min="0.01" max="1" step="0.01" value={loopEndRatio} onChange={e => { const v=Number(e.target.value); if(v>loopStartRatio)setLoopEndRatio(v); }} />
                    </div>
                  </div>
                )}
              </div>

           </div>

           {/* Timbre Controls */}
           <div id="tour-eq" className={`control-panel glass-panel ${activeTarget === 'tour-eq' ? 'tour-highlight' : ''}`}>
              <h3>OVERTONES</h3>
              <div className="harmonics-sliders">
                 {harmonics.map((val, i) => (
                   <div className="harmonic-slider" key={i} title={`Harmonic ${i+1}`}>
                      <NumInput 
                         value={val} 
                         onChange={(n: number) => {
                            const newH = [...harmonics];
                            newH[i] = n;
                            setHarmonics(newH);
                         }} 
                         min={-24} max={24} 
                      />
                      <input 
                         type="range" 
                         {...{orient: "vertical"} as any}
                         min="-24" max="24" step="1"
                         value={val} 
                         onChange={e => {
                            const newH = [...harmonics];
                            newH[i] = Number(e.target.value);
                            setHarmonics(newH);
                         }} 
                      />
                      <span className="harmonic-value">dB</span>
                   </div>
                 ))}
              </div>

              <h3 style={{marginTop: 32}}>MASTER EQ</h3>
              <GraphicEQ 
                 low={eqLow} mid={eqMid} high={eqHigh}
                 setLow={setEqLow} setMid={setEqMid} setHigh={setEqHigh}
              />
           </div>

           {/* Envelope & Flux */}
           <div id="tour-envelope" className={`control-panel glass-panel ${activeTarget === 'tour-envelope' ? 'tour-highlight' : ''}`}>
              <h3>Envelope & Flux</h3>
              <div className="control-group">
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  Attack
                  <NumInput value={attack} onChange={setAttack} min={0} max={2} suffix="s" />
                </label>
                <input 
                  type="range" min="0" max="2" step="0.01" 
                  value={attack} 
                  onChange={e => setAttack(Number(e.target.value))} 
                />
              </div>
              <div className="control-group">
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  Sustain Falloff / Release
                  <NumInput value={release} onChange={setRelease} min={0.1} max={5} suffix="s" />
                </label>
                <input 
                  type="range" min="0.1" max="5" step="0.1" 
                  value={release} 
                  onChange={e => setRelease(Number(e.target.value))} 
                />
              </div>
              <div className="control-group">
                <label>Attack Curve ({attackShape})</label>
                <div style={{display: 'flex', gap: 8, marginTop: 4, height: 40}}>
                   <button 
                     className={`shape-btn ${attackShape === 'analog' ? 'active' : ''}`}
                     onClick={() => setAttackShape('analog')}
                     title="Analog (Exponential Attack)"
                   >
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                       <path d="M4 20 Q4 4 20 4" strokeLinecap="round" strokeLinejoin="round" />
                     </svg>
                   </button>
                   <button 
                     className={`shape-btn ${attackShape === 'linear' ? 'active' : ''}`}
                     onClick={() => setAttackShape('linear')}
                     title="Digital (Linear Attack)"
                   >
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                       <path d="M4 20 L20 4" strokeLinecap="round" strokeLinejoin="round" />
                     </svg>
                   </button>
                </div>
              </div>
              <div className="control-group">
                <label>Release Curve ({releaseShape})</label>
                <div style={{display: 'flex', gap: 8, marginTop: 4, height: 40}}>
                   <button 
                     className={`shape-btn ${releaseShape === 'analog' ? 'active' : ''}`}
                     onClick={() => setReleaseShape('analog')}
                     title="Analog (Exponential RC Decay)"
                   >
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                       <path d="M4 4 Q4 20 20 20" strokeLinecap="round" strokeLinejoin="round" />
                     </svg>
                   </button>
                   <button 
                     className={`shape-btn ${releaseShape === 'linear' ? 'active' : ''}`}
                     onClick={() => setReleaseShape('linear')}
                     title="Digital (Linear Decay)"
                   >
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                       <path d="M4 4 L20 20" strokeLinecap="round" strokeLinejoin="round" />
                     </svg>
                   </button>
                </div>
              </div>
              <div className="control-group" style={{marginTop: 8}}>
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  Flux Depth
                  <NumInput value={flux} onChange={setFlux} min={0} max={1} />
                </label>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={flux} 
                  onChange={e => setFlux(Number(e.target.value))} 
                />
              </div>

              <div className="control-group" style={{marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  Space (Reverb) Mix
                  <NumInput value={reverbMix} onChange={setReverbMix} min={0} max={1} />
                </label>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={reverbMix} 
                  onChange={e => setReverbMix(Number(e.target.value))} 
                />
              </div>
              <div className="control-group">
                <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  Delay Mix
                  <NumInput value={delayMix} onChange={setDelayMix} min={0} max={1} />
                </label>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={delayMix} 
                  onChange={e => setDelayMix(Number(e.target.value))} 
                />
              </div>

           </div>
        </div>

        {/* Bottom Third: Expanded Keyboard */}
        <div id="tour-keyboard" className={`keyboard-section glass-panel ${activeTarget === 'tour-keyboard' ? 'tour-highlight' : ''}`}>
            <div className="virtual-keyboard">
                {KEYS.map((k) => (
                   <div 
                     key={k.note}
                     className={`key ${k.black ? 'black' : 'white'}`}
                     onMouseDown={() => noteOn(k.note, 100)}
                     onMouseUp={() => noteOff(k.note)}
                     onMouseLeave={() => noteOff(k.note)}
                     onTouchStart={(e) => { e.preventDefault(); noteOn(k.note, 100); }}
                     onTouchEnd={(e) => { e.preventDefault(); noteOff(k.note); }}
                   >
                     <span>{k.label}</span>
                   </div>
                ))}
            </div>
        </div>
      </main>
    </div>
  );
}

export default App;
