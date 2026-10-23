import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  decodeHtmlEntities,
  extractDivById,
  htmlToText,
  jobageToPeriod,
  metaField,
  parseJobCards,
  parseJobDetail,
  parseListMeta,
  withinDays,
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
      expect(c.url).toBe(`https://www.jobkorea.co.kr/Recruit/GI_Read/${c.id}`)
    }
  })

  test("reads the first card's fields exactly", () => {
    const c = cards[0]
    expect(c.id).toBe("49947457")
    expect(c.title).toBe("[에티버스] 데이터 엔지니어 (경력)")
    expect(c.company).toBe("㈜이테크시스템")
    expect(c.location).toBe("서울 중구")
    expect(c.date).toBe("2026-09-08")
    expect(c.deadline).toBe("2026-11-04 23:00")
    expect(c.tags).toContain("경력3년↑")
    expect(c.sponsored).toBe(false)
  })

  test("flags the paid placement and still reads its dates", () => {
    const ad = cards[2]
    expect(ad.id).toBe("50211200")
    expect(ad.sponsored).toBe(true)
    expect(ad.date).toBe("2026-10-21")
    expect(ad.location).toBe("대전 유성구")
  })

  test("reads the JOB_LIST total, not another query's", () => {
    expect(parseListMeta(fixture("search-page.html")).total).toBe(3179)
  })

  test("one malformed card does not break the rest", () => {
    const html = `<div data-sentry-component="CardJob">junk</div>` + fixture("search-page.html")
    expect(parseJobCards(html).length).toBe(3)
  })

  test("open-ended postings report 상시채용", () => {
    const html =
      '<script>self.__next_f.push([1,"{\\"content\\":[{\\"id\\":\\"1234567\\",\\"legacyJobNo\\":\\"1\\",\\"createdAt\\":\\"2026-09-10T10:00:00+09:00\\",\\"applicationPeriod\\":{\\"start\\":\\"2026-09-10T10:00:00+09:00\\",\\"end\\":\\"2070-01-01T00:00:00+09:00\\"}}]},\\"queryKey\\":[\\"JOB_LIST\\"]"])</script>'
    expect(parseListMeta(html).byId.get("1234567")).toEqual({ date: "2026-09-10", deadline: "상시채용", sponsored: false })
  })
})

describe("parseJobDetail (live fixture)", () => {
  const job = parseJobDetail(fixture("detail-page.html"), fixture("detail-body.html"), "50101226")

  test("reads JSON-LD and meta fields", () => {
    expect(job.title).toBe("[웍스피어] DBA 인프라 플랫폼 (5년 이상)")
    expect(job.company).toBe("웍스피어(유)")
    expect(job.location).toBe("서울특별시 서초구 서초대로 301, 동익성봉빌딩")
    expect(job.date).toBe("2026-10-02")
    expect(job.deadline).toBe("2026-10-31 23:59")
    expect(job.employmentType).toBe("정규직")
    expect(job.career).toBe("경력 5년이상")
    expect(job.education).toBe("학력무관")
    expect(job.salary).toBe("회사 내규에 따름")
  })

  test("description is decoded text with line breaks", () => {
    expect(job.description).toContain("이런 업무를 하시게 돼요!")
    expect(job.description).toContain("\n")
    expect(job.description).not.toMatch(/<[a-z]/i)
    expect(job.description).not.toMatch(/&(lsquo|rsquo|nbsp|amp);/)
    expect(job.imageBody).toBe(false)
  })
})

describe("helpers", () => {
  test("decodes named, decimal and hex entities", () => {
    expect(decodeHtmlEntities("&lsquo;AI&rsquo; &amp; &#39;x&#39; &#x1F600;")).toBe("‘AI’ & 'x' \u{1F600}")
  })

  test("htmlToText keeps paragraph breaks", () => {
    expect(htmlToText("<p>하나</p><p>둘<br>셋</p>")).toBe("하나\n둘\n셋")
  })

  test("extractDivById handles nesting", () => {
    expect(extractDivById('<div id="a"><div>x</div>y</div><div>z</div>', "a")).toBe("<div>x</div>y")
  })

  test("metaField keeps commas inside a value", () => {
    const html = '<meta name="description" content="경력 : 신입, 경력 3년↑, 학력 : 대졸, 급여 : 3,000만원, 마감일 : 2026.10.31"/>'
    expect(metaField(html, "경력")).toBe("신입, 경력 3년↑")
    expect(metaField(html, "급여")).toBe("3,000만원")
    expect(metaField(html, "근무지")).toBeNull()
  })

  test("jobageToPeriod rounds up to JobKorea's windows", () => {
    expect(jobageToPeriod(1)).toBe("2")
    expect(jobageToPeriod(2)).toBe("3")
    expect(jobageToPeriod(7)).toBe("4")
    expect(jobageToPeriod(14)).toBe("5")
    expect(jobageToPeriod(31)).toBeNull()
  })

  test("withinDays compares KST calendar days", () => {
    const now = new Date("2026-10-23T03:00:00Z")
    expect(withinDays("2026-10-23", 1, now)).toBe(true)
    expect(withinDays("2026-10-22", 1, now)).toBe(false)
    expect(withinDays(null, 7, now)).toBe(false)
  })

  test("buildUrl maps flags to JobKorea parameters", () => {
    const url = new URL(buildUrl({ query: "회계 부산", jobage: 7, page: 3, format: "json" }))
    expect(url.pathname).toBe("/Search/")
    expect(url.searchParams.get("stext")).toBe("회계 부산")
    expect(url.searchParams.get("tabType")).toBe("recruit")
    expect(url.searchParams.get("Page_No")).toBe("3")
    expect(url.searchParams.get("period")).toBe("4")
    expect(new URL(buildUrl({ query: "x", jobage: 9999, page: 1, format: "json" })).searchParams.has("period")).toBe(false)
  })
})

describe("normalizeId", () => {
  test("accepts a posting number or a jobkorea URL", () => {
    expect(normalizeId("50101226")).toBe("50101226")
    expect(normalizeId("https://www.jobkorea.co.kr/Recruit/GI_Read/50101226?Oem_Code=C1&logpath=1")).toBe("50101226")
    expect(normalizeId("www.jobkorea.co.kr/Recruit/GI_Read/50101226")).toBe("50101226")
    expect(normalizeId("https://m.jobkorea.co.kr/Recruit/GI_Read/50101226")).toBe("50101226")
    expect(normalizeId("https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=50101226")).toBe("50101226")
  })

  test("rejects other hosts and look-alikes", () => {
    expect(normalizeId("https://example.com/Recruit/GI_Read/50101226")).toBeNull()
    expect(normalizeId("https://jobkorea.co.kr.evil.io/Recruit/GI_Read/50101226")).toBeNull()
    expect(normalizeId("https://www.jobkorea.co.kr/Search/?stext=50101226")).toBeNull()
    expect(normalizeId("abc")).toBeNull()
  })
})
