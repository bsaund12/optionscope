# OptionScope Development Context

## Project Purpose

OptionScope is a general-purpose options analytics application. It provides
stock and options-market data, strategy analysis, and payoff visualization.

Do not build features around only one ticker. All functionality should remain
general-purpose.

## Current Stack

- Python
- FastAPI
- PostgreSQL
- SQLAlchemy
- Pydantic
- Docker Compose
- Pytest
- Alpaca market-data APIs
- React frontend

## Engineering Priorities

1. Security
2. Correctness
3. Testability
4. Maintainability
5. Clear architecture
6. Performance where measurements justify it

Avoid unnecessary abstractions and premature microservices.

## Current Backend Structure

- `app/` contains the FastAPI backend.
- `tests/` contains automated tests.
- `frontend/` contains the frontend application.
- `docker-compose.yml` manages local services.

Inspect the repository before assuming exact filenames or architecture.

## Existing API Capabilities

- Create tracked tickers
- List tracked tickers
- Retrieve stock quotes
- Retrieve stock snapshots
- Retrieve options expiration dates
- Retrieve filtered options chains

## Development Rules

- Validate all external input.
- Never expose API keys or provider credentials.
- Keep provider responses separate from internal application models.
- Add tests for new behavior and bug fixes.
- Preserve backward compatibility unless a breaking change is intentional.
- Do not change unrelated files.
- Do not claim tests passed without seeing the test output.
- Use database migrations for schema changes.
- Treat external market-data providers as unreliable.

## Verification

Run the relevant test suite after changes:

```bash
pytest