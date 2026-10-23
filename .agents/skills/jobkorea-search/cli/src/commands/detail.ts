import { BODY_URL, DETAIL_URL, htmlFetch, parseJobDetail, parseJsonLd, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const JOBKOREA_HOST = /(^|\.)jobkorea\.co\.kr$/i

/**
 * Accept a raw posting number or a jobkorea.co.kr GI_Read URL (any host
 * variant, with or without scheme, Gno= query form included). URLs on other
 * hosts are rejected: an employer's apply link can carry an unrelated number.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{6,}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!JOBKOREA_HOST.test(parsed.hostname)) return null
  const path = parsed.pathname.match(/\/Recruit\/GI_Read\/(\d{6,})\/?$/i)
  if (path) return path[1]
  const gno = parsed.searchParams.get("Gno") ?? parsed.searchParams.get("gno")
  return gno && /^\d{6,}$/.test(gno) ? gno : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a JobKorea posting number from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const page = await htmlFetch(`${DETAIL_URL}/${id}`)
    if (!page || !parseJsonLd(page)) {
      writeError("Job not found (removed, closed, or the posting number is wrong)", "NOT_FOUND")
      return 1
    }
    const body = await htmlFetch(`${BODY_URL}?Gno=${id}`)
    const job = parseJobDetail(page, body, id)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.career ? `경력: ${job.career}` : "",
        job.education ? `학력: ${job.education}` : "",
        job.employmentType ? `고용형태: ${job.employmentType}` : "",
        job.salary ? `급여: ${job.salary}` : "",
        job.date ? `게시일: ${job.date}` : "",
        job.deadline ? `마감일: ${job.deadline}` : "",
        "",
        job.description || "(no description)",
        job.imageBody ? "\n(본문 대부분이 이미지입니다. 전체 내용은 URL에서 확인하세요.)" : "",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
