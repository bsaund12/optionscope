# OptionScope — Current Status

_Last updated: 2026-07-27_

## Architecture

OptionScope currently uses a single-service FastAPI backend (`app/`) backed by PostgreSQL, with a separate Vite/React/TypeScript frontend that communicates with the backend over HTTP. There is no API gateway, queue, or microservice architecture.

- **api** — FastAPI and Uvicorn, containerized through Docker Compose.
- **db** — PostgreSQL 16, containerized through Docker Compose.
- **frontend** — Vite development server that still runs outside Docker Compose; it is not yet built, containerized, or deployed.
- **Alpaca** — Sole external market-data provider, called synchronously through `httpx` from synchronous `def` route handlers.

There is no production deployment yet for any component (API, database, or frontend).

The synchronous route handlers are appropriate for the current blocking HTTP client because FastAPI executes them in a thread pool rather than blocking the main asynchronous event loop.

Provider responses are normalized into internal dataclasses and Pydantic schemas before being returned to clients. Alpaca credentials and raw provider payloads are not exposed through API responses.

## Implemented functionality

### Backend

- Ticker tracking:
  - Create a ticker.
  - List tracked tickers.
  - Retrieve a ticker by symbol.
  - Routes are available under `/tickers`.
- Stock quote retrieval:
  - `/market/stocks/{symbol}/quote`
- Full market snapshot retrieval:
  - `/market/stocks/{symbol}/snapshot`
  - Includes day-change calculations.
- Active option-expiration lookup:
  - `/market/options/{symbol}/expirations`
  - Paginates through Alpaca's option-contract catalog.
- Filtered, at-the-money-centered option-chain retrieval:
  - `/market/options/{symbol}/chain`
  - Supports calls, puts, or both.
  - Supports strike-range filtering.
  - Supports result limits.
  - Selects contracts nearest to the reference stock price.
- Input validation for:
  - Ticker symbols.
  - Expiration dates.
  - Strike ranges.
  - Option types.
  - Chain limits.
- `/health` database-connectivity check.

### Implemented frontend functionality

#### Position Lens

- Client-side, single-leg payoff estimate (`frontend/src/positionLens.ts`).
- Supports long calls, short calls, long puts, and short puts.
- Calculates expiration-only payoff (break-even, maximum profit, maximum
  loss) from option-chain data already loaded in the browser.

#### Vertical-spread calculation engine

`frontend/src/verticalSpreads.ts` adds a reusable, two-leg calculation
engine used by the Vertical Spread Builder UI:

- Supports four strategies: bull call spread, bear call spread, bear put
  spread, and bull put spread.
- Strategy rules (required option type, long-leg strike position, outlook,
  debit/credit kind) are centralized in one metadata table and exposed via
  `getVerticalSpreadRequirements()`, rather than duplicated per strategy.
- Validates that both legs share the same underlying symbol, the same
  expiration date, and the correct option type for the selected strategy,
  and that the long and short legs are correctly ordered by strike (and are
  not the same strike).
- Follows the existing Position Lens quote convention: long legs use the
  ask price, short legs use the bid price, and the last trade price is used
  as a fallback when the preferred quote is unavailable.
- Returns a clearly marked "unavailable" result — instead of a misleading
  number — when a required quote is missing, or when the available quotes
  would produce a zero or negative (inverted) net debit or credit.
- Calculates strike width, net debit/credit per share and per contract,
  break-even price, maximum profit, and maximum loss.

#### Vertical Spread Builder UI

`frontend/src/components/VerticalSpreadBuilder.tsx` connects the
calculation engine to the option chain already loaded in the browser:

- Strategy selection across all four supported spreads.
- Long-leg and short-leg selection from the currently loaded chain.
- Incompatible contracts are disabled in each selector, with the reason
  shown directly in the option text (e.g. "must be higher than long leg").
- Analysis renders automatically once both legs are validly selected, using
  the engine's output directly — no spread math is duplicated in the
  component.
- "Reset selections" clears both legs without closing the builder or
  reloading the chain.
- "Close spread builder" removes the builder without reloading the option
  chain.
- Switching strategy clears both selected legs, since each strategy
  requires a different option type and/or strike ordering.
- Loading a new ticker or a new option chain in `App.tsx` closes the
  builder, so it can never hold a stale contract reference from a previous
  chain.
- Desktop (multi-column) and narrow-width (single-column) responsive
  layout, manually verified in the browser.
- Read-only analysis only — no order entry or brokerage execution.
- An unexpected error from the calculation engine is caught and rendered as
  an inline message rather than crashing the component; the engine's own
  validation remains the authoritative safety layer, and the UI's
  disabling of incompatible options is a convenience on top of it, not a
  replacement for it.

### Not yet implemented

The following capabilities are mentioned or implied in the current README but are not yet implemented:

- Additional multi-leg strategies beyond vertical spreads.
- Theoretical option pricing such as Black-Scholes.
- Internally computed Greeks.
- Implied-volatility analysis.

Current Greek values are passed through from Alpaca rather than calculated by OptionScope.

## Known issues

- **No retry or backoff behavior for Alpaca requests**:
  - A transient provider or network failure immediately fails the user's request.
- **No caching layer**:
  - Every market-data request makes a new request to Alpaca.
  - This will not scale safely beyond limited development use.
- **No authentication or authorization**:
  - All routes are currently public to anyone who can reach the API.
  - For example, `POST /tickers` has no access control.
  - This is expected during early development but blocks a safe public deployment.
- **No OptionScope API rate limiting**:
  - A caller could repeatedly invoke OptionScope endpoints and consume Alpaca rate limits or paid usage.
- **README.md previously overstated capabilities** such as spreads, theoretical pricing, and computed Greeks or volatility analysis. It now separates "Currently implemented" from "Planned / roadmap" functionality (corrected 2026-07-24), and "Currently implemented" now includes the Vertical Spread Builder (corrected 2026-07-27).
- **All backend routes remain in one `main.py` file**:
  - The file is approximately 740 lines.
  - This is not yet an urgent problem, but routes should be split into dedicated routers as the API surface grows.
- **`App.tsx` is growing as the frontend gains features**:
  - It still owns most page-level state (ticker search, chain loading,
    Position Lens, and the Vertical Spread Builder toggle) directly.
  - Formatting helpers have been extracted to `format.ts`, and the spread
    builder itself lives in its own component, but `App.tsx` would benefit
    from further decomposition as more features are added.
- **Frontend deployment is incomplete**:
  - The frontend is not containerized.
  - It is not served by the backend.
  - No production deployment workflow exists.

## Current test status

### Backend

The backend test suite was run successfully on 2026-07-27.

Environment:

- Python 3.9.6
- pytest 8.4.2

Verification command:

```bash
python -m pytest -v
```

Confirmed result:

```text
72 passed
```

The current backend suite covers:

- Ticker and request validation.
- Expiration-date validation.
- Strike-range validation.
- Option-type and chain-limit validation.
- OCC option-symbol parsing.
- Option-chain snapshot normalization.
- Filtering malformed provider contracts.
- Strike filtering and result limiting.
- Reference-price selection.
- Nearest-to-price option selection.
- Alpaca option-chain request construction.
- Option-chain endpoint orchestration through direct function calls.
- `DATABASE_URL` configuration validation (missing, empty, whitespace-only, and valid values).

Remaining backend coverage gaps include:

- `AlpacaClient` HTTP error translation for:
  - `401`
  - `403`
  - `404`
  - `429`
  - Malformed JSON
  - Network and timeout failures
- `/tickers` endpoint behavior.
- `/health` endpoint behavior.
- Stock quote and snapshot day-change calculations.
- Database-backed integration tests.
- FastAPI `TestClient` request-and-response tests.
- Authentication and authorization tests once those features exist.

### Frontend

The frontend test suite and production build were verified successfully on 2026-07-27.

Test command:

```bash
cd frontend
npm test
```

Confirmed result:

```text
Test Files  3 passed (3)
Tests       34 passed (34)
```

The current Vitest suite covers:

- `positionLens.test.ts` — single-leg payoff calculations for long/short
  calls and puts.
- `verticalSpreads.test.ts` — all four vertical-spread strategies, the
  centralized strategy-requirement metadata, the long-ask/short-bid quote
  convention with last-trade fallback, and missing/inverted quote handling.
- `components/VerticalSpreadBuilder.test.tsx` — strategy selection, long-leg
  and short-leg selection, disabling of incompatible contracts, successful
  metric rendering, Reset and Close behavior, strategy-switch clearing,
  empty-option-side handling, and defensive rendering of an unexpected
  engine error.

Production build command:

```bash
npm run build
```

Confirmed result:

```text
tsc -b && vite build
21 modules transformed
Production build completed successfully
```

Known frontend coverage gaps include:

- `App.tsx` state management (ticker search, chain loading, error/loading
  states) as a whole.
- API orchestration and rendering of market-snapshot and option-chain
  responses.
- End-to-end/browser-level tests (current coverage is component-level via
  React Testing Library plus pure-calculation tests).

### Continuous integration

`.github/workflows/ci.yml` runs on pull requests targeting `main` and on pushes to `main`, with `permissions: contents: read` at the workflow level. CI is active and has passed on GitHub Actions for both jobs.

- **`backend` job**: starts a `postgres:16-alpine` service container (dummy CI-only credentials, matching `docker-compose.yml`'s healthcheck pattern), installs `requirements-dev.txt` on Python 3.12, runs `alembic upgrade head` against the service container, then runs `pytest`. No Alpaca credentials are provided or required — all Alpaca-touching tests mock the client.
- **`frontend` job**: runs in `frontend/`, uses Node 24 (matches `vite`'s and `vitest`'s `engines` requirements), runs `npm ci`, `npm test` (`vitest run`, non-interactive), and `npm run build`.

The first Actions run for the Vertical Spread Builder pull request (PR #5)
failed in the `frontend` job during the `npm ci` step: `package-lock.json`
had been regenerated on macOS, which pruned a handful of Linux-only
optional dependency entries (`@emnapi/core`, `@emnapi/runtime`,
`@emnapi/wasi-threads`) that the Linux CI runner needed. This was a
lockfile-generation/platform issue, not an application defect. The
diagnosis was reproduced locally in a clean `node:24-bookworm-slim`
container before making any change, the lockfile was then regenerated in
that same clean Linux container and re-verified there, and the corrected
lockfile was committed separately (`fix: restore cross-platform frontend
lockfile`). The re-run of the workflow then passed dependency installation,
tests, and the production build.

## Important engineering decisions

- Alpaca response formats are kept separate from internal application and database models.
- Provider normalization occurs in `option_chain.py` and `option_selection.py` before results reach route-response handling.
- Route handlers use synchronous `def` declarations because the current `httpx` provider calls are blocking.
- Option-chain requests retrieve a larger but bounded provider result set using `MAX_PROVIDER_OPTION_CHAIN_LIMIT`.
- OptionScope then selects contracts nearest to the reference stock price rather than relying on Alpaca's ordering or limit behavior.
- CORS is currently restricted to localhost development origins.
- CORS permits only `GET` requests and uses `allow_credentials=False`.
- `.env` is ignored by Git.
- No secrets were found in tracked source files.
- Frontend dependency directories, build output, and local environment files are excluded from version control.
- Alembic (`alembic/env.py`) obtains `DATABASE_URL` through the same `require_database_url()` helper the application uses, rather than a connection string in `alembic.ini`, so migrations fail the same way the app does when configuration is missing.
- Docker Compose's `api` service now runs `alembic upgrade head` before starting Uvicorn, so schema is brought up to date automatically on container startup.
- The Docker Compose database was already at the baseline schema (created by the old `create_all()` behavior). It was reconciled with a one-time `alembic stamp 4de9997abbde` run in a temporary one-off `api` container, verified with `alembic current`. The existing `tickers` table and its rows were confirmed present and unchanged before and after. Docker Compose was then started normally; `alembic upgrade head` ran on `api` startup, found the database already at head (no `CREATE TABLE` was issued), and `/health` returned `{"status":"healthy","database":"connected"}`.
- Vertical-spread formulas live only in `verticalSpreads.ts`; the UI
  component reuses `analyzeVerticalSpread()` and never re-derives break-even,
  profit, or loss math itself.
- The Vertical Spread Builder derives which contracts are selectable from
  the same centralized strategy metadata the engine uses
  (`getVerticalSpreadRequirements()`), instead of re-encoding each
  strategy's rules a second time in the component.
- Invalid strike combinations are disabled in the UI before selection is
  even possible, but the engine's own validation remains the final safety
  layer — the component still calls `analyzeVerticalSpread()` inside a
  `try`/`catch` so an unexpected mismatch cannot crash the React tree.
- Shared formatting helpers (currency, outcome, quote-source labels) were
  extracted from `App.tsx` into `format.ts` so both `App.tsx` and
  `VerticalSpreadBuilder.tsx` use one implementation.
- Frontend component tests (`VerticalSpreadBuilder.test.tsx`) use React
  Testing Library and a `jsdom` environment scoped to that file via a
  `// @vitest-environment jsdom` pragma; pure-calculation tests
  (`positionLens.test.ts`, `verticalSpreads.test.ts`) keep running in
  Vitest's default Node environment, so most of the suite stays fast.
- The frontend lockfile (`package-lock.json`) is maintained so that a clean
  `npm ci` succeeds on the Linux CI runners it actually targets, not just
  on the platform it happens to be regenerated on.

## Recommended next tasks

1. Refactor the growing `App.tsx` into smaller focused components.
2. Add provider retry/backoff and a caching layer for Alpaca requests.
3. Expand backend HTTP and database integration coverage (`TestClient`,
   `/tickers`, `/health`, and Alpaca error-translation tests).
4. Add safe authentication, authorization, and rate limiting before any
   public deployment.
5. Plan production deployment for the API, database, and frontend.
6. Evaluate the next analytics feature: additional multi-leg strategies,
   theoretical pricing, or implied-volatility tools.
