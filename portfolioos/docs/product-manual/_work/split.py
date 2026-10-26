"""Split the full product manual into an index plus one file per feature.

Reads the six merged deliverables in docs/product-manual/ (built by merge.py)
and writes a navigable tree beside them:

  INDEX.md                 every module, feature, setting, workflow and role, one line each
  modules/<slug>.md        a chapter's introduction and the list of its features
  features/<F-ID>.md       one feature, all its parts, with a small header
  settings/<slug>.md       the settings that belong to one module
  workflows/<W-ID>.md      one workflow
  roles.md                 roles and the permission matrix
  dependencies.md          cross-module dependency table
  CHANGES.md               behaviour changed since the source commit

IDs (F-, S-, W-, D-, R-) in the text become relative links, so a reader or an
agent can open only the file it needs. Re-run after merge.py:

  python docs/product-manual/_work/split.py docs/product-manual
"""
import re
import shutil
import sys
from pathlib import Path

ID_RE = re.compile(r"\b(?:[FSWD]-[A-Z0-9]+-\d{3}|R-[A-Z]+)\b")
MARK_RE = re.compile(r"\s*<!--\s*((?:[FSWDR])-[A-Z0-9-]+)\s*-->")
SKIP_CHAPTERS = {"Contents", "Glossary", "Roles and profiles"}
CHANGED_CHAPTER = "Changed since this manual was written"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8").replace("\r\n", "\n")


def split_on(text: str, level: str) -> list[str]:
    """Split text into blocks that start with a heading of the given level ('## ')."""
    parts = re.split(rf"^(?={re.escape(level)})", text, flags=re.M)
    return [p for p in parts if p.startswith(level)]


def cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def first_sentence(text: str, cap: int = 140) -> str:
    text = re.sub(r"`([^`]*)`", r"\1", re.sub(r"\*\*", "", text)).strip()
    m = re.match(r"(.+?[.!?])(\s|$)", text)
    s = m.group(1) if m else text
    return s if len(s) <= cap else s[:cap].rsplit(" ", 1)[0] + " …"


def main() -> int:
    root = Path(sys.argv[1])
    manual = read(root / "PRODUCT_MANUAL.md")
    inventory = read(root / "FEATURE_INVENTORY.md")
    settings_src = read(root / "SETTINGS_AND_TOGGLES.md")
    workflows_src = read(root / "WORKFLOWS_AND_TROUBLESHOOTING.md")
    roles_src = read(root / "USER_ROLES_AND_PERMISSIONS.md")
    head = "\n".join(l for l in manual.split("\n")[1:6] if l.startswith(">"))

    # Inventory: status and roles per feature; ID prefix -> module.
    inv, prefix_module, deps = {}, {}, []
    section = ""
    for line in inventory.split("\n"):
        if line.startswith("## "):
            section = line[3:].strip()
        if not line.startswith("| ") or line.startswith("|---"):
            continue
        c = cells(line)
        if section == "Inventory" and re.match(r"F-[A-Z0-9]+-\d{3}$", c[0]):
            inv[c[0]] = {"name": c[1], "module": c[2], "route": c[3], "roles": c[4], "actions": c[5],
                         "settings": c[6], "backend": c[7], "data": c[8], "status": c[9], "sources": c[11] if len(c) > 11 else ""}
        elif section == "Dependencies" and c[0].startswith("D-"):
            deps.append(c)

    # ID prefix -> manual chapter, so settings and workflows land beside their module file.
    for chapter in split_on(manual, "## "):
        ctitle = chapter.split("\n", 1)[0][3:].strip()
        for fid in re.findall(r"<!--\s*F-([A-Z0-9]+)-\d{3}\s*-->", chapter):
            prefix_module.setdefault(fid, ctitle)
    for fid, v in inv.items():
        prefix_module.setdefault(fid.split("-")[1], v["module"])

    # Settings, grouped by the module their ID prefix belongs to.
    settings, setting_file = {}, {}
    for block in split_on(settings_src, "### "):
        m = MARK_RE.search(block.split("\n", 1)[0])
        if not m:
            continue
        sid = m.group(1)
        module = prefix_module.get(sid.split("-")[1], "Other")
        name = MARK_RE.sub("", block.split("\n", 1)[0][4:]).strip()
        default = ""
        dm = re.search(r"^\| Default \| (.+?) \|$", block, re.M)
        if dm:
            default = first_sentence(dm.group(1), 90)
        # Trailing "## page → section" headings belong to the next setting; drop them.
        body = re.split(r"^## ", block, flags=re.M)[0].rstrip()
        settings.setdefault(module, []).append((sid, name, default, body))
        setting_file[sid] = slug(module)

    workflows = []
    for block in split_on(workflows_src, "## "):
        m = MARK_RE.search(block.split("\n", 1)[0])
        if m:
            title = MARK_RE.sub("", block.split("\n", 1)[0][3:]).strip()
            module = prefix_module.get(m.group(1).split("-")[1], "Other")
            workflows.append((m.group(1), title, module, block.rstrip()))
    workflow_ids = {w[0] for w in workflows}

    roles_heads = re.findall(r"^### (.+?)\s*<!--\s*(R-[A-Z]+)\s*-->", roles_src, re.M)
    dep_ids = {d[0] for d in deps}

    def linker(where: str):
        """Return a function that links IDs as seen from a file in `where` ('', 'features', ...)."""
        up = "../" if where else ""

        def target(i: str) -> str | None:
            if i.startswith("F-") and i in inv:
                return f"{up}features/{i}.md" if where != "features" else f"{i}.md"
            if i.startswith("S-") and i in setting_file:
                return f"{up}settings/{setting_file[i]}.md#{i.lower()}"
            if i.startswith("W-") and i in workflow_ids:
                return f"{up}workflows/{i}.md" if where != "workflows" else f"{i}.md"
            if i.startswith("D-") and i in dep_ids:
                return f"{up}dependencies.md#{i.lower()}"
            if i.startswith("R-") and any(r == i for _, r in roles_heads):
                return f"{up}roles.md#{i.lower()}"
            return None

        def link_line(line: str) -> str:
            if line.lstrip().startswith("#"):
                return line
            out = []
            for k, seg in enumerate(re.split(r"(`[^`]*`)", line)):
                if k % 2:  # inside a code span
                    out.append(seg)
                    continue
                out.append(ID_RE.sub(lambda m: f"[{m.group(0)}]({t})" if (t := target(m.group(0))) else m.group(0), seg))
            return "".join(out)

        return lambda text: "\n".join(link_line(l) for l in text.split("\n"))

    def anchor_heading(block: str) -> str:
        """Put an explicit anchor before a marked heading so ID links resolve on any renderer."""
        first, _, rest = block.partition("\n")
        m = MARK_RE.search(first)
        if not m:
            return block
        return f'<a id="{m.group(1).lower()}"></a>\n{MARK_RE.sub("", first)}\n{rest}'

    for d in ("modules", "features", "settings", "workflows"):
        shutil.rmtree(root / d, ignore_errors=True)
        (root / d).mkdir()

    # Chapters -> module files and feature files.
    modules, feature_rows = [], []
    link_f, link_m = linker("features"), linker("modules")
    changes = ""
    for chapter in split_on(manual, "## "):
        title = chapter.split("\n", 1)[0][3:].strip()
        if title == "Glossary":
            (root / "glossary.md").write_text("[Index](INDEX.md)\n\n# " + chapter[3:].rstrip() + "\n", encoding="utf-8")
            continue
        if title in SKIP_CHAPTERS:
            continue
        if title == CHANGED_CHAPTER:
            changes = chapter
            continue
        ms = slug(title)
        blocks = re.split(r"^(?=### )", chapter.split("\n", 1)[1], flags=re.M)
        intro, features, extra = blocks[0].strip(), [], []
        for b in blocks[1:]:
            m = re.search(r"<!--\s*(F-[A-Z0-9]+-\d{3})\s*-->", b.split("\n", 1)[0])
            if not m:
                extra.append(b.rstrip())
                continue
            fid = m.group(1)
            name = MARK_RE.sub("", b.split("\n", 1)[0][4:]).strip()
            body = b.split("\n", 1)[1].strip()
            what = re.search(r"^\*\*What it does:\*\*\s*(.+)$", body, re.M)
            info = inv.get(fid, {"status": "?", "roles": "?"})
            settings_here = sorted(set(re.findall(r"\bS-[A-Z0-9]+-\d{3}\b", body)))
            related = sorted(set(re.findall(r"\bF-[A-Z0-9]+-\d{3}\b", body)) - {fid})
            meta = (f"---\nid: {fid}\ntitle: \"{name}\"\nmodule: \"{title}\"\nstatus: {info['status']}\n"
                    f"roles: \"{info['roles']}\"\nsettings: [{', '.join(settings_here)}]\n"
                    f"related: [{', '.join(related)}]\n---\n\n")
            nav = f"[← {title}](../modules/{ms}.md) · [Index](../INDEX.md)\n\n"
            (root / "features" / f"{fid}.md").write_text(
                meta + nav + f"# {name}\n\n`{fid}` · {info['status']} · Roles: {link_f(info['roles'])}\n\n" + link_f(body) + "\n",
                encoding="utf-8")
            one = first_sentence(what.group(1)) if what else ""
            features.append((fid, name, info["status"], one))
            feature_rows.append((fid, name, title, ms, info["status"], one))
        lines = [f"[Index](../INDEX.md)\n\n# {title}\n", head, ""]
        if intro:
            lines += [link_m(intro), ""]
        if features:
            lines += ["## Features", "", "| ID | Feature | Status | What it does |", "|---|---|---|---|"]
            lines += [f"| [{f}](../features/{f}.md) | {n} | {s} | {o} |" for f, n, s, o in features]
            lines.append("")
        if title in {m for m in settings}:
            lines += [f"Settings for this module: [settings/{ms}.md](../settings/{ms}.md)", ""]
        lines += [link_m(x) for x in extra]
        (root / "modules" / f"{ms}.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        modules.append((title, ms, len(features)))

    # Inventory-only features (backend jobs, hidden screens) get a short file from their inventory row,
    # so every F- link resolves.
    documented = {r[0] for r in feature_rows}
    not_in_manual = [(f, v) for f, v in inv.items() if f not in documented]
    for fid, v in not_in_manual:
        module_slug = slug(prefix_module.get(fid.split("-")[1], v["module"]))
        back = (f"[← {prefix_module.get(fid.split('-')[1], v['module'])}](../modules/{module_slug}.md) · "
                if (root / "modules" / f"{module_slug}.md").exists() else "")
        srcs = ", ".join(f"`{x.strip()}`" for x in v["sources"].split(";") if x.strip())
        body = "\n".join([
            "---", f"id: {fid}", f'title: "{v["name"]}"', f'module: "{v["module"]}"', f"status: {v['status']}",
            f'roles: "{v["roles"]}"', "in_manual: false", "---", "",
            f"{back}[Index](../INDEX.md)", "", f"# {v['name']}", "",
            f"`{fid}` · {v['status']} · Roles: {v['roles']}", "",
            "This entry has no section in the product manual (usually a background job, an API with no screen, "
            "or a hidden page). What the inventory records:", "",
            "| | |", "|---|---|",
            f"| Module | {v['module']} |", f"| Page / route | {v['route']} |", f"| Actions | {v['actions']} |",
            f"| Settings | {v['settings']} |", f"| Backend | {v['backend']} |", f"| Data read / changed | {v['data']} |",
            f"| Sources | {srcs} |", "",
            "Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).", ""])
        (root / "features" / f"{fid}.md").write_text(link_f(body), encoding="utf-8")

    link_s = linker("settings")
    for module, items in settings.items():
        text = [f"[Index](../INDEX.md)\n\n# Settings — {module}\n", head, ""]
        text += [link_s(anchor_heading(body)) + "\n" for _, _, _, body in items]
        (root / "settings" / f"{slug(module)}.md").write_text("\n".join(text), encoding="utf-8")

    link_w = linker("workflows")
    for wid, wtitle, module, body in workflows:
        (root / "workflows" / f"{wid}.md").write_text(
            f"[Index](../INDEX.md)\n\n# {wtitle}\n\n`{wid}` · {module}\n\n" + link_w(body.split("\n", 1)[1].strip()) + "\n",
            encoding="utf-8")

    link_root = linker("")
    roles_out = re.sub(r"^(### .+?)\s*<!--\s*(R-[A-Z]+)\s*-->", lambda m: f'<a id="{m.group(2).lower()}"></a>\n{m.group(1)}',
                       roles_src, flags=re.M)
    (root / "roles.md").write_text("[Index](INDEX.md)\n\n" + link_root(roles_out.split("\n", 1)[1]), encoding="utf-8")

    dep_lines = ["[Index](INDEX.md)\n\n# Cross-module dependencies\n", head, "",
                 "| ID | Feature | How it's reached | Sources |", "|---|---|---|---|"]
    dep_lines += [f'| <a id="{d[0].lower()}"></a>{d[0]} | ' + " | ".join(d[1:]) + " |" for d in deps]
    (root / "dependencies.md").write_text("\n".join(dep_lines) + "\n", encoding="utf-8")

    if changes:
        (root / "CHANGES.md").write_text("[Index](INDEX.md)\n\n# " + link_root(changes[3:]).rstrip() + "\n", encoding="utf-8")

    # INDEX.md
    idx = [
        "# EveryPaisa Product Manual — Index", "", head, "",
        "Start here. Each row links to one small file, so you only open what you need.",
        "",
        "| Look for | Open |", "|---|---|",
        "| A screen or area | [Modules](#modules) → `modules/<area>.md` |",
        "| One feature in full (what, why, steps, controls, errors, how it works) | [Features](#features) → `features/<F-ID>.md` |",
        "| A setting or toggle | [Settings](#settings) → `settings/<area>.md` |",
        "| A task, step by step | [Workflows](#workflows) → `workflows/<W-ID>.md` |",
        "| Who can do what | [roles.md](roles.md) |",
        "| What changed after this manual was written | [CHANGES.md](CHANGES.md) |",
        "| A term | [glossary.md](glossary.md) |",
        "| Known gaps and possible defects | [DOCUMENTATION_GAPS.md](DOCUMENTATION_GAPS.md) |",
        "",
        "> These files are generated from the full deliverables in this folder (`PRODUCT_MANUAL.md` and the others) by "
        "`_work/split.py`. Edit the source and re-run the script; don't edit the generated files by hand.",
        "",
        "## Modules", "", "| Module | Features |", "|---|---|",
    ]
    idx += [f"| [{t}](modules/{s}.md) | {n} |" for t, s, n in modules]
    idx += ["", "## Features"]
    for t, s, n in modules:
        rows = [r for r in feature_rows if r[3] == s]
        if not rows:
            continue
        idx += ["", f"### [{t}](modules/{s}.md)", "", "| ID | Feature | Status | What it does |", "|---|---|---|---|"]
        idx += [f"| [{f}](features/{f}.md) | {n} | {st} | {o} |" for f, n, _, _, st, o in rows]
    if not_in_manual:
        idx += ["", "### Not described in the manual", "",
                "Inventory entries with no manual section (mostly backend jobs or hidden pages); each has a short file. Details: "
                "[FEATURE_INVENTORY.md](FEATURE_INVENTORY.md).", "",
                "| ID | Feature | Module | Status |", "|---|---|---|---|"]
        idx += [f"| [{f}](features/{f}.md) | {v['name']} | {v['module']} | {v['status']} |" for f, v in not_in_manual]
    idx += ["", "## Settings"]
    for module, items in settings.items():
        idx += ["", f"### [{module}](settings/{slug(module)}.md)", "", "| ID | Setting | Default |", "|---|---|---|"]
        idx += [f"| [{sid}](settings/{slug(module)}.md#{sid.lower()}) | {name} | {d} |" for sid, name, d, _ in items]
    idx += ["", "## Workflows", "", "| ID | Workflow | Module |", "|---|---|---|"]
    idx += [f"| [{w}](workflows/{w}.md) | {t} | {m} |" for w, t, m, _ in workflows]
    idx += ["", "## Roles", "", "| ID | Role |", "|---|---|"]
    idx += [f"| [{r}](roles.md#{r.lower()}) | {n} |" for n, r in roles_heads]
    (root / "INDEX.md").write_text("\n".join(idx) + "\n", encoding="utf-8")
    readme = [
        "# EveryPaisa Product Manual", "",
        "Start with **[INDEX.md](INDEX.md)**: every module, feature, setting, workflow and role, one line each, "
        "linking to one small file per item.", "",
        "| Folder / file | What it holds |", "|---|---|",
        "| `INDEX.md` | The index |",
        "| `modules/` | One file per area: its introduction and feature list |",
        "| `features/` | One file per feature (`F-…`), with a header listing module, status, roles, settings and related features |",
        "| `settings/` | Settings and toggles, one file per area |",
        "| `workflows/` | Step-by-step tasks (`W-…`) |",
        "| `roles.md` · `dependencies.md` · `glossary.md` · `CHANGES.md` | Roles and permissions, cross-module links, terms, changes since the source commit |",
        "| `PRODUCT_MANUAL.md` and the other capitalised files | The full single-file deliverables this tree is generated from |",
        "| `_work/` | Generation scripts and per-batch sources |", "",
        "Regenerate: run `_work/merge.py` (rebuilds the full files), then "
        "`python docs/product-manual/_work/split.py docs/product-manual`.", "",
    ]
    (root / "README.md").write_text("\n".join(readme), encoding="utf-8")

    print(f"modules {len(modules)} · features {len(feature_rows)} (+{len(not_in_manual)} inventory-only) · "
          f"settings {sum(len(v) for v in settings.values())} · workflows {len(workflows)} · roles {len(roles_heads)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
