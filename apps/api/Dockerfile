# ──────────────────────────────────────────────
# Thravic API (FastAPI) — Standalone Image
# Build context: apps/api (this directory)
#
#   docker build -t thravic-api .
# ──────────────────────────────────────────────

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first so this layer caches across code changes
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code and Alembic migrations
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY alembic_support.py ./

# Run as a non-root user
RUN useradd --create-home --uid 1001 thravic \
    && mkdir -p /app/uploads \
    && chown -R thravic:thravic /app
USER thravic

EXPOSE 3001

# Render/Railway inject $PORT; default to 3001 for local Docker runs
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3001}"]
