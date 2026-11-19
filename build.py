from array import array
import json
from math import pi, sin
from pathlib import Path
import shutil
import sys
import wave

ROOT = Path(__file__).resolve().parent
output = ROOT / "dist"
output.mkdir(exist_ok=True)
for name in ("index.html", "style.css", "app.mjs", "audio.mjs", "core.mjs", "storage.mjs", "tempo.mjs", "count-voice.mjs", "adfit.mjs"):
    shutil.copyfile(ROOT / "src" / name, output / name)

count_source = ROOT / "src" / "count"
count_output = output / "count"
count_output.mkdir(exist_ok=True)
count_files = []
for name in [*(f"{rep:02d}.mp3" for rep in range(1, 21)), "preview.mp3"]:
    source = count_source / name
    target = count_output / name
    if source.is_file():
        shutil.copyfile(source, target)
        count_files.append(name)
    else:
        target.unlink(missing_ok=True)
(count_output / "manifest.json").write_text(json.dumps(count_files), encoding="utf-8")

# Chrome on Android classifies media longer than five seconds as persistent.
sample_rate = 8_000
samples = array("h", [0]) * (sample_rate * 60)
for start, length, frequency in ((0.08, 0.13, 587), (0.25, 0.17, 784)):
    offset = round(start * sample_rate)
    count = round(length * sample_rate)
    for i in range(count):
        envelope = sin(pi * i / count) ** 2
        samples[offset + i] = round(3_900 * envelope * sin(2 * pi * frequency * i / sample_rate))
if sys.byteorder == "big":
    samples.byteswap()
with wave.open(str(output / "carrier.wav"), "wb") as audio:
    audio.setparams((1, 2, sample_rate, 0, "NONE", "not compressed"))
    audio.writeframes(samples.tobytes())
print("Built dist/")
