from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TickerCreate(BaseModel):
    """The information OptionScope needs when adding a ticker."""

    symbol: str = Field(
        min_length=1,
        max_length=10,
        examples=["TSM"],
    )

    company_name: str = Field(
        min_length=1,
        max_length=255,
        examples=["Taiwan Semiconductor Manufacturing Company"],
    )

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("company_name")
    @classmethod
    def clean_company_name(cls, value: str) -> str:
        return value.strip()


class TickerResponse(BaseModel):
    """The ticker information OptionScope sends back to the user."""

    id: int
    symbol: str
    company_name: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)