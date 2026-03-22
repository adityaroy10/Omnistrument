export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  // Simple Autocorrelation Pitch Detection - OPTIMIZED
  // Only analyze a subset of the audio to prevent UI freezing.
  // 50Hz = 20ms period = ~882 samples. 4096 samples provides a great window for pitch detection
  const windowSize = Math.min(buffer.length, 4096); 
  const maxOffset = Math.min(buffer.length, Math.floor(sampleRate / 50)); // Don't look lower than 50Hz context

  let maxVal = -1;
  let maxStrPos = -1;
  let rms = 0;

  for (let i = 0; i < windowSize; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / windowSize);
  if (rms < 0.01) return null; // Signal too quiet

  let foundZeroCross = false;
  for (let offset = 0; offset < maxOffset; offset++) {
    let corr = 0;
    for (let i = 0; i < windowSize; i++) {
        // Prevent out of bounds
        if (i + offset < buffer.length) {
            corr += buffer[i] * buffer[i + offset];
        }
    }
    
    // Ignore the peak at offset 0
    if (offset > 0 && corr < 0) {
      foundZeroCross = true;
    }
    
    if (foundZeroCross && corr > maxVal) {
      maxVal = corr;
      maxStrPos = offset;
    }
  }

  if (maxStrPos === -1) return null;
  const pitch = sampleRate / maxStrPos;
  
  // Guard against unrealistic high pitches from noise
  if (pitch > 3000) return null; 
  
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
