/**
 * The four questions a partner asks before he will read anything else.
 *
 * Measured on the page this replaces: "does it write back to my client's
 * Tally" was answered at 8,870px, "do you want my GST portal credentials" at
 * 8,870 and again in an FAQ at 11,500, the price at 10,077 and again at
 * 12,677, and "do I have to sit through a sales call" was never stated at all.
 * Those are objections one, two, three and five in the order a partner
 * actually raises them, and every one of them was answered past the
 * two-thirds mark — after the reader had been asked to earn the answer by
 * scrolling nine screens of argument.
 *
 * A firm does not own the books it is trusted with; it holds thirty other
 * companies' under an engagement letter. Custody is asked before accuracy,
 * always, and a page that makes a partner scroll for it has told him
 * something about its priorities before it has told him anything about the
 * product.
 *
 * So: four rows, directly under the first screenshot, about 250px. It is the
 * cheapest block on the page and it moves the price from 68% depth to 11%.
 */

const ANSWERS: { q: string; a: string }[] = [
  {
    q: "Does it touch my client's Tally?",
    a: "Read-only. The gateway reads; there is no write path anywhere in the ingest code, so it is a property of the software rather than a setting somebody can turn on in a hurry.",
  },
  {
    q: "Do you want my GST portal login?",
    a: "Never. You download the GSTR-2B JSON or Excel exactly as you do today and hand us the file. Nothing is scraped and nobody logs in as you.",
  },
  {
    q: "What does it cost?",
    a: "₹6,000 to ₹15,000 a month per firm for up to twenty-five client companies, plus GST. Priced per firm, not per seat.",
  },
  {
    q: "Do I have to sit through a sales call?",
    a: "No. The demo workspace is open right now, loaded with twelve months of books, and the password is on this page.",
  },
];

export function Answers() {
  return (
    <section className="py-10 lg:pl-20">
      <dl className="grid gap-x-12 gap-y-6 border-y border-hairline py-8 sm:grid-cols-2">
        {ANSWERS.map(({ q, a }) => (
          <div key={q} className="min-w-0">
            <dt className="wdth-set font-anek text-subhead font-semibold leading-tight text-agreed">
              {q}
            </dt>
            <dd className="rag-pretty opsz-prose mt-1.5 max-w-[46ch] font-news text-ident leading-relaxed text-graphite">
              {a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
