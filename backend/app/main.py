from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.startup import register_all_mocks
from app.api.routes import health, demo_cases, process_order, denial, package_records, pitch, retrieval_test, admin

settings = get_settings()
configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "startup",
        app=settings.app_name,
        version=settings.app_version,
        env=settings.environment,
        llm_model=settings.gemini_model,
        env_file=str(settings.model_config.get("env_file", "unknown")),
    )
    register_all_mocks()
    yield
    logger.info("shutdown", app=settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Prior authorization automation API for healthcare revenue cycle.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — allow Next.js dev server and any configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Adds basic security response headers to all API responses."""
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    # Never leak stack traces or internal paths to the client
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "request_id": str(id(request))},
    )


# Register routers
prefix = settings.api_prefix

app.include_router(health.router, prefix=prefix)
app.include_router(demo_cases.router, prefix=prefix)
app.include_router(process_order.router, prefix=prefix)
app.include_router(denial.router, prefix=prefix)
app.include_router(package_records.router, prefix=prefix)
app.include_router(pitch.router, prefix=prefix)
app.include_router(retrieval_test.router, prefix=prefix)
app.include_router(admin.router, prefix=prefix)
