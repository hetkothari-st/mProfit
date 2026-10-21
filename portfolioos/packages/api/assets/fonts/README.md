# Bundled fonts (Will Maker PDF)

Noto Serif v2.015 (hinted Regular, Bold, Italic) - https://github.com/notofonts/latin-greek-cyrillic/releases/tag/NotoSerif-v2.015
Noto Serif Devanagari v2.006 (hinted Regular, Bold) - https://github.com/notofonts/devanagari/releases/tag/NotoSerifDevanagari-v2.006

Both are licensed under the SIL Open Font License 1.1 (`OFL.txt`, `OFL-NotoSerifDevanagari.txt`).
Checksums are pinned in `packages/api/test/will/fonts.test.ts`. To update a font, download the new
release zip, verify it, replace the file and update the pinned hash in the same commit.

Will PDFs generated before template v2 used Noto Sans; those PDFs are stored as generated and are
never re-rendered, so the Sans files are no longer bundled.
