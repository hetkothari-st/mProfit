# PortfolioOS

> Full-stack, multi-asset portfolio management & accounting platform for Indian investors, HNIs, family offices, advisors, CAs, and traders. A modern MProfit replica with enhancements.

## Tech stack

**Frontend** — React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, Zustand, React Query, React Router v6, TanStack Table, Recharts, React Hook Form + Zod, date-fns

**Backend** — Node.js 20 + TypeScript, Express, Prisma (PostgreSQL 15), Redis 7 + Bull, JWT + bcrypt, Zod

**Infra** — Docker Compose for local dev; pnpm workspaces monorepo

## Repository layout

```
portfolioos/
├── apps/
│   └── web/                 # React frontend (Vite)
├── packages/
│   ├── api/                 # Express + Prisma backend
│   │   └── prisma/
│   └── shared/              # Shared TS types & utilities
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Docker Desktop (for Postgres + Redis)

### Setup

```bash
# 1. Copy env
cp .env.example .env

# 2. Start Postgres + Redis
pnpm docker:up

# 3. Install dependencies
pnpm install

# 4. Generate Prisma client + run migrations
pnpm db:generate
pnpm db:migrate

# 5. Seed demo data
pnpm db:seed

# 6. Run API + Web in parallel
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- API docs (Swagger): http://localhost:3001/api/docs

### Demo credentials

- Email: `demo@portfolioos.in`
- Password: `Demo@1234`

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run API + web in parallel |
| `pnpm dev:api` | Run API only |
| `pnpm dev:web` | Run web only |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Typecheck across workspace |
| `pnpm lint` | Lint across workspace |
| `pnpm test` | Run Vitest across workspace |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:studio` | Open Prisma Studio |

## Feature roadmap

Implementation follows the phased plan in `CLAUDE.md` Section 13:

- **Phase 1** — Monorepo, Prisma schema, auth, portfolio CRUD, login/register, dashboard shell, portfolio pages
- **Phase 2** — Stock/MF master data, manual transactions, holdings engine, EOD prices, dashboard metrics
- **Phase 3** — Import engine (CSV/Excel/PDF, MF CAS, contract notes) with Bull workers
- **Phase 4** — FIFO capital gains, XIRR, tax reports (Intraday/STCG/LTCG/112A), PDF + Excel export
- **Phase 5** — Full asset class coverage (F&O, Bonds, FD, NPS, PPF/EPF, Gold, Real Estate…) + corporate actions
- **Phase 6** — Double-entry accounting (chart of accounts, vouchers, trial balance, P&L, balance sheet)
- **Phase 7** — Advisor features (clients, AUM, shared portfolios)
- **Phase 8** — Alerts, email, mobile polish, caching, onboarding

## License

MIT
