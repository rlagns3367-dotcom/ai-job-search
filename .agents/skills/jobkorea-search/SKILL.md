---
name: jobkorea-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in South Korea, find
  Korean job listings, or look up a specific JobKorea job posting — even if they
  don't mention jobkorea.co.kr explicitly. JobKorea (잡코리아) is one of Korea's two
  largest general-purpose job boards, covering every sector and region. Invoke for
  open positions, vacancies and hiring in Korea or in Korean cities (Seoul, Busan,
  Incheon, Daegu, Daejeon, Gwangju, Pangyo/Seongnam). Trigger phrases include:
  jobkorea, 잡코리아, 채용공고, 채용 정보, 구인, 구직, 일자리, 취업, 이직, 경력직 채용,
  신입 채용, 정규직, 대기업 채용, 공채, 수시채용, 개발자 채용, 데이터 엔지니어, 마케팅 채용,
  회계 채용, jobs in korea, korean jobs, job search korea, work in korea, jobs
  seoul, hiring korea, job openings korea.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobkorea-search/cli/src/cli.ts *)
---

# JobKorea Search Skill (잡코리아)

Search live job listings on JobKorea (jobkorea.co.kr), a general-purpose Korean job
board. No authentication or API key is needed, and the CLI has **no runtime
dependencies**: it runs with just `bun`. Postings are in Korean, so Korean keywords
give the best results.

## ⚠️ Personal use only

This reads JobKorea's public pages. `robots.txt` permits the search and posting
paths this CLI uses, but **keep volume low, don't use it commercially or for bulk
data collection,** and run it on your own responsibility.

## When to use this skill

- Search for job openings in Korea by keyword (직무, 기술, 회사명)
- Keep only postings from today, the last 3 days, week or month
- Get the full description, conditions and deadline of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: keyword search. **Required.**
- `--jobage <days>`: posted within N days. Mapped to JobKorea's own windows, rounded up: `1` (오늘), `2`-`3` (최근3일), `4`-`7` (최근1주일), `8`-`30` (최근1개월). Above 30, the page is filtered client-side on the posting date.
- `--page <n>`: page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>`: cap results the CLI outputs (client-side).
- `--format json|table|plain`

> **Location note:** JobKorea's region filter is not exposed as a URL parameter, so this CLI has no `--location` flag (passing one is an error, not silently ignored). Put the region in the query instead, e.g. `-q "회계 부산"`. This matches on posting text, so check the `location` field of each result.

### Fetch full job detail

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the posting number from `search` results (e.g. `50101226`). A full
jobkorea.co.kr `GI_Read` URL works too; URLs on other hosts are rejected. Returns
title, company, address, 경력, 학력, 고용형태, 급여, posting date, deadline, and the
full posting body.

---

## How to use effectively

**Always start with `search`**, then call `detail <id>` for the postings worth reading.

**Use `--jobage 7`** for a weekly sweep of fresh postings.

**Watch the `sponsored` field.** JobKorea mixes paid placements into the results;
they are marked `sponsored: true` and may match the query only loosely.

**Use `--format table`** for scanning, `json` for processing, and `plain` for reading one posting.

---

## Usage examples

### Data engineer roles from the last week

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search \
  -q "데이터 엔지니어" --jobage 7 --format table
```

### Marketing roles in Seoul

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search \
  -q "마케팅 서울" --format table
```

### Accounting roles in Busan, posted today

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search \
  -q "회계 부산" --jobage 1 --format table
```

### Backend developer roles, page 2, as JSON

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search \
  -q "백엔드 개발자" --page 2 --format json
```

### Full details for one posting

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts detail 50101226 --format plain
```

---

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable overview |
| `plain` | Reading a single posting (`detail`) |

Search JSON is `{ "meta": { "count", "total", "page" }, "results": [...] }`. Each
result has `id`, `title`, `company`, `location`, `date`, `deadline`, `tags`,
`sponsored` and `url` (missing values are `null`).

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

---

## Notes

- **Data source:** the search page is server-rendered (Next.js). Titles, companies and locations come from the result cards; posting dates, deadlines and the total count come from the search data embedded in the same page. One request per search.
- **Deadline:** `YYYY-MM-DD HH:MM` (KST), or `상시채용` for open-ended postings (JobKorea stores those with a far-future end date).
- **Location in search results** is the card's short form (`서울 영등포구 외 1` means several sites); `detail` returns the full address.
- **Image-only postings:** some employers publish the body as images. `detail` then sets `imageBody: true`; read the posting at its `url`.
- Endpoint and markup anchors are documented in `url-reference.md`.
