---
name: saramin-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in South Korea, find
  Korean job listings, or look up a specific Saramin job posting — even if they
  don't mention saramin.co.kr explicitly. Saramin (사람인) is one of Korea's two
  largest general-purpose job boards, covering every sector and region. Invoke for
  open positions, vacancies and hiring in Korea or in Korean cities (Seoul, Busan,
  Incheon, Daegu, Daejeon, Gwangju, Pangyo/Seongnam). Trigger phrases include:
  saramin, 사람인, 채용공고, 채용 정보, 구인, 구직, 일자리, 취업, 이직, 경력직 채용,
  신입 채용, 정규직, 서울 채용, 부산 채용, 개발자 채용, 백엔드 개발자, 데이터 엔지니어,
  마케팅 채용, 회계 채용, jobs in korea, korean jobs, job search korea, work in
  korea, jobs seoul, jobs busan, hiring korea, job openings korea.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/saramin-search/cli/src/cli.ts *)
---

# Saramin Search Skill (사람인)

Search live job listings on Saramin (saramin.co.kr), a general-purpose Korean job
board. No authentication or API key is needed, and the CLI has **no runtime
dependencies**: it runs with just `bun`. Postings are in Korean, so Korean
keywords give the best results ("데이터 엔지니어" works better than "data engineer").

## ⚠️ Personal use only

This reads Saramin's public pages. `robots.txt` permits the search and job-view
paths this CLI uses, but **keep volume low, don't use it commercially or for bulk
data collection,** and run it on your own responsibility.

## When to use this skill

- Search for job openings in Korea by keyword (직무, 기술, 회사명)
- Narrow to one or more regions (서울, 경기, 부산, …)
- Keep only recent postings, or sort newest first
- Get the full description, conditions and deadline of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: keyword search. **Required.**
- `--location <region>` / `-l <region>`: region filter. Accepts 서울, 경기, 인천, 부산, 대구, 대전, 광주 (전남광주), 울산, 세종, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주, 전국. Full names (서울특별시) and romanized names (seoul, busan) work too. Comma-separate for several: `-l "서울,경기"`.
- `--jobage <days>`: keep postings dated within N days. Saramin has no age parameter, so this filters the fetched page client-side on the card date (see Notes).
- `--sort <order>`: `relevance` (default) or `date` (newest first).
- `--page <n>`: page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>`: cap results the CLI outputs (client-side).
- `--format json|table|plain`

### Fetch full job detail

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts detail <rec_idx|url> [--format json|plain]
```

`rec_idx` is the `id` from `search` results (e.g. `55297082`). A full saramin.co.kr
job URL works too; URLs on other hosts are rejected. Returns title, company,
address, 경력, 학력, 근무형태, 급여, 근무일시, start date, deadline, and the full
posting body.

---

## How to use effectively

**Always start with `search`**, then call `detail <id>` for the postings worth reading.

**Use `--sort date --jobage 7`** for a weekly sweep of fresh postings.

**Combine regions** when the commute allows: `-l "서울,경기"` covers Seoul plus Pangyo/Bundang.

**Use `--format table`** for scanning, `json` for processing, and `plain` for reading one posting.

---

## Usage examples

### Data engineer roles in Seoul, newest first

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search \
  -q "데이터 엔지니어" -l 서울 --sort date --format table
```

### Backend developer roles in Seoul or Gyeonggi from the last 7 days

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search \
  -q "백엔드 개발자" -l "서울,경기" --sort date --jobage 7 --format table
```

### Marketing roles in Busan

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search \
  -q "마케팅" -l 부산 --limit 10 --format table
```

### Accounting roles, page 2, as JSON

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search \
  -q "회계" --page 2 --format json
```

### Full details for one posting

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts detail 55297082 --format plain
```

---

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable overview |
| `plain` | Reading a single posting (`detail`) |

Search JSON is `{ "meta": { "count", "total", "page" }, "results": [...] }`. Each
result has `id`, `title`, `company`, `location`, `date`, `dateKind`, `deadline`,
`conditions`, `sectors` and `url` (missing values are `null`).

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

---

## Notes

- **Dates:** a card shows either 등록일 (posted) or 수정일 (last edited). `date` holds whichever is shown and `dateKind` says which (`posted` / `edited`). `--jobage` filters on that date, so a recently edited old posting counts as recent.
- **`--jobage` filters one page.** It does not fetch more pages to make up for filtered-out cards; combine it with `--sort date` so the page holds the newest postings.
- **Deadline** in search results is Saramin's card text (`~ 11/14(토)`, `채용시`, `상시채용`); `detail` returns the exact `YYYY-MM-DD HH:MM`.
- **Image-only postings:** some employers publish the body as images. `detail` then sets `imageBody: true` and the text description is short or empty; read the posting at its `url`.
- **Detail needs two requests:** the `view-ajax` fragment (summary) and the `view-detail` iframe (body), the same two calls Saramin's own page makes.
- Endpoint and markup anchors are documented in `url-reference.md`.
