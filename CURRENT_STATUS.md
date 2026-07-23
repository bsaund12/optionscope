# OptionScope — Current Status

_Last updated: 2026-07-23_

## Architecture

OptionScope currently uses a single-service FastAPI backend (`app/`) backed by PostgreSQL, with a separate Vite/React/TypeScript frontend that communicates with the backend over HTTP. There is no API gateway, queue, or microservice architecture.

- **api** — FastAPI and Uvicorn, containerized through Docker Compose.
- **db** — PostgreSQL 16, containerized through Docker Compose.
- **frontend** — Vite development server that currently runs outside Docker Compose; it is not yet built, containerized, or deployed.
- **Alpaca** — Sole external market-data provider, called synchronously through `httpx` from synchronous `def` route handlers.

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

### Frontend

The frontend test suite and production build were verified successfully on 2026-07-23.

Test command:

```bash
cd frontend
npm test -- --run
```

Confirmed result:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    88ms
```

The current Vitest suite covers five `positionLens.ts` scenarios:

- Long-call payoff using the ask as the debit reference.
- Short-call payoff using the bid as the credit reference.
- Long-put payoff limits at expiration.
- Short-put payoff limits at expiration.
- Rejection of a position that does not match the selected contract.

Production build command:

```bash
npm run build
```

Confirmed result:

```text
18 modules transformed
Production build completed successfully in 76ms
```

Known frontend coverage gaps include:

- `App.tsx` state management.
- Form handling.
- API orchestration.
- Loading states.
- Error states.
- Rendering market snapshot and option-chain responses.

- **Position Lens**:
  - Client-side, single-leg payoff estimate.
  - Supports long calls, short calls, long puts, and short puts.
  - Calculates expiration-only payoff from option-chain data already loaded in the browser.

### Not yet implemented

The following capabilities are mentioned or implied in the current README but are not yet implemented:

- Multi-leg option spreads.
- Theoretical option pricing such as Black-Scholes.
- Internally computed Greeks.
- Implied-volatility analysis.

Current Greek values are passed through from Alpaca rather than calculated by OptionScope.

## Known issues

- **No database migrations**:
  - Tables are currently created through `Base.metadata.create_all()` during application startup.
  - Alembic is not configured.
  - This conflicts with the project's convention that schema changes should use migrations.
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
- **README.md is incomplete and inaccurate**:
  - It contains an unclosed code fence and incomplete setup instructions.
  - It overstates capabilities such as spreads, theoretical pricing, and computed Greeks or volatility analysis.
- **All backend routes remain in one `main.py` file**:
  - The file is approximately 740 lines.
  - This is not yet an urgent problem, but routes should be split into dedicated routers as the API surface grows.
- **Frontend deployment is incomplete**:
  - The frontend is not containerized.
  - It is not served by the backend.
  - No production deployment workflow exists.

## Current test status

### Backend

The backend test suite was run successfully on 2026-07-23.

Environment:

- Python 3.9.6
- pytest 8.4.2

Verification command:

```bash
python -m pytest -v
```

Confirmed result:

```text
72 passed in 0.38s
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

Vitest currently includes tests for `positionLens.ts` payoff calculations.

Known frontend coverage gaps include:

- `App.tsx` state management.
- Form handling.
- API orchestration.
- Loading states.
- Error states.
- Rendering option-chain and snapshot responses.

The frontend test suite and production build have not yet been verified during this session.

Run:

```bash
cd frontend
npm test -- --run
npm run build
cd ..
```

### Continuous integration

No CI configuration currently exists. Backend and frontend verification must be run manually.

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

## Recommended next tasks

1. Commit the staged frontend source, `.gitignore`, and project-status documentation.
2. Introduce Alembic and replace startup-driven schema creation with managed migrations.
3. Add CI to run backend tests, frontend tests, and the frontend production build automatically.