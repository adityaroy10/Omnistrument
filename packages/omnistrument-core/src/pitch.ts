/**
 * YIN Pitch Detection Algorithm
 *
 * Detects the fundamental frequency of a monophonic audio signal.
 * Based on: de Cheveigné & Kawahara (2002) "YIN, a fundamental frequency estimator
 * for speech and music." JASA 111(4), pp. 1917–1930.
 *
 * Tuned for real-time browser audio at 44100 Hz with a 4096-sample window,
 * covering ~21 Hz (sub-bass) to 3000 Hz.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const windowSize = Math.min(buffer.length, 4096);
  const halfWindow = Math.floor(windowSize / 2);
  const yinBuffer = new Float32Array(halfWindow);

  // Step 0: RMS gate — reject signals that are effectively silent
  let rms = 0;
  for (let i = 0; i < windowSize; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / windowSize);
  if (rms < 0.01) return null;

  // Step 1: Squared Difference Function
  for (let tau = 0; tau < halfWindow; tau++) {
    let sum = 0;
    for (let i = 0; i < halfWindow; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    yinBuffer[tau] = sum;
  }

  // Step 2: Cumulative Mean Normalized Difference Function (CMNDF)
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfWindow; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] = (yinBuffer[tau] * tau) / (runningSum + 1e-10);
  }

  // Step 3: Absolute thresholding — find first dip below 0.15
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

  // Fallback: use the global minimum if no dip passed the strict threshold
  if (tauEstimate === -1) {
    let minVal = Infinity;
    for (let tau = 2; tau < halfWindow; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau];
        tauEstimate = tau;
      }
    }
    // If the best estimate is still above 0.5, the signal is essentially unpitched noise
    if (minVal > 0.5) return null;
  }

  // Step 4: Parabolic interpolation — sub-sample accuracy
  let betterTau = tauEstimate;
  if (tauEstimate > 0 && tauEstimate < halfWindow - 1) {
    const s0 = yinBuffer[tauEstimate - 1];
    const s1 = yinBuffer[tauEstimate];
    const s2 = yinBuffer[tauEstimate + 1];
    betterTau = tauEstimate + (0.5 * (s0 - s2)) / (s0 - 2 * s1 + s2 + 1e-10);
  }

  const pitch = sampleRate / betterTau;

  // Reject pitches outside the realistic musical range
  if (pitch < 20 || pitch > 3000) return null;

  return pitch;
}
