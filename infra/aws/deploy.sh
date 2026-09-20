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
#   1. foundation stack  - VPC, Postgres, S3, ECR              (~12 min first time)
#   2. build and push    - one image, two entry points         (~3-5 min)
#   3. discover a model  - asks Bedrock what it can call
#   4. app stack         - EC2 + CloudFront API, Lambda, Step Functions, schedule
#   5. bootstrap         - migrate and seed the demo firm, inside the VPC
#   6. verify            - the health check has to return 200
#
# NOTE: This deploy uses the EC2+CloudFront backend (02-app-ec2.yaml) rather
# than App Runner, which requires account verification not yet cleared on new
# accounts. EC2 runs the exact same Docker image; CloudFront provides instant
# TLS via *.cloudfront.net with no domain ownership required.
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
# --provenance=false --sbom=false: BuildKit's default attestation manifests
# produce an OCI image index Lambda's container runtime rejects outright
# ("image manifest, config or layer media type ... is not supported").
# App Runner tolerates it; Lambda does not, and this image runs as both.
docker build --platform linux/amd64 --provenance=false --sbom=false \
  -t "${REPO_URI}:${IMAGE_TAG}" "${ROOT}"
docker push "${REPO_URI}:${IMAGE_TAG}"
note "pushed ${REPO_URI}:${IMAGE_TAG}"

# ── 3. which model this account can actually call ───────────────────────────
#
# The model id is not guessable and it differs by region: the same model is
# `anthropic.claude-...` in one region, reachable only through a
# `global.anthropic....` or `apac.anthropic....` inference profile in
# another, and simply absent in a third. Hard-coding one is how a deploy
# discovers, in front of an audience, that the region it landed in does not
# have it. So ask the account.
#
# And ask it the right question. This block used to take
# `modelSummaries[-1]`, the last on-demand Anthropic model the account
# listed, with no filter on lifecycle. On 10 September 2026 the id it had
# picked — Claude 3 Haiku — reached its Bedrock end of life. It stayed in
# the listing, stayed allowed by IAM, stayed in the health check, and
# started returning ValidationException on every call. `?modelLifecycle.
# status=='ACTIVE'` is the whole fix here; the application now also falls
# through to the next live model at runtime, so the same retirement costs
# one failed call rather than the model layer.

say "Discovering a Bedrock model"
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-}"
if [[ -z "${BEDROCK_MODEL_ID}" ]]; then
  # Inference profiles first: they fail over to another region under load
  # instead of throttling, and several regions — ap-south-1 among them —
  # offer the current Anthropic models only through one.
  BEDROCK_MODEL_ID="$(aws bedrock list-inference-profiles \
    --region "${REGION}" \
    --query "sort_by(inferenceProfileSummaries[?contains(inferenceProfileId, 'anthropic') && status=='ACTIVE'], &inferenceProfileId) | [-1].inferenceProfileId" \
    --output text 2>/dev/null || echo None)"

  if [[ "${BEDROCK_MODEL_ID}" == "None" || -z "${BEDROCK_MODEL_ID}" ]]; then
    BEDROCK_MODEL_ID="$(aws bedrock list-foundation-models \
      --region "${REGION}" --by-provider anthropic --by-inference-type ON_DEMAND \
      --query "sort_by(modelSummaries[?modelLifecycle.status=='ACTIVE'], &modelId) | [-1].modelId" \
      --output text 2>/dev/null || echo None)"
  fi
fi

if [[ "${BEDROCK_MODEL_ID}" == "None" || -z "${BEDROCK_MODEL_ID}" ]]; then
  BEDROCK_MODEL_ID=""
  note "No live Anthropic model is available to this account in ${REGION}."
  note "Grant it: Bedrock console -> Model access -> Enable, then re-run."
  note "Deploying anyway. The application re-asks the account at start-up,"
  note "and explanations fall back to the deterministic text until one is"
  note "available — correct, just plainer."
else
  note "using ${BEDROCK_MODEL_ID}"
fi

# ── 4. application ──────────────────────────────────────────────────────────

say "Application stack: EC2+CloudFront API, Lambda, Step Functions, schedule"
aws cloudformation deploy \
  --region "${REGION}" \
  --stack-name "${APP_STACK}" \
  --template-file "${HERE}/02-app-ec2.yaml" \
  --parameter-overrides \
  "ProjectName=${PROJECT}" \
  "ImageTag=${IMAGE_TAG}" \
  "BedrockModelId=${BEDROCK_MODEL_ID}" \
  "BedrockRegion=${BEDROCK_REGION:-}" \
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
note "EC2 UserData pulls the Docker image at first boot. Retrying for up to 10 min..."
for attempt in $(seq 1 60); do
  CODE="$(curl -s -o "${RESPONSE}" -w '%{http_code}' "${API_URL}/api/health" || echo 000)"
  [[ "${CODE}" == "200" ]] && break
  if [[ "${attempt}" == "60" ]]; then
    note "Health returned ${CODE} after 60 attempts."
    note "The instance may still be starting. Check manually in 2 minutes:"
    note "  curl ${API_URL}/api/health"
    break
  fi
  sleep 10
done
[[ "${CODE}" == "200" ]] && note "health 200" && note "$(cat "${RESPONSE}")"

API_IP="$(stack_output "${APP_STACK}" ApiPublicIp)"

cat <<SUMMARY

    API (EC2 HTTP)  ${API_URL}
    health          ${API_URL}/api/health
    docs            ${API_URL}/docs
    pipeline        ${STATE_MACHINE}

    EC2 public IP: ${API_IP}

── Next: the web app on Amplify ──────────────────────────────────────────────

How the proxy works:
  Browser → HTTPS → Amplify (https://main.xxx.amplifyapp.com/api/...)
  Amplify server → HTTP → EC2 (${API_URL}/api/...)
  No mixed-content issue. No CloudFront needed.

In the Amplify console, set these environment variables BEFORE the first build:

    NEXT_PUBLIC_API_BASE     = (empty string — leave the value blank)
    NEXT_PUBLIC_API_UPSTREAM = ${API_URL}

Then in Amplify: Create new app → GitHub → your repo → main branch.
The appRoot is apps/web (already set in apps/web/amplify.yml).

No CORS_ORIGINS step needed: the browser never calls EC2 directly.

If you later need to update the EC2 URL (after a re-deploy with a new
instance), just update NEXT_PUBLIC_API_UPSTREAM in Amplify and trigger
a new build.

Teardown, when you are done:  ./infra/aws/teardown.sh
SUMMARY

