from decimal import Decimal

from app.option_chain import (
    NormalizedOptionChainContract,
    validate_chain_limit,
)


def select_nearest_option_contracts(
    contracts: list[NormalizedOptionChainContract],
    *,
    reference_price: Decimal,
    limit: int,
) -> list[NormalizedOptionChainContract]:
    """
    Select the contracts whose strikes are closest to a reference price.

    Contracts are ranked by distance from the reference price. Ties prefer
    the lower strike, then the contract symbol, so results stay predictable.
    The selected contracts are returned in normal ascending strike order for
    an options-chain table.
    """

    if reference_price <= Decimal("0"):
        raise ValueError("Reference price must be greater than zero.")

    safe_limit = validate_chain_limit(limit)

    nearest_contracts = sorted(
        contracts,
        key=lambda contract: (
            abs(contract.strike_price - reference_price),
            contract.strike_price,
            contract.contract_symbol,
        ),
    )[:safe_limit]

    return sorted(
        nearest_contracts,
        key=lambda contract: (
            contract.strike_price,
            contract.contract_symbol,
        ),
    )
