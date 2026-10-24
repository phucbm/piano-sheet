"""Audio -> MIDI with ByteDance's piano transcription model.

Usage: uv run python scripts/transcribe.py output/song.wav output/song.mid
"""
import sys

import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

wav, out = sys.argv[1], sys.argv[2]
audio, _ = librosa.load(wav, sr=sample_rate, mono=True)
PianoTranscription(device="cpu", checkpoint_path="models/piano_crnn.pth").transcribe(audio, out)
print("wrote", out)
