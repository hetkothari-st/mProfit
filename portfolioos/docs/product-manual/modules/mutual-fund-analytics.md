[Index](../INDEX.md)

# Mutual Fund Analytics

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Mutual Fund Analytics is the research layer on top of your mutual fund book. It has three pages: **Portfolio analysis** (your own book: returns, overlap, look-through, cost, tax, goals), a **fund page** per scheme (score, metrics, findings and verdict), and **How we score a fund** (the methodology). Portfolio analysis and fund pages need the Plus plan or higher (feature `MF_ANALYTICS`); the methodology page is open to every signed-in user. A fixed disclaimer closes the analysis and fund pages: "Past performance does not guarantee future returns, and no analysis here predicts them. … Mutual fund investments are subject to market risks; read all scheme related documents carefully."

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-MF-011](../features/F-MF-011.md) | Portfolio analysis — totals and scope notice | Live | The Portfolio analysis page opens with a summary card Mutual fund book: current value, invested value, number of schemes (and how many are … |
| [F-MF-012](../features/F-MF-012.md) | Funds you hold | Live | A table Funds you hold with one row per scheme: Scheme (AMC logo, name linking to the fund page, AMC · plan type · "SIP active" · "held N … |
| [F-MF-013](../features/F-MF-013.md) | Overlap | Live | The Overlap section lists, for each pair of your funds, the share of their portfolios made of the same securities, in two tables: Equity … |
| [F-MF-014](../features/F-MF-014.md) | Look-through | Live | The Look-through section adds up what your funds own underneath: Asset class split, Sectors, Underlying stocks (top 25, with Of MF book, Of … |
| [F-MF-015](../features/F-MF-015.md) | Cost | Live | The Cost section shows Weighted TER, Annual cost, Cost rank in category ("Higher is cheaper") and Direct-plan saving, per year, then a … |
| [F-MF-016](../features/F-MF-016.md) | Tax lots | Live | The Tax section shows Unrealised STCG, Unrealised LTCG, §112A headroom and Financial year, a list Lots currently at a loss, and Open lots: … |
| [F-MF-017](../features/F-MF-017.md) | Goals fit | Live | The Goals section shows, for each active goal linked to portfolios that hold funds, a suitability chip (Suitable, Mismatch, Underpowered), … |
| [F-MF-018](../features/F-MF-018.md) | Fund detail — Overview | Live | A fund page (/mutual-funds/<scheme code>) shows the AMC logo, scheme name, "AMC · SEBI category / sub-category · plan type plan" and, on … |
| [F-MF-019](../features/F-MF-019.md) | Fund alternatives | Live | On the fund Overview, Ranked higher by your adviser lists up to 3 funds in the same category that the adviser's signed fund ranking places … |
| [F-MF-020](../features/F-MF-020.md) | Fund detail — Detailed calculations | Live | The Detailed calculations tab shows: the Fund score card (composite, stars, rating status, risk-o-meter, category universe, median and … |
| [F-MF-021](../features/F-MF-021.md) | Findings, verdict and Refresh analysis | Live | The What we found block on the Detailed calculations tab shows the latest analysis run of *your* portfolio for this fund: a verdict chip … |
| [F-MF-022](../features/F-MF-022.md) | Scoring methodology | Live | How we score a fund shows the scoring rules read live from the scorer: an overview (percentile ranks within the fund's own SEBI … |
| [F-MF-023](../features/F-MF-023.md) | Fund research data pipeline | Live | Scheduled server jobs keep the research data behind the fund pages current: NAV adjustment for payouts (22:30 IST daily), metrics (23:15 … |
