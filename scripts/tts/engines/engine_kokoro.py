#!/usr/bin/env python3
"""Kokoro TTS engine — one CLI contract for the audio pipeline.

Usage:
    engine_kokoro.py --text "<text>" --voice af_heart --out /tmp/out.mp3 [--lang a] [--speed 1.0]

Contract: reads text, synthesizes with the given Kokoro preset voice,
writes an audio file (mp3 if a converter/ffmpeg is available, else wav)
to --out. Prints the byte count on success. Exits non-zero with a clear
message on any failure — never fabricates an output file.

Kokoro samples at 24000 Hz. Run from the engine's directory (or with the
venv active) so Kokoro's internal `uv`/spacy model-download subprocess can
find the virtualenv; from arbitrary cwd it may fail to auto-fetch spacy's
`en_core_web_sm`.
"""
import argparse
import os
import sys

KOKORO_SR = 24000

def write_audio(audio, out_path, sr):
    """audio is a torch.Tensor (or numpy) of float samples. Write wav, and
    mp3 too if a converter is available; prefer mp3 for the pipeline."""
    import numpy as np
    import soundfile as sf

    if hasattr(audio, "detach"):  # torch.Tensor
        audio = audio.detach().cpu().numpy()
    audio = np.ascontiguousarray(audio)

    wav_path = out_path.rsplit(".", 1)[0] + ".wav"
    sf.write(wav_path, audio, sr)

    if out_path.endswith(".mp3"):
        # Prefer pydub (bundled ffmpeg), else fall back to the ffmpeg CLI
        # directly (Homebrew `brew install ffmpeg` on this Mac).
        try:
            from pydub import AudioSegment  # optional; needs ffmpeg
            AudioSegment.from_wav(wav_path).export(out_path, format="mp3", bitrate="128k")
            os.remove(wav_path)
            return out_path
        except Exception:
            pass
        try:
            import subprocess
            subprocess.run(
                ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame",
                 "-b:a", "128k", out_path],
                check=True, capture_output=True,
            )
            os.remove(wav_path)
            return out_path
        except Exception as e:  # noqa: BLE001 — no converter at all: keep wav
            print(f"NO_MP3_CONVERTER (kept wav): {e}", file=sys.stderr)
            return wav_path
    return wav_path

def main():
    ap = argparse.ArgumentParser(description="Kokoro TTS engine")
    ap.add_argument("--text", required=True)
    ap.add_argument("--voice", required=True, help="e.g. af_heart, am_michael, bf_emma")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="a", help="kokoro lang_code; default 'a' (American English)")
    ap.add_argument("--speed", type=float, default=1.0)
    args = ap.parse_args()

    try:
        import warnings
        warnings.filterwarnings("ignore")
        from kokoro import KPipeline
    except Exception as e:  # noqa: BLE001
        print(f"KOKORO_NOT_AVAILABLE: {e}", file=sys.stderr)
        sys.exit(2)

    try:
        p = KPipeline(lang_code=args.lang, device="mps")
        segs = list(p(text=args.text, voice=args.voice, speed=args.speed))
        if not segs:
            print("NO_AUDIO: Kokoro returned zero segments", file=sys.stderr)
            sys.exit(3)
        import numpy as np
        audio = np.concatenate([s.audio.detach().cpu().numpy() for s in segs])
        out_path = write_audio(audio, args.out, KOKORO_SR)
        size = os.path.getsize(out_path)
        print(f"OK out={out_path} bytes={size} sr={KOKORO_SR}")
    except Exception as e:  # noqa: BLE001
        print(f"SYNTH_ERROR: {e}", file=sys.stderr)
        sys.exit(4)

if __name__ == "__main__":
    main()