import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  decodeHtmlEntities,
  htmlToText,
  parseJobCards,
  parseJobDetail,
  parseTotal,
  regionCodes,
  withinDays,
  yymmddToIso,
} from "../src/helpers"
import { normalizeId } from "../src/commands/detail"
import { buildUrl } from "../src/commands/search"

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf-8")

describe("parseJobCards (live fixture)", () => {
  const cards = parseJobCards(fixture("search-page.html"))

  test("parses every card with the /scrape contract fields", () => {
    expect(cards.length).toBe(3)
    for (const c of cards) {
      expect(c.id).toMatch(/^\d+$/)
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.title).not.toContain("<")
      expect(c.company).toBeTruthy()
      expect(c.location).toBeTruthy()
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.url).toBe(`https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${c.id}`)
    }
  })

  test("reads the first card's fields exactly", () => {
    const c = cards[0]
    expect(c.id).toBe("55297082")
    expect(c.title).toBe("파이썬,Java 개발자 정규직 채용합니다")
    expect(c.company).toBe("(주)한맥시스템")
    expect(c.location).toBe("서울 금천구")
    expect(c.date).toBe("2026-10-15")
    expect(c.dateKind).toBe("posted")
    expect(c.deadline).toBe("~ 11/14(토)")
    expect(c.conditions).toEqual(["신입·경력", "학력무관", "정규직"])
    expect(c.sectors).toContain("Python")
  })

  test("reads the total result count", () => {
    expect(parseTotal(fixture("search-page.html"))).toBe(2964)
  })

  test("one malformed card does not break the rest", () => {
    const html = `<div class="item_recruit" value="broken">junk</div>` + fixture("search-page.html")
    expect(parseJobCards(html).length).toBe(3)
  })
})

describe("parseJobDetail (live fixture)", () => {
  const job = parseJobDetail(fixture("view-ajax.html"), fixture("view-detail.html"), "55297082")

  test("reads header, summary and deadline", () => {
    expect(job.title).toBe("파이썬,Java 개발자 정규직 채용합니다")
    expect(job.company).toBe("(주)한맥시스템")
    expect(job.location).toContain("서울 금천구")
    expect(job.career).toBe("신입·경력 3~10년")
    expect(job.education).toBe("학력무관")
    expect(job.employmentType).toContain("정규직")
    expect(job.startDate).toBe("2026-10-15 10:00")
    expect(job.deadline).toBe("2026-11-14 23:59")
    expect(job.date).toBe("2026-10-15")
  })

  test("description is decoded text with line breaks", () => {
    expect(job.description).toBeTruthy()
    expect(job.description).toContain("주요업무")
    expect(job.description).toContain("\n")
    expect(job.description).not.toMatch(/<[a-z]/i)
    expect(job.description).not.toContain("&nbsp;")
    expect(job.imageBody).toBe(false)
  })
})

describe("helpers", () => {
  test("decodes named, decimal and hex entities", () => {
    expect(decodeHtmlEntities("&lsquo;AI&rsquo; &amp; &#39;x&#39; &#x1F600; &nbsp;")).toBe("‘AI’ & 'x' \u{1F600}  ")
  })

  test("htmlToText keeps paragraph breaks", () => {
    expect(htmlToText("<p>하나</p><p>둘<br>셋</p>")).toBe("하나\n둘\n셋")
  })

  test("yymmddToIso", () => {
    expect(yymmddToIso("26/10/15")).toBe("2026-10-15")
    expect(yymmddToIso("nope")).toBeNull()
  })

  test("regionCodes maps Korean, full and romanized names", () => {
    expect(regionCodes("서울")).toEqual(["101000"])
    expect(regionCodes("서울특별시")).toEqual(["101000"])
    expect(regionCodes("부산광역시, 경기도")).toEqual(["106000", "102000"])
    expect(regionCodes("Seoul,busan")).toEqual(["101000", "106000"])
    expect(regionCodes("101000")).toEqual(["101000"])
    expect(regionCodes("서울,atlantis")).toBeNull()
    expect(regionCodes("")).toBeNull()
  })

  test("withinDays compares KST calendar days", () => {
    const now = new Date("2026-10-23T03:00:00Z") // 12:00 KST
    expect(withinDays("2026-10-23", 1, now)).toBe(true)
    expect(withinDays("2026-10-22", 1, now)).toBe(false)
    expect(withinDays("2026-10-17", 7, now)).toBe(true)
    expect(withinDays("2026-10-16", 7, now)).toBe(false)
    expect(withinDays(null, 7, now)).toBe(false)
  })

  test("buildUrl maps flags to Saramin parameters", () => {
    const url = new URL(
      buildUrl({ query: "데이터", regions: ["101000", "102000"], jobage: 9999, sort: "date", page: 2, format: "json" }),
    )
    expect(url.pathname).toBe("/zf_user/search/recruit")
    expect(url.searchParams.get("searchword")).toBe("데이터")
    expect(url.searchParams.get("loc_mcd")).toBe("101000,102000")
    expect(url.searchParams.get("recruitSort")).toBe("reg_dt")
    expect(url.searchParams.get("recruitPage")).toBe("2")
  })
})

describe("normalizeId", () => {
  test("accepts a rec_idx or a saramin URL", () => {
    expect(normalizeId("55297082")).toBe("55297082")
    expect(normalizeId("https://www.saramin.co.kr/zf_user/jobs/relay/view?view_type=search&rec_idx=55297082")).toBe("55297082")
    expect(normalizeId("www.saramin.co.kr/zf_user/jobs/view?rec_idx=55297082")).toBe("55297082")
    expect(normalizeId("https://m.saramin.co.kr/job-search/view?rec_idx=55297082")).toBe("55297082")
  })

  test("rejects other hosts and look-alikes", () => {
    expect(normalizeId("https://example.com/apply?rec_idx=55297082")).toBeNull()
    expect(normalizeId("https://saramin.co.kr.evil.io/view?rec_idx=55297082")).toBeNull()
    expect(normalizeId("https://www.saramin.co.kr/zf_user/jobs/relay/view")).toBeNull()
    expect(normalizeId("abc")).toBeNull()
  })
})
