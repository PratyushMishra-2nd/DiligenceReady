// The authorisation policy for DiligenceReady, in Cedar.
//
// This file is the tenant boundary. It is not documentation of a rule that
// lives somewhere else in Python — `authz.decide()` evaluates exactly this
// text, and a request that no `permit` here matches is denied, because Cedar
// is deny-by-default.
//
// Why a policy language for a four-table authorisation model: a CA firm is
// handing us another business's books. "Which firm can see what" is the one
// question a prospective client asks that we have to answer with something
// other than "trust our code review". Twenty lines they can read beats a
// call graph they cannot.
//
// Entities:
//   DR::Firm     — a CA practice
//   DR::User     — attrs: firm (DR::Firm), role ("owner" | "member" | "readonly")
//   DR::Company  — a client company. attrs: firm (DR::Firm)

// ── reading ────────────────────────────────────────────────────────────────
//
// A firm sees its own clients. This single condition is the whole multi-tenant
// guarantee; everything below only narrows it further.

permit (
  principal,
  action in [
    DR::Action::"ViewCompany",
    DR::Action::"ViewEvidence",
    DR::Action::"Explain",
    DR::Action::"AskLedger"
  ],
  resource
)
when { resource has firm && resource.firm == principal.firm };

// ── writing ────────────────────────────────────────────────────────────────
//
// Uploading a document or recording a decision on a finding changes what the
// firm will act on, so it needs a role that is allowed to write — and still
// the same firm boundary as reading.

permit (
  principal,
  action in [DR::Action::"UploadDocument", DR::Action::"DecideRisk"],
  resource
)
when {
  resource has firm &&
  resource.firm == principal.firm &&
  principal.role != "readonly"
};

// A `forbid` rather than the absence of a `permit`, because Cedar's forbid
// beats every permit. A future policy that widens write access cannot
// accidentally widen it to a read-only account: the articled clerk who can
// see the client's ledger still cannot sign off on a finding.

forbid (
  principal,
  action in [
    DR::Action::"UploadDocument",
    DR::Action::"DecideRisk",
    DR::Action::"ManageUsers"
  ],
  resource
)
when { principal.role == "readonly" };

// ── administration ─────────────────────────────────────────────────────────
//
// Creating accounts is the owner's alone, and only over their own practice.
// The resource here is the firm itself, not a company, so the condition
// compares identity rather than an attribute.

permit (
  principal,
  action == DR::Action::"ManageUsers",
  resource
)
when { resource == principal.firm && principal.role == "owner" };
