#!/usr/bin/env bash
#
# Deploy DiligenceReady to AWS. Idempotent: run it again after a code change
# and it rebuilds, pushes and waits for the rollout.
#
#   ./infra/aws/deploy.sh
#
# Prerequisites, checked below rather than assumed:
#   * AWS CLI v2, authenticated (`aws sts get-caller-identity` succeeds)
#   * Docker running
#   * Bedrock model access granted in the console, for the region you pick
#
# What it does, in order:
#   1. foundation stack  - VPC, Postgres, S3, ECR        (~12 min first time)
#   2. build and push    - one image, two entry points   (~3 min)
#   3. discover a model  - asks Bedrock what it can call
#   4. app stack         - App Runner, Lambda, Step Functions, schedule
#   5. bootstrap         - migrate and seed the demo firm, inside the VPC
#   6. verify            - the health check has to return 200
#
# The demo account's password is generated inside the VPC and returned once,
# in step 5. It is not stored, logged or templated anywhere.

set -euo pipefail

PROJECT="${PROJECT:-diligenceready}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FOUNDATION_STACK="${PROJECT}-foundation"
APP_STACK="${PROJECT}-app"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../.." && pwd)"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ── 0. the things that are someone else's job ───────────────────────────────

say "Checking prerequisites"
command -v aws    >/dev/null || die "AWS CLI not found. See infra/aws/README.md."
command -v docker >/dev/null || die "Docker not found."
docker info >/dev/null 2>&1  || die "Docker is installed but not running."

ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" ||
  die "Not authenticated. Run 'aws configure' (or 'aws sso login')."
note "account ${ACCOUNT}, region ${REGION}"

stack_output() {
  aws cloudformation describe-stacks \
    --region "${REGION}" --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}

# ── 1. foundation ───────────────────────────────────────────────────────────

say "Foundation stack: VPC, Postgres, S3, ECR"
note "First run takes about twelve minutes. RDS is the slow part."
aws cloudformation deploy \
  --region "${REGION}" \
  --stack-name "${FOUNDATION_STACK}" \
  --template-file "${HERE}/01-foundation.yaml" \
  --parameter-overrides "ProjectName=${PROJECT}" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

REPO_URI="$(stack_output "${FOUNDATION_STACK}" ImageRepositoryUri)"
BUCKET="$(stack_output "${FOUNDATION_STACK}" DocumentBucketName)"
note "registry ${REPO_URI}"
note "bucket   ${BUCKET}"

# ── 2. the image ────────────────────────────────────────────────────────────

say "Building and pushing the image"
aws ecr get-login-password --region "${REGION}" |
  docker login --username AWS --password-stdin "${REPO_URI%%/*}" >/dev/null
note "authenticated to ECR"

# linux/amd64 explicitly. Building on an Apple Silicon or ARM Windows machine
# produces an arm64 image that App Runner accepts and then fails to start,
# with an error that never mentions the architecture.
docker build --platform linux/amd64 -t "${REPO_URI}:${IMAGE_TAG}" "${ROOT}"
docker push "${REPO_URI}:${IMAGE_TAG}"
note "pushed ${REPO_URI}:${IMAGE_TAG}"

# ── 3. which model this account can actually call ───────────────────────────
#
# The model id is not guessable and it differs by region: the same model is
# `anthropic.claude-...` in one region, reachable only through an
# `apac.anthropic....` inference profile in another, and simply absent in a
# third. Hard-coding one is how a deploy discovers, in front of an audience,
# that the region it landed in does not have it. So ask the account.

say "Discovering a Bedrock model"
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-}"
if [[ -z "${BEDROCK_MODEL_ID}" ]]; then
  # Inference profiles first: they fail over to another region under load
  # instead of throttling, and several regions offer the newer Anthropic
  # models on demand only through one.
  BEDROCK_MODEL_ID="$(aws bedrock list-inference-profiles \
    --region "${REGION}" \
    --query "inferenceProfileSummaries[?contains(inferenceProfileId, 'anthropic')].inferenceProfileId | [0]" \
    --output text 2>/dev/null || echo None)"

  if [[ "${BEDROCK_MODEL_ID}" == "None" || -z "${BEDROCK_MODEL_ID}" ]]; then
    BEDROCK_MODEL_ID="$(aws bedrock list-foundation-models \
      --region "${REGION}" --by-provider anthropic --by-inference-type ON_DEMAND \
      --query "modelSummaries[-1].modelId" --output text 2>/dev/null || echo None)"
  fi
fi

if [[ "${BEDROCK_MODEL_ID}" == "None" || -z "${BEDROCK_MODEL_ID}" ]]; then
  BEDROCK_MODEL_ID=""
  note "No Anthropic model is available to this account in ${REGION}."
  note "Grant it: Bedrock console -> Model access -> Enable, then re-run."
  note "Deploying anyway. Explanations fall back to the deterministic text,"
  note "which is correct, just plainer. The product works without a model."
else
  note "using ${BEDROCK_MODEL_ID}"
fi

# ── 4. application ──────────────────────────────────────────────────────────

say "Application stack: App Runner, Lambda, Step Functions, schedule"
aws cloudformation deploy \
  --region "${REGION}" \
  --stack-name "${APP_STACK}" \
  --template-file "${HERE}/02-app.yaml" \
  --parameter-overrides \
  "ProjectName=${PROJECT}" \
  "ImageTag=${IMAGE_TAG}" \
  "BedrockModelId=${BEDROCK_MODEL_ID}" \
  "CorsOrigins=${CORS_ORIGINS:-}" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset

API_URL="$(stack_output "${APP_STACK}" ApiUrl)"
FUNCTION="$(stack_output "${APP_STACK}" PipelineFunctionName)"
STATE_MACHINE="$(stack_output "${APP_STACK}" StateMachineArn)"

# ── 5. bootstrap the database ───────────────────────────────────────────────
#
# Postgres has no route in from outside the VPC, which is the right call for
# other people's books and also means there is no psql session from a laptop
# to load a demo with. The load runs inside the VPC, in the same image, as a
# one-off invoke.

say "Bootstrapping the database"
RESPONSE="$(mktemp)"
trap 'rm -f "${RESPONSE}"' EXIT

invoke_stage() {
  aws lambda invoke \
    --region "${REGION}" \
    --function-name "${FUNCTION}" \
    --cli-binary-format raw-in-base64-out \
    --payload "{\"stage\":\"$1\"}" \
    "${RESPONSE}" >/dev/null
  cat "${RESPONSE}"
}

note "migrate: $(invoke_stage migrate)"

# Seeding twice is an error, not a disaster: `create_user` refuses a
# duplicate email. A re-run says so and carries on, because everything after
# this point still needs to happen.
SEEDED="$(invoke_stage demo-seed)"
if [[ "${SEEDED}" == *'"sign_in"'* ]]; then
  note "Demo firm created. The password below is returned once and stored"
  note "nowhere. Copy it now."
  printf '\n%s\n\n' "${SEEDED}"
else
  note "demo-seed created no account (already seeded?):"
  note "${SEEDED:0:300}"
fi

say "Running the pipeline once, through Step Functions"
EXECUTION="$(aws stepfunctions start-execution \
  --region "${REGION}" --state-machine-arn "${STATE_MACHINE}" \
  --query executionArn --output text)"
note "execution ${EXECUTION##*:}"

STATUS=RUNNING
for _ in $(seq 1 60); do
  STATUS="$(aws stepfunctions describe-execution --region "${REGION}" \
    --execution-arn "${EXECUTION}" --query status --output text)"
  [[ "${STATUS}" == "RUNNING" ]] || break
  sleep 5
done
note "pipeline ${STATUS}"
[[ "${STATUS}" == "SUCCEEDED" ]] ||
  note "Open the execution in the Step Functions console to see which stage failed."

# ── 6. does it actually work ────────────────────────────────────────────────
#
# The health check is the deep one: it opens a database connection and runs
# the Cedar self-test. A 200 here means the API can reach Postgres through
# the VPC connector and the tenant boundary evaluates. Those are the two
# things most likely to be wrong on a first deploy.

say "Verifying"
for attempt in $(seq 1 40); do
  CODE="$(curl -s -o "${RESPONSE}" -w '%{http_code}' "${API_URL}/api/health" || echo 000)"
  [[ "${CODE}" == "200" ]] && break
  if [[ "${attempt}" == "40" ]]; then
    die "health never returned 200 (last ${CODE}): $(cat "${RESPONSE}")"
  fi
  sleep 10
done
note "health 200"
note "$(cat "${RESPONSE}")"

cat <<SUMMARY

    API        ${API_URL}
    health     ${API_URL}/api/health
    docs       ${API_URL}/docs
    pipeline   ${STATE_MACHINE}

Next, the web app. Amplify reads NEXT_PUBLIC_API_BASE at BUILD time, so set
it in the Amplify console's environment variables before the first build,
not after:

    NEXT_PUBLIC_API_BASE = ${API_URL}

Then come back and re-run this script with the Amplify URL, so the browser
is allowed to call the API:

    CORS_ORIGINS=https://main.xxxxxxxx.amplifyapp.com ./infra/aws/deploy.sh

Teardown, when you are done:  ./infra/aws/teardown.sh
SUMMARY
