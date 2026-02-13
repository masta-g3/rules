---
name: epic-init
description: Decompose a complex feature into trackable sub-features.
argument-hint: "[epic description]"
---

Given `$1`, decompose into 4-10 atomic features.

Steps:
1. Clarify scope if ambiguous.
2. Create `docs/plans/{epic}-000.md` as epic context.
3. Append sequential `{epic}-{nnn}` items to `features.yaml` with dependencies and priority.
4. Report decomposition summary and recommended first feature.

Do not implement here.
