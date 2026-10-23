# Fixtures

Trimmed copies of live JobKorea responses captured on 2026-10-23, used by the
offline parser tests so CI never needs network access to jobkorea.co.kr.

- `search-page.html` — the first three `CardJob` blocks of
  `/Search/?stext=데이터 엔지니어&tabType=recruit` (two organic results and one
  paid placement), plus the slice of the RSC payload that holds the `JOB_LIST`
  query data and the paid entry's `JOB_PRODUCT_LIST` data. Quotes inside the
  payload stay escaped (`\"`) exactly as served.
- `detail-page.html` — the `<head>` of `/Recruit/GI_Read/50101226` (meta tags
  and the schema.org JobPosting JSON-LD; scripts and stylesheets removed).
- `detail-body.html` — `/Recruit/GI_Read_Comt_Ifrm?Gno=50101226`, unmodified.

When JobKorea changes its markup, re-capture these and update the anchors in
`../../url-reference.md`.
