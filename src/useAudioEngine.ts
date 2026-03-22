import { useState, useRef } from 'react';

export function useAudioEngine(onRecordingComplete?: (buffer: AudioBuffer) => void) {
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const initContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
    }
  };

  const startRecording = async () => {
    initContext();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioData = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioData.arrayBuffer();
        const audioCtx = audioContextRef.current!;
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        if (onRecordingComplete) onRecordingComplete(decodedBuffer);
      };

      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      // Fallback alert for users
      alert("Microphone processing failed. Check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return {
    isRecording,
    startRecording,
    stopRecording,
    audioContext: audioContextRef.current
  };
}
