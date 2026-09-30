// wrap.js -- break a lyric line into ROWS, at full size, instead of shrinking it.
//
// WHY THIS FILE EXISTS
// --------------------
// `fit()` had exactly one strategy for a line too long for the band: make the
// type smaller until it fits on ONE row. It bisected the size, which is why it
// worked at all -- but the result is a 50-character Allare line set in type you
// could read at arm's length from a phone, which is the opposite of a lyric
// video. A lyric line that is too long wants to be BROKEN, not shrunk.
//
// The user's complaint, and it is the right one, was that long sentences came out
// as one flat row while short ones came out stacked. Both are the same bug: there
// was only ever one shape available, so the renderer picked whichever the
// measurement allowed instead of the one the lyric wanted.
//
//   हो.. जिस्काउँदै हिँडिन्छ बरु फसिँदैन कहिँ पनि
//     ->  हो..                            (1 row, full size)
//          जिस्काउँदै हिँडिन्छ
//          बरु फसिँदैन
//          कहिँ पनि
//
// TWO RULES, AND BOTH ARE LOAD-BEARING
//
// 1. NEVER split a word. Devanagari's shirorekha is continuous across a word, so
//    a break inside one snaps the headline. This is gotcha 8 and it is why every
//    row boundary here is a space.
//
// 2. Rows are BALANCED, not greedy. Greedy fills row 1 to the brim and leaves row
//    2 with two words, which reads as a mistake rather than as composition. The
//    balance pass evens the row widths toward their mean, which is what makes the
//    example above look deliberate. It costs a few microseconds and it is the
//    difference between "wrapped" and "typeset".
//
// This module is pure and has no Remotion in it, so check_wrap.mjs can test it
// without a render. The measurement it takes is `widthEm`, the same width model
// the renderer uses, so what this decides and what the browser draws cannot
// disagree by more than the model's own measured error.

/**
 * The width of one word in em, using the renderer's width model.
 * Wrapping on a different measurement than the one that draws is how a line ends
 * up one word too wide on screen and clipped.
 */
function em(text, widthTable) {
  if (widthTable && typeof widthTable.perChar === "number" &&
      Number.isFinite(widthTable.perChar)) {
    return [...text].length * widthTable.perChar;
  }
  const t = { ...DEFAULTS, ...(widthTable || {}) };
  let w = 0;
  for (const ch of text) {
    w += t[CLASS_OF(ch)] ?? 0.5;
  }
  return w;
}

const CLASS_OF = (ch) => {
  const c = ch.codePointAt(0);
  if (c >= 0x093a && c <= 0x094f) return "matra";       // matras, virama
  if (c === 0x0020 || c === 0x00a0) return "space";
  if (c >= 0x0915 && c <= 0x0939) return "cons";         // consonants
  return "other";                                          // vowels, danda, digits
};
const DEFAULTS = { cons: 0.62, matra: 0.08, space: 0.26, other: 0.5 };

/**
 * Split a line into rows that each fit `bandEm`.
 *
 * @param {string}   text       the lyric line
 * @param {object}   widthTable the renderer's width model
 * @param {number}   bandEm     the band's width in em
 * @param {object}   [opts]
 * @param {number}   [opts.maxRows]  refuse to plan more rows than this
 * @param {boolean}  [opts.balance]  even the rows out (default true)
 * @returns {{rows: string[][], count: number, widestEm: number, overBudget: boolean}}
 */
export function wrapRows(text, widthTable, bandEm, opts = {}) {
  const { maxRows = Infinity, balance = true } = opts;
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { rows: [], count: 0, widestEm: 0, overBudget: false };

  // A band narrower than the widest single WORD cannot be satisfied by wrapping
  // -- the word must go over, or be shrunk, and neither is this function's job.
  // Said plainly rather than clamped, because a caller that silently receives one
  // over-wide row has no way to know.
  const spaceEm = em(" ", widthTable);
  let rows = [[]];
  let w = 0;
  for (const word of words) {
    const ww = em(word, widthTable);
    const need = rows[rows.length - 1].length ? w + spaceEm + ww : ww;
    if (rows[rows.length - 1].length && need > bandEm && rows.length < maxRows) {
      rows.push([word]);
      w = ww;
    } else {
      rows[rows.length - 1].push(word);
      w = need;
    }
  }

  if (balance && rows.length > 1) rows = balanceRows(rows, spaceEm, widthTable, bandEm);

  const widths = rows.map((r) => rowEm(r, spaceEm, widthTable));
  return {
    rows,
    count: rows.length,
    widestEm: Math.max(...widths),
    // A row wider than the band means the word itself is too wide: wrapping
    // cannot help and the caller must shrink. Reported, not hidden.
    overBudget: Math.max(...widths) > bandEm,
  };
}

function rowEm(row, spaceEm, widthTable) {
  if (!row.length) return 0;
  return row.reduce((a, word) => a + em(word, widthTable), 0) +
    spaceEm * (row.length - 1);
}

/**
 * Even the rows out toward their mean width.
 *
 * The metric is the total absolute deviation from the mean, and the search is a
 * bounded sweep of the target row count rather than a full partition search: the
 * number of ways to break 12 words into rows is in the hundreds, and this runs
 * once per cue at prepare time, so the exhaustive version would be paying for
 * precision nobody can see on screen.
 *
 * For each candidate row count, the break points are placed by targeting a
 * running width, then the candidate with the least raggedness wins. Ties go to
 * FEWER rows, because a four-row version of a line that fits in three looks like
 * a mistake even when it is narrower on average.
 */
function balanceRows(rows, spaceEm, widthTable, bandEm) {
  const total = rowEm(rows.flat(), spaceEm, widthTable);
  const target = total / rows.length;
  let best = rows;
  let bestCost = Infinity;

  for (let want = 2; want <= rows.length; want++) {
    const ideal = total / want;
    const cand = [];
    let acc = [];
    let accW = 0;
    for (const row of rows.flat()) {
      const nextW = acc.length ? accW + spaceEm + em(row, widthTable) : em(row, widthTable);
      // Close the row when adding the next word would take us further from the
      // ideal width than stopping here does -- the standard greedy-against-a-target
      // rule, and the reason a long word still gets its own row rather than
      // pushing a row past the band.
      const stop = accW >= ideal;
      const overshoot = acc.length
        ? Math.abs(nextW - ideal) - Math.abs(accW - ideal)
        : -1;
      if (acc.length && (stop || overshoot > 0) && cand.length < want - 1) {
        cand.push(acc);
        acc = [row];
        accW = em(row, widthTable);
      } else {
        acc.push(row);
        accW = nextW;
      }
    }
    if (acc.length) cand.push(acc);

    const widths = cand.map((r) => rowEm(r, spaceEm, widthTable));
    // Every row must fit, or this candidate is not a layout at all.
    if (Math.max(...widths) > bandEm) continue;
    const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
    const cost = widths.reduce((a, b) => a + Math.abs(b - mean), 0) + cand.length * 1e-6;
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = cand;
    }
  }
  return best;
}

/**
 * Where each word goes, so the renderer knows which words start a new row.
 * Returned as a Set of word indices, because that is the only thing the caller
 * needs and a Set cannot be read in the wrong order by accident.
 */
export function rowStarts(rows) {
  const set = new Set();
  let i = 0;
  for (const row of rows) {
    if (i > 0 && row.length) set.add(i);
    i += row.length;
  }
  return set;
}