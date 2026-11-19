from pathlib import Path
import shutil
import wave

ROOT = Path(__file__).resolve().parent
output = ROOT / "dist"
output.mkdir(exist_ok=True)
for name in ("index.html", "style.css", "app.mjs", "audio.mjs", "core.mjs", "storage.mjs", "tempo.mjs"):
    shutil.copyfile(ROOT / "src" / name, output / name)
with wave.open(str(output / "carrier.wav"), "wb") as audio:
    audio.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
    audio.writeframes(bytes(16000))
print("Built dist/")
