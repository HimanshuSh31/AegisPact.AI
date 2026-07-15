from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel
from app.config import settings

# Create database engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True
)

# Async session factory
async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# FastAPI Dependency for db session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# DB Initialization
async def init_db() -> None:
    async with engine.begin() as conn:
        # Import models so they are registered on SQLModel.metadata
        from app import models  # noqa
        await conn.run_sync(SQLModel.metadata.create_all)
        
        # Self-healing migration for human overrides
        def upgrade_schema(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            
            # Check audit_finding human override fields
            columns = [col["name"] for col in inspector.get_columns("audit_finding")]
            if "is_overridden" not in columns:
                sync_conn.execute(text("ALTER TABLE audit_finding ADD COLUMN is_overridden BOOLEAN DEFAULT 0"))
                sync_conn.execute(text("ALTER TABLE audit_finding ADD COLUMN overridden_status VARCHAR(50)"))
                sync_conn.execute(text("ALTER TABLE audit_finding ADD COLUMN overridden_explanation TEXT"))
                sync_conn.execute(text("ALTER TABLE audit_finding ADD COLUMN overridden_by_id INTEGER"))
                sync_conn.execute(text("ALTER TABLE audit_finding ADD COLUMN overridden_at DATETIME"))

            # Check audit_schedule table
            if "audit_schedule" not in inspector.get_table_names():
                sync_conn.execute(text("""
                    CREATE TABLE audit_schedule (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        document_id INTEGER NOT NULL,
                        framework_id INTEGER NOT NULL,
                        cron_expression VARCHAR(100) DEFAULT '0 0 * * *',
                        next_run_at DATETIME,
                        created_at DATETIME
                    )
                """))
                
        await conn.run_sync(upgrade_schema)
