#!/usr/bin/env python3
"""Kokoro TTS engine — one CLI contract for the audio pipeline.

Usage:
    engine_kokoro.py --text "<text>" --voice af_heart --out /tmp/out.mp3 [--lang a] [--speed 1.0] [--bitrate 48k]

Contract: reads text, synthesizes with the given Kokoro preset voice,
writes an audio file (mp3 if a converter/ffmpeg is available, else wav)
to --out. Prints the byte count on success. Exits non-zero with a clear
message on any failure — never fabricates an output file.

Encoding: the emitted MP3 is always MONO at KOKORO_SR (24000 Hz) with the
--bitrate (default 48k, override with the AUDIO_BITRATE env var). This is
the lean profile the storage budget depends on: the private Supabase
'audio' bucket must hold a 91-article backfill inside the Free 1 GB tier,
and mono/24k/128kbps measures ~13.3 MB per article (~1.19 GB for 91) while
mono/24k/48kbps measures ~5 MB (~455 MB for 91). Do not raise the default
without re-checking the bucket budget.

Kokoro samples at 24000 Hz. Run from the engine's directory (or with the
venv active) so Kokoro's internal `uv`/spacy model-download subprocess can
find the virtualenv; from arbitrary cwd it may fail to auto-fetch spacy's
`en_core_web_sm`.
"""
import argparse
import json
import os
import sys

KOKORO_SR = 24000
# Lean storage profile: mono / KOKORO_SR / 48kbps fits a 91-article backfill
# in the Supabase Free 1 GB storage tier with margin (~5 MB/article).
DEFAULT_BITRATE = os.environ.get("AUDIO_BITRATE") or "48k"

def main():
    ap = argparse.ArgumentParser(description="Kokoro TTS engine")
    ap.add_argument("--text", required=True)
    ap.add_argument("--voice", required=True, help="e.g. af_heart, am_michael, bf_emma")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="a", help="kokoro lang_code; default 'a' (American English)")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--bitrate", default=DEFAULT_BITRATE,
                    help=("MP3 bitrate for the emitted narration; the output is always "
                          "mono at 24000 Hz. Default '48k' (lean storage profile), "
                          "overridable with the AUDIO_BITRATE env var."))
    ap.add_argument("--timing", default=None,
                    help=("Optional path to write a SegmentTiming[] JSON manifest: "
                          "[{text, startSec, endSec}, ...] capturing each Kokoro "
                          "segment's cumulative offset (sample_rate=24000-known)."))
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
        # Concatenate the segment tensors BUT preserve the cumulative
        # boundaries: each segment's start/end sample offset in the final
        # audio is the running sample count. Those boundaries ARE the exact
        # paragraph (sub-segment) timings — the audio pipeline historically
        # discarded them (plan Tier C fix).
        chunks = [s.audio.detach().cpu().numpy() for s in segs]
        audio = np.concatenate(chunks)
        if args.timing:
            timings = []
            total = 0
            for s, chunk in zip(segs, chunks):
                start = total / KOKORO_SR
                total += chunk.shape[0]
                end = total / KOKORO_SR
                # Kokoro Result exposes the spoken phrase as `.graphemes`
                # (there is no `.text` attribute on the Result object) — strip
                # it to newline-free text for the manifest.
                phrase = (getattr(s, "graphemes", "") or "").strip()
                timings.append({"text": phrase, "startSec": round(start, 3), "endSec": round(end, 3)})
            timing_dir = os.path.dirname(args.timing) or "."
            os.makedirs(timing_dir, exist_ok=True)
            with open(args.timing, "w", encoding="utf-8") as fh:
                json.dump(timings, fh, ensure_ascii=False, indent=2)
            print(f"OK_TIMING segments={len(timings)} -> {args.timing}", file=sys.stderr)
        out_path = write_audio(audio, args.out, KOKORO_SR, args.bitrate)
        size = os.path.getsize(out_path)
        print(f"OK out={out_path} bytes={size} sr={KOKORO_SR}")
    except Exception as e:  # noqa: BLE001
        print(f"SYNTH_ERROR: {e}", file=sys.stderr)
        sys.exit(4)

def write_audio(audio, out_path, sr, bitrate=DEFAULT_BITRATE):
    """audio is a torch.Tensor (or numpy) of float samples. Write wav, and
    mp3 too if a converter is available; prefer mp3 for the pipeline.

    The MP3 is ALWAYS mono at `sr` (24000) with `bitrate` (default 48k): the
    private bucket has to hold a 91-article backfill inside the Free 1 GB
    storage tier, so the lean profile is the contract, not a preference.
    """
    import numpy as np
    import soundfile as sf

    if hasattr(audio, "detach"):  # torch.Tensor
        audio = audio.detach().cpu().numpy()
    audio = np.ascontiguousarray(audio)

    wav_path = out_path.rsplit(".", 1)[0] + ".wav"
    sf.write(wav_path, audio, sr)

    if out_path.endswith(".mp3"):
        # ffmpeg CLI first: it is the only path that lets us pin mono +
        # sample rate + bitrate explicitly. Homebrew `brew install ffmpeg`.
        try:
            import subprocess
            subprocess.run(
                ["ffmpeg", "-y", "-i", wav_path,
                 "-ac", "1", "-ar", str(sr),
                 "-codec:a", "libmp3lame", "-b:a", bitrate,
                 "-map_metadata", "-1", out_path],
                check=True, capture_output=True,
            )
            os.remove(wav_path)
            return out_path
        except Exception:
            pass
        # Fallback: pydub (bundled ffmpeg) — same mono/sr/bitrate pinning.
        try:
            from pydub import AudioSegment  # optional; needs ffmpeg
            seg = AudioSegment.from_wav(wav_path).set_channels(1).set_frame_rate(sr)
            seg.export(out_path, format="mp3", bitrate=bitrate,
                       parameters=["-map_metadata", "-1"])
            os.remove(wav_path)
            return out_path
        except Exception as e:  # noqa: BLE001 — no converter at all: keep wav
            print(f"NO_MP3_CONVERTER (kept wav): {e}", file=sys.stderr)
            return wav_path
    return wav_path

if __name__ == "__main__":
    main()
