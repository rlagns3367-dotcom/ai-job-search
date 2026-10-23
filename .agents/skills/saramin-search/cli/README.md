# saramin-cli

CLI for searching jobs on Saramin (사람인, saramin.co.kr), South Korea, across any sector.

**Data source**: Saramin's public search page and job-view fragments (`/zf_user/search/recruit`, `/zf_user/jobs/relay/view-ajax`, `/zf_user/jobs/relay/view-detail`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Keep volume low and don't use it commercially or for bulk data collection.

## Installation

```bash
cd .agents/skills/saramin-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "데이터 엔지니어" -l 서울 --sort date --format table
bun run src/cli.ts search -q "백엔드 개발자" -l "서울,경기" --jobage 7 --format table
bun run src/cli.ts detail 55297082 --format plain
```

## Tests

```bash
bun test                    # offline: parsers against fixtures + argument validation
SARAMIN_LIVE=1 bun test     # also runs one live search + detail against saramin.co.kr
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the markup anchors.
