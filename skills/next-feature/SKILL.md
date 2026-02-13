---
name: next-feature
description: Select the next feature to implement from features.yaml.
disable-model-invocation: true
---

Run:
- `git log --oneline -10`
- `skills/_lib/select_next_feature.sh features.yaml`

Output format:
```
NEXT FEATURE: [id]
Description: [description]
Priority: [priority]
Dependencies: [list or "none"]
Suggested plan file: [id].md
```

If none exists, report no ready features and why (blocked deps or none pending).
