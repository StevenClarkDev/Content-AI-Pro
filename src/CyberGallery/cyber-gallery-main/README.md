# Cyber Gallery — Phase 1

Monorepo: NestJS API + Next.js web portal + React Native (Android-first) gallery sync app.

## Stack
- **API**: NestJS, Prisma, PostgreSQL, Redis (BullMQ), local disk storage, JWT auth.
- **Web**: Next.js 14 (App Router), Tailwind, TanStack Query.
- **Mobile**: React Native 0.74 (bare), CameraRoll, background uploads.
- **Shared**: typed DTOs in `packages/shared`.

## Quick start

```bash
pnpm install
pnpm infra:up                # postgres + redis
cp apps/api/.env.example apps/api/.env
pnpm --filter @cg/api prisma:migrate
pnpm dev:api                 # http://localhost:4817  (swagger: /docs)
pnpm dev:web                 # http://localhost:3001
pnpm dev:mobile              # then `pnpm --filter @cg/mobile android`
```

## Phase 1 milestones (status)
- [x] M1 Foundation
- [x] M2 Upload pipeline
- [x] M3 RN initial sync
- [x] M4 RN incremental + delete sync
- [x] M5 Web portal
- [x] M6 Hardening (rate limit, quota, retries, logs)

## Notes
- Storage: local disk under `apps/api/storage/{originals,thumbs}/<userId>/...`. Swap `LocalStorageService` for S3/GCS later.
- Quota: 5 GB / user, enforced on presign.
- Images only (`image/jpeg|png|webp|heic`).
- Galleries scoped per `(user, device)` — no cross-device merge.
