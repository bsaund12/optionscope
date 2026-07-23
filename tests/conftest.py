import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://optionscope_user:optionscope_test_password@localhost:5433/optionscope_test",
)
