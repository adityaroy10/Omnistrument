export function fft(real: Float32Array, imag: Float32Array) {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = real[j]; const ti = imag[j];
      real[j] = real[i]; imag[j] = imag[i];
      real[i] = tr; imag[i] = ti;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const tablestep = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; j < i + halfSize; j++, k += tablestep) {
        const theta = -2 * Math.PI * k / n;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const tpre = cosT * real[j + halfSize] - sinT * imag[j + halfSize];
        const tpim = sinT * real[j + halfSize] + cosT * imag[j + halfSize];
        real[j + halfSize] = real[j] - tpre;
        imag[j + halfSize] = imag[j] - tpim;
        real[j] += tpre;
        imag[j] += tpim;
      }
    }
  }
}

export function drawSpectrogramCanvas(canvas: HTMLCanvasElement, buffer: AudioBuffer | null) {
   if (!buffer || !canvas) return;
   const ctx = canvas.getContext('2d');
   if (!ctx) return;
   
   const width = canvas.width;
   const height = canvas.height;
   const data = buffer.getChannelData(0);
   
   // Keep FFT size relatively small so it draws instantly without blocking the UI
   const fftSize = 512;
   const overlap = 256;
   const step = fftSize - overlap;
   const columns = Math.floor((data.length - fftSize) / step);
   
   ctx.fillStyle = '#0b0f19'; 
   ctx.fillRect(0, 0, width, height);

   // Max chunks to stop it from freezing if the recording is insane
   const maxCols = Math.min(columns, 800); 
   const colWidth = width / maxCols;
   const rowHeight = height / (fftSize / 2);

   const real = new Float32Array(fftSize);
   const imag = new Float32Array(fftSize);

   for (let c = 0; c < maxCols; c++) {
       const offset = c * step;
       for (let i = 0; i < fftSize; i++) {
           real[i] = data[offset + i] * (0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)))); // Hann Window
           imag[i] = 0;
       }
       fft(real, imag);
       
       for (let y = 0; y < fftSize / 2; y++) {
           const magnitude = Math.sqrt(real[y]*real[y] + imag[y]*imag[y]);
           const db = 20 * Math.log10(magnitude || 1e-6);
           
           // map -80dB to 0dB to a color scale matching the theme
           const intensity = Math.max(0, Math.min(1, (db + 80) / 80)); 
           if (intensity > 0) {
              const r = Math.floor(intensity * 96);
              const g = Math.floor(intensity * 165);
              const b = Math.floor(intensity * 250); // Matching the accent blue
              ctx.fillStyle = `rgb(${r},${g},${b})`;
              ctx.fillRect(c * colWidth, height - (y + 1) * rowHeight, Math.ceil(colWidth), Math.ceil(rowHeight));
           }
       }
   }
}
