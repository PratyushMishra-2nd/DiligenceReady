import aggregates from "./aggregates.json";

/**
 * The denominator, drawn.
 *
 * The page's strongest claim is that eighty-two defects were planted and
 * eighty-two were found, with nothing invented. Stated as a sentence that is a
 * ratio with its denominator missing: eighty-two out of how many records is
 * the difference between a result and an anecdote. This draws the how-many.
 *
 * One cell is one record of one feed, in the order the feed lists them, both
 * companies laid end to end. The marked cells are the planted defects at the
 * row they were actually planted in — resolved by the matcher's own
 * `norm_invoice_no`, in scripts/build_landing_aggregates.py, not by placing
 * marks where they would look well distributed. That is the entire reason the
 * picture is allowed on a page that argues against unverifiable figures.
 *
 * What it does NOT do is invite you to count eleven thousand cells. That was
 * the version of this graphic that failed review: at a pitch fine enough to
 * fit, the individual record stops being countable and the picture asserts a
 * precision it cannot deliver. The field carries the scale, the marks carry
 * the count, and the caption carries the figures in words for anyone who
 * would rather read them — which includes every screen reader, and the
 * printed sheet.
 *
 * GSTR-2B has no marks. That is a finding, not an omission: every planted
 * defect targets a purchase invoice, a bank line or a month, never a document
 * the government filed. The record being checked against is the one register
 * with nothing wrong in it.
 *
 * No client JavaScript, no canvas, no animation. The route stays static.
 */

const COLUMNS = 120;
const PITCH = 4;
const CELL = 2.5;
const MARK = 4;
const LABEL_HEIGHT = 15;
const BAND_GAP = 20;
const WIDTH = COLUMNS * PITCH;

type Register = { label: string; count: number; marks: number[] };

const ORDER = ["books", "gstr2b", "bank"] as const;

export function Population() {
  const registers = ORDER.map((key) => aggregates.registers[key] as Register);

  let y = 0;
  const bands = registers.map((register) => {
    const rows = Math.ceil(register.count / COLUMNS);
    const band = { register, top: y, rows, height: rows * PITCH };
    y += LABEL_HEIGHT + band.height + BAND_GAP;
    return band;
  });
  const height = y - BAND_GAP;

  const { totals, targets } = aggregates;

  return (
    <figure className="mt-8">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        role="img"
        aria-labelledby="population-caption"
        className="block"
      >
        <defs>
          {/* The unmarked population, as a tile rather than eleven thousand
              nodes. A browser asked to lay out a rect per record spends real
              time on a picture whose point is that the records are numerous. */}
          <pattern
            id="population-cell"
            width={PITCH}
            height={PITCH}
            patternUnits="userSpaceOnUse"
          >
            <rect width={CELL} height={CELL} fill="#B3BEBB" />
          </pattern>
        </defs>

        {bands.map(({ register, top, rows, height: bandHeight }) => {
          // The last row is short unless the count divides exactly, and a
          // pattern-filled rectangle would happily draw the records that do
          // not exist. Full rows and remainder are filled separately.
          const remainder = register.count % COLUMNS;
          const fullRows = remainder === 0 ? rows : rows - 1;
          const gridTop = top + LABEL_HEIGHT;
          return (
            <g key={register.label}>
              <text
                x={0}
                y={top + 10}
                className="fill-ink-soft font-mono"
                fontSize="7"
                letterSpacing="0.08em"
              >
                {register.label.toUpperCase()}
              </text>
              <text
                x={WIDTH}
                y={top + 10}
                textAnchor="end"
                className="fill-ink-faint font-mono"
                fontSize="7"
              >
                {register.count.toLocaleString("en-IN")}
              </text>

              <rect
                x={0}
                y={gridTop}
                width={WIDTH}
                height={fullRows * PITCH}
                fill="url(#population-cell)"
              />
              {remainder > 0 && (
                <rect
                  x={0}
                  y={gridTop + fullRows * PITCH}
                  width={remainder * PITCH}
                  height={PITCH}
                  fill="url(#population-cell)"
                />
              )}

              {/* A mark is larger than a cell as well as a different colour,
                  so it survives being printed in grey and being read by
                  someone who does not separate red from green. */}
              {register.marks.map((index) => (
                <rect
                  key={index}
                  x={(index % COLUMNS) * PITCH - (MARK - CELL) / 2}
                  y={gridTop + Math.floor(index / COLUMNS) * PITCH - (MARK - CELL) / 2}
                  width={MARK}
                  height={MARK}
                  fill="#9E2B25"
                />
              ))}
              <rect
                x={0}
                y={gridTop + bandHeight + 2}
                width={WIDTH}
                height={0.5}
                fill="#D5DCDA"
              />
            </g>
          );
        })}
      </svg>

      <figcaption
        id="population-caption"
        className="mt-4 max-w-[64ch] text-micro leading-relaxed text-ink-faint"
      >
        Every record of both seeded companies across twelve periods:{" "}
        <Count n={totals.purchase_register} /> purchase invoices,{" "}
        <Count n={totals.gstr2b_documents} /> GSTR-2B documents and{" "}
        <Count n={totals.bank_statement} /> bank lines,{" "}
        <Count n={totals.purchase_register + totals.gstr2b_documents + totals.bank_statement} />{" "}
        in all. <Marked /> cells are marked: one for each of the {targets.row} planted
        defects that point at a record, drawn at the row it was planted in, plus the second
        row of each of the ten invoices booked twice, because being booked twice is what
        makes them defects. The remaining {targets.period} defects are a property of a
        month rather than of any row, so they are counted here and not drawn. The engine
        found all {totals.planted}, and raised{" "}
        {totals.false_positives === 0 ? "nothing" : `${totals.false_positives} findings`}{" "}
        the answer key does not contain.
      </figcaption>
    </figure>
  );
}

function Count({ n }: { n: number }) {
  return <span className="tabular text-ink-soft">{n.toLocaleString("en-IN")}</span>;
}

function Marked() {
  return (
    <span className="whitespace-nowrap">
      <span
        aria-hidden
        className="mr-1 inline-block h-2 w-2 translate-y-[1px] bg-exposure"
      />
      <span className="tabular text-ink-soft">{aggregates.cells_drawn}</span>
    </span>
  );
}
