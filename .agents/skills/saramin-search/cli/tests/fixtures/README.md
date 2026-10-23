# Fixtures

Trimmed copies of live Saramin responses captured on 2026-10-23, used by the
offline parser tests so CI never needs network access to saramin.co.kr.

- `search-page.html` — the first three `item_recruit` cards of
  `/zf_user/search/recruit?searchword=파이썬` plus the `cnt_result` count line
  (scripts removed).
- `view-ajax.html` — the header, summary, deadline and address blocks of the
  `/zf_user/jobs/relay/view-ajax` fragment for `rec_idx=55297082` (SVG icons
  and scripts removed).
- `view-detail.html` — the `/zf_user/jobs/relay/view-detail` iframe body for
  the same posting, unmodified.

When Saramin changes its markup, re-capture these and update the anchors in
`../../url-reference.md`.
