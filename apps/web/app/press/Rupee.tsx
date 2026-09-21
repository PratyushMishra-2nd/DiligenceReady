/**
 * The hero figure, and the Indian grouping made structural.
 *
 * `16,25,635.64` is not `1,625,635.64`. Indian grouping takes the last three
 * digits and then pairs, so the commas fall in different places and mean
 * different things: the last one is thousands, the one before it is lakhs.
 * This splits the figure at those commas so the lakh comma can be held in
 * vermillion while everything else settles into the overprint. It is one
 * pointer, at the one place the grouping differs from the international one,
 * and it is the whole of the localisation argument on this page.
 *
 * The rupee sign is set a step larger than the digits. Udaya Kumar drew it by
 * fusing the Devanagari letter ra with a stemless Latin R, and its two
 * horizontal bars were meant to read as an equals sign. This product is two
 * records brought into register, so its currency mark is already the thing
 * the page is about, and it is worth setting large enough to be looked at.
 * Every horizontal rule on this page is drawn at the weight and gap of those
 * two bars.
 */

export function Rupee({ amount, className = "" }: { amount: string; className?: string }) {
  const [whole, fraction = "00"] = amount.split(".");
  const groups = groupIndian(whole);

  return (
    <span className={className}>
      <span className="text-[1.18em] leading-[0] align-baseline">₹</span>
      {groups.map((group, index) => (
        <span key={index}>
          {group}
          {/* The last comma is thousands, the one before it is lakhs, and
              anything before that is crores. With the last group always
              holding three digits, the lakh comma is always the third
              separator from the end. */}
          {index < groups.length - 1 && <Comma lakh={index === groups.length - 3} />}
        </span>
      ))}
      .{fraction}
    </span>
  );
}

/**
 * The lakh comma, or an ordinary one.
 *
 * Held at full `statute` on every layer of the overprint rather than being
 * allowed to settle, so it stays red where the rest of the figure goes
 * near-black. A comma is a small mark to hang an argument on, which is why
 * it is the only one that gets this treatment.
 */
function Comma({ lakh }: { lakh: boolean }) {
  return lakh ? <span className="text-exposure">,</span> : <span>,</span>;
}

/**
 * Indian digit grouping, on a string.
 *
 * Last three, then twos, which is why 1625635 reads as 16 | 25 | 635. The
 * input is a string and stays one: these are rupees, and this repository
 * does not put rupees through a float.
 */
function groupIndian(whole: string): string[] {
  if (whole.length <= 3) return [whole];
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const pairs: string[] = [];
  let remaining = rest;
  while (remaining.length > 2) {
    pairs.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }
  if (remaining) pairs.unshift(remaining);
  return [...pairs, last3];
}
