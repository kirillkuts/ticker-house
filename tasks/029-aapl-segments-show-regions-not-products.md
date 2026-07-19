# 029 — AAPL "business segments" shows only geographic regions, not product segments

## Bug
Asking "Show AAPL's revenue by segment" renders a segments view whose "Revenue by
segment" chart contains only geographic regions (Americas, Europe, Greater China,
Rest of Asia Pacific, Japan). Apple's product segments (iPhone, Mac, iPad,
Wearables, Services) are missing, even though the widget is titled "business
segments" and a separate "Revenue by geography" section exists below.

The chat text even says "Apple's revenue is organized by geographic region rather
than product lines" — which is wrong: Apple reports both a geographic breakdown
and a product/services revenue disaggregation in its 10-K.

## Expected
- "Revenue by segment" for AAPL shows product-line revenue (iPhone, Mac, iPad,
  Wearables/Home/Accessories, Services), with geography staying in the
  "Revenue by geography" section.
- If the pipeline only loaded the geographic axis for AAPL, load/label the
  product disaggregation too (data pipeline: task 011, widgets: task 012).

## Likely area
Segment data pipeline / classification: AAPL's segment rows are probably tagged
with the wrong axis (regions stored as business segments), or the product-level
disaggregation was never ingested.

## Screenshot
Image 5: AAPL segments canvas — top chart legend lists only regions; geography
chart below duplicates the same data.

## Status
**Status:** done

Resolution: the product-axis data was ingested all along (iPhone, Mac, iPad,
Wearables, Service) but never surfaced — and Apple's reportable business segments
genuinely ARE regions, so the segments chart was honest but unhelpful.
segmentBreakdown() now also builds a `products` series whenever the segment axis
is "business", and the widget renders it as a "Revenue by product & service line"
stacked chart between the segment and geography sections. Two data fixes along the
way: (1) consolidated revenue is now joined by year-month — FSDS rounds period
ends to month end (2025-09-30) while financial_periods keeps the real fiscal date
(AAPL 2025-09-27), so the exact-date join silently missed and disabled parent
pruning; with the join fixed, AAPL's "Product" aggregate (= iPhone+Mac+iPad+
Wearables) is pruned by the existing subset-sum logic, now extracted into a shared
pruneParentAggregates(). (2) The geography country-vs-region dedup only drops
ISO-country members when the remaining regions still cover ≥80% of consolidated
revenue — AAPL's geography axis is US+CN+OtherCountries (the countries ARE the
partition), which the old rule reduced to a lone "OtherCountries" bar. Chat prompt
updated so the model never claims such a company "doesn't break out product lines".
Verified: 10-ticker data sweep (web/scripts/verify-029.ts — AAPL products sum to
1.000x of segments, geography 1.000x; MSFT/NVDA/AMZN/LLY gain product sections;
TSLA/META/GOOGL/JPM unchanged) and a live end-to-end chat run with screenshot
(web/scripts/verify-029-ui.mjs).
