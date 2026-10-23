// Data source: Saramin (saramin.co.kr) public pages. No authentication required.
// Search returns server-rendered HTML with one <div class="item_recruit"> card
// per posting. Detail is two requests, both made by Saramin's own job page:
// the view-ajax fragment (header, summary, deadline, address) and the
// view-detail iframe (the posting body). Parsed with regex, zero dependencies.

export const BASE_URL = "https://www.saramin.co.kr"
export const SEARCH_URL = `${BASE_URL}/zf_user/search/recruit`
export const VIEW_URL = `${BASE_URL}/zf_user/jobs/relay/view`
export const VIEW_AJAX_URL = `${BASE_URL}/zf_user/jobs/relay/view-ajax`
export const VIEW_DETAIL_URL = `${BASE_URL}/zf_user/jobs/relay/view-detail`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; saramin-cli/1.0)"

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404.
 * `body` switches the request to a form-encoded POST (view-ajax only);
 * view-ajax answers 404 unless the Referer is the job page it belongs to.
 */
export async function htmlFetch(url: string, body?: URLSearchParams, referer?: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      body,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        ...(referer ? { Referer: referer } : {}),
        ...(body
          ? {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
            }
          : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  /** ISO date (YYYY-MM-DD) of the card's 등록일 (posted) or 수정일 (edited). */
  date: string | null
  /** Which date `date` is: Saramin shows the edit date once a posting is edited. */
  dateKind: "posted" | "edited" | null
  /** Deadline as Saramin prints it on the card, e.g. "~ 11/14(토)" or "상시채용". */
  deadline: string | null
  /** Career / education / employment-type chips, e.g. ["신입·경력", "학력무관", "정규직"]. */
  conditions: string[]
  /** Job-category keywords, e.g. ["Python", "Java"]. */
  sectors: string[]
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  career: string | null
  education: string | null
  employmentType: string | null
  salary: string | null
  workHours: string | null
  startDate: string | null
  deadline: string | null
  description: string | null
  /** True when the body is mostly images (common on Saramin): read it at `url`. */
  imageBody: boolean
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  middot: "·", hellip: "…", ndash: "–", mdash: "—",
  bull: "•", rarr: "→", larr: "←", times: "×",
  lsaquo: "‹", rsaquo: "›", laquo: "«", raquo: "»",
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ent: string) => {
    if (ent[0] === "#") {
      const cp = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      return numericEntity(cp)
    }
    return NAMED_ENTITIES[ent] ?? whole
  })
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Render a block of HTML as text, keeping paragraph and list breaks. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|table|dl|dd|dt)>/gi, "\n")
  return withBreaks
    .split("\n")
    .map(clean)
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim()
}

/** "26/10/15" (YY/MM/DD) -> "2026-10-15". */
export function yymmddToIso(raw: string): string | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{2})/)
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
}

/** Parse the result count from the search page ("총 2,964건"). */
export function parseTotal(html: string): number | null {
  const m = html.match(/class="cnt_result"[^>]*>\s*총\s*([\d,]+)\s*건/)
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null
}

/**
 * Parse the search results page. Each posting is a
 * <div class="item_recruit" value="<rec_idx>">; we split on that marker and
 * parse every chunk on its own, so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<div class="item_recruit"\s+value="/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    const tit = chunk.match(/<h2 class="job_tit">[\s\S]*?<a[^>]*\btitle="([^"]*)"/)
    let title = tit ? clean(tit[1]) : ""
    if (!title) {
      const inner = chunk.match(/<h2 class="job_tit">([\s\S]*?)<\/h2>/)
      title = inner ? clean(inner[1]) : ""
    }
    if (!title) continue

    const corp = chunk.match(/<strong class="corp_name">([\s\S]*?)<\/strong>/)
    const company = corp ? clean(corp[1]) || null : null

    // job_condition holds <span> chips: location first, then career/education/type.
    const cond = chunk.match(/<div class="job_condition">([\s\S]*?)<\/div>/)
    const chips = cond
      ? [...cond[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => clean(m[1])).filter(Boolean)
      : []
    const location =
      chips.length > 0 && cond && /area-recruit|area-list/.test(cond[1]) ? chips[0].replace(/\s+,/g, ",") : null
    const conditions = location ? chips.slice(1) : chips

    const sectorBlock = chunk.match(/<div class="job_sector">([\s\S]*?)<\/div>/)
    const sectors = sectorBlock
      ? [...new Set([...sectorBlock[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => clean(m[1])).filter(Boolean))]
      : []

    let date: string | null = null
    let dateKind: JobCard["dateKind"] = null
    const day = chunk.match(/<span class="job_day">\s*(등록일|수정일)\s*([\d/]+)/)
    if (day) {
      date = yymmddToIso(day[2])
      dateKind = date ? (day[1] === "등록일" ? "posted" : "edited") : null
    }

    const dl = chunk.match(/<div class="job_date">\s*<span class="date">([\s\S]*?)<\/span>/)
    const deadline = dl ? clean(dl[1]) || null : null

    results.push({
      id,
      title,
      company,
      location,
      date,
      dateKind,
      deadline,
      conditions,
      sectors,
      url: `${VIEW_URL}?rec_idx=${id}`,
    })
  }

  return results
}

/** Read the <dd> that follows a <dt>label</dt>, minus tooltip widgets. */
function summaryValue(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const m = html.match(new RegExp(`<dt[^>]*>\\s*${escaped}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`))
  if (!m) return null
  const body = m[1].split(/<div class="toolTip/)[0]
  return clean(body) || null
}

/** "2026.11.14 23:59" -> "2026-11-14 23:59". */
function dotDate(raw: string | null): string | null {
  if (!raw) return null
  return raw.replace(/(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3")
}

/**
 * Parse the view-ajax fragment (header + summary + deadline + address) and the
 * view-detail iframe (posting body) into one detail record.
 */
export function parseJobDetail(ajaxHtml: string, bodyHtml: string, id: string): JobDetail {
  const titleMatch = ajaxHtml.match(/<h1 class="tit_job">([\s\S]*?)<\/h1>/)
  const companyMatch = ajaxHtml.match(/<a[^>]*\btitle="([^"]*)"[^>]*class="company"/)
    ?? ajaxHtml.match(/class="company"[^>]*>([\s\S]*?)<\/a>/)

  const address = ajaxHtml.match(/class="jv_cont jv_location"[^>]*data-address="([^"]*)"/)

  // Restrict the summary lookups to the summary block: the company-info block
  // further down reuses <dt>/<dd> for unrelated fields.
  const summaryStart = ajaxHtml.indexOf('class="jv_cont jv_summary"')
  const summaryEnd = summaryStart === -1 ? -1 : ajaxHtml.indexOf('class="jv_cont ', summaryStart + 10)
  const summary =
    summaryStart === -1 ? "" : ajaxHtml.slice(summaryStart, summaryEnd === -1 ? undefined : summaryEnd)

  const howtoStart = ajaxHtml.indexOf('class="jv_cont jv_howto"')
  const howto = howtoStart === -1 ? "" : ajaxHtml.slice(howtoStart, howtoStart + 4000)
  const period = howto.match(/<dl class="info_period">([\s\S]*?)<\/dl>/)?.[1] ?? ""
  const startDate = dotDate(summaryValue(period, "시작일"))
  const deadline = dotDate(
    period.match(/<dt class="end">\s*마감일\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/)?.[1]?.trim() ?? null,
  )

  // The iframe body wraps the posting in .user_content when the employer used
  // Saramin's editor; fall back to the whole <body> for template postings.
  const contentMatch =
    bodyHtml.match(/<div class="user_content"[^>]*>([\s\S]*)<\/div>\s*<\/body>/i) ??
    bodyHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const description = contentMatch ? htmlToText(contentMatch[1]) || null : bodyHtml ? htmlToText(bodyHtml) || null : null
  const imageCount = (bodyHtml.match(/<img\b/gi) ?? []).length
  const imageBody = imageCount > 0 && (description ?? "").length < 200

  return {
    id,
    title: titleMatch ? clean(titleMatch[1]) || "(untitled)" : "(untitled)",
    company: companyMatch ? clean(companyMatch[1]) || null : null,
    location: address ? clean(address[1]) || null : summaryValue(summary, "근무지역"),
    date: startDate ? startDate.slice(0, 10) : null,
    url: `${VIEW_URL}?rec_idx=${id}`,
    career: summaryValue(summary, "경력"),
    education: summaryValue(summary, "학력"),
    employmentType: summaryValue(summary, "근무형태"),
    salary: summaryValue(summary, "급여"),
    workHours: summaryValue(summary, "근무일시"),
    startDate,
    deadline,
    description,
    imageBody,
  }
}

/**
 * Saramin top-level region codes (loc_mcd). Accepts the Korean short name,
 * the full name, or a romanized alias; the CLI also accepts a raw 6-digit code.
 */
export const REGIONS: Record<string, string> = {
  서울: "101000", 경기: "102000", 대구: "104000", 대전: "105000", 부산: "106000",
  울산: "107000", 인천: "108000", 강원: "109000", 경남: "110000", 경북: "111000",
  전남: "112000", 광주: "112000", 전남광주: "112000", 전북: "113000", 충북: "114000",
  충남: "115000", 제주: "116000", 전국: "117000", 세종: "118000",
  seoul: "101000", gyeonggi: "102000", daegu: "104000", daejeon: "105000", busan: "106000",
  ulsan: "107000", incheon: "108000", gangwon: "109000", gyeongnam: "110000",
  gyeongbuk: "111000", jeonnam: "112000", gwangju: "112000", jeonbuk: "113000",
  chungbuk: "114000", chungnam: "115000", jeju: "116000", sejong: "118000",
}

/** Map a --location value to Saramin loc_mcd codes; null if any part is unknown. */
export function regionCodes(input: string): string[] | null {
  const codes: string[] = []
  for (const raw of input.split(",")) {
    const part = raw.trim()
    if (!part) return null
    if (/^\d{6}$/.test(part)) {
      codes.push(part)
      continue
    }
    const key = part
      .toLowerCase()
      .replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "")
      .replace(/전체$/, "")
    const code = REGIONS[key]
    if (!code) return null
    codes.push(code)
  }
  return [...new Set(codes)]
}

/** True when an ISO date falls within the last `days` days (inclusive of today). */
export function withinDays(iso: string | null, days: number, now: Date = new Date()): boolean {
  if (!iso) return false
  const posted = Date.parse(`${iso}T00:00:00+09:00`)
  if (Number.isNaN(posted)) return false
  // Compare calendar days in KST, the timezone Saramin prints dates in.
  const kstToday = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const todayStart = Date.parse(`${kstToday}T00:00:00+09:00`)
  return posted >= todayStart - (days - 1) * 86400_000
}
