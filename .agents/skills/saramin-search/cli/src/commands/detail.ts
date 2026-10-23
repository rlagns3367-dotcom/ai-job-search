import { VIEW_AJAX_URL, VIEW_DETAIL_URL, VIEW_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const SARAMIN_HOST = /(^|\.)saramin\.co\.kr$/i

/**
 * Accept a raw rec_idx or any saramin.co.kr job URL carrying ?rec_idx=.
 * A URL on any other host is rejected: an employer's own apply link can carry
 * a number that happens to be a valid rec_idx for an unrelated posting.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{5,}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!SARAMIN_HOST.test(parsed.hostname)) return null
  const rec = parsed.searchParams.get("rec_idx")
  return rec && /^\d{5,}$/.test(rec) ? rec : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Saramin rec_idx from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const ajax = await htmlFetch(
      VIEW_AJAX_URL,
      new URLSearchParams({ rec_idx: id, rec_seq: "0", view_type: "search" }),
      `${VIEW_URL}?rec_idx=${id}`,
    )
    if (!ajax || !/class="tit_job"/.test(ajax)) {
      writeError("Job not found (removed, closed, or the rec_idx is wrong)", "NOT_FOUND")
      return 1
    }
    const body = await htmlFetch(`${VIEW_DETAIL_URL}?rec_idx=${id}&rec_seq=0`)
    const job = parseJobDetail(ajax, body, id)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.career ? `경력: ${job.career}` : "",
        job.education ? `학력: ${job.education}` : "",
        job.employmentType ? `근무형태: ${job.employmentType}` : "",
        job.salary ? `급여: ${job.salary}` : "",
        job.workHours ? `근무일시: ${job.workHours}` : "",
        job.startDate ? `시작일: ${job.startDate}` : "",
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
