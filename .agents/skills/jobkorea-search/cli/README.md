# jobkorea-cli

CLI for searching jobs on JobKorea (잡코리아, jobkorea.co.kr), South Korea, across any sector.

**Data source**: JobKorea's public search page and posting pages (`/Search/`, `/Recruit/GI_Read/{id}`, `/Recruit/GI_Read_Comt_Ifrm`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Keep volume low and don't use it commercially or for bulk data collection.

## Installation

```bash
cd .agents/skills/jobkorea-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required; put the region in the query) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "데이터 엔지니어" --jobage 7 --format table
bun run src/cli.ts search -q "회계 부산" --format table
bun run src/cli.ts detail 50101226 --format plain
```

## Tests

```bash
bun test                    # offline: parsers against fixtures + argument validation
JOBKOREA_LIVE=1 bun test     # also runs one live search + detail against jobkorea.co.kr
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the markup anchors.
