# OptionScope

OptionScope is an options-analysis platform.

## Currently implemented

- Ticker watchlists (create, list, retrieve).
- Stock quotes and market snapshots.
- Option-chain exploration, including expiration lookup and nearest-strike,
  filtered, at-the-money-centered chain retrieval.
- Frontend ticker search with live market-snapshot display and configurable
  option-chain filtering (calls only, puts only, or both, plus strike range
  and result limit).
- Single-leg Position Lens analysis for long calls, short calls, long puts,
  and short puts, using option-chain data already loaded in the browser.
- Vertical Spread Builder analysis for bull call, bear call, bear put, and
  bull put spreads, including:
  - Long-leg and short-leg quote references.
  - Strike width.
  - Net debit or credit per share and per contract.
  - Break-even price.
  - Maximum profit and maximum loss.
  - Validation of option type, expiration, underlying symbol, and strike
    ordering before two contracts can be analyzed together.
  - Clear "unavailable" results, instead of misleading numbers, when quotes
    are missing, invalid, or produce an inverted (zero or negative) debit or
    credit.

All calculations are expiration-only estimates. This is read-only analysis —
OptionScope does not submit or execute brokerage orders.

Quote conventions: long legs use the ask price when available, short legs
use the bid price when available, and the last trade price is used as a
fallback when the preferred quote is unavailable.

Greek values shown are passed through from Alpaca; OptionScope does not yet
compute them itself.

## Frontend architecture

`App.tsx` owns application workflow state (the searched ticker, loaded
snapshot, option-chain filters, loaded chain, Position Lens selection, and
Vertical Spread Builder visibility) and orchestrates all API requests.
Presentation is split into focused, controlled components that receive their
data and callbacks as props and hold no state of their own:

- `MarketSearchForm` — the ticker-search form.
- `MarketSnapshot` — the market-snapshot metrics.
- `OptionChainControls` — expiration, chain-side, strike, and result-limit
  filters.
- `OptionChainTable` — a single option-chain side (calls or puts).
- `PositionLens` — single-leg position analysis.
- `VerticalSpreadBuilder` — vertical-spread analysis.

Shared display and moneyness-classification helpers used across these
components live in `frontend/src/marketView.ts`. Position and vertical-spread
payoff calculations remain centralized in `frontend/src/positionLens.ts` and
`frontend/src/verticalSpreads.ts`; the React components render those
calculation results rather than duplicating the formulas.

## Planned / roadmap

The following are not yet implemented:

- Additional multi-leg strategies beyond vertical spreads.
- Theoretical option pricing (e.g. Black-Scholes).
- Internally computed Greeks.
- Implied-volatility analysis.
- Production deployment and infrastructure hardening.

## Testing and CI

GitHub Actions runs a `backend` job and a `frontend` job on pull requests
targeting `main` and on pushes to `main`.

- The `backend` job starts PostgreSQL, runs Alembic migrations, and runs
  `pytest`.
- The `frontend` job runs `npm ci`, the Vitest test suite, and the
  production build (which includes a TypeScript compilation check).

Latest verified results: 72 backend tests passing, and 10 frontend test files
(173 tests) passing. The production build, TypeScript compilation, and
`eslint` all pass. The frontend suite covers pure calculation logic (Position
Lens and vertical-spread math), pure formatting and moneyness-classification
helpers, focused tests for each presentation component, and App-level
workflow characterization tests (ticker search, option-chain loading,
Position Lens, and Vertical Spread Builder flows) against mocked API
responses. There is no automated browser-level end-to-end test suite; the
application was also manually smoke-tested locally across multiple tickers
and the workflows above.

## Local development

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Fill in `.env` with your Alpaca API credentials and a local database password.

### Running with Docker Compose

```bash
docker compose up
```

Docker Compose builds `DATABASE_URL` automatically from `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in `.env`. The `api` service runs `alembic upgrade head` automatically before starting Uvicorn, so the schema is always brought up to date on startup.

### Running the API directly on the host

OptionScope requires the `DATABASE_URL` environment variable to be set explicitly — there is no built-in fallback. When running the API outside Docker Compose (for example `uvicorn app.main:app --reload`), export it yourself. Against the Compose-managed database exposed on `localhost:5433`:

```bash
export DATABASE_URL="postgresql+psycopg://optionscope_user:<password>@localhost:5433/optionscope"
```

### Running the frontend

The frontend runs outside Docker Compose and is not yet containerized. It
expects the backend API to already be running locally (via Docker Compose or
directly on the host, as described above) at the URL configured by
`VITE_API_BASE_URL`, or `http://localhost:8000` by default.

```bash
cd frontend
npm ci
npm run dev
```

### Database migrations

OptionScope uses [Alembic](https://alembic.sqlalchemy.org/) for schema migrations. `Base.metadata.create_all()` is no longer used at startup — Alembic is the only mechanism that creates or changes tables. Migrations need `DATABASE_URL` set, same as above.

**Fresh database** (no `tickers` table yet):

```bash
alembic upgrade head
```

This runs every migration's `upgrade()` in order to build the schema from nothing. Docker Compose does this automatically; on the host, run it yourself before starting the API for the first time and after pulling any new migration.

**`upgrade` vs. `stamp`**

- `alembic upgrade head` actually executes each migration's `upgrade()` — it issues real `CREATE TABLE` / `ALTER TABLE` statements against the database.
- `alembic stamp head` runs no migration at all. It only writes the target revision into Alembic's own bookkeeping table (`alembic_version`), telling Alembic "consider this database already at this revision." Only use `stamp` when the database's schema already matches that revision through some other means (see below) — never as a shortcut to skip applying real schema changes.

**One-time step for a database that predates Alembic**

If your local or Docker Compose database was created by the old `create_all()`-on-startup behavior, it already has a `tickers` table matching the baseline migration exactly. Running `alembic upgrade head` against it will fail, because the baseline migration's `upgrade()` tries to `CREATE TABLE tickers`, which already exists. For that database only, run once:

```bash
alembic stamp head
```

This marks the database as already at the baseline revision without re-running `CREATE TABLE`. Do this once per pre-existing database; any newly created database should use `alembic upgrade head` instead.

**Warning:** `alembic downgrade base` reverts every migration in the project, including the `DROP TABLE` statements in each migration's `downgrade()`. Running it deletes the `tickers` table and all of its data. Never run it against a database whose data you want to keep.
