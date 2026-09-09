#!/usr/bin/env python3
"""Generate OmniStudio cert quiz JSON tiers from the canonical curriculum.

Reads ~/.hermes/scripts/omni-studio-curriculum.py (source of truth: 46
requirements x 3 questions) and emits, into the blog repo:

    content/learn/omni-studio-cert/questions/<slug>.json   # 46 files, 3 q each
    content/learn/omni-studio-cert/checks/check-<1..9>.json  # 9 files, 15 q each
    content/learn/omni-studio-cert/exam.json                 # 60 q, domain-weighted

Tier spec (course-progression pattern, ADR-101):
    quizName:  omni-studio-cert:lesson:<slug> | :check:<n> | :exam
    check n   = lessons [5n-4 .. 5n] (check-9 = lessons 41-45; lesson 46 is not
                pooled into any check)
    exam      = 60 questions stratified by blueprint domain weights
                (Fundamentals 18% / FlexCards 15% / OmniScripts 20% /
                 IP 15% / Data Mappers 17% / Troubleshooting 15% -> 11/9/12/9/10/9)

Idempotent: fixed random seed + deterministic ordering, and the generator-owned
directories are cleared first, so reruns produce identical output.

Usage: python3 generate-omni-quizzes.py [--print-summary]
"""
import argparse
import importlib.util
import json
import os
import random
import re
import sys

REPO = os.path.expanduser("~/Documents/Fortress-of-Solitude/adroit-blog")
OUT = os.path.join(REPO, "content/learn/omni-studio-cert")
CURRICULUM_PATH = os.path.expanduser("~/.hermes/scripts/omni-studio-curriculum.py")
EXAM_SEED = 20260810  # fixed -> idempotent exam sampling

# Blueprint domain weights for 60 exam questions (11/9/12/9/10/9 = 60).
# Order matches the official exam guide domain list.
EXAM_WEIGHTS = {
    "OmniStudio Fundamentals": 11,
    "FlexCards": 9,
    "OmniScripts": 12,
    "Integration Procedures": 9,
    "Data Mappers": 10,
    "Troubleshooting & Debugging": 9,
}


def load_curriculum():
    spec = importlib.util.spec_from_file_location("osc", CURRICULUM_PATH)
    osc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(osc)
    return osc.CURRICULUM


def existing_lesson_slugs():
    """day -> slug map from published MDX frontmatter (source of truth)."""
    slugs = {}
    learn_dir = os.path.join(OUT)
    if not os.path.isdir(learn_dir):
        return slugs
    for fn in sorted(os.listdir(learn_dir)):
        if not fn.endswith(".mdx"):
            continue
        path = os.path.join(learn_dir, fn)
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        m_slug = re.search(r"^slug:\s*(\S+)", text, re.MULTILINE)
        m_lesson = re.search(r"^lesson:\s*(\d+)", text, re.MULTILINE)
        if m_slug and m_lesson:
            slugs[int(m_lesson.group(1))] = m_slug.group(1).strip()
    return slugs


def slugify_title(title):
    """Title slug matching the daily cron's observed behavior for lessons 6-8:
    lowercase, drop '&', '/' -> '-', strip punctuation, spaces -> '-',
    cap at 50 chars. Lesson id prefix is added separately (see lesson_slug)."""
    s = title.lower()
    s = s.replace("&", "").replace("/", "-").replace(",", "")
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    return s[:50].rstrip("-")


def lesson_slug(entry, known_slugs):
    """Canonical quiz-sidecar slug for a lesson: exact MDX slug when the lesson
    is published, else deterministic day-NN-<id.lower()>-<title-slug> (matches
    the cron's `day-NN-<requirement-id>-<slug>` pattern)."""
    day = entry["day"]
    if day in known_slugs:
        return known_slugs[day]
    rid = entry["id"].lower()  # e.g. fc-3, os-1, ip-5, dm-2, t-4
    return f"day-{day:02d}-{rid}-{slugify_title(entry['title'])}"


def to_question(q):
    """Curriculum question tuple -> QuizQuestion JSON object."""
    if isinstance(q, dict):
        qtext = q.get("q", q.get("question", ""))
        options = q.get("options", [])
        answer = q.get("answer", q.get("correct", ""))
        expl = q.get("explanation", "")
    else:
        qtext, options, answer, *rest = q
        expl = rest[0] if rest else ""
    if isinstance(answer, str) and len(answer) == 1 and answer.isalpha():
        index = ord(answer.upper()) - ord("A")
    else:
        # numeric fallback (0-based)
        index = int(answer)
    return {
        "question": qtext,
        "options": list(options),
        "correct_answer_index": index,
        "explanation": expl,
    }


def emit_lesson_files(curriculum, known_slugs):
    """questions/<slug>.json — 3 questions per lesson (canonical first three)."""
    qdir = os.path.join(OUT, "questions")
    os.makedirs(qdir, exist_ok=True)
    written = []
    for entry in curriculum:
        slug = lesson_slug(entry, known_slugs)
        questions = [to_question(q) for q in entry["questions"][:3]]
        data = {
            "quizName": f"omni-studio-cert:lesson:{slug}",
            "title": f"Lesson {entry['day']} — {entry['title']}",
            "description": entry["req"],
            "questions": questions,
        }
        path = os.path.join(qdir, f"{slug}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        written.append((entry["day"], slug, len(questions)))
    return written


def emit_check_files(curriculum, known_slugs):
    """checks/check-<n>.json — 15 questions pooled from lessons [5n-4 .. 5n]."""
    cdir = os.path.join(OUT, "checks")
    os.makedirs(cdir, exist_ok=True)
    by_day = {entry["day"]: entry for entry in curriculum}
    written = []
    for n in range(1, 10):
        first = 5 * n - 4
        last = 5 * n
        questions = []
        topics = []
        for day in range(first, last + 1):
            entry = by_day.get(day)
            if not entry:
                continue
            if entry["domain"] not in topics:
                topics.append(entry["domain"])
            questions.extend(to_question(q) for q in entry["questions"][:3])
        data = {
            "quizName": f"omni-studio-cert:check:{n}",
            "title": f"Knowledge Check {n} — Lessons {first}–{last}",
            "description": (
                f"Fifteen questions pooled from Lessons {first}–{last} — "
                f"{' · '.join(topics)}. Pass with 80% or higher to move toward "
                "unlocking the cert prep exam."
            ),
            "questions": questions,
        }
        path = os.path.join(cdir, f"check-{n}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        written.append((n, first, last, len(questions)))
    return written


def emit_exam_file(curriculum):
    """exam.json — 60 questions stratified to the blueprint domain weights.

    Deterministic: fixed EXAM_SEED. Each domain pool is shuffled once and the
    top EXAM_WEIGHTS[domain] are taken; domains appear in blueprint order.
    """
    pool = {}
    for entry in curriculum:
        domain = entry["domain"]
        # lesson quiz takes the canonical 3; any extras still join the exam pool
        for q in entry["questions"]:
            pool.setdefault(domain, []).append(to_question(q))

    rng = random.Random(EXAM_SEED)
    selected = []
    for domain, want in EXAM_WEIGHTS.items():
        qs = list(pool.get(domain, []))
        rng.shuffle(qs)
        selected.extend(qs[:want])

    data = {
        "quizName": "omni-studio-cert:exam",
        "title": "OmniStudio Developer Certification — Practice Exam",
        "description": (
            "60-question timed practice exam mirroring the official blueprint "
            "domain weights. 105 minutes, pass with 72% or higher."
        ),
        "questions": selected,
    }
    path = os.path.join(OUT, "exam.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return selected


def clear_generated():
    """Remove previously generated quiz JSONs so reruns are clean/idempotent."""
    for rel in ("questions", "checks"):
        d = os.path.join(OUT, rel)
        if os.path.isdir(d):
            for fn in os.listdir(d):
                if fn.endswith(".json"):
                    os.remove(os.path.join(d, fn))
    exam = os.path.join(OUT, "exam.json")
    if os.path.exists(exam):
        os.remove(exam)


def verify(curriculum, lesson_files, check_files, exam_questions):
    """Run the task's required verifications; returns list of problems."""
    problems = []

    # 1. counts
    if len(lesson_files) != 46:
        problems.append(f"expected 46 lesson files, got {len(lesson_files)}")
    for day, slug, n in lesson_files:
        if n != 3:
            problems.append(f"lesson {day} ({slug}): expected 3 q, got {n}")

    if len(check_files) != 9:
        problems.append(f"expected 9 check files, got {len(check_files)}")
    for n, first, last, cnt in check_files:
        if cnt != 15:
            problems.append(f"check-{n} (lessons {first}-{last}): expected 15 q, got {cnt}")

    if len(exam_questions) != 60:
        problems.append(f"expected 60 exam questions, got {len(exam_questions)}")

    # 2. exam domain weights within ±1 of blueprint percentage
    from collections import Counter
    # recompute from the emitted file (simplest, mirrors json.tool read)
    with open(os.path.join(OUT, "exam.json"), encoding="utf-8") as f:
        exam_data = json.load(f)
    # map each exam question back to its domain via curriculum question text
    text_to_domain = {}
    for entry in curriculum:
        for q in entry["questions"]:
            text_to_domain[q[0]] = entry["domain"]
    dom_counts = Counter(text_to_domain.get(q["question"], "?") for q in exam_data["questions"])
    blueprint_pct = {
        "OmniStudio Fundamentals": 18,
        "FlexCards": 15,
        "OmniScripts": 20,
        "Integration Procedures": 15,
        "Data Mappers": 17,
        "Troubleshooting & Debugging": 15,
    }
    for domain, pct in blueprint_pct.items():
        got = dom_counts.get(domain, 0)
        expected = pct / 100.0 * 60
        if abs(got - expected) > 1.0:
            problems.append(
                f"exam domain {domain}: {got} q vs blueprint {pct}% ({expected:.1f} expected, ±1)"
            )
    if sum(dom_counts.values()) != 60:
        problems.append(f"exam domain counts sum to {sum(dom_counts.values())}, not 60")

    # 3. every emitted file parses (json.tool equivalent) and has quizName
    json_files = []
    qdir = os.path.join(OUT, "questions")
    cdir = os.path.join(OUT, "checks")
    json_files.extend(
        os.path.join(qdir, f) for f in sorted(os.listdir(qdir)) if f.endswith(".json")
    )
    json_files.extend(
        os.path.join(cdir, f) for f in sorted(os.listdir(cdir)) if f.endswith(".json")
    )
    json_files.append(os.path.join(OUT, "exam.json"))
    for path in json_files:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            problems.append(f"unparseable {path}: {e}")
            continue
        if not data.get("quizName"):
            problems.append(f"missing quizName in {path}")
        if not isinstance(data.get("questions"), list) or not data["questions"]:
            problems.append(f"missing/empty questions in {path}")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--print-summary", action="store_true")
    args = ap.parse_args()

    curriculum = load_curriculum()
    known_slugs = existing_lesson_slugs()

    clear_generated()
    lesson_files = emit_lesson_files(curriculum, known_slugs)
    check_files = emit_check_files(curriculum, known_slugs)
    exam_questions = emit_exam_file(curriculum)

    problems = verify(curriculum, lesson_files, check_files, exam_questions)

    if args.print_summary:
        print(f"lessons: {len(lesson_files)} files, {sum(f[2] for f in lesson_files)} questions")
        print(f"checks:  {len(check_files)} files, {sum(c[3] for c in check_files)} questions")
        print(f"exam:    {len(exam_questions)} questions (seed {EXAM_SEED})")
        from collections import Counter
        with open(os.path.join(OUT, "exam.json"), encoding="utf-8") as f:
            ed = json.load(f)
        text_to_domain = {}
        for entry in curriculum:
            for q in entry["questions"]:
                text_to_domain[q[0]] = entry["domain"]
        dom_counts = Counter(text_to_domain.get(q["question"], "?") for q in ed["questions"])
        print("exam domains:", dict(dom_counts))

    if problems:
        print("\nVERIFY FAILED:")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print("verify OK: 46 lesson files, 9 check files (15q), exam.json (60q)")


if __name__ == "__main__":
    main()
