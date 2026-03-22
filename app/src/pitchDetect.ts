export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  // YIN Pitch Detection Algorithm - heavily mitigates octave errors compared to raw AC
  const windowSize = Math.min(buffer.length, 4096); // Extended to 4096 to allow detecting sub-bass down to ~21Hz
  const halfWindow = Math.floor(windowSize / 2);
  const yinBuffer = new Float32Array(halfWindow);
  
  // 0. RMS Gate check - signal too quiet?
  let rms = 0;
  for (let i = 0; i < windowSize; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / windowSize);
  if (rms < 0.01) return null;

  // 1. Difference Function
  for (let tau = 0; tau < halfWindow; tau++) {
      let sum = 0;
      for (let i = 0; i < halfWindow; i++) {
          const delta = buffer[i] - buffer[i + tau];
          sum += delta * delta;
      }
      yinBuffer[tau] = sum;
  }

  // 2. Cumulative Mean Normalized Difference Function (CMNDF)
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfWindow; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] = yinBuffer[tau] * tau / (runningSum + 1e-10); // Prevent div by 0
  }

  // 3. Absolute Thresholding (Find first dip below 0.15)
  const threshold = 0.15;
  let tauEstimate = -1;
  for (let tau = 2; tau < halfWindow; tau++) {
      if (yinBuffer[tau] < threshold) {
          // Find local minimum around this dip
          while (tau + 1 < halfWindow && yinBuffer[tau + 1] < yinBuffer[tau]) {
              tau++;
          }
          tauEstimate = tau;
          break;
      }
  }

  // Fallback: If no pitch passes the strict threshold, use the global minimum.
  if (tauEstimate === -1) {
      let minVal = Infinity;
      for (let tau = 2; tau < halfWindow; tau++) {
          if (yinBuffer[tau] < minVal) {
              minVal = yinBuffer[tau];
              tauEstimate = tau;
          }
      }
      // If the best estimate is terrible, return null (it's unpitched noise)
      if (minVal > 0.5) return null; // Reverted back to 0.5 for cleaner results
  }

  // 4. Parabolic Interpolation (Refines the pitch accuracy)
  let betterTau = tauEstimate;
  if (tauEstimate > 0 && tauEstimate < halfWindow - 1) {
      const s0 = yinBuffer[tauEstimate - 1];
      const s1 = yinBuffer[tauEstimate];
      const s2 = yinBuffer[tauEstimate + 1];
      betterTau = tauEstimate + 0.5 * (s0 - s2) / (s0 - 2 * s1 + s2 + 1e-10);
  }

  const pitch = sampleRate / betterTau;
  
  // Reject unrealistic pitches
  if (pitch > 3000 || pitch < 20) return null; 
  
  return pitch;
}

export function drawWaveformCanvas(canvas: HTMLCanvasElement, buffer: AudioBuffer | null) {
  if (!buffer || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / width));

  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.strokeStyle = '#60a5fa'; // var(--accent)
  ctx.lineWidth = 2;

  for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
          const val = data[(i * step) + j] || 0;
          if (val < min) min = val;
          if (val > max) max = val;
      }
      ctx.lineTo(i, (1 + min) * height / 2);
      ctx.lineTo(i, (1 + max) * height / 2);
  }
  ctx.stroke();
}
