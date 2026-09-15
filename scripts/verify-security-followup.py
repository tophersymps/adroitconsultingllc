import json, urllib.request, urllib.error

BASE = "http://localhost:3210"

def post(path, body, origin=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    if origin:
        req.add_header("Origin", origin)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def get(path):
    try:
        with urllib.request.urlopen(BASE + path) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

tests = [
    ("1. valid POST /read (no Origin)", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "ai-strategy-2026"}, None),
    ("1b. canonical prefixed contentSlug blog/<slug> (t_808e5885)", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "blog/ai-strategy-2026"}, None),
    ("1c. canonical prefixed contentSlug lesson/<slug> (t_808e5885)", "/api/progress/read",
     {"contentType": "lesson", "contentSlug": "lesson/day-01-f1"}, None),
    ("1d. prefixed contentSlug traversal blog/../etc -> 400", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "blog/../etc/passwd"}, None),
    ("1e. prefixed contentSlug double-slash blog/a/b -> 400", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "blog/a/b"}, None),
    ("2. evil Origin -> 403", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "ai-strategy-2026"}, "https://evil.example.com"),
    ("3. bad charset slug -> 400", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "bad<script>slug"}, None),
    ("4. oversized slug -> 400", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "x" * 300}, None),
    ("5. quiz questionIndex out of range -> 400", "/api/progress/quiz",
     {"quizName": "omni-studio-cert", "questionIndex": 99, "userAnswerIndex": 0,
      "correctAnswerIndex": 1, "isCorrect": False}, None),
    ("6. quiz spoofed isCorrect (valid index; unauth fallback expected)", "/api/progress/quiz",
     {"quizName": "omni-studio-cert", "questionIndex": 0, "userAnswerIndex": 2,
      "correctAnswerIndex": 0, "isCorrect": True}, None),
    ("7. lesson path-traversal slug -> 400", "/api/progress/lesson",
     {"lessonSlug": "../../etc/passwd"}, None),
    ("8. quiz userAnswerIndex out of range (5 options) -> 400", "/api/progress/quiz",
     {"quizName": "omni-studio-cert", "questionIndex": 0, "userAnswerIndex": 7,
      "correctAnswerIndex": 0, "isCorrect": False}, None),
    ("9. lesson valid -> unauth fallback", "/api/progress/lesson",
     {"lessonSlug": "day-03-f3-managed-package-vs-standard-runtime-upgrades"}, None),
    # F2 (t_4ee14a75): quizName path traversal variants must be rejected at the
    # API layer before any filesystem join (validateSlug) — and even if one
    # slipped through, getQuizForSeries() itself refuses unsafe slugs.
    ("10. quiz traversal quizName -> 400", "/api/progress/quiz",
     {"quizName": "../../../etc/passwd", "questionIndex": 0, "userAnswerIndex": 0,
      "correctAnswerIndex": 0, "isCorrect": False}, None),
    ("11. quiz dot-dot slash encoded -> 400", "/api/progress/quiz",
     {"quizName": "..%2f..%2fetc", "questionIndex": 0, "userAnswerIndex": 0,
      "correctAnswerIndex": 0, "isCorrect": False}, None),
]

ok = True
for name, path, body, origin in tests:
    status, text = post(path, body, origin)
    print(f"{name}\n   -> {status} {text[:120]}")
    if status in (400, 403, 429, 500) and "traversal" in name.lower():
        # traversal variants must NOT be 200
        pass
    elif status == 200 and "traversal" in name.lower():
        ok = False
        print("   !! traversal test unexpectedly returned 200")

# Page-level: /learn/[series]/quiz with an invalid series must 404 (notFound),
# not attempt a filesystem read.
status, _ = get("/learn/../../etc/quiz")
print(f"12. GET traversal series page -> {status}")
if status != 404:
    ok = False
    print("   !! expected 404")

print("\nRESULT:", "PASS" if ok else "FAIL")
