# Saramin URL Reference

Recorded 2026-10-23 against the live site. `robots.txt` (User-agent `*`) does not
disallow any path below; it does disallow `/zf_user/recruit/recruit-posting/`,
`/recruit/recruit_view.php` and the apply/resume paths, which this CLI never touches.

## Search

```
GET https://www.saramin.co.kr/zf_user/search/recruit?searchType=search&searchword={query}&loc_mcd={codes}&recruitSort=reg_dt&recruitPage={n}&recruitPageCount=20
```

| Parameter | Meaning |
|-----------|---------|
| `searchword` | Keyword query (URL-encoded Korean is fine) |
| `searchType` | `search` (what the site's search box sends) |
| `loc_mcd` | Comma-separated top-level region codes (table below) |
| `recruitSort` | Omit for relevance; `reg_dt` = newest first |
| `recruitPage` | 1-indexed page |
| `recruitPageCount` | Page size; the CLI fixes it at 20 |

No posting-age parameter was found, so `--jobage` filters client-side.

### Region codes (`loc_mcd`)

| Region | Code | Region | Code |
|--------|------|--------|------|
| 서울 | 101000 | 강원 | 109000 |
| 경기 | 102000 | 경남 | 110000 |
| 대구 | 104000 | 경북 | 111000 |
| 대전 | 105000 | 전남광주 | 112000 |
| 부산 | 106000 | 전북 | 113000 |
| 울산 | 107000 | 충북 | 114000 |
| 인천 | 108000 | 충남 | 115000 |
| 제주 | 116000 | 세종 | 118000 |
| 전국 | 117000 | | |

The full list (with district codes) is embedded in the search page as JSON
objects with `"id":"loc_mcd"`.

### Result markup

- Total: `<span class="cnt_result">총 2,964건</span>`
- One card per `<div class="item_recruit" value="{rec_idx}">`
- Title: `<h2 class="job_tit"><a title="{title}" href="/zf_user/jobs/relay/view?...rec_idx={id}...">`
- Company: `<strong class="corp_name"><a ...>{company}</a></strong>`
- Deadline: `<div class="job_date"><span class="date">~ 11/14(토)</span>`
- Conditions: `<div class="job_condition">` → `<span>` chips; the first holds the
  region links (`/zf_user/area-recruit/...`), then career, education, employment type
- Sectors: `<div class="job_sector">` → `<a>` keywords
- Date: `<span class="job_day">등록일 26/10/15</span>` or `수정일 26/10/21` (YY/MM/DD)

## Detail

The job page `/zf_user/jobs/relay/view?rec_idx={id}` is a shell that loads its
content with JavaScript. The CLI makes the same two calls the page makes:

1. **Summary fragment**
   ```
   POST https://www.saramin.co.kr/zf_user/jobs/relay/view-ajax
   Content-Type: application/x-www-form-urlencoded
   X-Requested-With: XMLHttpRequest
   Referer: https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx={id}

   rec_idx={id}&rec_seq=0&view_type=search
   ```
   Without the `Referer` the endpoint answers 404.
   - Title: `<h1 class="tit_job">`
   - Company: `<a ... title="{company}" class="company">`
   - Summary: `<div class="jv_cont jv_summary">` with `<dt>경력|학력|근무형태|급여|근무일시|근무지역</dt><dd>…</dd>`
     (tooltips inside `<dd>` start at `<div class="toolTip…">` and are cut off)
   - Period: `<dl class="info_period"><dt>시작일</dt><dd>2026.10.15 10:00</dd><dt class="end">마감일</dt><dd>2026.11.14 23:59</dd>`
   - Address: `<div class="jv_cont jv_location" data-address="(08506) 서울 금천구 …">`

2. **Posting body**
   ```
   GET https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx={id}&rec_seq=0
   ```
   The body sits in `<div class="user_content">`. Some employers use images only.

A removed or invalid `rec_idx` returns a fragment without `class="tit_job"`; the
CLI reports `NOT_FOUND`.
