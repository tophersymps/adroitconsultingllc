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

tests = [
    ("1. valid POST /read (no Origin)", "/api/progress/read",
     {"contentType": "blog", "contentSlug": "ai-strategy-2026"}, None),
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
]

for name, path, body, origin in tests:
    status, text = post(path, body, origin)
    print(f"{name}\n   -> {status} {text[:120]}")
