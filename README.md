# Back to the Top

NBA Top Shot daily on-chain analytics. Source of truth: this private GitHub repository. Sites hosts the dashboard; daily GitHub Actions publishes only aggregated blockchain data to its authenticated update endpoint.

## Develop

Requires Node 22+ and Python 3.12+. `npm ci --ignore-scripts`, `npm test`, `npm run build`, then `npm run preview` (port 4173). `npm run build:site` additionally bundles a Cloudflare Worker for Sites hosting. No API keys are needed to read Flow.

## Data

```sh
python3 collector/scan.py --latest-first
python3 collector/scan.py --start 2026-10-01 --end 2026-10-03
python3 collector/scan.py --start 2026-11-13 --end 2026-11-13 --refresh
```

Coverage begins **2026-10-01**. Every date is fixed EST, **05:00 UTC to 05:00 UTC**, including October. Current days are excluded. Each sealed-block query range contains at most 250 blocks. Cached successful API responses are reused on local retry; `.cache` is never committed. Days are written atomically only after all event and enrichment requests succeed. Any failure exits nonzero and leaves the last published day intact. Pending dates remain missing, not zero.

The dashboard shows daily observations with a default seven-day window. The header range and in-chart zoom sliders synchronize all six charts. Sales volume and activity share the first row; four Moment metrics fill the next two rows. Stacked volume bars show daily totals; line points show values. No period aggregates are displayed. The monthly calendar shows the highest USD Moment sale across listing, offer and legacy channels, with official media and a link to the exact on-chain NFT. Ties use the first event in deterministic timestamp/transaction/index order. `collector/backfill_top_sales.py` rebuilds historical identities entirely from the existing Flow cache and verifies each against the published daily high. `public/data/top-sales.json` preserves historical identity enrichment when an older activity backfill replaces day files; fresh daily collection writes `highestSale` directly. ListingCompleted/OfferCompleted require purchased=true and exact NFT contract types. Legacy TopShotMarketV3 sales remain in the raw data and participation calculation but are excluded from the displayed offer/listing sales channels. Primary pack drops are excluded. USD value is DapperUtilityCoin only. Offers often report a generic capability rather than the underlying payment vault: the collector resolves it using amount-matched, non-null-source fungible withdrawals preceding that specific offer completion, excluding later gas fees. Ambiguous/other-currency sales are excluded and counted in quality fields.

Deduplication uses transaction ID + event index, preserving legitimate repeated sales of one NFT. Buyers/sellers are matched by transaction and NFT type/ID; listing withdrawals precede completion and buyer deposits follow it. Offer participants are explicit in the event. Address counts are not people. Combined asset counts use daily set unions. Four system addresses are excluded (see `collector/scan.py`). Lock/unlock counts are event counts, not current locked supply. A unique transaction authorizer is counted as a **signer**, not asserted to be an NFT owner; ambiguous authorizers remain unattributed.

Daily JSON exposes `quality` counters for excluded currencies, unresolved lock events and sales without both matched addresses. Check these alongside reconciliation totals. Known reference: 2026-11-13 Moments = 3,413 sales / $30,419.59; the prior analyst's rounded amount was $30,420.

## Daily updates

`.github/workflows/daily.yml` runs **06:35 UTC / 01:35 fixed EST**, collects missing completed days, commits summaries and uploads the snapshot. GitHub may delay scheduled runs. Manual dispatch is available for recovery; missing days are automatically caught up. No Codex scheduler is required. Private-repository Actions usage is subject to the account's included minutes; no paid hosting or subscription is configured.

Repository secrets: `DATA_WRITE_KEY` (narrow data-ingestion key), `SITES_SERVICE_TOKEN` (Sites private-service authorization). The same ingestion key is a secret runtime variable in Sites. Neither belongs in source, frontend bundles or logs. The website is publicly accessible; the source repository remains private. Changing audience does not change source repository privacy. Data writes also require the application key even if audience changes later.

The Worker serves versioned bundled assets and the latest R2 `daily.json`. Update credentials are accepted only on `/api/data`; writes validate schema, reject stale snapshots and cannot remove completed dates. The publisher reads back and compares the whole snapshot after each write. Source deployments use the Sites packaging workflow; daily updates do not redeploy the app.

## Provenance

Derived from Flow public Access API and an analyst handoff in Han's Huddo. The handoff's two daily CSV files were empty; all published dates are independently re-collected. Original scanner concepts were reviewed and rewritten for safe retries, fixed time boundaries, currency verification and NFT-level participant matching.

Activity coverage v2 monitors the exact event map exposed in `daily.json.activityCoverage`, including cancelled listings, offer cancellation, legacy listing changes, transfers/gifts, locks, burns and pack open/reveal requests. It counts explicitly attributable addresses and unambiguous transaction signers. This is observed activity, not a guarantee of every possible contract interaction; calls without monitored events, collection setup and administrative operations are excluded. Multi-authorizer fallback events remain unattributed and are reported in `quality.unresolvedActivityEvents`. Channel price statistics are computed from individual sales, never averages of daily medians.
