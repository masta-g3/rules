---
argument-hint: [request]
description: Create and maintain a Markdown implementation plan from a single request string.
---

Given the request: **$1**, create and maintain a detailed Markdown implementation plan as follows.

1. Create new markdown document with the name of the feature or request (e.g. DOCUMENT_INTEGRATION.md).
2. Brainstorm solution alternatives that align with current style (modular, lightweight, clean, avoid corporate bloat).
3. Write out a detailed implementation plan with precise details (code snippets, file names, etc.) on all the steps needed, including a detailed architectural layout that maps components, data flows, and dependencies. Think of this as a implementation guide for a junior engineer who will execute on the job. For substantial features (new apps, rewrites, multi-service work), the plan should be robust (aim for +200 lines, including pseudocode, diagrams and breakdowns as needed); for minor edits or narrow fixes keep it as concise as the change warrants. Structure it like a narrative PRD: flowing prose, subsections, tables, and diagrams as the spine, with bullet lists used only for short enumerations.
4. Add an implementation section that divides work into incremental phases—foundation first, then progressive refinement. Each phase should produce testable, reviewable output (e.g., architecture setup → core components → specific features → polish). Use [ ] checkboxes to track progress within each phase.

Don't execute on this plan yet; the user will provide feedback and finally approve. After that, once you move to the implementation and make progress on it, verify if the plan actually corresponds to what was implemented, mark [x] what is completed, and if there are divergences, update the document. Keep a single document per session.
