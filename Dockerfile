# One image, two entry points.
#
# App Runner runs it as a web service (the default CMD below). Lambda runs the
# same image as the pipeline stages, by overriding ENTRYPOINT and CMD in the
# function's ImageConfig — see infra/aws/02-app.yaml.
#
# Building it once matters for more than image size. The nightly reconciliation
# and the API must agree about every rounding decision, every normalisation and
# every threshold; shipping them as two artefacts is how they stop agreeing.
# Here it is impossible: they are the same bytes.

# Pulled through AWS's public mirror of Docker Hub rather than Docker Hub
# itself: identical digest, no anonymous pull limit to trip over when the
# deploy script builds and pushes a few times in a row.
FROM public.ecr.aws/docker/library/python:3.14-slim AS base

# uv, for a lockfile-exact install. Copied from the published image rather
# than pip-installed so the version is pinned by digest, not resolved at
# build time.
COPY --from=ghcr.io/astral-sh/uv:0.9.29 /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

# ── dependencies ────────────────────────────────────────────────────────────
#
# The manifests come first and on their own, so a source change does not
# reinstall psycopg, pandas and the Rust extension behind Cedar. Only the
# workspace members' pyproject files are needed to resolve the workspace.

COPY pyproject.toml uv.lock ./
COPY packages/engine/pyproject.toml packages/engine/
COPY apps/api/pyproject.toml apps/api/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-workspace

# ── the application ─────────────────────────────────────────────────────────
#
# `migrations/` is not optional: `config.project_root()` locates the repo root
# by walking up for `migrations/sql`, and the migrate stage applies the files
# from there. An image without it starts and then fails on its first query.

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY migrations/ migrations/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# The Lambda runtime interface client. Installed here rather than as a project
# dependency because it is a deployment concern: nothing in the engine or the
# API imports it, and a developer running the CLI should not have to build it.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --no-cache awslambdaric

# Not root. App Runner does not require it; a process that handles other
# people's books should not need to be told.
RUN useradd --create-home --uid 10001 diligence \
    && chown -R diligence:diligence /app
USER diligence

EXPOSE 8080

# App Runner's default. Lambda overrides both of these.
#
# One worker on purpose: App Runner scales by adding instances, and a second
# uvicorn worker inside one instance only doubles the Postgres connections
# without adding a core to run them on.
CMD ["uvicorn", "diligence_api.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
