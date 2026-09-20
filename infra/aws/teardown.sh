#!/usr/bin/env bash
#
# Delete everything this project created in AWS.
#
#   ./infra/aws/teardown.sh
#
# Run it when the demo is over. The standing cost of the stack is small but
# it is not zero, and the two line items that keep billing whether or not
# anyone visits the URL are the NAT gateway and the RDS instance. A forgotten
# NAT gateway is the classic way a free-credit balance disappears.
#
# Order matters. CloudFormation will not delete the foundation stack while
# the application stack still imports its exports, and it will not delete the
# ECR repository or the S3 bucket while either holds objects — so those are
# emptied first, explicitly, rather than left to fail the stack delete with a
# message that does not say which resource is the problem.

set -euo pipefail

PROJECT="${PROJECT:-diligenceready}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}"
FOUNDATION_STACK="${PROJECT}-foundation"
APP_STACK="${PROJECT}-app"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }

command -v aws >/dev/null || { echo "AWS CLI not found." >&2; exit 1; }

cat <<WARNING

This permanently deletes, in region ${REGION}:

    ${APP_STACK}          EC2 instance, CloudFront distribution, Lambda, Step Functions, schedule
    ${FOUNDATION_STACK}   VPC, NAT gateway, RDS instance AND ITS DATA,
                          the S3 document bucket AND EVERY DOCUMENT IN IT,
                          and the ECR repository

There is no backup and no undo. The RDS instance is deleted without a final
snapshot.

WARNING

read -r -p "Type the project name (${PROJECT}) to confirm: " CONFIRM
[[ "${CONFIRM}" == "${PROJECT}" ]] || { echo "Not confirmed. Nothing deleted."; exit 1; }

# ── application first: it imports the foundation's exports ──────────────────

say "Deleting ${APP_STACK}"
if aws cloudformation describe-stacks --region "${REGION}" \
  --stack-name "${APP_STACK}" >/dev/null 2>&1; then
  aws cloudformation delete-stack --region "${REGION}" --stack-name "${APP_STACK}"
  note "waiting (CloudFront distribution deletion takes a few minutes)"
  aws cloudformation wait stack-delete-complete \
    --region "${REGION}" --stack-name "${APP_STACK}"
  note "gone"
else
  note "not present"
fi

# ── empty what CloudFormation cannot delete while it is full ────────────────

say "Emptying the document bucket"
BUCKET="$(aws cloudformation describe-stacks --region "${REGION}" \
  --stack-name "${FOUNDATION_STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='DocumentBucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")"

if [[ -n "${BUCKET}" && "${BUCKET}" != "None" ]]; then
  # Versioning is on, so `aws s3 rm --recursive` leaves every previous
  # version and every delete marker behind, and the bucket delete then fails
  # saying only that the bucket is not empty.
  note "removing every object version from ${BUCKET}"
  while true; do
    VERSIONS="$(aws s3api list-object-versions --bucket "${BUCKET}" \
      --max-items 500 \
      --query '{Objects: [].{Key:Key,VersionId:VersionId}}' \
      --output json 2>/dev/null || echo '{"Objects":null}')"
    [[ "${VERSIONS}" == '{"Objects":null}' ]] && break
    aws s3api delete-objects --bucket "${BUCKET}" --delete "${VERSIONS}" >/dev/null 2>&1 || break
  done
  while true; do
    MARKERS="$(aws s3api list-object-versions --bucket "${BUCKET}" \
      --max-items 500 \
      --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
      --output json 2>/dev/null || echo '{"Objects":null}')"
    [[ "${MARKERS}" == '{"Objects":null}' ]] && break
    aws s3api delete-objects --bucket "${BUCKET}" --delete "${MARKERS}" >/dev/null 2>&1 || break
  done
  note "emptied"
else
  note "no bucket found"
fi

say "Emptying the image repository"
if aws ecr describe-repositories --region "${REGION}" \
  --repository-names "${PROJECT}" >/dev/null 2>&1; then
  IMAGES="$(aws ecr list-images --region "${REGION}" --repository-name "${PROJECT}" \
    --query 'imageIds[*]' --output json)"
  if [[ "${IMAGES}" != "[]" ]]; then
    aws ecr batch-delete-image --region "${REGION}" \
      --repository-name "${PROJECT}" --image-ids "${IMAGES}" >/dev/null
  fi
  note "emptied"
else
  note "no repository found"
fi

# ── foundation ──────────────────────────────────────────────────────────────

say "Deleting ${FOUNDATION_STACK}"
if aws cloudformation describe-stacks --region "${REGION}" \
  --stack-name "${FOUNDATION_STACK}" >/dev/null 2>&1; then
  aws cloudformation delete-stack --region "${REGION}" --stack-name "${FOUNDATION_STACK}"
  note "waiting (RDS and the NAT gateway take several minutes)"
  aws cloudformation wait stack-delete-complete \
    --region "${REGION}" --stack-name "${FOUNDATION_STACK}"
  note "gone"
else
  note "not present"
fi

say "Done"
note "Amplify is not managed by these stacks. If you connected the web app,"
note "delete that app in the Amplify console as well."
note "Check for leftovers: CloudWatch log groups under /aws/lambda/${PROJECT}-*"
note "are deleted with the stack; anything you created by hand is not."
