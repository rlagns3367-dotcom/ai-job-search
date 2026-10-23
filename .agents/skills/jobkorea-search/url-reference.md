# JobKorea URL Reference

Recorded 2026-10-23 against the live site. `robots.txt` (User-agent `*`) disallows
only login, account, user, corporate-admin and salary-list paths; `/Search/` and
`/Recruit/GI_Read*` are allowed. (Social-preview crawlers are blocked from
`/Search/`; that rule does not apply to this CLI's User-Agent.)

## Search

```
GET https://www.jobkorea.co.kr/Search/?stext={query}&tabType=recruit&Page_No={n}&period={code}
```

| Parameter | Meaning |
|-----------|---------|
| `stext` | Keyword query |
| `tabType` | `recruit` = job postings tab |
| `Page_No` | 1-indexed page (20 results per page) |
| `period` | `1` 전체, `2` 오늘, `3` 최근3일, `4` 최근1주일, `5` 최근1개월 |

Not found as URL parameters (2026-10-23): region (`local`, `areaCode`, `loc`, …
all ignored) and sort order. The page's JS bundles are served from
`frontend-app-cdn.jobkorea.co.kr`; read them there when looking for these.
Region codes for reference: 서울 `I000`, 경기 `B000`, 인천 `K000`, 대전 `G000`,
세종 `1000`, 충남 `O000`, 충북 `P000`, 전남광주 `L000`, 전북 `M000`, 대구 `F000`,
경북 `D000`, 부산 `H000`, 울산 `J000`, 경남 `C000`, 강원 `A000`, 제주 `N000`, 전국 `Q000`.

### Result cards (HTML)

- One card per `data-sentry-component="CardJob"`
- ID: the first `/Recruit/GI_Read/{id}` link in the card
- Title: `<a ... data-sentry-component="Title" ...><span ...>{title}</span></a>`
- Company: first `<span>` of the `<a>` right after the title link
- Chips: `data-sentry-component="GrayChip"` blocks; the text is in
  `<span class="truncate …">`. The chip with the `emoji--basicemoji-place2`
  icon is the location; the others are industry/job tags.

### Embedded search data (RSC payload)

The same page pushes React Query state into `self.__next_f.push([1,"…"])`
script strings (quotes escaped as `\"`). Relevant queries:

- `queryKey: ["JOB_LIST", 20, <page0>, "1", "DESC", "<query>", …]` — the organic
  results. Its data (placed *before* the `queryKey`) has `totalElements`,
  `totalPages` and `content[]` entries with `id`, `title`, `createdAt`,
  `applicationPeriod.start/end`, `areaCodeList`, `careerType`, ….
- `JOB_PRODUCT_LIST`, `JOB_CPC_SLOT_LIST` — paid placements. Their entries use
  the same `id`/`createdAt`/`applicationPeriod` fields; the CLI marks them
  `sponsored: true`.
- An `applicationPeriod.end` in 2070 means 상시채용 (no deadline).

## Detail

1. **Posting page**: `GET https://www.jobkorea.co.kr/Recruit/GI_Read/{id}`
   - `<script type="application/ld+json">` with a schema.org `JobPosting`:
     `title`, `datePosted`, `validThrough`, `employmentType`,
     `experienceRequirements`, `educationRequirements`,
     `hiringOrganization.name`, `jobLocation.address.streetAddress`
   - `<meta name="description" content="경력 : …, 학력 : …, 급여 : …, 마감일 : …">`
     (values may contain commas; split only before the next `라벨 :`)
2. **Posting body**: `GET https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno={id}`
   - Body in `<div id="detail-content" …>`. Some employers use images only.

A removed posting has no JobPosting JSON-LD; the CLI reports `NOT_FOUND`.
