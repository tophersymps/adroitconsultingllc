#!/usr/bin/env python3
"""Generate Omni-bar quiz content (questions/, checks/, exam.json) for a learn
series by reading its published MDX lessons.

Grounded approach: for each lesson we extract the frontmatter (title, slug,
lesson number, excerpt) and the body's real content sentences, then emit 3
multiple-choice questions whose correct answer and explanation are drawn from
the lesson's own sentences. Per-lesson files land in questions/<slug>.json;
pooled checks land in checks/check-N.json (one per 5-lesson block); a >=20
question exam lands in exam.json.

Existing question files are NEVER overwritten (ai-at-work's hand-authored /
subagent content is preserved); we only fill gaps. series.json group/subgroup
are added if missing.

Usage: python3 scripts/generate-omni-content.py [series ...]
"""
import json, os, re, sys, random

REPO = os.path.expanduser("~/Documents/Fortress-of-Solitude/adroit-blog")
LEARN = os.path.join(REPO, "content", "learn")

DEFAULT_SERIES = [
    "salesforce-architect",
    "agentic-ai",
    "ai-at-work",
    "hermes-consultant",
    "hermes-consultant-intermediate",
    "hermes-consultant-advanced",
]

FRONT = re.compile(r"^---\n(.*?)\n---", re.DOTALL)

def parse_lesson(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    fm = {}
    m = FRONT.match(text)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip().strip('"').strip("'")
    body = text[m.end():] if m else text
    return fm, body

def strip_md(s):
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"[*_`>#]", "", s)
    s = s.replace("**", "").replace("`", "")
    return s.strip()

def clean_sentence(s):
    s = strip_md(s)
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    return s

def harvest_sentences(body):
    """Return real, substantive sentences from the lesson body, in order."""
    # drop footnotes
    body = re.sub(r"\[\^\d+\].*", "", body)
    body = body.split("## Try it")[0]
    body = body.split("## What's next")[0]
    sents = []
    for para in body.split("\n\n"):
        # drop markdown heading lines entirely
        para_lines = [l for l in para.splitlines() if not l.lstrip().startswith("#")]
        para = clean_sentence("\n".join(para_lines))
        if not para or len(para) < 45:
            continue
        # split on sentence boundaries but keep sentences with commas/colons
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\u201c])", para)
        for p in parts:
            p = p.strip()
            if len(p) < 45:
                continue
            # drop colon-terminated lead-in fragments (not complete sentences)
            if p.endswith(":") or p.endswith("\u2026"):
                continue
            # skip pure lists / headings / bullets already stripped
            sents.append(p)
    # dedupe, keep order
    seen = set()
    out = []
    for s in sents:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out

def pick_question_sentences(sents, rng):
    """Pick 2-3 representative sentences spread across the lesson."""
    if not sents:
        return []
    n = len(sents)
    if n == 1:
        return sents
    picks = []
    # first real content sentence (index 0) and a couple spread out
    picks.append(0)
    for idx in (n // 3, (2 * n) // 3, n - 1):
        if idx not in picks and 0 <= idx < n:
            picks.append(idx)
    return [sents[i] for i in sorted(set(picks))[:3]]

def invert_statement(real):
    """Return a plausible-but-wrong inversion of a correct statement, or None.

    Makes the distractor semantically opposite/incorrect rather than a
    near-equivalent true lesson sentence, so a comprehension question never
    has two defensible answers.
    """
    s = real.rstrip(".")
    if not s:
        return None
    # negation rewrites, first match wins; prefer structured claims
    rewrites = [
        (r"\b(is|are)\b", "is not", 1),
        (r"\b(always|usually|typically)\b", "never", 1),
        (r"\b(must|should)\b", "must not", 1),
        (r"\b(requires|needs)\b", "never requires", 1),
        (r"\b(the most|the best|the fastest|the simplest)\b", "the least", 1),
        (r"\b(best|simplest|most important|most reliable)\b", "least important", 1),
        (r"\b(manual|automated|automatic)\b", "manual", 1),
        (r"\b(primary|central|core)\b", "peripheral", 1),
    ]
    for pat, rep, _ in rewrites:
        m = re.search(pat, s, re.IGNORECASE)
        if m:
            frag = re.sub(pat, rep, s[m.start():], count=1)
            out = (s[:m.start()] + frag).strip()
            if len(out) >= 40 and not out.endswith(":"):
                return out + "."
    # fallback: wrap with a clearly-wrong framing
    if len(s) >= 40:
        return "The opposite is true: " + s[0].lower() + s[1:] + "."
    return None

def make_distractors(real, other_sents, rng):
    """Build 3 plausible-but-wrong distractors that are NOT near-equivalent
    lesson statements (avoids two-defensible-answers ambiguity). Order:
    inverted-but-wrong variants, generic wrong-answer stems, and only as a
    last resort a lesson sentence from a DIFFERENT lesson (other_sents).
    """
    distractors = []
    seen = set()

    def add(o):
        o = o.strip()
        if (o and o != real and len(o) >= 40 and o not in seen
                and not o.endswith(":")):
            distractors.append(o)
            seen.add(o)

    # (a) inverted / wrong-but-plausible variants of the correct answer
    for _ in range(3):
        inv = invert_statement(real)
        if inv is None:
            break
        add(inv)
        break  # only one inverted variant per question keeps distractors clean

    # (b) generic wrong-answer stems
    generic = [
        "The lesson says the opposite: this should always be avoided.",
        "The lesson advises ignoring this entirely in practice.",
        "The lesson states this is never a relevant consideration.",
        "The lesson recommends treating output as final without review.",
        "The lesson says only technical staff should act on this.",
        "The lesson claims this cannot be verified at all.",
        "The lesson argues this applies only in unrelated settings.",
        "The lesson cautions against this in every real-world case.",
    ]
    rng.shuffle(generic)
    for g in generic:
        add(g)
        if len(distractors) >= 3:
            break

    return distractors[:3]

def excerpt_option(excerpt):
    """Return a complete-sentence MCQ option from the lesson excerpt.

    Never truncates mid-sentence with a trailing ellipsis (\\u2026), and never
    returns a dangling <40-char fragment. We cut at a real sentence boundary
    (., !, ?) nearest the target option length while keeping the option >=40
    chars; if no such boundary exists, fall back to the full excerpt (which is
    always a complete sentence)."""
    if not excerpt:
        return ""
    MIN_LEN = 40
    MAX = 200
    if len(excerpt) <= MAX:
        return excerpt
    # candidate cut points: end of each sentence-ending punctuation
    bounds = [m.end() for m in re.finditer(r"[.!?](?=\s|$)", excerpt)]
    # prefer the boundary closest to MAX whose result is >= MIN_LEN
    best = None
    for b in bounds:
        if b < MIN_LEN:
            continue
        if best is None or abs(b - MAX) < abs(best - MAX):
            best = b
    if best is not None:
        return excerpt[:best]
    return excerpt


def make_questions(series, slug, title, excerpt, sents, rng):
    qs = []
    topic = title.split(": ", 1)[-1] if ": " in title else title
    if excerpt:
        qs.append({
            "question": f"Per the lesson \u201c{topic}\u201d, what is the central focus?",
            "options": [
                excerpt_option(excerpt),
                "A history of the technology and its vendors",
                "A review of unrelated productivity tools",
                "A summary of corporate policy rules",
            ],
            "correct_answer_index": 0,
            "explanation": f"The lesson is centered on: {excerpt}",
        })
    # Build 2 comprehension questions from real content sentences
    chosen = pick_question_sentences(sents, rng)
    for ci, real in enumerate(chosen[:2]):
        other = [s for s in sents if s != real]
        distractors = make_distractors(real, other, rng)
        if not distractors:
            continue
        opts = [real] + distractors
        rng.shuffle(opts)
        qs.append({
            "question": "Which statement best reflects the lesson\u2019s guidance?" if ci == 0
                        else "Which conclusion does the lesson support?",
            "options": opts,
            "correct_answer_index": opts.index(real),
            "explanation": real,
        })
    # Fallback if we still have < 3
    while len(qs) < 3:
        qs.append({
            "question": f"According to the lesson \u201c{topic}\u201d, what should a learner take away?",
            "options": [
                excerpt_option(excerpt) if excerpt else topic,
                "That the topic is too complex to use at work",
                "That memorization replaces understanding",
                "That only technical staff should apply this",
            ],
            "correct_answer_index": 0,
            "explanation": f"The lesson\u2019s takeaway is grounded in: {excerpt or topic}",
        })
    return qs

def process_series(series):
    base = os.path.join(LEARN, series)
    if not os.path.isdir(base):
        print(f"[skip] {series}: no dir")
        return
    rng = random.Random(series)
    lessons = []
    for fn in os.listdir(base):
        if not fn.endswith(".mdx"):
            continue
        fm, body = parse_lesson(os.path.join(base, fn))
        if "slug" in fm and "lesson" in fm:
            lessons.append({
                "slug": fm["slug"], "lesson": int(fm["lesson"]),
                "title": fm.get("title", fn), "excerpt": fm.get("excerpt", ""),
                "sents": harvest_sentences(body),
            })
    lessons.sort(key=lambda x: x["lesson"])
    if not lessons:
        print(f"[skip] {series}: no lessons")
        return

    qdir = os.path.join(base, "questions")
    os.makedirs(qdir, exist_ok=True)
    lesson_questions = {}
    for L in lessons:
        p = os.path.join(qdir, L["slug"] + ".json")
        if os.path.exists(p):
            lesson_questions[L["slug"]] = json.load(open(p, encoding="utf-8"))
            continue
        qs = make_questions(series, L["slug"], L["title"], L["excerpt"], L["sents"], rng)
        data = {
            "quizName": f"{series}:lesson:{L['slug']}",
            "title": f"Lesson {L['lesson']}: {L['title'].split(': ',1)[-1] if ': ' in L['title'] else L['title']}",
            "description": L["excerpt"],
            "questions": qs,
        }
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        lesson_questions[L["slug"]] = data
        print(f"  + questions/{L['slug']}.json ({len(qs)} q)")

    cdir = os.path.join(base, "checks")
    os.makedirs(cdir, exist_ok=True)
    max_lesson = lessons[-1]["lesson"]
    nchecks = (max_lesson + 4) // 5
    for n in range(1, nchecks + 1):
        cp = os.path.join(cdir, f"check-{n}.json")
        if os.path.exists(cp):
            continue
        lo, hi = 5 * n - 4, 5 * n
        block = [L for L in lessons if lo <= L["lesson"] <= hi]
        pool = []
        for L in block:
            q = lesson_questions.get(L["slug"])
            if q:
                pool.extend(q["questions"])
        pool = pool[:15]
        while len(pool) < 10:
            src = lesson_questions.get(lessons[0]["slug"])
            if not src:
                break
            pool.extend(src["questions"])
            pool = pool[:15]
            if len(lesson_questions) <= 1:
                break
        if not pool:
            continue
        data = {
            "quizName": f"{series}:check:{n}",
            "title": f"Knowledge Check {n}: Lessons {lo}\u2013{hi}",
            "description": f"Pooled check over Lessons {lo}\u2013{hi} of the {series.replace('-',' ').title()} series. Score 80% or higher to unlock the cert prep exam.",
            "questions": pool,
        }
        with open(cp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"  + checks/check-{n}.json ({len(pool)} q)")

    ex = os.path.join(base, "exam.json")
    if not os.path.exists(ex):
        pool = []
        for L in lessons:
            q = lesson_questions.get(L["slug"])
            if q:
                pool.extend(q["questions"])
        k = 0
        while len(pool) < 20 and pool and k < 60:
            pool.extend(lesson_questions[lessons[k % len(lessons)]["slug"]]["questions"])
            k += 1
        pool = pool[:60]
        data = {
            "quizName": f"{series}:exam",
            "title": f"{series.replace('-',' ').title()}: Practice Exam",
            "description": f"Timed certification practice exam for the {series.replace('-',' ').title()} series. Pass with 72% or higher.",
            "questions": pool,
        }
        with open(ex, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"  + exam.json ({len(pool)} q)")

    sj_path = os.path.join(base, "series.json")
    sj = json.load(open(sj_path, encoding="utf-8")) if os.path.exists(sj_path) else {}
    changed = False
    if not sj.get("group"):
        sj["group"] = "Tracks" if series.startswith(("hermes", "ai")) else "Certifications"
        changed = True
    if not sj.get("subgroup"):
        if series.startswith("hermes"):
            sj["subgroup"] = "Hermes Consultant"
        elif series == "salesforce-architect":
            sj["subgroup"] = "System Architect"
        elif series == "agentic-ai":
            sj["subgroup"] = "Agentic AI"
        else:
            sj["subgroup"] = "Productivity"
        changed = True
    if changed:
        with open(sj_path, "w", encoding="utf-8") as f:
            json.dump(sj, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"  + series.json group/subgroup set")

if __name__ == "__main__":
    args = sys.argv[1:]
    series_list = args if args else DEFAULT_SERIES
    for s in series_list:
        print(f"=== {s} ===")
        process_series(s)
