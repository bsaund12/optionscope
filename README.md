# OptionScope

OptionScope is an options-analysis platform for:

- Watchlists and market snapshots
- Option-chain exploration
- Calls, puts, spreads, and payoff analysis
- Theoretical option pricing
- Greeks and volatility analysis

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

Docker Compose builds `DATABASE_URL` automatically from `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in `.env`.

### Running the API directly on the host

OptionScope requires the `DATABASE_URL` environment variable to be set explicitly — there is no built-in fallback. When running the API outside Docker Compose (for example `uvicorn app.main:app --reload`), export it yourself. Against the Compose-managed database exposed on `localhost:5433`:

```bash
export DATABASE_URL="postgresql+psycopg://optionscope_user:<password>@localhost:5433/optionscope"
```