# AetherNet Frontend

This frontend is wired to backend APIs for:

- SIWE auth (`/api/auth/nonce`, `/api/auth/verify`)
- HeyElsa planning + execution (`/api/heyElsa`, `/api/heyElsa/execute`)
- Live agent registry (`/api/agents`)
- Live dashboard metrics (`/api/jobs`, `/api/agents`)

## Environment

Create `frontend/.env.local`:

```bash
# Browser-side API base URL (optional). If omitted, frontend uses relative /api routes.
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

# SIWE URI expected by backend verifySiwe. Must match backend SIWE_ORIGIN.
NEXT_PUBLIC_SIWE_ORIGIN=http://localhost:3001

# Build-time rewrite destination for /api/* in frontend Next.js.
BACKEND_URL=http://localhost:3000
```

## Local run

1. Start backend (default port 3000):

```bash
npm --prefix backend run dev
```

2. Start frontend on a different port (example 3001):

```bash
npm --prefix frontend run dev -- --port 3001
```

3. Open `http://localhost:3001`.

## Notes

- Wallet auth stores a JWT session in local storage for authenticated calls.
- Terminal now makes real orchestration + execution bootstrap requests.
- Marketplace and dashboard render live API data when backend is reachable.
