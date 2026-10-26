# EveryPaisa Product Manual

Start with **[INDEX.md](INDEX.md)**: every module, feature, setting, workflow and role, one line each, linking to one small file per item.

| Folder / file | What it holds |
|---|---|
| `INDEX.md` | The index |
| `modules/` | One file per area: its introduction and feature list |
| `features/` | One file per feature (`F-…`), with a header listing module, status, roles, settings and related features |
| `settings/` | Settings and toggles, one file per area |
| `workflows/` | Step-by-step tasks (`W-…`) |
| `roles.md` · `dependencies.md` · `glossary.md` · `CHANGES.md` | Roles and permissions, cross-module links, terms, changes since the source commit |
| `PRODUCT_MANUAL.md` and the other capitalised files | The full single-file deliverables this tree is generated from |
| `_work/` | Generation scripts and per-batch sources |

Regenerate: run `_work/merge.py` (rebuilds the full files), then `python docs/product-manual/_work/split.py docs/product-manual`.
