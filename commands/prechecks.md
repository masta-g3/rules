Perform a deployment readiness check (framework-agnostic, CI/CD parity)
- Setup: clean install (npm ci|pnpm i --frozen-lockfile|yarn --immutable); ensure scripts: type-check, check
- Static checks: run linter and type-checker; fix blocking issues (no @ts-ignore/@ts-expect-error/any/unknown as fixes)
- Build: run production build; parity: replicate platform build locally (e.g., vercel/cloudflare/netlify/docker/CI) and ensure it passes; treat framework build-time validations as blockers
- Env: ensure all required env vars are listed in .env.example (no secrets)
- DB: validate schema/migrations (e.g., prisma validate/generate; sequelize/typeorm/knex migration status)
- APIs: verify route/module exports/imports for your framework (App Router handlers, Express/Fastify, NestJS controllers)
- Framework rules (examples): enforce SSR/CSR boundaries and deprecations (e.g., Next.js: move viewport to `export const viewport`; wrap `useSearchParams`/client hooks in <Suspense>; case-correct imports)
- Third-party: confirm required env checks and error handling for payments/SDKs (e.g., Stripe apiVersion matches SDK, requests satisfy types)

Report (blocking-only):
✅ Build: Fixed [N] type errors; [M] blocking lint; build OK (local + parity)
✅ Env: Added [missing vars]
✅ DB: Schema valid; migrations consistent
✅ APIs: Fixed [routes/modules]
⚠️Non-blocking warnings: [brief or “none”]

Focus only on actual blockers, not style warnings. DO NOT ALTER the functionality of the codebase, focus only on fixing styling or deployment related errors.
