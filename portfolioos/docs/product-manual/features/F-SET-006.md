---
id: F-SET-006
title: "Desktop app download and version"
module: "Settings"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: []
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Desktop app download and version

`F-SET-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Offers the EveryPaisa desktop app for Windows or Mac (latest published release), in Settings and as a **Desktop app** link in the header; inside the desktop app, shows which version is running.

**Why it exists:** The card text: "EveryPaisa in its own window on your computer, with the same account and data. It keeps itself up to date."

**Where to find it:** **Tools → Settings → Desktop app**, and the header **Desktop app** link (download icon, wider screens only).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) on a Windows or Mac computer.

**Steps**
1. In Settings, click **Download for Windows** or **Download for Mac** (the one for your computer is highlighted and first). Or click the header link ("Download EveryPaisa for Mac/Windows").
2. Inside the desktop app, the card reads "You're using the EveryPaisa desktop app, version <v>. It updates itself; Help → Check for Updates checks now."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download for Windows** / **Download for Mac** | Link buttons | Download the installer | Hidden when that installer is missing from the release |
| Header **Desktop app** | Link | Downloads the installer for your computer | Hidden on phones/tablets (<768px), inside the desktop app, and until a release exists |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The installer downloads from GitHub.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| The card or header link is missing | No published release yet, GitHub unreachable, a phone/tablet or other OS, or no installer for your OS | Use the web app |

**Limitations:** Only Windows and Mac. Drafts and pre-releases are ignored.

**How it works:** The browser (without your session) calls GitHub's "latest release" API for the app's repository and picks assets named `EveryPaisa-Setup-*.exe` and `*-mac.dmg`. The result is cached for 1 hour and not retried on failure. The desktop app identifies itself to the page with its version.

**Related features:** [D-SET-006](../dependencies.md#d-set-006).

**Sources:** `apps/web/src/pages/settings/DesktopAppSection.tsx:12`, `apps/web/src/pages/settings/DesktopAppSection.tsx:29`, `apps/web/src/pages/settings/DesktopAppSection.tsx:36`, `apps/web/src/components/layout/DesktopDownloadButton.tsx:10`, `apps/web/src/components/layout/DesktopDownloadButton.tsx:24`, `apps/web/src/lib/desktopApp.ts:44`, `apps/web/src/lib/desktopApp.ts:51`, `apps/web/src/lib/desktopApp.ts:64`
