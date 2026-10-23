#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Saramin (saramin.co.kr), Korea's
// general-purpose job board. No external CLI framework and no runtime
// dependencies, so it runs anywhere `bun` is available.
//
// Personal use only: keep volume low and do not use it for bulk collection.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { regionCodes } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", h: "help" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `saramin-cli — search jobs on Saramin (사람인, saramin.co.kr), South Korea

USAGE
  bun run src/cli.ts search --query "<text>" [flags]
  bun run src/cli.ts detail <rec_idx|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (직무, 기술, 회사명). REQUIRED.
  --location, -l <region> Region: 서울, 경기, 인천, 부산, 대구, 대전, 광주, 울산, 세종,
                          강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주, 전국 (or romanized:
                          seoul, busan, ...). Comma-separate for several: "서울,경기".
  --jobage <days>         Posted or edited within N days (client-side filter on the page).
  --sort <order>          relevance (default) | date (newest first).
  --page <n>              1-indexed page (20 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "데이터 엔지니어" -l 서울 --sort date --format table
  bun run src/cli.ts search -q "마케팅" -l "서울,경기" --jobage 7 --format table
  bun run src/cli.ts search -q "회계" -l 부산 --limit 10 --format table
  bun run src/cli.ts detail 55297082 --format plain

Personal use only — reads Saramin's public pages; keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "sort", "page", "limit", "format", "help"]),
  detail: new Set(["format", "help"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

function wholeNumber(name: string, raw: string | boolean | string[]): number | null {
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < 1) {
    fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
    return null
  }
  return val
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Unknown flags are an error, never silently dropped: a dropped filter
  // changes what the search returns without any warning.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(`unknown flag --${key} for '${cmd}'; see --help for the supported flags`, "UNKNOWN_FLAG")
    }
  }

  if (cmd === "search") {
    if (typeof flags.query !== "string" || !flags.query.trim()) {
      return fail('--query/-q is required and must be non-empty (e.g. -q "백엔드 개발자")', "MISSING_REQUIRED")
    }
    let regions: string[] = []
    if (flags.location !== undefined) {
      const codes = typeof flags.location === "string" ? regionCodes(flags.location) : null
      if (!codes) {
        return fail(
          `unknown --location "${flags.location}"; use a region such as 서울, 경기, 부산 or seoul, busan (comma-separated for several)`,
          "BAD_ARG",
        )
      }
      regions = codes
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }
    const sort = flags.sort !== undefined ? String(flags.sort) : "relevance"
    if (!["relevance", "date"].includes(sort)) {
      return fail(`--sort must be one of relevance|date, got "${sort}"`, "BAD_ARG")
    }

    let jobage = 9999
    let page = 1
    let limit: number | undefined
    if (flags.jobage !== undefined) {
      const v = wholeNumber("jobage", flags.jobage)
      if (v === null) return 1
      jobage = v
    }
    if (flags.page !== undefined) {
      const v = wholeNumber("page", flags.page)
      if (v === null) return 1
      page = v
    }
    if (flags.limit !== undefined) {
      const v = wholeNumber("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    const opts: SearchOpts = {
      query: flags.query.trim(),
      regions,
      jobage,
      sort: sort as SearchOpts["sort"],
      page,
      limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires a <rec_idx|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
