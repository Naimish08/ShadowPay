# HeyElsa Execute API

This document describes the Elsa marketplace kickoff endpoints.

## 1) Plan intent (no state change)

`POST /api/heyElsa`

Request body:

```json
{
  "userPrompt": "Audit this contract and draft a launch thread",
  "walletAddress": "0x..."
}
```

Response includes:
- `council` contract (Gemini/GPT/Claude/Grok)
- `quote` with `requiredBeforeSigning=true`
- `tasks` inferred from intent
- `pipeline` stages
- `evidenceBundleTemplate`

## 2) Execute kickoff (creates blueprint + job)

`POST /api/heyElsa/execute`

Headers:
- `Authorization: Bearer <siwe_jwt>`

Request body:

```json
{
  "userPrompt": "Audit this contract and draft a launch thread",
  "title": "Pre-seed launch prep",
  "requestId": "req-preseed-001",
  "acceptQuote": true
}
```

### Quote gate

If `acceptQuote` is missing or false, API returns `428` and no state is created.

Example `428` response:

```json
{
  "status": "quote_required",
  "message": "Quote must be accepted before execution. Re-submit with acceptQuote=true.",
  "quote": {
    "requiredBeforeSigning": true,
    "currency": "ETH",
    "network": "sepolia",
    "totalMaxCostEth": "0.0070",
    "paymentProtocol": "x402-via-heyelsa",
    "minConfirmations": 1
  },
  "tasks": []
}
```

### Success response (`201`)

Returns:
- `plan` (full orchestration payload)
- `onChain` posting status (`posted`, `skipped`, or `failed`)
- `blueprint` with Fileverse refs/hash
- `job` linked to blueprint refs/hash
- `evidenceBundleDraft`

## 3) Optional Sepolia posting adapter

When `HEYELSA_ONCHAIN_ENABLED=true`, execution attempts to call
`ElsaOrchestrator.executeBlueprint(...)` on Sepolia using local signing.

Required env vars:
- `SEPOLIA_RPC_URL`
- `ELSA_SIGNER_PRIVATE_KEY`
- `ELSA_ORCHESTRATOR_ADDRESS`

If disabled, `onChain.status` is `skipped` and local bootstrap still completes.

## 4) x402 payment signing endpoint

`POST /api/heyElsa/x402/sign`

Headers:
- `Authorization: Bearer <siwe_jwt>`

Request body:

```json
{
  "jobId": "job-uuid",
  "paymentRequiredHeader": "{\"amount\":\"0.001\",\"token\":\"ETH\",\"recipient\":\"0x...\"}",
  "maxBudgetEth": "0.0100",
  "txHash": "0x...",
  "minConfirmations": 1
}
```

Behavior:
- parses and validates x402 `X-Payment-Required` payload
- rejects if requested amount exceeds `maxBudgetEth`
- signs job-scoped payment proof locally using `ELSA_SIGNER_PRIVATE_KEY`
- optionally verifies Sepolia confirmations when `txHash` is provided

## 5) x402 outbound dispatch endpoint

`POST /api/heyElsa/x402/dispatch`

Headers:
- `Authorization: Bearer <siwe_jwt>`

Request body:

```json
{
  "jobId": "job-uuid",
  "endpoint": "https://agent.example/execute",
  "method": "POST",
  "headers": {
    "X-Request-Id": "req-1"
  },
  "body": {
    "task": "analyze"
  },
  "maxBudgetEth": "0.0100",
  "paymentTxHash": "0x...",
  "minConfirmations": 1,
  "allowUnconfirmedRetry": false
}
```

Behavior:
- sends initial request to provider endpoint
- if provider returns `402` + `X-Payment-Required`, validates challenge
- enforces quoted budget cap
- signs job-scoped x402 payment proof locally
- optionally confirms payment tx on Sepolia
- retries request with `X-Payment-Proof` header

## 6) Oracle verification settlement endpoint

`POST /api/heyElsa/oracle/verify`

Headers:
- `x-oracle-secret: <ELSA_ORACLE_WEBHOOK_SECRET>`

Request body:

```json
{
  "jobId": "job-uuid",
  "approved": true,
  "proof": {
    "deliverableHash": "ipfs://Qm...",
    "oracleReportRef": "ipfs://Qm-report",
    "notes": "quality check passed"
  },
  "proofHash": "0x...",
  "oracleTxHash": "0x...",
  "reason": "Passed policy checks"
}
```

Behavior:
- validates callback secret
- verifies canonical proof hash (if supplied)
- only settles `delivered` jobs
- `approved=true`: marks completed, releases escrow, records reputation updates
- `approved=false`: marks disputed, records negative reputation event for hired agent
- optionally attempts on-chain reputation mutation via `ReputationEngine`
  when `HEYELSA_ONCHAIN_REPUTATION_ENABLED=true`

## 7) What this does not yet perform

Pending integrations:
- DAO/governance escalation flow for disputed outcomes

Current implementation is a backend bootstrap layer to make those integrations deterministic and auditable.
