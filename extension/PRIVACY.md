# PortfolioOS Browser Extension — Privacy Policy

**Effective:** 2026-05-07

## What we collect

The PortfolioOS extension reads page content **only** on the following financial portal hostnames:

- `passbook.epfindia.gov.in`
- `unifiedportal-mem.epfindia.gov.in`
- `retail.onlinesbi.sbi`
- `onlinesbi.sbi`
- (additional Indian bank netbanking domains as supported in future releases)

On these pages the extension extracts:

- Transaction date, amount, and description from passbook / statement tables
- Account identifier (last 4 digits only)

## What we do NOT collect

- Browsing history outside the listed hostnames
- Login credentials (the extension never reads password fields)
- One-time passwords (OTPs)
- Any content on any non-financial-portal page

## Where data goes

Extracted financial data is sent over HTTPS to your paired PortfolioOS account on the Railway-hosted PortfolioOS API. It is stored encrypted at rest. Only your account can read it. We do not share data with third parties. We do not sell data.

## Authentication

The extension authenticates using a bearer token issued during the one-time pairing flow with your PortfolioOS web account. Bearers are stored in `chrome.storage.local`, encrypted by the browser profile. You can revoke a paired extension at any time from the extension popup or your PortfolioOS web account settings.

## Permissions explained

- `storage` — to remember your pairing token across browser restarts.
- `host_permissions` — limited to the financial portal domains listed above. The extension cannot access any other site.

## Data retention

You can delete your PortfolioOS account at any time from the web app. Account deletion permanently removes all extension-sourced data within 30 days.

## Contact

Questions? Email: privacy@portfolio-os.in (replace with real email when registered)

## Changes

We will update this policy as needed. The "Effective" date at the top reflects the current version.
