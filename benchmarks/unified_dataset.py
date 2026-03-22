import os
import glob
import json
import torch
import librosa
from torch.utils.data import Dataset, DataLoader

class OmnistrumentDataset(Dataset):
    """
    A unified dataset loader for Omnistrument benchmarking.
    It expects data in standard folders under a root data directory.
    Currently supports a generic structure, can be extended for NSynth JSON annotations.
    """
    def __init__(self, data_root, target_sample_rate=44100):
        self.data_root = data_root
        self.target_sample_rate = target_sample_rate
        self.samples = []
        
        # Find all testing audio files
        self._find_files()

    def _find_files(self):
        # A simple glob to find audio files. 
        # In actual usage, this expands to parse ground-truth metadata files.
        search_pattern = os.path.join(self.data_root, '**', '*.[wW][aA][vV]')
        wav_files = glob.glob(search_pattern, recursive=True)
        search_pattern_flac = os.path.join(self.data_root, '**', '*.[fF][lL][aA][cC]')
        flac_files = glob.glob(search_pattern_flac, recursive=True)
        
        all_files = wav_files + flac_files
        
        for file_path in all_files:
            # We would parse the MIDI note or ground truth pitch from the file name or a JSON here.
            # Sticking a dummy dictionary for the stub.
            self.samples.append({
                'filepath': file_path,
                'true_midi': 60, # Dummy fallback
                'true_pitch_hz': 261.63, # Dummy fallback
                'instrument_class': 'unknown'
            })

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample_info = self.samples[idx]
        filepath = sample_info['filepath']
        
        # Load audio using librosa for better cross-platform support than torchaudio
        try:
            # Librosa elegantly handles resampling and mono conversion internally
            waveform_np, _ = librosa.load(filepath, sr=self.target_sample_rate, mono=True)
            waveform = torch.from_numpy(waveform_np).unsqueeze(0) # Convert to [1, Time]
        except Exception as e:
            # Return empty tensor if read fails
            return {
                'filepath': filepath,
                'audio_tensor': torch.zeros((1, 1)),
                'error': str(e)
            }
            
        return {
            'filepath': filepath,
            'audio_tensor': waveform,
            'true_midi': sample_info['true_midi'],
            'true_pitch_hz': sample_info['true_pitch_hz'],
            'instrument_class': sample_info['instrument_class']
        }

def get_dataloader(data_root, batch_size=32, num_workers=0):
    dataset = OmnistrumentDataset(data_root)
    # Using a custom collate_fn if audio files are of different lengths is needed,
    # but for now we iterate sequentially or rely on uniform sample crops.
    # To handle variable length audio in standard DataLoader batched format, we usually pad them.
    
    def pad_collate(batch):
        # basic padding collator
        waveforms = [item['audio_tensor'] for item in batch if 'error' not in item]
        if not waveforms:
            return batch
        max_len = max([w.shape[1] for w in waveforms])
        
        padded_waveforms = []
        filepaths = []
        midis = []
        pitches = []
        
        for item in batch:
            if 'error' in item: continue
            w = item['audio_tensor']
            pad_len = max_len - w.shape[1]
            if pad_len > 0:
                w = torch.nn.functional.pad(w, (0, pad_len))
            padded_waveforms.append(w)
            filepaths.append(item['filepath'])
            midis.append(item['true_midi'])
            pitches.append(item['true_pitch_hz'])
            
        return {
            'filepath': filepaths,
            'audio_tensor': torch.stack(padded_waveforms),
            'true_midi': torch.tensor(midis),
            'true_pitch_hz': torch.tensor(pitches)
        }

    return DataLoader(dataset, batch_size=batch_size, shuffle=True, collate_fn=pad_collate, num_workers=num_workers)
