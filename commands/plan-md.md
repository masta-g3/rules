---
argument-hint: [request]
description: Create and maintain a Markdown implementation plan from a single request string.
---

Given the request: **$1**, create and maintain a detailed Markdown implementation plan as follows.

For complex requests, or when the user requests a plan in a .md:
1. Create new markdown document with the name of the feature or request (e.g. DOCUMENT_INTEGRATION.md).
2. Brainstorm solution alternatives that align with current style (modular, lightweight, clean, avoid corporate bloat).
3. Write out a detailed implementation plan with precise details (code snippets, file names, etc.) on all the steps needed. Think of this as a implementation guide for a junior engineer who will execute on the job.
4. Divide the plan into phases or steps and add [ ] to track progress.

Don't execute on this plan yet; te user will provide feedback and finally approve. After that, once you move to the implementation and make progress on it, verify if the plan actually corresponds to what was implemented, mark [x] what is completed, and if there are divergences, update the document. Keep a single document per session.