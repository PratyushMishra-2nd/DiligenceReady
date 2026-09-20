import { Schedule, ScheduleRow } from "./Sheet";

/**
 * Where the client's data goes, which is the first question a partner asks and
 * the last thing this page was answering.
 *
 * A CA firm does not hold its own books. It holds thirty other companies'
 * books, under an engagement letter, and a partner who puts those into someone
 * else's software is the person who answers for it. The page argued for four
 * sections about accuracy before it said a word about custody, which is the
 * wrong order for the reader it is written to.
 *
 * Every row is a property of how the system is built rather than a promise
 * about how carefully we intend to behave.
 */
const POSTURE: { claim: string; note: string }[] = [
  {
    claim: "Nothing is written back to a client's books",
    note: "The Tally gateway is read. There is no write path in the ingest package — a property of the code, not a setting someone could change in a hurry.",
  },
  {
    claim: "Every account belongs to exactly one firm",
    note: "No self-service signup, because there is no self-service client data. A firm owner creates each account, and every query is scoped to the firm on the session.",
  },
  {
    claim: "Documents are content-addressed by sha256",
    note: "The key is the hash of the file, so a document resolves identically on local disk and in S3, and a row written against one reads against the other.",
  },
  {
    claim: "The database password is never configuration",
    note: "Read once at startup from the Secrets Manager secret RDS created and rotates. It is in no environment file, no build log and not in this repository.",
  },
  {
    claim: "The model is never shown a document",
    note: "It receives a finished finding — figures the engine already computed — and writes the sentence. The matchers, rules and aggregates import no model client at all.",
  },
  {
    claim: "The product works with no model at all",
    note: "Leave the Bedrock id empty and every explanation falls back to a deterministic template. Nothing on a screen depends on a model being reachable.",
  },
];

export function Trust() {
  return (
    <div className="mt-8">
      <Schedule>
        {POSTURE.map(({ claim, note }) => (
          <ScheduleRow key={claim} term={claim} note={note} />
        ))}
      </Schedule>
    </div>
  );
}
