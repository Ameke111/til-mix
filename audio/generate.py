"""Render the listening bank from the same phrases used by the site."""

import argparse
import json
import subprocess
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig


folder = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path, help="The ISSAI Piper ONNX file, next to its .onnx.json.")
args = parser.parse_args()

source = "import { LISTENING_CLIPS } from './listening.js'; console.log(JSON.stringify(LISTENING_CLIPS));"
clips = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source], cwd=folder.parent))
voice = PiperVoice.load(args.model)

for index, clip in enumerate(clips):
    speaker = 0 if index % 2 == 0 else 2
    chunks = list(voice.synthesize(clip["kk"], SynthesisConfig(speaker_id=speaker)))
    if not chunks:
        raise ValueError(f"Missing audio for {clip['id']}")
    first = chunks[0]
    padding = bytes(int(first.sample_rate * .13) * first.sample_width * first.sample_channels)
    with wave.open(str(folder / f"{clip['id']}.wav"), "wb") as recording:
        recording.setnchannels(first.sample_channels)
        recording.setsampwidth(first.sample_width)
        recording.setframerate(first.sample_rate)
        recording.writeframes(padding + padding.join(chunk.audio_int16_bytes for chunk in chunks) + padding)
