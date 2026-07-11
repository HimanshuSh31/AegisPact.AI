"""
Structured JSON logging for AegisPact.AI.

Usage anywhere in the codebase:
    from app.logger import get_logger
    log = get_logger(__name__)
    log.info("audit_started", job_id=1, document_id=3)
    log.error("task_failed", job_id=1, exc_info=True)
"""

import logging
import sys
import structlog


def _configure_structlog() -> None:
    """Configure structlog with JSON renderer for production."""
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(),
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "watchfiles.main", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


_configure_structlog()


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a structlog logger bound to the given module name."""
    return structlog.get_logger(name)
