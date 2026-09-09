import json
from pathlib import Path

base = Path("/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog")
ts = (base / "src/shared/contracts-constellations.ts").read_text()
plan = json.loads((base / "docs/decomposition-plan-constellations.json").read_text())
plan["contract_type_definitions"] = ts
body = "decomposition-plan:\n" + json.dumps(plan, indent=2)
(base / "docs/_decomposition-comment.txt").write_text(body)
rt = json.loads(json.dumps(plan))
assert rt["contract_type_definitions"] == ts
print("OK parsed; body chars:", len(body))
print("sub_tasks:", [s["id"] for s in plan["sub_tasks"]])