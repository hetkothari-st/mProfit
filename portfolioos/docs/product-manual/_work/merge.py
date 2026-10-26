#!/usr/bin/env python3
"""Merge the full-app manual run's fragments into the six deliverables.

Usage: python merge.py <docs/product-manual dir> --product <name> --commit <sha> --date <YYYY-MM-DD>
Reads _work/global/* and _work/modules/<batch>/*.md (marker format in _work/BRIEF.md).
Prints the allow-list literals collected from fragments for the final audit.
"""
import argparse
import re
import sys
from pathlib import Path

# Reading order of the manual: account first, then the everyday core, then data in, assets, analysis, people.
BATCH_ORDER = [
    "b06-account-access", "b10-core-shell", "b07-data-in", "b02-mutual-funds", "b01-asset-classes",
    "b04-loans-cards", "b05-property-vehicles", "b11-money-misc", "b08-reports-tax", "b09-advice-pro",
    "b03-family-succession",
]
INVENTORY_HEADER = ("| ID | Feature | Module | Page/route | Roles | Actions | Settings/toggles | Backend deps | "
                    "Data read/modified | Impl. status | Doc status | Sources |\n" + "|---" * 12 + "|")
GAP_SECTIONS = [
    ("UNVERIFIED", "Unverified claims"),
    ("AMBIGUITIES", "Implementation ambiguities and possible defects"),
    ("HIDDEN", "Hidden, partial, backend-only, deprecated features"),
    ("MISMATCHES", "UI / API permission mismatches"),
    ("CHOICES", "Choices made without asking"),
    ("ALLOWLIST", "Audit allow-list"),
]


def between(text: str, name: str) -> str:
    m = re.search(rf"<!--\s*BEGIN {name}\s*-->(.*?)<!--\s*END {name}\s*-->", text, re.S)
    return m.group(1).strip("\n") if m else ""


def header_before(text: str, name: str) -> str:
    """The table header (2 lines) just before a BEGIN marker, if any."""
    idx = text.find(f"BEGIN {name}")
    if idx < 0:
        return ""
    lines = [l for l in text[:idx].splitlines() if l.strip()]
    lines = lines[:-1] if lines and "BEGIN" in lines[-1] else lines
    tail = [l for l in lines[-2:] if l.strip().startswith("|")]
    return "\n".join(tail) if len(tail) == 2 else ""


def rows(block: str) -> list[str]:
    out = []
    for l in block.splitlines():
        t = l.strip()
        if not t.startswith("|") or re.match(r"^\|\s*:?-", t):
            continue
        first = t.strip("|").split("|")[0].strip().lower()
        if first in {"id", "term", "key / cookie", "env var name", "page / feature / action", "symptom / message",
                     "choice", "literal"}:
            continue  # a table header that sat inside the markers
        out.append(l)
    return out


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8") if p.exists() else ""


def role_blocks(roles_md: str) -> str:
    out, keep = [], False
    for line in roles_md.splitlines():
        if re.match(r"^#{2,4}\s.*<!--\s*R-[A-Z0-9-]+\s*-->", line):
            keep = True
            line = "### " + line.lstrip("#").strip()
        elif keep and (line.startswith("ROLE ORDER") or re.match(r"^#{1,2}\s", line)):
            keep = False
        if keep:
            out.append(line)
    return "\n".join(out).strip()


def anchor(title: str) -> str:
    return re.sub(r"[^a-z0-9 -]", "", title.lower()).strip().replace(" ", "-")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--product", required=True)
    ap.add_argument("--commit", required=True)
    ap.add_argument("--date", required=True)
    a = ap.parse_args()
    root = Path(a.root)
    work = root / "_work"
    g = work / "global"
    roles_md = read(g / "roles.md")
    order_m = re.search(r"ROLE ORDER:\s*(.+)", roles_md)
    role_order = [r.strip() for r in order_m.group(1).split(",")] if order_m else []
    if not role_order:
        print("ERROR: no ROLE ORDER in roles.md")
        return 1

    batches = [b for b in BATCH_ORDER if (work / "modules" / b).is_dir()]
    missing = [b for b in BATCH_ORDER if b not in batches]
    frag = {b: {f.name: read(f) for f in (work / "modules" / b).glob("*.md")} for b in batches}

    head = (f"> Product: {a.product} · Generated: {a.date} · Source commit: {a.commit}\n"
            f"> UI verification: Code-only — not visually verified\n> Scope: Whole application")

    # PRODUCT_MANUAL.md
    chapters = [between(frag[b].get("PRODUCT_MANUAL.md", ""), "MODULES") for b in batches]
    body = "\n\n".join(c for c in chapters if c)
    glossary = {}
    for src in [read(g / "glossary.md")] + [frag[b].get("PRODUCT_MANUAL.md", "") for b in batches]:
        for r in rows(between(src, "GLOSSARY")):
            term = r.strip("|").split("|")[0].strip()
            glossary.setdefault(term.lower(), r)
    getting = between(read(g / "getting-started.md"), "GETTING-STARTED")
    # The fragment carries its own heading; the manual adds one too.
    getting = re.sub(r"^## Getting started\s*\n", "", getting.lstrip())
    changed = read(g / "changed-since.md").strip() if (g / "changed-since.md").exists() else ""
    changed_title = re.match(r"## (.+)", changed).group(1) if changed else ""
    h2 = ([changed_title] if changed else []) + ["Getting started"] + re.findall(r"^## (.+)$", body, re.M) + ["Roles and profiles", "Glossary"]
    toc = "\n".join(f"- [{t}](#{anchor(t)})" for t in h2)
    manual = (f"# {a.product} Product Manual\n\n{head}\n\n## Contents\n{toc}\n\n"
              + (changed + "\n\n" if changed else "")
              + f"## Getting started\n\n{getting}\n\n"
              f"{body}\n\n## Roles and profiles\n\n{role_blocks(roles_md)}\n\n## Glossary\n\n| Term | Meaning |\n|---|---|\n"
              + "\n".join(glossary[k] for k in sorted(glossary)) + "\n")
    (root / "PRODUCT_MANUAL.md").write_text(manual, encoding="utf-8")

    # FEATURE_INVENTORY.md
    inv_rows, dep_rows = [], []
    for b in batches:
        t = frag[b].get("FEATURE_INVENTORY.md", "")
        inv_rows += rows(between(t, "INVENTORY"))
        dep_rows += rows(between(t, "DEPENDENCIES"))
    counts: dict[str, int] = {}
    for r in inv_rows:
        cells = [c.strip() for c in r.strip().strip("|").split("|")]
        if len(cells) >= 11:
            counts[cells[9]] = counts.get(cells[9], 0) + 1
    summary = "\n".join(f"| {k} | {v} |" for k, v in sorted(counts.items()))
    inv = (f"# Feature Inventory\n\n{head}\n\n## Summary\n| Impl. status | Count |\n|---|---|\n{summary}\n"
           f"| **Total** | {len(inv_rows)} |\n\n## Inventory\n{INVENTORY_HEADER}\n" + "\n".join(inv_rows) +
           "\n\n## Dependencies\n| ID | Feature (out of scope of its batch) | How it's reached | Sources |\n|---|---|---|---|\n"
           + "\n".join(dep_rows) + "\n")
    (root / "FEATURE_INVENTORY.md").write_text(inv, encoding="utf-8")

    # SETTINGS_AND_TOGGLES.md
    sets = "\n\n".join(between(frag[b].get("SETTINGS_AND_TOGGLES.md", ""), "SETTINGS") for b in batches)
    def dedupe(name):
        seen, out = set(), []
        for b in batches:
            for r in rows(between(frag[b].get("SETTINGS_AND_TOGGLES.md", ""), name)):
                k = r.strip("|").split("|")[0].strip().lower()
                if k not in seen:
                    seen.add(k)
                    out.append(r)
        return "\n".join(out)
    settings = (f"# Settings and Toggles Reference\n\n{head}\n\n{sets.strip()}\n\n## Client-side storage\n"
                "| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |\n|---|---|---|---|---|\n"
                f"{dedupe('CLIENT-STORAGE')}\n\n## Operator configuration (not user-facing)\n"
                f"| Env var name | Purpose | Effect when unset |\n|---|---|---|\n{dedupe('OPERATOR-CONFIG')}\n")
    (root / "SETTINGS_AND_TOGGLES.md").write_text(settings, encoding="utf-8")

    # USER_ROLES_AND_PERMISSIONS.md
    matrix = "\n".join(r for b in batches for r in rows(between(frag[b].get("USER_ROLES_AND_PERMISSIONS.md", ""), "MATRIX")))
    notes = "\n".join(between(frag[b].get("USER_ROLES_AND_PERMISSIONS.md", ""), "ROLE-NOTES") for b in batches)
    app_level = between(roles_md, "APP-LEVEL")
    roles = (f"# User Roles and Permissions\n\n{head}\n\n## Roles\n\n{role_blocks(roles_md)}\n\n"
             + (f"## App-level access\n\n{app_level}\n\n" if app_level else "")
             + "## Permission matrix\n\n| Page / feature / action | " + " | ".join(role_order) + " | Enforced by |\n|---"
             + "|---" * (len(role_order) + 1) + f"|\n{matrix}\n\nLegend: Allowed · Denied · Conditional (see note)\n\n"
             f"## Notes and mismatches\n\n{notes.strip()}\n")
    (root / "USER_ROLES_AND_PERMISSIONS.md").write_text(roles, encoding="utf-8")

    # WORKFLOWS_AND_TROUBLESHOOTING.md
    wfs = "\n\n".join(between(frag[b].get("WORKFLOWS_AND_TROUBLESHOOTING.md", ""), "WORKFLOWS") for b in batches)
    ts = "\n".join(r for b in batches for r in rows(between(frag[b].get("WORKFLOWS_AND_TROUBLESHOOTING.md", ""), "TROUBLESHOOTING")))
    wf = (f"# Workflows and Troubleshooting\n\n{head}\n\n{wfs.strip()}\n\n## General troubleshooting\n"
          f"| Symptom / message | Why | How to recover |\n|---|---|---|\n{ts}\n")
    (root / "WORKFLOWS_AND_TROUBLESHOOTING.md").write_text(wf, encoding="utf-8")

    # DOCUMENTATION_GAPS.md
    parts = [f"# Documentation Gaps\n\n{head}\n\n## Verification limitations\n\n"
             "- The whole manual was produced from source code only; no screen was viewed in a running app.\n"
             + ("- Releases after the source commit fixed many of the defects listed below. The manual's "
                "\"Changed since this manual was written\" chapter lists every change by release.\n"
                if (g / "changed-since.md").exists() else "")
             + "".join(f"- Batch `{b}` produced no output.\n" for b in missing)]
    allow = []
    for name, title in GAP_SECTIONS:
        parts.append(f"\n## {title}\n")
        for b in batches:
            t = frag[b].get("DOCUMENTATION_GAPS.md", "")
            rs = rows(between(t, name))
            if not rs:
                continue
            hdr = header_before(t, name) or ""
            parts.append(f"\n### {b}\n{hdr}\n" + "\n".join(rs) + "\n")
            if name == "ALLOWLIST":
                allow += [r.strip("|").split("|")[0].strip().strip("`") for r in rs]
    (root / "DOCUMENTATION_GAPS.md").write_text("".join(parts), encoding="utf-8")

    print(f"merged batches: {len(batches)}; missing: {missing or 'none'}; features: {len(inv_rows)}")
    print("ALLOW:", " ".join(sorted(set(x for x in allow if x))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
