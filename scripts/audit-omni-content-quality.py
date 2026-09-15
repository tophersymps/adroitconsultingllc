#!/usr/bin/env python3
"""Proof script for Omni content-quality follow-up (t_1b282209 / t_bcb71c5a).

Counts, across every question/check/exam JSON in the 6 non-OmniStudio learn
series:
  1. correct answers that are colon-terminated (dangling lead-in fragments)
  2. correct answers shorter than 40 characters (incomplete fragments)
  3. correct answers ending in a Unicode ellipsis '\\u2026' (mid-sentence
     truncation of the lesson excerpt)
  4. comprehension questions whose distractor is a real lesson statement
     (near-equivalent -> two-defensible-answers ambiguity)

Exits 0 only if ALL counts are zero. Print a machine-readable summary.
"""
import json, os, re, sys

LEARN = os.path.expanduser("~/Documents/Fortress-of-Solitude/adroit-blog/content/learn")
SERIES = [
    "salesforce-architect", "agentic-ai", "ai-at-work",
    "hermes-consultant", "hermes-consultant-intermediate",
    "hermes-consultant-advanced",
]
MIN_LEN = 40

def harvest_lesson_sentences(body):
    """Same extraction the generator uses, so comprehension distractors are
    compared against the lesson sentences the generator could have chosen."""
    body = re.sub(r"\[\^\d+\].*", "", body)
    body = body.split("## Try it")[0]
    body = body.split("## What's next")[0]
    sents = []
    for para in body.split("\n\n"):
        lines = [l for l in para.splitlines() if not l.lstrip().startswith("#")]
        s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", "\n".join(lines))
        s = re.sub(r"[*_`>#]", "", s).strip()
        s = re.sub(r"\s+", " ", s)
        if not s or len(s) < MIN_LEN:
            continue
        for p in re.split(r"(?<=[.!?])\s+(?=[A-Z\u201c])", s):
            p = p.strip()
            if len(p) < MIN_LEN or p.endswith(":") or p.endswith("\u2026"):
                continue
            sents.append(p)
    seen = set()
    return [x for x in sents if not (x in seen or seen.add(x))]

def lesson_sentences_for(series, slug):
    mdx = os.path.join(LEARN, series, slug + ".mdx")
    if not os.path.isfile(mdx):
        return []
    text = open(mdx, encoding="utf-8").read()
    m = re.search(r"^---\n(.*?)\n---", text, re.DOTALL)
    body = text[m.end():] if m else text
    return harvest_lesson_sentences(body)

def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()

def main():
    colon = short = ellipsis = ambiguous = total = 0
    problems = []
    for series in SERIES:
        base = os.path.join(LEARN, series)
        for root, _, files in os.walk(base):
            for fn in sorted(files):
                if not fn.endswith(".json"):
                    continue
                rel = os.path.relpath(os.path.join(root, fn), LEARN)
                try:
                    data = json.load(open(os.path.join(root, fn), encoding="utf-8"))
                except Exception:
                    problems.append(f"{rel}: unparseable")
                    continue
                for i, q in enumerate(data.get("questions", [])):
                    opts = q.get("options", [])
                    ci = q.get("correct_answer_index")
                    if ci is None or ci >= len(opts):
                        continue
                    total += 1
                    ans = opts[ci].rstrip()
                    if ans.endswith(":"):
                        colon += 1; problems.append(f"COLON {rel} q{i}: {ans[:50]!r}")
                    if ans.endswith("\u2026"):
                        ellipsis += 1; problems.append(f"ELLIPSIS {rel} q{i}: {ans[:60]!r}")
                    if len(ans) < MIN_LEN:
                        short += 1; problems.append(f"SHORT {rel} q{i} ({len(ans)}): {ans[:50]!r}")
                    # ambiguity: distractor near-equal to a real lesson sentence?
                    stem = (q.get("question") or "")
                    if "which conclusion does" in stem.lower() or \
                       "best reflects the lesson" in stem.lower() or \
                       "central focus" in stem.lower():
                        slug = fn[:-5]
                        lsn = [norm(s) for s in lesson_sentences_for(series, slug)]
                        n_ans = norm(ans)
                        for j, o in enumerate(opts):
                            if j == ci:
                                continue
                            no = norm(o)
                            if no and no in lsn:
                                ambiguous += 1
                                problems.append(
                                    f"AMBIG {rel} q{i}: distractor {j} is a real lesson sentence: {o[:50]!r}")
    print(f"series={len(SERIES)} correct_answers_scanned={total}")
    print(f"colon_terminated={colon} short_lt{MIN_LEN}={short} "
          f"ellipsis_terminated={ellipsis} ambiguous_comprehension_distractor={ambiguous}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("RESULT: PASS — zero correct-answer fragment / zero ambiguous-distractor defects.")
    sys.exit(0)

if __name__ == "__main__":
    main()
