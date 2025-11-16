---
argument-hint: [request]
description: Create and maintain a Markdown implementation plan from a single request string.
---

Given the request: **$1**, create and maintain a detailed Markdown implementation plan as follows.

1. Create new markdown document with the name of the feature or request (e.g. DOCUMENT_INTEGRATION.md).
2. Brainstorm solution alternatives that align with current style (modular, lightweight, clean, avoid corporate bloat).
3. Write out a detailed implementation plan with precise details (code snippets, file names, etc.) on all the steps needed, including an explicit architectural layout that maps components, data flows, and dependencies. Think of this as a implementation guide for a junior engineer who will execute on the job. For substantial features (new apps, rewrites, multi-service work), the plan should be robust (think thousand lines, including pseudocode, diagrams and breakdowns if needed); for minor edits or narrow fixes keep it as concise as the change warrants.
   When the scope is broad (net-new apps, greenfield systems, major redesigns) or the user explicitly asks for depth, expand each phase into concrete substeps that reference architectural design or UI/UX mockups when relevant so a junior engineer can deliver without further clarification, prioritizing completeness over brevity while still avoiding filler.
4. Divide the plan into phases or steps and add [ ] to track progress.

Don't execute on this plan yet; te user will provide feedback and finally approve. After that, once you move to the implementation and make progress on it, verify if the plan actually corresponds to what was implemented, mark [x] what is completed, and if there are divergences, update the document. Keep a single document per session.
