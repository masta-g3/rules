---
description: Deployment readiness check (framework-agnostic, CI/CD parity).
---

Perform a deployment readiness check:

### Setup
- Clean install dependencies (npm ci / pnpm i --frozen-lockfile / yarn --immutable)
- Ensure required scripts exist: type-check, check

### Static Checks
- Run linter and type-checker
- Fix blocking issues (no @ts-ignore, @ts-expect-error, any, or unknown as fixes)

### Build
- Run production build
- Replicate platform build locally (vercel/cloudflare/netlify/docker/CI) and ensure it passes
- Treat framework build-time validations as blockers

### Environment
- Ensure all required env vars are listed in .env.example (no secrets)

### Database
- Validate schema/migrations (prisma validate/generate, sequelize/typeorm/knex migration status)

### APIs
- Verify route/module exports/imports for your framework (App Router handlers, Express/Fastify, NestJS controllers)

### Framework Rules
- Enforce SSR/CSR boundaries and deprecations
- Example (Next.js): move viewport to `export const viewport`; wrap `useSearchParams`/client hooks in `<Suspense>`; case-correct imports

### Third-party
- Confirm required env checks and error handling for payments/SDKs
- Example: Stripe apiVersion matches SDK, requests satisfy types

---

### Report (blocking-only)

```
✅ Build: Fixed [N] type errors; [M] blocking lint; build OK (local + parity)
✅ Env: Added [missing vars]
✅ DB: Schema valid; migrations consistent
✅ APIs: Fixed [routes/modules]
⚠️ Non-blocking warnings: [brief or "none"]
```

Focus only on actual blockers, not style warnings. DO NOT ALTER the functionality of the codebase—fix only styling or deployment-related errors.
