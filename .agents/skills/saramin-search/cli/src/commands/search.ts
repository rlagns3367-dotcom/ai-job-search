import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  parseTotal,
  withinDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  /** Saramin loc_mcd region codes (already resolved by the CLI). */
  regions: string[]
  jobage: number
  sort: "relevance" | "date"
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const PAGE_SIZE = 20

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("searchType", "search")
  params.set("searchword", opts.query)
  if (opts.regions.length > 0) params.set("loc_mcd", opts.regions.join(","))
  if (opts.sort === "date") params.set("recruitSort", "reg_dt")
  params.set("recruitPage", String(opts.page))
  params.set("recruitPageCount", String(PAGE_SIZE))
  return `${SEARCH_URL}?${params.toString()}`
}

/** East Asian characters take two terminal columns; pad by display width. */
function width(s: string): number {
  let w = 0
  for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠￠-￦]/.test(ch) ? 2 : 1
  return w
}

export function fit(s: string, cols: number): string {
  let out = ""
  for (const ch of s) {
    if (width(out + ch) > cols) break
    out += ch
  }
  return out + " ".repeat(cols - width(out))
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header = `${fit("ID", 9)} ${fit("TITLE", 44)} ${fit("COMPANY", 24)} ${fit("LOCATION", 16)} ${fit("DATE", 10)} DEADLINE`
  const rows = cards.map(
    (c) =>
      `${fit(c.id, 9)} ${fit(c.title, 44)} ${fit(c.company || "—", 24)} ${fit(c.location || "—", 16)} ${fit(c.date || "—", 10)} ${c.deadline || "—"}`,
  )
  return [header, "-".repeat(width(header)), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)
    // Saramin's search page has no posting-age parameter, so --jobage filters
    // the fetched page client-side on the card date (posted or last edited).
    if (opts.jobage < 9999) cards = cards.filter((c) => withinDays(c.date, opts.jobage))
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"} · 마감 ${c.deadline || "—"}\n  ${c.conditions.join(" · ")}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, total: parseTotal(html), page: opts.page }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
