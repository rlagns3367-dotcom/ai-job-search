import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers"

// Argument validation never reaches the network.
describe("CLI validation", () => {
  const cases: [string, string[], string][] = [
    ["missing --query", ["search"], "MISSING_REQUIRED"],
    ["empty --query", ["search", "-q", ""], "MISSING_REQUIRED"],
    ["unknown flag", ["search", "-q", "x", "--bogus", "1"], "UNKNOWN_FLAG"],
    ["--location is not supported", ["search", "-q", "x", "--location", "서울"], "UNKNOWN_FLAG"],
    ["bad --format", ["search", "-q", "x", "--format", "xml"], "BAD_ARG"],
    ["fractional --jobage", ["search", "-q", "x", "--jobage", "0.5"], "BAD_ARG"],
    ["zero --page", ["search", "-q", "x", "--page", "0"], "BAD_ARG"],
    ["detail without id", ["detail"], "NO_ID"],
    ["detail foreign URL", ["detail", "https://example.com/Recruit/GI_Read/50101226"], "BAD_ID"],
    ["unknown command", ["frobnicate"], "BAD_CMD"],
  ]
  for (const [name, args, code] of cases) {
    test(`${name} exits 1 with ${code} on stderr`, async () => {
      const r = await runCLI(args)
      expect(r.exitCode).toBe(1)
      expect(r.stdout).toBe("")
      expect(JSON.parse(r.stderr).code).toBe(code)
    })
  }

  test("--location error points at the query workaround", async () => {
    const r = await runCLI(["search", "-q", "x", "-l", "서울"])
    expect(JSON.parse(r.stderr).error).toContain("put the region in the query")
  })

  test("--help prints usage", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("jobkorea-cli")
  })
})

// Live smoke test: opt in with JOBKOREA_LIVE=1 (CI stays offline).
describe.skipIf(!process.env.JOBKOREA_LIVE)("live", () => {
  test("search returns real results", async () => {
    const out = parseJSON<{ results: { id: string; title: string; url: string }[] }>(
      await runCLI(["search", "-q", "데이터 엔지니어", "--limit", "3"]),
    )
    expect(out.results.length).toBeGreaterThan(0)
    for (const r of out.results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.url).toContain("jobkorea.co.kr")
    }
    const detail = parseJSON<{ title: string }>(await runCLI(["detail", out.results[0].id]))
    expect(detail.title).not.toBe("(untitled)")
  })
})
