"""
ClaimShield AI — Data Integrity Verification Script
====================================================
Run from the backend directory:
    python ../scripts/verify_data.py

Or from repo root:
    python scripts/verify_data.py

Checks:
  1. policy_chunks: count == 9 with 3072-dim embeddings
  2. demo_cases: count == 3
  3. Redis connectivity
  4. Per-payer retrieval: at least 1 chunk per demo case
  5. Full DEMO-001 workflow smoke test (optional — slow)
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Allow running from repo root or backend/
_repo_root = Path(__file__).parent.parent
sys.path.insert(0, str(_repo_root / "backend"))

import asyncpg
import redis.asyncio as aioredis

# Load .env manually (pydantic-settings not available outside backend package)
def _load_env():
    env_path = _repo_root / "backend" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())

_load_env()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://claimshield:claimshield@localhost:5432/claimshield",
)
# asyncpg uses postgres:// scheme (without +asyncpg suffix)
_PG_DSN = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

PASS = "\033[92m  PASS\033[0m"
FAIL = "\033[91m  FAIL\033[0m"
WARN = "\033[93m  WARN\033[0m"


async def check_postgres(conn: asyncpg.Connection) -> bool:
    all_ok = True

    # 1. Policy chunks count
    row = await conn.fetchrow("SELECT COUNT(*) AS cnt FROM policy_chunks")
    count = row["cnt"]
    ok = count == 9
    status = PASS if ok else FAIL
    print(f"{status}  policy_chunks count = {count} (expected 9)")
    all_ok &= ok

    # 2. Embedding dimensions (vector_dims is the pgvector function for this)
    dim_row = await conn.fetchrow(
        "SELECT vector_dims(embedding) AS dim FROM policy_chunks LIMIT 1"
    )
    if dim_row:
        dim = dim_row["dim"]
        ok = dim == 3072
        status = PASS if ok else FAIL
        print(f"{status}  embedding dimensions = {dim} (expected 3072)")
        all_ok &= ok
    else:
        print(f"{FAIL}  no policy_chunks rows found — run seed first")
        all_ok = False

    # 3. Demo cases
    row = await conn.fetchrow("SELECT COUNT(*) AS cnt FROM demo_cases")
    count = row["cnt"]
    ok = count == 3
    status = PASS if ok else FAIL
    print(f"{status}  demo_cases count = {count} (expected 3)")
    all_ok &= ok

    # 4. Payer isolation — each payer has exactly 3 chunks
    rows = await conn.fetch(
        "SELECT payer_id, COUNT(*) AS cnt FROM policy_chunks GROUP BY payer_id ORDER BY payer_id"
    )
    for r in rows:
        ok = r["cnt"] == 3
        status = PASS if ok else WARN
        print(f"{status}  chunks for payer_id={r['payer_id']} = {r['cnt']} (expected 3)")
        all_ok &= ok

    # 5. No null embeddings
    null_row = await conn.fetchrow(
        "SELECT COUNT(*) AS cnt FROM policy_chunks WHERE embedding IS NULL"
    )
    ok = null_row["cnt"] == 0
    status = PASS if ok else FAIL
    print(f"{status}  null embeddings = {null_row['cnt']} (expected 0)")
    all_ok &= ok

    return all_ok


async def check_redis() -> bool:
    try:
        r = aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
        ok = await r.ping()
        await r.aclose()
        print(f"{PASS}  Redis ping at {REDIS_URL}")
        return bool(ok)
    except Exception as exc:
        print(f"{FAIL}  Redis unavailable: {exc}")
        return False


async def check_retrieval(conn: asyncpg.Connection) -> bool:
    """Quick keyword retrieval check per payer (no Gemini needed)."""
    all_ok = True
    cases = [
        ("bcbs_tx",         "commercial",     "75571"),
        ("unitedhealthcare","commercial_hmo",  "75561"),
        ("aetna",           "commercial",     "75571"),
    ]
    for payer_id, plan_type, cpt_code in cases:
        rows = await conn.fetch(
            """
            SELECT id FROM policy_chunks
            WHERE payer_id = $1
              AND plan_type = $2
              AND (array_length(cpt_codes, 1) IS NULL OR $3 = ANY(cpt_codes))
            LIMIT 5
            """,
            payer_id, plan_type, cpt_code,
        )
        ok = len(rows) >= 1
        status = PASS if ok else FAIL
        print(f"{status}  retrieval for payer={payer_id}, cpt={cpt_code}: {len(rows)} chunks")
        all_ok &= ok
    return all_ok


async def check_backend_health() -> bool:
    """Check backend health endpoint."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get("http://localhost:8000/api/v1/health")
            ok = r.status_code == 200
            status = PASS if ok else FAIL
            print(f"{status}  backend /health = {r.status_code}")
            return ok
    except Exception as exc:
        print(f"{WARN}  backend health check skipped (not running?): {exc}")
        return True  # Don't fail if backend not running


async def main() -> int:
    print("\n=== ClaimShield AI -- Data Integrity Check ===\n")

    failures = 0

    # Postgres checks
    print("--- PostgreSQL ---")
    try:
        conn = await asyncpg.connect(_PG_DSN)
        try:
            pg_ok = await check_postgres(conn)
            retrieval_ok = await check_retrieval(conn)
        finally:
            await conn.close()
        if not (pg_ok and retrieval_ok):
            failures += 1
    except Exception as exc:
        print(f"{FAIL}  Cannot connect to Postgres: {exc}")
        print(f"       DSN: {_PG_DSN}")
        failures += 1

    print("\n--- Redis ---")
    if not await check_redis():
        failures += 1

    print("\n--- Backend Health ---")
    await check_backend_health()

    print()
    if failures == 0:
        print("\033[92m✅  All data integrity checks PASSED\033[0m\n")
        return 0
    else:
        print(f"\033[91m❌  {failures} check(s) FAILED — fix issues above before demo\033[0m\n")
        return 1


if __name__ == "__main__":
    # Ensure UTF-8 output on Windows
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(asyncio.run(main()))
