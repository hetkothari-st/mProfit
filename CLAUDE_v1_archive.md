# CLAUDE.md — Build a Full MProfit-Replica Portfolio Management Platform

> **Purpose:** This file instructs Claude Code to build an end-to-end, production-grade, multi-asset portfolio management & accounting platform that replicates all features of MProfit (India's leading portfolio management software), plus additional enhancements. Read every section before writing a single line of code.

---

## 0. PROJECT OVERVIEW

Build **PortfolioOS** — a full-stack SaaS web application for Indian investors, HNIs, Family Offices, Financial Advisors, Chartered Accountants, and Traders. The platform must:

- Track investments across all Indian asset classes (Stocks, Mutual Funds, F&O, Bonds, FDs, NPS, AIF, PMS, REITs, InvITs, Gold, ULIPs, Insurance, PPF, EPF, Real Estate, Crypto, Art, and more)
- Import trade data from 700+ brokers and financial institutions
- Generate capital gains, XIRR, ITR-ready, and 45+ other reports
- Provide a full double-entry accounting module integrated with the portfolio
- Support multi-user, multi-portfolio, and multi-family workflows
- Run as a modern web app (React frontend + Node.js backend + PostgreSQL database)
- Have a mobile-responsive UI and companion mobile views

---

## 1. TECH STACK

### Frontend
- **Framework:** React 18 with TypeScript
- **Routing:** React Router v6
- **State Management:** Zustand (global) + React Query (server state)
- **UI Library:** shadcn/ui components + Tailwind CSS
- **Charts:** Recharts (line, bar, pie, area, treemap)
- **Tables:** TanStack Table v8 (sorting, filtering, pagination, export)
- **Forms:** React Hook Form + Zod validation
- **Date Handling:** date-fns
- **File Upload:** react-dropzone
- **PDF Generation:** react-pdf / @react-pdf/renderer
- **Excel Export:** xlsx (SheetJS)
- **Notifications:** react-hot-toast
- **Icons:** lucide-react

### Backend
- **Runtime:** Node.js 20 LTS with TypeScript
- **Framework:** Express.js
- **ORM:** Prisma with PostgreSQL
- **Authentication:** JWT (access + refresh tokens) + bcrypt
- **File Parsing:** 
  - PDF: pdf-parse
  - Excel/CSV: xlsx, csv-parse
  - HTML: cheerio
- **Job Queue:** Bull (Redis-backed) for async import jobs
- **Caching:** Redis (price cache, session cache)
- **Email:** nodemailer
- **Validation:** Zod
- **Price Data:** Yahoo Finance API (yfinance-compatible) + BSE/NSE data feeds

### Database
- **Primary DB:** PostgreSQL 15
- **Cache/Queue:** Redis 7
- **File Storage:** Local filesystem (dev) / AWS S3 (prod)

### Infrastructure
- **Containerization:** Docker + Docker Compose for local dev
- **API:** REST with OpenAPI/Swagger docs

---

## 2. PROJECT STRUCTURE

```
portfolioos/
├── apps/
│   ├── web/                          # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn base components
│   │   │   │   ├── layout/           # Sidebar, Header, PageLayout
│   │   │   │   ├── portfolio/        # Portfolio-specific components
│   │   │   │   ├── assets/           # Per-asset-class components
│   │   │   │   ├── reports/          # Report viewers
│   │   │   │   ├── accounting/       # Accounting module components
│   │   │   │   └── charts/           # Chart wrappers
│   │   │   ├── pages/
│   │   │   │   ├── auth/             # Login, Register, ForgotPassword
│   │   │   │   ├── dashboard/        # Main dashboard
│   │   │   │   ├── portfolios/       # Portfolio list & detail
│   │   │   │   ├── assets/           # Per asset class pages
│   │   │   │   ├── transactions/     # Transaction management
│   │   │   │   ├── import/           # Import wizard
│   │   │   │   ├── reports/          # All reports
│   │   │   │   ├── accounting/       # Accounting module
│   │   │   │   ├── advisor/          # Advisor-specific pages
│   │   │   │   ├── settings/         # User & system settings
│   │   │   │   └── alerts/           # Alerts & reminders
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   ├── stores/               # Zustand stores
│   │   │   ├── lib/                  # Utilities, formatters
│   │   │   ├── types/                # TypeScript types
│   │   │   └── api/                  # API client (Axios instances)
│   │   └── public/
│   └── mobile-pwa/                   # PWA wrapper (optional phase 2)
├── packages/
│   ├── api/                          # Express backend
│   │   ├── src/
│   │   │   ├── routes/               # Express routers
│   │   │   ├── controllers/          # Route handlers
│   │   │   ├── services/             # Business logic
│   │   │   ├── middleware/           # Auth, error handling, rate limit
│   │   │   ├── jobs/                 # Bull queue workers
│   │   │   ├── parsers/              # File import parsers
│   │   │   │   ├── stocks/           # Contract note parsers
│   │   │   │   ├── mf/               # Mutual fund CAS parsers
│   │   │   │   ├── bank/             # Bank statement parsers
│   │   │   │   └── generic/          # CSV/Excel generic parser
│   │   │   ├── calculators/          # FIFO, XIRR, tax calculators
│   │   │   ├── priceFeeds/           # Price data integration
│   │   │   └── utils/
│   │   └── prisma/
│   │       ├── schema.prisma         # Full database schema
│   │       └── migrations/
│   └── shared/                       # Shared types & utilities
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. DATABASE SCHEMA (Prisma)

Create `packages/api/prisma/schema.prisma` with the following complete schema:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── USERS & AUTH ───────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String
  phone         String?
  pan           String?   // PAN card for tax
  role          UserRole  @default(INVESTOR)
  plan          PlanTier  @default(FREE)
  planExpiresAt DateTime?
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  portfolios      Portfolio[]
  portfolioGroups PortfolioGroup[]
  clients         Client[]        // For advisors
  alerts          Alert[]
  importJobs      ImportJob[]
  accounts        Account[]       // Accounting ledger accounts
  refreshTokens   RefreshToken[]
}

enum UserRole {
  INVESTOR
  HNI
  FAMILY_OFFICE
  ADVISOR
  CA
  ADMIN
}

enum PlanTier {
  FREE
  LITE
  PLUS
  HNI
  FAMILY_OFFICE
  ADVISOR
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  createdAt DateTime @default(now())
}

// ─── CLIENTS (for Advisor/CA role) ──────────────────────────────

model Client {
  id        String  @id @default(cuid())
  advisorId String
  advisor   User    @relation(fields: [advisorId], references: [id])
  name      String
  email     String?
  pan       String?
  phone     String?
  category  String? // e.g. "HNI", "Retail"
  createdAt DateTime @default(now())

  portfolios Portfolio[]
}

// ─── PORTFOLIOS & GROUPS ─────────────────────────────────────────

model Portfolio {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  clientId    String?
  client      Client?  @relation(fields: [clientId], references: [id])
  name        String
  description String?
  type        PortfolioType @default(INVESTMENT)
  currency    String   @default("INR")
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  groups         PortfolioGroupMember[]
  holdings       Holding[]
  transactions   Transaction[]
  cashFlows      CashFlow[]
  alerts         Alert[]
}

enum PortfolioType {
  INVESTMENT
  TRADING
  GOAL
  STRATEGY
}

model PortfolioGroup {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String
  description String?
  createdAt   DateTime @default(now())

  members PortfolioGroupMember[]
}

model PortfolioGroupMember {
  portfolioId String
  groupId     String
  portfolio   Portfolio      @relation(fields: [portfolioId], references: [id])
  group       PortfolioGroup @relation(fields: [groupId], references: [id])

  @@id([portfolioId, groupId])
}

// ─── ASSET MASTER DATA ───────────────────────────────────────────

model StockMaster {
  id         String   @id @default(cuid())
  symbol     String   @unique
  name       String
  exchange   Exchange
  isin       String?  @unique
  sector     String?
  industry   String?
  isActive   Boolean  @default(true)
  updatedAt  DateTime @updatedAt

  holdings     Holding[]
  transactions Transaction[]
  prices       StockPrice[]
  corporateActions CorporateAction[]
}

enum Exchange {
  BSE
  NSE
  MCX
  NFO
  BFO
}

model MutualFundMaster {
  id          String   @id @default(cuid())
  schemeCode  String   @unique
  schemeName  String
  amcName     String
  category    MFCategory
  subCategory String?
  isin        String?
  isActive    Boolean  @default(true)
  updatedAt   DateTime @updatedAt

  holdings     Holding[]
  transactions Transaction[]
  navHistory   MFNav[]
}

enum MFCategory {
  EQUITY
  DEBT
  HYBRID
  SOLUTION_ORIENTED
  OTHER
  ETF
  INDEX_FUND
  ELSS
  FMP
  LIQUID
}

// ─── PRICES ──────────────────────────────────────────────────────

model StockPrice {
  id        String   @id @default(cuid())
  stockId   String
  stock     StockMaster @relation(fields: [stockId], references: [id])
  date      DateTime @db.Date
  open      Decimal  @db.Decimal(18,4)
  high      Decimal  @db.Decimal(18,4)
  low       Decimal  @db.Decimal(18,4)
  close     Decimal  @db.Decimal(18,4)
  volume    BigInt?

  @@unique([stockId, date])
}

model MFNav {
  id         String   @id @default(cuid())
  fundId     String
  fund       MutualFundMaster @relation(fields: [fundId], references: [id])
  date       DateTime @db.Date
  nav        Decimal  @db.Decimal(18,4)

  @@unique([fundId, date])
}

// ─── CORPORATE ACTIONS ───────────────────────────────────────────

model CorporateAction {
  id         String   @id @default(cuid())
  stockId    String
  stock      StockMaster @relation(fields: [stockId], references: [id])
  type       CorporateActionType
  exDate     DateTime @db.Date
  ratio      Decimal? @db.Decimal(18,6)  // for split/bonus
  amount     Decimal? @db.Decimal(18,4)  // for dividend
  details    Json?
  createdAt  DateTime @default(now())
}

enum CorporateActionType {
  DIVIDEND
  BONUS
  SPLIT
  MERGER
  DEMERGER
  RIGHTS
  BUYBACK
}

// ─── HOLDINGS ────────────────────────────────────────────────────

model Holding {
  id             String      @id @default(cuid())
  portfolioId    String
  portfolio      Portfolio   @relation(fields: [portfolioId], references: [id])
  assetClass     AssetClass
  
  // Stock specific
  stockId        String?
  stock          StockMaster? @relation(fields: [stockId], references: [id])
  
  // MF specific
  fundId         String?
  fund           MutualFundMaster? @relation(fields: [fundId], references: [id])

  // Generic (for bonds, FD, NPS, etc.)
  assetName      String?
  isin           String?
  
  quantity       Decimal   @db.Decimal(18,6)
  avgCostPrice   Decimal   @db.Decimal(18,4)
  totalCost      Decimal   @db.Decimal(18,4)
  currentPrice   Decimal?  @db.Decimal(18,4)
  currentValue   Decimal?  @db.Decimal(18,4)
  unrealisedPnL  Decimal?  @db.Decimal(18,4)
  
  updatedAt      DateTime  @updatedAt

  transactions   Transaction[]

  @@unique([portfolioId, assetClass, stockId, fundId])
}

enum AssetClass {
  EQUITY
  FUTURES
  OPTIONS
  MUTUAL_FUND
  ETF
  BOND
  GOVT_BOND
  CORPORATE_BOND
  FIXED_DEPOSIT
  NPS
  PPF
  EPF
  PMS
  AIF
  REIT
  INVIT
  GOLD_BOND
  GOLD_ETF
  PHYSICAL_GOLD
  PHYSICAL_SILVER
  ULIP
  INSURANCE
  REAL_ESTATE
  PRIVATE_EQUITY
  CRYPTOCURRENCY
  ART_COLLECTIBLES
  CASH
  OTHER
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────

model Transaction {
  id            String      @id @default(cuid())
  portfolioId   String
  portfolio     Portfolio   @relation(fields: [portfolioId], references: [id])
  holdingId     String?
  holding       Holding?    @relation(fields: [holdingId], references: [id])
  
  assetClass    AssetClass
  transactionType TransactionType
  
  // Asset identifiers
  stockId       String?
  stock         StockMaster? @relation(fields: [stockId], references: [id])
  fundId        String?
  fund          MutualFundMaster? @relation(fields: [fundId], references: [id])
  assetName     String?
  isin          String?

  // Transaction details
  tradeDate     DateTime    @db.Date
  settlementDate DateTime?  @db.Date
  quantity      Decimal     @db.Decimal(18,6)
  price         Decimal     @db.Decimal(18,4)
  grossAmount   Decimal     @db.Decimal(18,4)
  
  // Charges
  brokerage     Decimal     @db.Decimal(18,4) @default(0)
  stt           Decimal     @db.Decimal(18,4) @default(0)
  stampDuty     Decimal     @db.Decimal(18,4) @default(0)
  exchangeCharges Decimal   @db.Decimal(18,4) @default(0)
  gst           Decimal     @db.Decimal(18,4) @default(0)
  sebiCharges   Decimal     @db.Decimal(18,4) @default(0)
  otherCharges  Decimal     @db.Decimal(18,4) @default(0)
  netAmount     Decimal     @db.Decimal(18,4)

  // F&O specific
  strikePrice   Decimal?    @db.Decimal(18,4)
  expiryDate    DateTime?   @db.Date
  optionType    OptionType?
  lotSize       Int?

  // Bond/FD specific
  maturityDate  DateTime?   @db.Date
  interestRate  Decimal?    @db.Decimal(8,4)
  interestFrequency String?

  broker        String?
  exchange      Exchange?
  orderNo       String?
  tradeNo       String?
  narration     String?
  
  importJobId   String?
  importJob     ImportJob?  @relation(fields: [importJobId], references: [id])
  
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  capitalGains  CapitalGain[]
  voucherEntries VoucherEntry[]
}

enum TransactionType {
  BUY
  SELL
  SWITCH_IN
  SWITCH_OUT
  SIP
  DIVIDEND_REINVEST
  DIVIDEND_PAYOUT
  BONUS
  SPLIT
  MERGER_IN
  MERGER_OUT
  DEMERGER_IN
  DEMERGER_OUT
  RIGHTS_ISSUE
  INTEREST_RECEIVED
  MATURITY
  REDEMPTION
  DEPOSIT
  WITHDRAWAL
  OPENING_BALANCE
}

enum OptionType {
  CALL
  PUT
}

// ─── CAPITAL GAINS ────────────────────────────────────────────────

model CapitalGain {
  id              String   @id @default(cuid())
  portfolioId     String
  sellTransactionId String
  sellTransaction Transaction @relation(fields: [sellTransactionId], references: [id])

  buyTransactionId String   // FIFO matched buy
  assetClass       AssetClass
  assetName        String
  isin             String?

  buyDate          DateTime @db.Date
  sellDate         DateTime @db.Date
  quantity         Decimal  @db.Decimal(18,6)
  buyPrice         Decimal  @db.Decimal(18,4)
  sellPrice        Decimal  @db.Decimal(18,4)
  buyAmount        Decimal  @db.Decimal(18,4)
  sellAmount       Decimal  @db.Decimal(18,4)
  
  // Indexed cost (for debt funds where applicable)
  indexedCostOfAcquisition Decimal? @db.Decimal(18,4)
  
  capitalGainType  CapitalGainType
  gainLoss         Decimal  @db.Decimal(18,4)
  taxableGain      Decimal  @db.Decimal(18,4)
  financialYear    String   // e.g. "2024-25"

  createdAt        DateTime @default(now())
}

enum CapitalGainType {
  INTRADAY
  SHORT_TERM
  LONG_TERM
}

// ─── CASH FLOWS ───────────────────────────────────────────────────

model CashFlow {
  id          String    @id @default(cuid())
  portfolioId String
  portfolio   Portfolio @relation(fields: [portfolioId], references: [id])
  date        DateTime  @db.Date
  type        CashFlowType
  amount      Decimal   @db.Decimal(18,4)
  description String?
  createdAt   DateTime  @default(now())
}

enum CashFlowType {
  INFLOW
  OUTFLOW
}

// ─── ACCOUNTING MODULE ────────────────────────────────────────────

model Account {
  id            String      @id @default(cuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  code          String
  name          String
  type          AccountType
  parentId      String?
  parent        Account?    @relation("AccountTree", fields: [parentId], references: [id])
  children      Account[]   @relation("AccountTree")
  openingBalance Decimal    @db.Decimal(18,4) @default(0)
  createdAt     DateTime    @default(now())

  debitEntries  VoucherEntry[] @relation("DebitAccount")
  creditEntries VoucherEntry[] @relation("CreditAccount")

  @@unique([userId, code])
}

enum AccountType {
  ASSET
  LIABILITY
  INCOME
  EXPENSE
  EQUITY
}

model Voucher {
  id          String      @id @default(cuid())
  userId      String
  type        VoucherType
  voucherNo   String
  date        DateTime    @db.Date
  narration   String?
  isAutoGenerated Boolean @default(false)
  createdAt   DateTime    @default(now())

  entries VoucherEntry[]

  @@unique([userId, type, voucherNo])
}

enum VoucherType {
  JOURNAL
  PAYMENT
  RECEIPT
  CONTRA
  PURCHASE
  SALES
}

model VoucherEntry {
  id            String      @id @default(cuid())
  voucherId     String
  voucher       Voucher     @relation(fields: [voucherId], references: [id])
  debitAccountId  String
  creditAccountId String
  debitAccount  Account     @relation("DebitAccount", fields: [debitAccountId], references: [id])
  creditAccount Account     @relation("CreditAccount", fields: [creditAccountId], references: [id])
  amount        Decimal     @db.Decimal(18,4)
  narration     String?
  transactionId String?
  transaction   Transaction? @relation(fields: [transactionId], references: [id])
}

// ─── IMPORT JOBS ──────────────────────────────────────────────────

model ImportJob {
  id           String      @id @default(cuid())
  userId       String
  user         User        @relation(fields: [userId], references: [id])
  portfolioId  String?
  type         ImportType
  status       ImportStatus @default(PENDING)
  fileName     String
  filePath     String
  broker       String?
  totalRows    Int?
  successRows  Int?
  failedRows   Int?
  errorLog     Json?
  createdAt    DateTime    @default(now())
  completedAt  DateTime?

  transactions Transaction[]
}

enum ImportType {
  CONTRACT_NOTE_PDF
  CONTRACT_NOTE_EXCEL
  CONTRACT_NOTE_HTML
  MF_CAS_PDF
  MF_CAS_EXCEL
  BACK_OFFICE_CSV
  BANK_STATEMENT_PDF
  BANK_STATEMENT_CSV
  NPS_STATEMENT
  GENERIC_CSV
  GENERIC_EXCEL
}

enum ImportStatus {
  PENDING
  PROCESSING
  COMPLETED
  COMPLETED_WITH_ERRORS
  FAILED
}

// ─── ALERTS & REMINDERS ───────────────────────────────────────────

model Alert {
  id          String      @id @default(cuid())
  userId      String
  user        User        @relation(fields: [userId], references: [id])
  portfolioId String?
  portfolio   Portfolio?  @relation(fields: [portfolioId], references: [id])
  type        AlertType
  title       String
  description String?
  triggerDate DateTime
  isRead      Boolean     @default(false)
  isActive    Boolean     @default(true)
  metadata    Json?
  createdAt   DateTime    @default(now())
}

enum AlertType {
  FD_MATURITY
  BOND_MATURITY
  MF_LOCK_IN_EXPIRY
  SIP_DUE
  INSURANCE_PREMIUM
  DIVIDEND_RECEIVED
  CORPORATE_ACTION
  PRICE_TARGET
  CUSTOM
}
```

---

## 4. BACKEND — ALL API ROUTES

Create all of the following REST API endpoints under `packages/api/src/routes/`:

### Auth Routes (`/api/auth`)
```
POST   /register            — Register new user
POST   /login               — Login, return JWT + refresh token
POST   /refresh             — Refresh access token
POST   /logout              — Invalidate refresh token
POST   /forgot-password     — Send reset email
POST   /reset-password      — Reset password with token
GET    /me                  — Get current user profile
PATCH  /me                  — Update profile
```

### Portfolio Routes (`/api/portfolios`)
```
GET    /                    — List all portfolios (with summary stats)
POST   /                    — Create portfolio
GET    /:id                 — Get portfolio details
PATCH  /:id                 — Update portfolio
DELETE /:id                 — Delete portfolio
GET    /:id/summary         — Current value, XIRR, P&L summary
GET    /:id/holdings        — All holdings with current prices
GET    /:id/asset-allocation — Asset allocation breakdown
GET    /:id/historical-valuation — Month-end valuations
GET    /:id/cash-flows      — Cash flow history + XIRR
```

### Portfolio Groups (`/api/groups`)
```
GET    /                    — List groups
POST   /                    — Create group
GET    /:id                 — Group details
PATCH  /:id                 — Update
DELETE /:id                 — Delete
POST   /:id/portfolios      — Add portfolio to group
DELETE /:id/portfolios/:pid — Remove portfolio
GET    /:id/summary         — Consolidated group summary
GET    /:id/holdings        — Consolidated holdings
```

### Transactions (`/api/transactions`)
```
GET    /                    — List (filterable by portfolio, asset class, date range)
POST   /                    — Add manual transaction
GET    /:id                 — Get transaction
PATCH  /:id                 — Edit transaction
DELETE /:id                 — Delete transaction
POST   /bulk                — Bulk add transactions
```

### Assets — Stocks (`/api/assets/stocks`)
```
GET    /search              — Search BSE/NSE stocks
GET    /:symbol/price       — Current + historical price
GET    /:symbol/corporate-actions — Dividends, splits, bonuses
```

### Assets — Mutual Funds (`/api/assets/mf`)
```
GET    /search              — Search MF schemes
GET    /:schemeCode/nav     — Current + historical NAV
GET    /:schemeCode/details — Fund details
```

### Import (`/api/import`)
```
POST   /upload              — Upload file, create import job
GET    /jobs                — List import jobs
GET    /jobs/:id            — Get job status & preview
POST   /jobs/:id/confirm    — Confirm & commit imported transactions
DELETE /jobs/:id            — Cancel job
GET    /brokers             — List supported brokers
```

### Reports (`/api/reports`)
```
GET    /portfolio-summary         — Summary for one or more portfolios
GET    /holdings                  — Holdings report
GET    /xirr                      — Annualised return (XIRR) report
GET    /historical-valuation      — Month-end NAV history
GET    /unrealised-pnl            — Unrealised P&L
GET    /capital-gains             — Capital gains (params: fy, assetClass, type)
GET    /capital-gains/intraday    — Intraday P&L
GET    /capital-gains/short-term  — STCG report
GET    /capital-gains/long-term   — LTCG report  
GET    /capital-gains/schedule112a — Schedule 112A for ITR
GET    /income                    — Dividend & interest income
GET    /transactions              — Transaction report
GET    /holding-period            — Holding period analysis
GET    /asset-allocation          — Asset allocation with drill-down
GET    /due-dates                 — FD/bond maturity + SIP due dates
GET    /expenses                  — Brokerage & charges report
GET    /aum                       — AUM by portfolio/client (advisor)
GET    /client-holdings           — Client-wise holdings (advisor)
GET    /export/:reportType        — Download as PDF/Excel
```

### Accounting (`/api/accounting`)
```
GET    /accounts            — Chart of accounts
POST   /accounts            — Create account
PATCH  /accounts/:id        — Edit account
GET    /vouchers            — List vouchers
POST   /vouchers            — Create voucher
GET    /vouchers/:id        — Get voucher detail
PATCH  /vouchers/:id        — Edit voucher
DELETE /vouchers/:id        — Delete voucher
GET    /ledger/:accountId   — Account ledger
GET    /trial-balance       — Trial balance
GET    /profit-loss         — P&L statement
GET    /balance-sheet       — Balance sheet
GET    /bank-reconciliation — Bank reconciliation
POST   /bank-import         — Import bank statement to accounting
```

### Alerts (`/api/alerts`)
```
GET    /                    — List alerts
POST   /                    — Create alert
PATCH  /:id                 — Update/mark read
DELETE /:id                 — Delete
```

### Admin/Settings (`/api/settings`)
```
GET    /plans               — Available plans
POST   /subscription        — Subscribe to plan
GET    /users               — Manage users (admin)
```

---

## 5. CORE BUSINESS LOGIC

### 5.1 FIFO Capital Gains Calculator

Create `packages/api/src/calculators/capitalGains.ts`:

```typescript
// The FIFO calculator must:
// 1. Sort all BUY transactions for an asset chronologically (oldest first)
// 2. For each SELL, match against the oldest buys first
// 3. Determine holding period: <1 year = STCG, >=1 year = LTCG
//    (Exception: Equity MF & listed shares: <12m = STCG, >=12m = LTCG)
//    (Exception: Debt MF pre-2023: <36m = STCG, >=36m = LTCG with indexation)
// 4. Handle intraday: buy and sell on same day in same portfolio = Intraday
// 5. LTCG Grandfathering for equity & equity MF:
//    - For assets bought before 31 Jan 2018, cost basis is max(actual cost, FMV on 31 Jan 2018)
// 6. Indexation for debt MF bought before April 2023:
//    - Indexed cost = Cost * (CII of sell year / CII of buy year)
// 7. Apply STT adjustments where applicable
// 8. Return structured CapitalGain objects for each matched lot
```

### 5.2 XIRR Calculator

Create `packages/api/src/calculators/xirr.ts`:

```typescript
// Implement XIRR using Newton-Raphson iteration:
// XIRR finds the rate 'r' such that NPV of all cashflows = 0
// Cashflows: all investments as negative, all redemptions/current value as positive
// Each cashflow has a date
// Returns annualised return rate as decimal (e.g., 0.15 for 15%)
//
// Also implement:
// - Portfolio-level XIRR (across all transactions + current value)
// - Asset-level XIRR (per holding)
// - Group-level XIRR (consolidated)
// - Rolling XIRR (1Y, 3Y, 5Y windows)
```

### 5.3 Corporate Actions Auto-Apply

Create `packages/api/src/services/corporateActions.ts`:

```typescript
// When a corporate action is applied to a portfolio:
//
// BONUS: Add new shares at zero cost, increase quantity
// SPLIT: Adjust quantity (multiply by split ratio), adjust avg price
// MERGER: 
//   - Close the absorbed company holding
//   - Create new holding in acquirer at weighted avg cost
// DEMERGER:
//   - Reduce quantity/cost in parent company
//   - Create new holding in demerged entity
//   - Allocate cost in ratio specified by company
// DIVIDEND: 
//   - Create income transaction
//   - If reinvested: create new buy transaction at ex-dividend price
// RIGHTS ISSUE:
//   - Create buy transaction at rights price for entitled quantity
```

### 5.4 Import Engine

Create `packages/api/src/parsers/`:

The import engine must handle:

**Stock Contract Notes:**
- PDF contract notes (regex-based extraction of trade date, script, qty, price, charges)
- Excel contract notes (column mapping from known broker formats)
- HTML contract notes (DOM parsing)
- Support broker-specific formats: Zerodha, ICICI Direct, HDFC Securities, Kotak, Sharekhan, AngelOne, Groww, Upstox, 5Paisa, and generic fallbacks

**Mutual Fund:**
- CAS (Consolidated Account Statement) from CAMS & KFintech (NSDL)
- Parse: scheme name, folio number, transaction type, date, units, NAV, amount
- Handle switch-in/switch-out as paired transactions

**Bank Statements:**
- CSV/Excel from major banks (HDFC, ICICI, SBI, Kotak, Axis)
- Map to accounting entries

**Generic:**
- CSV with column auto-detection
- Excel with sheet selection

```typescript
// Import pipeline:
// 1. File upload → detect format
// 2. Parse file → extract raw transactions
// 3. Map to internal format → show preview to user
// 4. User reviews & corrects
// 5. Confirm → persist transactions, update holdings, recalculate capital gains
```

---

## 6. FRONTEND — ALL PAGES & COMPONENTS

### 6.1 Authentication Pages

**`/pages/auth/Login.tsx`**
- Email + password form
- Remember me
- Forgot password link
- Link to register

**`/pages/auth/Register.tsx`**
- Name, email, password, confirm password
- User type selection (Investor / Advisor / CA)
- Plan selection

### 6.2 Dashboard (`/pages/dashboard/Dashboard.tsx`)

The main dashboard must show:

```
┌─────────────────────────────────────────────────────────┐
│  PORTFOLIO SELECTOR (dropdown: all portfolios / groups)  │
├─────────────┬──────────────┬──────────────┬─────────────┤
│ Current     │ Total        │ Today's      │ XIRR        │
│ Value       │ Investment   │ Gain/Loss    │ (Annualised)│
│ ₹X,XX,XXX   │ ₹X,XX,XXX    │ ₹XX,XXX      │ XX.XX%      │
├─────────────┴──────────────┴──────────────┴─────────────┤
│  Portfolio Value Chart (area chart, 1M / 3M / 6M / 1Y / 3Y / ALL) │
├────────────────────────┬────────────────────────────────┤
│  Asset Allocation      │  Top Holdings                  │
│  (Pie/Donut Chart)     │  (Table: asset, value, %)      │
├────────────────────────┼────────────────────────────────┤
│  Recent Transactions   │  Upcoming Alerts               │
│  (last 10)             │  (FD maturity, SIPs, etc.)     │
└────────────────────────┴────────────────────────────────┘
```

Components needed:
- `<MetricCard>` — key number + trend indicator
- `<PortfolioValueChart>` — Recharts AreaChart with time range selector
- `<AssetAllocationPie>` — Donut chart with legend
- `<TopHoldingsTable>` — TanStack Table
- `<RecentTransactionsList>`
- `<AlertsWidget>`

### 6.3 Portfolio Pages

**`/pages/portfolios/PortfolioList.tsx`**
- Cards or table of all portfolios
- Each card: name, current value, XIRR, gain/loss %, asset allocation mini-bar
- Create new portfolio button
- Portfolio group management

**`/pages/portfolios/PortfolioDetail.tsx`**
- Tabs: Holdings | Transactions | Performance | Asset Allocation | Reports
- Holdings tab: table with columns — Asset, Qty, Avg Cost, Current Price, Current Value, Unrealised P&L, % Change, XIRR, Holding Period
- All columns sortable and filterable
- Export to Excel/PDF

### 6.4 Asset Class Pages

Create individual pages for each asset class under `/pages/assets/`:

**Stocks (`StocksPage.tsx`)**
- Holdings table: Symbol, Exchange, Qty, Avg Cost, CMP (live/delayed), Value, P&L, XIRR
- Click on stock → drawer with transaction history, chart, corporate actions
- Add buy/sell transaction inline

**Futures & Options (`FOPage.tsx`)**
- Live F&O positions with MTM P&L
- Mark-to-market with live prices
- Realised vs unrealised gain
- Lot-wise position tracking
- Greeks (optional)

**Mutual Funds (`MutualFundsPage.tsx`)**
- Fund-wise holdings: Scheme, Folio, Units, Avg NAV, Current NAV, Value, P&L, XIRR
- SIP tracking
- Switch in/out support

**Bonds (`BondsPage.tsx`)**
- Accrued interest calculation
- YTM calculation
- Maturity tracking

**Fixed Deposits (`FDPage.tsx`)**
- Bank, principal, rate, start date, maturity date
- Accrued interest
- Maturity reminder setup

**NPS (`NPSPage.tsx`)**
- Tier I / Tier II tracking
- Asset allocation within NPS (E/G/C/A)

**Others (PPF, EPF, AIF, PMS, REITs, InvITs, Gold, Real Estate, Insurance, ULIPs)**
- Each gets its own page with appropriate fields
- Manual transaction entry
- Valuation tracking

### 6.5 Import Wizard (`/pages/import/`)

**Step 1 — Upload**
- Drag & drop zone accepting PDF, Excel, CSV, HTML
- Select portfolio
- Select import type or auto-detect
- Select broker (for contract notes)

**Step 2 — Preview**
- Table preview of extracted transactions
- Highlight rows with errors/warnings
- Allow user to edit individual rows
- Show statistics: X transactions found, Y errors

**Step 3 — Review & Map**
- Unmapped assets (new stocks/funds found) — user maps to master
- Duplicate detection: show transactions that may already exist
- User can exclude specific rows

**Step 4 — Confirm**
- Summary: X transactions to be imported
- Expected impact on portfolio
- Confirm → process in background

**Import Status Page**
- List of all past import jobs
- Status badges (Processing / Completed / Failed)
- Click to see details and error log

### 6.6 Reports (`/pages/reports/`)

Create a report hub with the following reports, each downloadable as PDF and Excel:

**Analytical Reports:**
- `PortfolioSummaryReport` — Overall portfolio with all asset classes
- `XIRRReport` — Annualised returns, customisable by period
- `HistoricalValuationReport` — Month-end values table + chart
- `UnrealisedPnLReport` — Current unrealised gains/losses
- `AssetAllocationReport` — Detailed asset allocation breakdown
- `HoldingPeriodReport` — How long each asset has been held

**Capital Gain Reports:**
- `IntradayReport` — Same-day trades
- `STCGReport` — Short-term capital gains
- `LTCGReport` — Long-term capital gains
- `ConsolidatedCGReport` — All CG in one view
- `Schedule112AReport` — ITR Schedule 112A format (equity & equity MF LTCG)
- `ITRCompatibleReport` — Export compatible with ClearTax, Winman, CompuTax

**Transaction Reports:**
- `TransactionReport` — All transactions with filters
- `TradeReport` — Trade-specific view with charges

**Income Reports:**
- `IncomeReport` — Dividends, interest, rent received
- `DueDateReport` — Upcoming FD/bond maturities and SIP dates
- `ExpenseReport` — Brokerage, STT, transaction charges

**Accounting Reports:**
- `TrialBalanceReport`
- `ProfitLossReport`
- `BalanceSheetReport`
- `LedgerReport`

**Advisor Reports:**
- `AUMReport` — Assets under management
- `ClientHoldingsReport` — Client-wise holding summary
- `FamilyWiseReport` — Family-wide consolidated view

Each report component must:
1. Have filter controls at the top (date range, portfolio, asset class, financial year)
2. Display in a clean table/chart
3. Have "Download PDF" and "Download Excel" buttons
4. Support "Save as PDF" and "Print" options

### 6.7 Accounting Module (`/pages/accounting/`)

**Chart of Accounts**
- Tree view of accounts (Assets > Bank Accounts, etc.)
- Add/edit accounts
- Auto-created accounts from portfolio transactions

**Voucher Entry**
- Journal voucher: debit & credit legs
- Payment & receipt vouchers
- Auto-generated vouchers from stock/MF transactions

**Ledger View**
- Account-wise transaction history
- Opening balance, closing balance

**Bank Reconciliation**
- Match bank statement entries to accounting entries
- Mark reconciled / unreconciled

**Financial Statements**
- Trial Balance
- Profit & Loss Statement
- Balance Sheet

### 6.8 Alerts & Reminders (`/pages/alerts/`)

- List all active alerts
- Create new alert (FD maturity, SIP date, price target, custom)
- Mark as read/completed
- Email notification settings

### 6.9 Advisor Features (`/pages/advisor/`)

- Client management (add/edit clients)
- Client portfolio list
- Client-wise capital gains generation
- AUM dashboard
- Share portfolio view with clients (read-only link generation)
- Category-wise client grouping

### 6.10 Settings (`/pages/settings/`)

- Profile settings
- Change password
- Subscription & plan details
- Notification preferences
- Data export (full data backup)
- Delete account

---

## 7. UI/UX DESIGN GUIDELINES

- **Theme:** Clean, professional financial app aesthetic. Primary color: Deep blue (`#022B54`). Accent: Green (`#219C48`). Background: Light gray (`#F8FAFC`).
- **Typography:** Inter for UI, monospace for numbers
- **Numbers:** Always use Indian number formatting (₹ with lakhs/crores): `₹1,23,456.78`
- **Positive values:** Green with up arrow (▲)
- **Negative values:** Red with down arrow (▼)
- **Tables:** Zebra striping, sticky headers, sort indicators
- **Loading states:** Skeleton loaders for all data-fetching components
- **Empty states:** Helpful illustrations + action prompts (e.g., "No portfolios yet — Create your first portfolio")
- **Mobile responsive:** All pages must work at 375px width minimum
- **Sidebar navigation:** Collapsible. Items: Dashboard, Portfolios, Stocks, Mutual Funds, F&O, Bonds, FDs, NPS, Others, Reports, Import, Accounting, Alerts, Settings

---

## 8. AUTHENTICATION & MULTI-TENANCY

- JWT access tokens (15 min expiry) + refresh tokens (30 days)
- All API routes protected with `authenticate` middleware
- Users can only access their own data
- Advisors can access client data through explicit client-advisor relationship
- Row-level security via Prisma queries (always filter by `userId`)
- Rate limiting: 100 req/min per user for regular endpoints, 10 req/min for import endpoints

---

## 9. PRICE DATA INTEGRATION

Create `packages/api/src/priceFeeds/`:

```typescript
// Price data sources (use whichever is available):
// 1. NSE/BSE EOD data — free, updated daily
// 2. Yahoo Finance API — for historical prices
// 3. MF NAV: AMFI daily NAV file (https://www.amfiindia.com/spages/NAVAll.txt)
//    - Download daily, parse, store in MFNav table
// 4. For real-time (15-min delay): NSE India API endpoints

// Price update jobs (Bull queue):
// - Daily at 4:30 PM IST: Update all stock EOD prices
// - Daily at 10:00 PM IST: Update all MF NAVs from AMFI
// - Every 15 minutes during market hours (9:15 AM - 3:30 PM IST): Update stock prices
// - On demand: when user views a holding, check if price is stale

// Current value calculation:
// currentValue = quantity * latestPrice
// unrealisedPnL = currentValue - (quantity * avgCostPrice)
// unrealisedPnL% = (unrealisedPnL / (quantity * avgCostPrice)) * 100
```

---

## 10. XIRR IMPLEMENTATION DETAIL

```typescript
export function calculateXIRR(cashflows: { date: Date; amount: number }[]): number {
  // cashflows: negative = investments (outflows), positive = redemptions + current value
  // Returns annualised rate as decimal
  
  // Newton-Raphson:
  // f(r) = sum of [cashflow_i / (1 + r)^((date_i - date_0) / 365)]
  // f'(r) = derivative
  // r_new = r_old - f(r_old) / f'(r_old)
  // Iterate until |r_new - r_old| < 1e-10 or max 1000 iterations
  
  // Edge cases:
  // - Only one cashflow: return 0
  // - All cashflows on same date: return 0
  // - No solution converges: return NaN (show "N/A" in UI)
}
```

---

## 11. DOCKER SETUP

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: portfolioos
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: ./packages/api
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/portfolioos
      REDIS_URL: redis://redis:6379
      JWT_SECRET: your-super-secret-key-change-in-production
    depends_on:
      - postgres
      - redis

  web:
    build: ./apps/web
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:3001
    depends_on:
      - api

volumes:
  postgres_data:
```

---

## 12. ENVIRONMENT VARIABLES

Create `.env.example`:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=change-this-to-a-secure-random-string
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# Email (for alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password

# Price Data
NSE_API_KEY=optional
AMFI_NAV_URL=https://www.amfiindia.com/spages/NAVAll.txt

# Storage
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE_MB=50

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
```

---

## 13. IMPLEMENTATION ORDER (Phase by Phase)

### Phase 1 — Foundation (Start Here)
1. Set up monorepo with `npm workspaces`
2. Initialize PostgreSQL + Prisma schema (Section 3)
3. Build auth system (register, login, JWT)
4. Create portfolio CRUD APIs
5. Build login/register pages and basic dashboard layout with sidebar
6. Build portfolio list & create portfolio pages

### Phase 2 — Core Portfolio Tracking
1. Stock master data import (NSE/BSE symbol list)
2. Manual transaction entry for Stocks and Mutual Funds
3. Holdings calculation engine
4. Current price fetching (EOD from NSE/AMFI)
5. Dashboard metrics (current value, P&L, XIRR)
6. Portfolio detail page with holdings table

### Phase 3 — Import Engine
1. Build generic CSV/Excel parser
2. Build MF CAS statement parser
3. Build contract note parsers (start with Zerodha, then others)
4. Import wizard UI (upload → preview → confirm)
5. Background job processing with Bull

### Phase 4 — Capital Gains & Reports
1. FIFO capital gains calculator
2. XIRR calculator
3. Capital gains reports (Intraday, STCG, LTCG)
4. Schedule 112A report
5. Portfolio summary, XIRR, and historical valuation reports
6. PDF and Excel export for all reports

### Phase 5 — Full Asset Class Coverage
1. Futures & Options module
2. Bonds, FDs, NPS pages
3. Corporate actions (bonus, split, merger, demerger)
4. PPF, EPF, Gold, Real Estate, Insurance modules

### Phase 6 — Accounting Module
1. Chart of accounts
2. Auto-generate vouchers from transactions
3. Bank statement import
4. Trial balance, P&L, Balance sheet

### Phase 7 — Advisor Features
1. Client management
2. Multi-client portfolio views
3. AUM reports
4. Shared portfolio links

### Phase 8 — Polish
1. Alerts & reminders system
2. Email notifications
3. Mobile responsiveness polish
4. Performance optimisation (query optimization, Redis caching)
5. Onboarding flow for new users

---

## 14. ADDITIONAL FEATURES TO BUILD (Beyond MProfit)

After replicating all MProfit features, add these enhancements:

1. **AI Portfolio Insights** — Use Claude API to generate natural language portfolio analysis, flag underperforming assets, suggest rebalancing
2. **Portfolio Benchmarking** — Compare portfolio returns vs. Nifty 50, Sensex, sectoral indices
3. **Goal Planning** — Set financial goals (retirement, education, house) with SIP calculator and progress tracking
4. **Tax Loss Harvesting** — Identify stocks/funds with losses that can offset capital gains
5. **Crypto Support** — Track crypto holdings via API (CoinGecko)
6. **Drag-and-Drop Dashboard** — Customisable widget dashboard
7. **Dark Mode** — Full dark theme
8. **Multi-Currency** — For NRIs with foreign investments
9. **REST API + API Keys** — Let power users query their own data
10. **Collaborative Portfolios** — Share portfolio editing with family members

---

## 15. TESTING REQUIREMENTS

Create tests for all critical business logic:

```
packages/api/src/calculators/__tests__/
  capitalGains.test.ts   — Test FIFO matching, intraday, LTCG grandfathering, indexation
  xirr.test.ts           — Test XIRR calculation with known inputs/outputs
  
packages/api/src/parsers/__tests__/
  mfCas.test.ts          — Parse sample CAS statements
  contractNote.test.ts   — Parse sample contract notes

apps/web/src/components/__tests__/
  PortfolioSummary.test.tsx
  ReportsTable.test.tsx
```

Use **Vitest** for both frontend and backend tests.

---

## 16. CODE QUALITY STANDARDS

- TypeScript strict mode enabled everywhere (`"strict": true`)
- ESLint + Prettier configured
- All API responses use consistent shape: `{ success: boolean; data?: T; error?: string; meta?: PaginationMeta }`
- All monetary values stored and calculated as `Decimal` (never floating point)
- All dates stored as UTC, displayed in IST
- Indian number formatting utility: `formatINR(amount: Decimal): string` → `₹1,23,456.78`
- Pagination on all list endpoints: `?page=1&limit=50`
- Comprehensive error handling with meaningful error messages

---

## 17. SAMPLE DATA SEED

Create `packages/api/prisma/seed.ts` with:
- 1 demo investor user (email: `demo@portfolioos.in`, password: `Demo@1234`)
- 3 portfolios (Long Term, Trading, F&O)
- 20 stock holdings across both exchanges
- 10 mutual fund holdings
- 2 FDs
- 50+ transactions spanning 3 years
- Pre-calculated capital gains for FY 2024-25
- A demo advisor user with 3 demo clients

---

## 18. README

Create a comprehensive `README.md` with:
- Project overview
- Architecture diagram (ASCII or mermaid)
- Setup instructions (Docker + manual)
- API documentation pointer
- Features list
- Contributing guide
- License (MIT)

---

## START COMMAND

Begin by running:

```bash
# 1. Create project structure
mkdir portfolioos && cd portfolioos
npm init -w apps/web -w packages/api -w packages/shared -y

# 2. Start with Phase 1 — Foundation
# Follow the phase order in Section 13
```

**Read this entire CLAUDE.md before writing any code. Start with Phase 1 and work through phases sequentially. Do not skip phases. Ask for clarification if any feature specification is ambiguous.**
