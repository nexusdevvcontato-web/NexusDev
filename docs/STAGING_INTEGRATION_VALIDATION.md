# Staging Integration Validation

Validation date: 2026-11-20/21 (UTC)
Branch: `rebuild/v2-security`

## Components observed

- Vercel project: `nexusdev-frontend`
- Preview deployment: `dpl_2iCUSjEVYMBaGsy6ZxjBZ33L837w`
- Frontend source commit: `681149244eb488290a37ab8b27885365eef35aa4`
- Preview state: `READY`
- Render service: `nexusdev-staging-v2`
- Render service ID: `srv-dbvt9krrjlhs73fn6lo0`
- Render service branch: `rebuild/v2-security`
- Render auto-deploy: disabled; trigger: off
- Latest live Render runtime deploy observed: `ed28e216d6bf83f2360f8fa795dda230c6bc2213`

The Render runtime deploy intentionally remains on the last runtime-changing commit. Later backend commits in this workstream contain tests and documentation only; no runtime redeploy was needed for those changes.

## Checks completed

1. GitHub Actions for backend commit `71e68c29934ba87f5e3e6f1908e4bb0eb759e289` completed successfully (workflow run `44843667902`).
2. Vercel Preview deployment for frontend commit `681149244eb488290a37ab8b27885365eef35aa4` was reported `READY`.
3. Preview root document returned HTTP 200 and served the Portuguese NexusDev Vite application HTML.
4. Preview request to `/api/health` returned HTTP 200 with `status: online` and service `NexusDev API v2.0`.
5. The health response included `x-render-origin-server: Render`, confirming the Preview API rewrite reached the Render backend rather than a Vercel-local response.
6. Render service metadata confirmed the expected staging branch, health check path `/api/health`, free plan, and disabled auto-deploy.

## Checks not completed

- A subsequent protected-preview request to `/api/me` could not be inspected because the protected deployment fetch flow returned `deployment_authentication_required` after redirect. This is not evidence of an application authentication defect and is not counted as a passing endpoint test.
- No full interactive browser session was run. This validates document delivery and API proxy connectivity, not visual behavior or complete user journeys.
- Registration/login/refresh/logout, drafts, privacy export, and certificate flows were not executed end-to-end against staging in this pass.
- No production deployment, production service, production database, or production secret was changed or accessed.

## Result

The frontend Preview is serving the expected application document and its `/api/health` route successfully reaches the Render staging backend. The Vercel-to-Render transport/proxy integration is therefore verified for the health endpoint.

This is not a production-readiness certification. Full authenticated workflow tests, browser-level UI validation, and the remaining operational gates in `SECURITY_REGRESSION_TEST_MATRIX.md` remain required.
