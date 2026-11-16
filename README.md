# Back to the Top

NBA Top Shot daily on-chain analytics. Public source: https://github.com/hellohanchen/back-to-the-top. Dashboard: https://hellohanchen.github.io/back-to-the-top/. Daily GitHub Actions collects public blockchain data and publishes GitHub Pages plus the existing Sites mirror.

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

`.github/workflows/daily.yml` runs **05:00 UTC / 00:00 fixed EST**, collects missing completed days, commits summaries and uploads the snapshot. GitHub may delay scheduled runs. Manual dispatch is available for recovery; missing days are automatically caught up. No Codex scheduler is required. The collector waits up to ten minutes for sealed blocks to reach the day boundary. GitHub scheduling is best effort, so midnight is the scheduled trigger, not a guarantee of exact execution or publication time. This fixed UTC−5 schedule does not follow daylight saving time.

Repository secrets: `DATA_WRITE_KEY` (narrow data-ingestion key), `SITES_SERVICE_TOKEN` (Sites private-service authorization). The same ingestion key is a secret runtime variable in Sites. Neither belongs in source, frontend bundles or logs. Both the website and source repository are public. Data writes also require the application key even if audience changes later.

The Worker serves versioned bundled assets and the latest R2 `daily.json`. Update credentials are accepted only on `/api/data`; writes validate schema, reject stale snapshots and cannot remove completed dates. The publisher reads back and compares the whole snapshot after each write. Source deployments use the Sites packaging workflow; daily updates do not redeploy the app.

## Provenance

Derived from Flow public Access API and an analyst handoff in Han's Huddo. The handoff's two daily CSV files were empty; all published dates are independently re-collected. Original scanner concepts were reviewed and rewritten for safe retries, fixed time boundaries, currency verification and NFT-level participant matching.

Activity coverage v2 monitors the exact event map exposed in `daily.json.activityCoverage`, including cancelled listings, offer cancellation, legacy listing changes, transfers/gifts, locks, burns and pack open/reveal requests. It counts explicitly attributable addresses and unambiguous transaction signers. This is observed activity, not a guarantee of every possible contract interaction; calls without monitored events, collection setup and administrative operations are excluded. Multi-authorizer fallback events remain unattributed and are reported in `quality.unresolvedActivityEvents`. Channel price statistics are computed from individual sales, never averages of daily medians.


## GitHub Pages

`.github/workflows/pages.yml` builds the static `dist/` site and deploys it with GitHub Pages Actions. It runs on main source pushes, manual dispatch, and as a reusable job after the daily collector commits fresh data. It checks out the updated main branch, so automated data commits are published even though GitHub does not trigger another workflow from a `GITHUB_TOKEN` push. Relative asset and data URLs support both the repository subpath and the Sites root. Pages has no credentials or write endpoint. Deployment verifies the complete live JSON snapshot against the build. Enable Pages with the GitHub Actions publishing source in repository settings.

## Daily market share

The fourth and fifth charts split each day's **Moment USD revenue** by Set and player (offers, listings and legacy sales; Packs excluded). Each day independently shows its five largest categories plus Others in a 100% stack. Colors identify daily rank; hover shows the actual Set/player and revenue. Expand All sets / All players and select a day to see every category, amount and share. Zero-sales or pending days are gaps, not fabricated 100% totals.

Run `python3 -m collector.market_share` after collecting. It replays the three sale event types from the same Flow cache, checks each channel's count and amount against the existing day, then enriches identities using the official Top Shot site's public Atlas NFT service. Burned/minted identities can be recovered from Flow events and the TopShot contract's Play/Set getters. Metadata is current at enrichment time; unavailable metadata remains Unattributed in the denominator and quality counts. Sets use IDs (series are kept separate); player-directory names and verified aliases normalize names such as Steph/Stephen Curry and diacritics. Historical names without a current player match remain as recorded.

The daily workflow runs this enrichment before committing/publishing and caches only public metadata. Failed requests or reconciliation failures stop publication; no credentials are required for metadata reads. `daily.json.marketShareCoverage` records coverage and provenance. The Sites ingestion limit is 20 MB to accommodate the full category history; grouping sums are validated on writes.

The daily job retains 00:00 fixed EST (05:00 UTC), with a 01:18 EST catch-up run. Challenge updates use five-minute cron slots away from the hour boundary. GitHub schedule delivery can be delayed or dropped; an enabled workflow and successful manual run do not prove scheduled delivery. Check runs with event `schedule` and live generatedAt timestamps.

Public metadata snapshots in `collector/metadata/` seed the runner without credentials. The Atlas API returns HTTP 403 from GitHub-hosted runners as of 2026-11-16, while local requests work. Newly minted/burned identities are resolved from Flow first. Previously unseen older Moments may still require local enrichment: failed daily runs retain the unpublished daily JSON and sale rows as the `unpublished-market-data` artifact. Complete enrichment locally, reconcile channels, update the public snapshot, and retry. Do not bypass reconciliation or represent a failed run as a fresh publication. Flow request caches survive enrichment failures.
