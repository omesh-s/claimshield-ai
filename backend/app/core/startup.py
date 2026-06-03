"""
Application startup — registers all mock data at launch.
Called inside the FastAPI lifespan context manager.
"""
from __future__ import annotations

from app.core.logging import get_logger

logger = get_logger(__name__)


def register_all_mocks() -> None:
    """
    Register all seed data into the in-memory mock registries.
    Order matters: mocks must be registered before any request is handled.
    """
    from app.mocks.ehr import register_mock_data as register_ehr
    from app.mocks.clearinghouse import register_mock_data as register_clearinghouse

    register_ehr()
    logger.info("startup.mocks.ehr_registered", patients=3)

    register_clearinghouse()
    logger.info("startup.mocks.clearinghouse_registered", payer_cpt_combos=3)

    logger.info("startup.mocks.complete", message="All demo data registered and ready")
