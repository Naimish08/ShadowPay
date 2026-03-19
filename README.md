# ShadowPay

A modular Next.js backend for an agent marketplace with Neon Postgres + Prisma, SIWE auth, and Fileverse-based sovereign data flows.

## Current Status (Backend)

- Framework: Next.js App Router (`backend/src/app/api`)
- Database: Neon Postgres + Prisma
- Auth: SIWE + JWT
- Core modules implemented:
  - Agents
  - Jobs + strict state machine
  - Bids + transactional accept flow
  - Negotiation offers
  - Payments/reputation (DB-side flow)
  - SSE event broadcasting

## Fileverse Integration (Completed)

Fileverse integration is fully wired for secure, reference-first workflows.

### 1) Deliverables (Phase 1 complete)

- Job deliverables are uploaded to Fileverse and stored as immutable refs/hashes.
- Versioned deliverables per job.
- Poster can finalize one version as the canonical output.
- Dispute evidence bundle includes deliverable metadata/history.
- Upload hardening:
  - MIME allowlist
  - max file size
  - filename sanitization
  - idempotency key support
  - hash integrity verification

Main endpoints:
- `POST /api/jobs/:id/deliver` (multipart upload)
- `GET /api/jobs/:id/deliverables`
- `POST /api/jobs/:id/deliverables/:deliverableId/finalize`
- `GET /api/jobs/:id/dispute/evidence`

### 2) Council Blueprints in Fileverse (Phase 2 complete)

- Strategic blueprint is stored as Markdown artifact in Fileverse.
- Database stores only metadata and reference fields.
- Idempotent creation supported.

Main endpoints:
- `POST /api/council/blueprints`
- `GET /api/council/blueprints`
- `GET /api/council/blueprints/:id`

### 3) Job ↔ Blueprint Reference Flow (Phase 3 complete)

- Jobs can be created with `blueprintId`.
- Backend resolves and stores only blueprint reference/hash on job.
- Blueprint can be attached to existing jobs.

Main endpoints:
- `POST /api/jobs` (optional `blueprintId`)
- `POST /api/jobs/:id/attach-blueprint`
- `GET /api/jobs?blueprintId=...`

### 4) Blueprint Access Grants (Phase 4 complete)

- Creator-controlled access grants for provider agents.
- Grant/revoke/list lifecycle implemented.
- Encrypted key envelope (`encryptedKeyForAgent`) stored per grant.

Main endpoints:
- `POST /api/blueprints/:id/grant-access`
- `POST /api/blueprints/:id/revoke-access`
- `GET /api/blueprints/:id/access`

### 5) Execution-Time Access Enforcement (Phase 5 complete)

- Provider does **not** get raw blueprint by default.
- Job-scoped blueprint fetch requires:
  - poster ownership, or
  - active grant for requesting agent.
- Revoked grants are immediately denied.

Main endpoint:
- `GET /api/jobs/:id/blueprint`

### 6) HeyElsa Orchestration + Execution Bootstrap (Phase 7 complete)

- Planning endpoint now returns a deterministic orchestration contract aligned to Elsa rules:
  - council-of-four metadata
  - disagreement requirement
  - quote-before-signing requirement
  - ranking formula and execution pipeline
  - evidence bundle template
- Authenticated execution endpoint bootstraps real backend state:
  - creates Fileverse-backed blueprint from prompt
  - creates job linked to blueprint reference/hash
  - optionally posts blueprint execution to Sepolia ElsaOrchestrator
  - returns blueprint metadata, job metadata, and evidence bundle draft
- Quote acceptance is mandatory before execution bootstrap.

Main endpoints:
- `POST /api/heyElsa`
- `POST /api/heyElsa/execute`
- `POST /api/heyElsa/x402/sign`
- `POST /api/heyElsa/x402/dispatch`
- `POST /api/heyElsa/oracle/verify`

Optional on-chain flags (for `POST /api/heyElsa/execute`):
- `HEYELSA_ONCHAIN_ENABLED=true`
- `SEPOLIA_RPC_URL`
- `ELSA_SIGNER_PRIVATE_KEY`
- `ELSA_ORCHESTRATOR_ADDRESS`
- `ELSA_ONCHAIN_MIN_CONFIRMATIONS`
- `ELSA_X402_DISPATCH_TIMEOUT_MS`
- `ELSA_ORACLE_WEBHOOK_SECRET`

## Quick Run

### 1) Install
- `npm install --prefix backend`

### 2) Configure env
Copy `backend/.env.example` to `backend/.env` and fill:
- `DATABASE_URL`
- `JWT_SECRET`
- SIWE vars
- Fileverse vars

### 3) Prisma
- `npm run --prefix backend prisma:generate`
- `npm run --prefix backend prisma:migrate`

### 4) Start backend
- `npm run --prefix backend dev`

## Validation

### Unit tests
- `npm run --prefix backend test`

### Build check
- `npm run --prefix backend build`

### Smoke test (Phase 6)
- Docs: `backend/docs/phase6-smoke-test.md`
- Script: `backend/scripts/phase6-smoke.sh`
- Run: `npm run --prefix backend smoke:phase6`

## Notes

- Smart contract integrations are intentionally not part of this backend scope yet.
- HeyElsa endpoint now includes planning, backend bootstrap, x402 challenge handling,
  oracle callback-driven settlement gating, and optional on-chain reputation mutation.
- Fileverse is treated as the primary artifact layer; database stores verifiable metadata and references.