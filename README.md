# OptionScope

OptionScope is an options-analysis platform.

## Currently implemented

- Ticker watchlists (create, list, retrieve).
- Stock quotes and market snapshots.
- Option-chain exploration, including expiration lookup and nearest-strike,
  filtered chain retrieval.
- Single-leg payoff analysis (long/short calls and puts) via the frontend
  Position Lens, using option-chain data already loaded in the browser.

Greek values shown are passed through from Alpaca; OptionScope does not yet
compute them itself.

## Planned / roadmap

The following are not yet implemented:

- Multi-leg option spreads.
- Theoretical option pricing (e.g. Black-Scholes).
- Internally computed Greeks.
- Implied-volatility analysis.

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