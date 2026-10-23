// Data source: JobKorea (jobkorea.co.kr) public pages. No authentication required.
// The search page is a server-rendered Next.js page: each posting renders as a
// CardJob block (title, company, location), and the same page embeds the
// search API response (posting dates, deadlines, total count) in its React
// Server Components payload. Detail is the posting page's schema.org JobPosting
// JSON-LD plus the GI_Read_Comt_Ifrm iframe that holds the posting body.
// Parsed with regex, zero runtime dependencies.

export const BASE_URL = "https://www.jobkorea.co.kr"
export const SEARCH_URL = `${BASE_URL}/Search/`
export const DETAIL_URL = `${BASE_URL}/Recruit/GI_Read`
export const BODY_URL = `${BASE_URL}/Recruit/GI_Read_Comt_Ifrm`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; jobkorea-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
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
  /** ISO date (YYYY-MM-DD) the posting was created, from the embedded API data. */
  date: string | null
  /** Application deadline (YYYY-MM-DD HH:MM, KST), "상시채용" when open-ended. */
  deadline: string | null
  /** Card chips after the location, e.g. ["포털·컨텐츠·커뮤니티, DBA", "경력5년↑"]. */
  tags: string[]
  /** A paid placement JobKorea mixes into the results, not a keyword match. */
  sponsored: boolean
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
  deadline: string | null
  description: string | null
  /** True when the body is mostly images: read it at `url`. */
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

/**
 * Pull the embedded search API data out of the RSC payload. The payload is a
 * JS string literal, so quotes arrive escaped (\"); unescape them and read
 * every posting entry keyed by id. Entries inside the JOB_LIST query are the
 * organic results; the rest come from the paid slots (JOB_PRODUCT_LIST,
 * JOB_CPC_SLOT_LIST) that JobKorea renders between them.
 */
export interface ListMeta {
  total: number | null
  byId: Map<string, { date: string | null; deadline: string | null; sponsored: boolean }>
}

export function parseListMeta(html: string): ListMeta {
  const data = html.replace(/\\"/g, '"')
  const byId: ListMeta["byId"] = new Map()
  // React Query dehydrates as {state:{data:{...}}, queryKey:[...]}, so the
  // JOB_LIST data sits before its own queryKey and after the previous query's.
  const keyAt = data.indexOf('"queryKey":["JOB_LIST"')
  const prevKey = keyAt === -1 ? -1 : data.lastIndexOf('"queryKey":[', keyAt - 1)
  const total = keyAt === -1 ? null : data.slice(Math.max(prevKey, 0), keyAt).match(/"totalElements":(\d+)/)

  const starts = [...data.matchAll(/"id":"(\d+)","legacyJobNo"/g)]
  starts.forEach((m, i) => {
    const id = m[1]
    const at = m.index ?? 0
    const entry = data.slice(at, starts[i + 1]?.index ?? at + 4000)
    const organic = keyAt !== -1 && at > prevKey && at < keyAt
    const existing = byId.get(id)
    if (existing && !existing.sponsored) return
    const created = entry.match(/"createdAt":"(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
    const end = entry.match(/"applicationPeriod":\{"start":"[^"]*","end":"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
    // Open-ended postings (상시채용) carry a far-future sentinel end date.
    const deadline = !end ? null : parseInt(end[1], 10) >= 2050 ? "상시채용" : `${end[1]} ${end[2]}`
    byId.set(id, { date: created, deadline, sponsored: !organic })
  })
  return { total: total ? parseInt(total[1], 10) : null, byId }
}

/**
 * Parse the search results page. Each posting renders as a CardJob block; we
 * split on that marker and parse each chunk on its own, so one malformed card
 * cannot break the rest. Dates come from the embedded API data, by id.
 */
export function parseJobCards(html: string): JobCard[] {
  const meta = parseListMeta(html)
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/data-sentry-component="CardJob"/).slice(1)

  for (const chunk of chunks) {
    const id = chunk.match(/\/Recruit\/GI_Read\/(\d+)/)?.[1]
    if (!id || seen.has(id)) continue

    const titleLink = chunk.match(/data-sentry-component="Title"[^>]*>([\s\S]*?)<\/a>/)
    const title = titleLink ? clean(titleLink[1]) : ""
    if (!title) continue

    // The company name is the first span of the link that follows the title.
    const afterTitle = titleLink ? chunk.slice(chunk.indexOf(titleLink[0]) + titleLink[0].length) : ""
    const companyMatch = afterTitle.match(/<a[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    // GrayChip blocks: the one carrying the place icon is the location.
    const chips = [
      ...chunk.matchAll(/data-sentry-component="GrayChip"[^>]*>([\s\S]*?)<span class="truncate[^"]*">([\s\S]*?)<\/span>/g),
    ].map((m) => ({ isPlace: /basicemoji-place/.test(m[1]), text: clean(m[2]) }))
    const place = chips.find((c) => c.isPlace)
    const tags = chips.filter((c) => !c.isPlace && c.text).map((c) => c.text)
    const career = chunk.match(/>(경력[^<]{0,12}|신입[^<]{0,12}|경력무관)</)?.[1]
    if (career && !tags.includes(career)) tags.push(career)

    const extra = meta.byId.get(id)
    seen.add(id)
    results.push({
      id,
      title,
      company,
      location: place?.text || null,
      date: extra?.date ?? null,
      deadline: extra?.deadline ?? null,
      tags,
      sponsored: extra?.sponsored ?? false,
      url: `${DETAIL_URL}/${id}`,
    })
  }
  return results
}

interface JsonLdJobPosting {
  "@type"?: string
  title?: string
  datePosted?: string
  validThrough?: string
  employmentType?: string | string[]
  experienceRequirements?: string
  educationRequirements?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string } }
}

/** Find the schema.org JobPosting JSON-LD block on the posting page. */
export function parseJsonLd(html: string): JsonLdJobPosting | null {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1])
      const items = Array.isArray(data) ? data : [data]
      const posting = items.find((d) => d && d["@type"] === "JobPosting")
      if (posting) return posting as JsonLdJobPosting
    } catch {
      // A malformed block is skipped; the page may carry another.
    }
  }
  return null
}

const EMPLOYMENT_TYPES: Record<string, string> = {
  FULL_TIME: "정규직",
  PART_TIME: "파트타임",
  CONTRACTOR: "계약직",
  TEMPORARY: "임시직",
  INTERN: "인턴",
  VOLUNTEER: "자원봉사",
  PER_DIEM: "일용직",
  OTHER: "기타",
}

/**
 * Read one "라벨 : 값" pair from the page's meta description, which reads like
 * "경력 : 경력 5년이상, 학력 : 학력무관, 급여 : 회사 내규에 따름, 마감일 : 2026.10.31".
 * Values may contain commas themselves, so split only before the next label.
 */
export function metaField(html: string, label: string): string | null {
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1]
  if (!desc) return null
  for (const pair of decodeHtmlEntities(desc).split(/,\s*(?=[가-힣]+\s*:)/)) {
    const m = pair.match(/^\s*([가-힣]+)\s*:\s*(.*)$/)
    if (m && m[1] === label) return m[2].trim() || null
  }
  return null
}

/** Combine the posting page (JSON-LD + meta) and the body iframe. */
export function parseJobDetail(pageHtml: string, bodyHtml: string, id: string): JobDetail {
  const ld = parseJsonLd(pageHtml) ?? {}
  const addr = ld.jobLocation?.address
  const location =
    [addr?.streetAddress, addr?.addressLocality, addr?.addressRegion]
      .map((s) => (s ? clean(s).replace(/^대한민국\s*/, "") : ""))
      .filter(Boolean)
      .join(" ") || null

  const types = Array.isArray(ld.employmentType) ? ld.employmentType : ld.employmentType ? [ld.employmentType] : []
  const employmentType = types.map((t) => EMPLOYMENT_TYPES[t] ?? t).join(", ") || null

  const content = extractDivById(bodyHtml, "detail-content") ?? bodyHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ""
  const description = content ? htmlToText(content) || null : null
  const imageCount = (content.match(/<img\b/gi) ?? []).length

  const validThrough = ld.validThrough?.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/)
  return {
    id,
    title: ld.title ? clean(ld.title) : "(untitled)",
    company: ld.hiringOrganization?.name ? clean(ld.hiringOrganization.name) : null,
    location,
    date: ld.datePosted?.slice(0, 10) ?? null,
    url: `${DETAIL_URL}/${id}`,
    career: metaField(pageHtml, "경력") ?? ld.experienceRequirements ?? null,
    education: metaField(pageHtml, "학력") ?? ld.educationRequirements ?? null,
    employmentType,
    salary: metaField(pageHtml, "급여"),
    deadline: validThrough ? [validThrough[1], validThrough[2]].filter(Boolean).join(" ") : null,
    description,
    imageBody: imageCount > 0 && (description ?? "").length < 200,
  }
}

/** Inner HTML of the <div id="..."> element, tracking nested <div> depth. */
export function extractDivById(html: string, id: string): string | null {
  const open = new RegExp(`<div[^>]*\\bid="${id}"[^>]*>`, "i").exec(html)
  if (!open) return null
  let i = open.index + open[0].length
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return html.slice(open.index + open[0].length)
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(open.index + open[0].length, i - 6)
}

/**
 * Map --jobage days to JobKorea's `period` filter: the smallest window that
 * covers the request (오늘, 최근3일, 최근1주일, 최근1개월). Requests beyond a
 * month get no portal filter; the CLI then filters on the posting date.
 */
export function jobageToPeriod(days: number): string | null {
  if (days <= 1) return "2"
  if (days <= 3) return "3"
  if (days <= 7) return "4"
  if (days <= 30) return "5"
  return null
}

/** True when an ISO date falls within the last `days` days (KST calendar days). */
export function withinDays(iso: string | null, days: number, now: Date = new Date()): boolean {
  if (!iso) return false
  const posted = Date.parse(`${iso}T00:00:00+09:00`)
  if (Number.isNaN(posted)) return false
  const kstToday = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const todayStart = Date.parse(`${kstToday}T00:00:00+09:00`)
  return posted >= todayStart - (days - 1) * 86400_000
}
