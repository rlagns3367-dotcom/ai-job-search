import {
  SEARCH_URL,
  htmlFetch,
  jobageToPeriod,
  parseJobCards,
  parseListMeta,
  withinDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("stext", opts.query)
  params.set("tabType", "recruit")
  params.set("Page_No", String(opts.page))
  const period = opts.jobage < 9999 ? jobageToPeriod(opts.jobage) : null
  if (period) params.set("period", period)
  return `${SEARCH_URL}?${params.toString()}`
}

/** East Asian characters take two terminal columns; pad by display width. */
function width(s: string): number {
  let w = 0
  for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠￠-￦]/.test(ch) ? 2 : 1
  return w
}

function fit(s: string, cols: number): string {
  let out = ""
  for (const ch of s) {
    if (width(out + ch) > cols) break
    out += ch
  }
  return out + " ".repeat(cols - width(out))
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header = `${fit("ID", 9)} ${fit("TITLE", 44)} ${fit("COMPANY", 22)} ${fit("LOCATION", 16)} ${fit("DATE", 10)} DEADLINE`
  const rows = cards.map(
    (c) =>
      `${fit(c.id, 9)} ${fit(c.title, 44)} ${fit(c.company || "—", 22)} ${fit(c.location || "—", 16)} ${fit(c.date || "—", 10)} ${c.deadline || "—"}`,
  )
  return [header, "-".repeat(width(header)), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)
    // Beyond a month JobKorea has no period window; filter on the posting date.
    if (opts.jobage < 9999 && jobageToPeriod(opts.jobage) === null) {
      cards = cards.filter((c) => withinDays(c.date, opts.jobage))
    }
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"} · 마감 ${c.deadline || "—"}\n  ${c.tags.join(" · ")}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, total: parseListMeta(html).total, page: opts.page }, results: cards },
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
