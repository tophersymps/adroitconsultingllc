#!/usr/bin/env python3
"""Validate that a learn series meets the Omni bar (ADR-101/104/106).

Checks, for each series in content/learn/:
  1. series.json exists and has name/description/gradient (+ group/subgroup for tiered)
  2. questions/<slug>.json exists for EVERY published .mdx lesson slug,
     each with quizName '<series>:lesson:<slug>', >=3 questions, valid options,
     correct_answer_index in range, explanation present.
  3. checks/check-<n>.json for each 5-lesson block [5n-4,5n] that overlaps
     published lessons; each with quizName '<series>:check:<n>' and >=10 questions.
  4. exam.json present with quizName '<series>:exam' and >=20 questions.
  5. All JSON parses; correct_answer_index valid.

Exit 0 if every tiered series passes; nonzero with a problem list otherwise.
Usage: python3 scripts/validate-omni-bar.py [--series salesforce-architect ...]
"""
import json, os, re, sys

REPO = os.path.expanduser("~/Documents/Fortress-of-Solitude/adroit-blog")
LEARN = os.path.join(REPO, "content", "learn")

# Series that must meet the bar. Omni already does; these are the build-outs.
DEFAULT_SERIES = [
    "salesforce-architect",
    "agentic-ai",
    "ai-at-work",
    "hermes-consultant",
    "hermes-consultant-intermediate",
    "hermes-consultant-advanced",
]

def slug_of(fn):
    return fn[:-4] if fn.endswith(".mdx") else fn

def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def validate_questions(qs, path, problems):
    if not isinstance(qs, list) or len(qs) < 3:
        problems.append(f"{path}: expected >=3 questions, got {len(qs) if isinstance(qs,list) else qs}")
        return
    for i, q in enumerate(qs):
        if not isinstance(q, dict) or not q.get("question"):
            problems.append(f"{path}: question {i} missing text")
        opts = q.get("options")
        if not isinstance(opts, list) or len(opts) < 2:
            problems.append(f"{path}: question {i} needs >=2 options")
        ci = q.get("correct_answer_index")
        if not isinstance(ci, int) or ci < 0 or ci >= len(opts):
            problems.append(f"{path}: question {i} bad correct_answer_index {ci!r}")
        if not q.get("explanation"):
            problems.append(f"{path}: question {i} missing explanation")

def check_series(series, problems):
    base = os.path.join(LEARN, series)
    if not os.path.isdir(base):
        problems.append(f"{series}: missing series dir")
        return
    # 1. series.json
    sj = os.path.join(base, "series.json")
    if not os.path.isfile(sj):
        problems.append(f"{series}: missing series.json")
    else:
        data = load_json(sj)
        for k in ("name", "description", "gradient"):
            if not data.get(k):
                problems.append(f"{series}: series.json missing {k}")
        if not data.get("group"):
            problems.append(f"{series}: series.json missing group (Omni bar)")

    # published lesson slugs from MDX frontmatter
    mdx_slugs = set()
    lesson_num = {}
    for fn in os.listdir(base):
        if fn.endswith(".mdx"):
            with open(os.path.join(base, fn), encoding="utf-8") as f:
                text = f.read()
            m = re.search(r"^slug:\s*(\S+)", text, re.MULTILINE)
            if m:
                mdx_slugs.add(m.group(1).strip())
            m2 = re.search(r"^lesson:\s*(\d+)", text, re.MULTILINE)
            if m and m2:
                lesson_num[m.group(1).strip()] = int(m2.group(1))

    # 2. per-lesson question files
    qdir = os.path.join(base, "questions")
    q_slugs = set()
    if os.path.isdir(qdir):
        for fn in os.listdir(qdir):
            if fn.endswith(".json"):
                q_slugs.add(fn[:-5])
                p = os.path.join(qdir, fn)
                data = load_json(p)
                slug = fn[:-5]
                if data.get("quizName") != f"{series}:lesson:{slug}":
                    problems.append(f"{series}: {fn} quizName mismatch: {data.get('quizName')!r}")
                validate_questions(data.get("questions"), f"{series}/{fn}", problems)
    missing = mdx_slugs - q_slugs
    if missing:
        problems.append(f"{series}: published lessons missing question files: {sorted(missing)}")

    # 3. checks
    cdir = os.path.join(base, "checks")
    max_lesson = max(lesson_num.values()) if lesson_num else 0
    nchecks = (max_lesson + 4) // 5
    check_files = set()
    if os.path.isdir(cdir):
        for fn in os.listdir(cdir):
            m = re.match(r"^check-(\d+)\.json$", fn)
            if m:
                check_files.add(int(m.group(1)))
                data = load_json(os.path.join(cdir, fn))
                if data.get("quizName") != f"{series}:check:{int(m.group(1))}":
                    problems.append(f"{series}: {fn} quizName mismatch")
                validate_questions(data.get("questions"), f"{series}/{fn}", problems)
    for n in range(1, nchecks + 1):
        if n not in check_files:
            problems.append(f"{series}: missing check-{n}.json (lessons {5*n-4}-{5*n})")

    # 4. exam.json
    ex = os.path.join(base, "exam.json")
    if not os.path.isfile(ex):
        problems.append(f"{series}: missing exam.json")
    else:
        data = load_json(ex)
        if data.get("quizName") != f"{series}:exam":
            problems.append(f"{series}: exam.json quizName mismatch: {data.get('quizName')!r}")
        qs = data.get("questions")
        if not isinstance(qs, list) or len(qs) < 20:
            problems.append(f"{series}: exam.json needs >=20 questions, got {len(qs) if isinstance(qs,list) else qs}")
        else:
            validate_questions(qs, f"{series}/exam.json", problems)

def main():
    args = [a for a in sys.argv[1:]]
    series_list = DEFAULT_SERIES
    if args and args[0] == "--series":
        series_list = args[1:]
    problems = []
    for s in series_list:
        check_series(s, problems)
    if problems:
        print("OMNI BAR VIOLATIONS:")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print(f"Omni bar OK for {len(series_list)} series: "
          + ", ".join(series_list))

if __name__ == "__main__":
    main()
