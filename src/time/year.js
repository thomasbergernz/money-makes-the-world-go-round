// Time model for the timeline.
//
// Every date in the system is a single number: a decimal year in *astronomical*
// numbering, where year 0 means 1 BC, -1 means 2 BC, and so on. There is no gap
// at the era boundary, so durations and overlap tests are plain arithmetic.
//
// JS `Date` is deliberately not used. It cannot represent years before 1 AD
// without sign tricks, treats years 0-99 as 19xx, and carries a calendar we do
// not want at 3000 BC. Display formatting converts back to historical
// numbering ("1 BC", never "0").

const ISO = /^(-?\d{1,6})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(-?\d{1,6})-(\d{2})$/;
const BARE = /^(\d{1,6})$/;
const NEGATIVE = /^-(\d{1,6})$/;

const SUFFIXED = /^(\d{1,6})\s*(bc|bce|ad|ce)$/;
const PREFIXED = /^(bc|bce|ad|ce)\s*(\d{1,6})$/;

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function dayOfYear(year, month, day) {
  const leap = isLeapYear(year) && month > 2 ? 1 : 0;
  return DAYS_BEFORE_MONTH[month - 1] + day + leap;
}

// Historical year + era -> astronomical decimal year, positioned mid-year.
// Mid-year placement matches the original viewer: a bare year is an interval
// we only know to the year, so we anchor it at the middle rather than at an
// edge that would imply precision we do not have.
function midYear(historicalYear, isBC) {
  if (historicalYear === 0) {
    throw new RangeError("Year zero does not exist in historical numbering; use '1 BC'");
  }
  return (isBC ? 1 - historicalYear : historicalYear) + 0.5;
}

/**
 * Parse a date string into a decimal astronomical year.
 *
 * Accepted: "1815", "1815 BC", "1815BC", "1815 BCE", "AD 1815",
 * "1815-04-10". Anything else throws — including a bare "-1815", see below.
 * The previous implementation guessed, and silently read "1234 AD" as
 * 1234 BC.
 *
 * @param {string} input
 * @returns {number} decimal year; 1 BC is 0, 1 AD is 1
 */
export function parseYear(input) {
  if (typeof input !== "string") {
    throw new TypeError(`Expected a date string, got ${typeof input}`);
  }
  const s = input.trim().toLowerCase().replace(/\./g, "");
  if (s === "") throw new SyntaxError("Empty date string");

  const iso = ISO.exec(s);
  if (iso) {
    const [, yearText, monthText, dayText] = iso;
    const astronomicalYear = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (month < 1 || month > 12) throw new RangeError(`Month out of range in "${input}"`);
    if (day < 1 || day > 31) throw new RangeError(`Day out of range in "${input}"`);
    const length = isLeapYear(astronomicalYear) ? 366 : 365;
    // Mid-day, for the same reason a bare year is anchored mid-year.
    return astronomicalYear + (dayOfYear(astronomicalYear, month, day) - 0.5) / length;
  }

  // Month precision: anchor mid-month, for the same reason a bare year is
  // anchored mid-year — the edge would imply a precision the data lacks.
  const isoMonth = ISO_MONTH.exec(s);
  if (isoMonth) {
    const astronomicalYear = Number(isoMonth[1]);
    const month = Number(isoMonth[2]);
    if (month < 1 || month > 12) throw new RangeError(`Month out of range in "${input}"`);
    const length = isLeapYear(astronomicalYear) ? 366 : 365;
    const first = dayOfYear(astronomicalYear, month, 1);
    const next = month === 12 ? length + 1 : dayOfYear(astronomicalYear, month + 1, 1);
    return astronomicalYear + (first - 1 + (next - first) / 2) / length;
  }

  const bare = BARE.exec(s);
  if (bare) return midYear(Number(bare[1]), false);

  // A leading minus is rejected on purpose. Two incompatible conventions are
  // in the wild and they differ by one year: ISO 8601 reads "-1815" as
  // astronomical (= 1816 BC), while the original viewer and the Smithsonian
  // volcano data read it as 1815 BC. A one-year skew is invisible on screen
  // and fatal to a tool whose whole claim is that events line up, so callers
  // must spell the era out. Ingest scripts convert their source convention
  // explicitly.
  if (NEGATIVE.test(s)) {
    throw new SyntaxError(
      `Ambiguous negative year "${input}": write "${s.slice(1)} BC" (or the ` +
        `astronomical year one greater) so the era is unambiguous`,
    );
  }

  const suffixed = SUFFIXED.exec(s);
  if (suffixed) return midYear(Number(suffixed[1]), isBCEra(suffixed[2]));

  const prefixed = PREFIXED.exec(s);
  if (prefixed) return midYear(Number(prefixed[2]), isBCEra(prefixed[1]));

  throw new SyntaxError(`Unrecognised date: "${input}"`);
}

function isBCEra(era) {
  return era === "bc" || era === "bce";
}

/**
 * The span a date string actually covers, at the precision it was written.
 *
 * "1816" is a whole year, not a moment in it. Anchoring both ends of an
 * interval at mid-year would make `1816,1816` a zero-width interval that no
 * cursor can hit and no lane can show. So an interval takes the *start* of its
 * start's span and the *end* of its end's span, and only a dateless instant
 * uses the midpoint.
 *
 * The upper bound is nudged just inside the span so that formatting it yields
 * the same year that was written: the end of 1816 must read "1816", not "1817".
 *
 * @param {string} input
 * @returns {[number, number]} [start, end] in decimal astronomical years
 */
export function parseYearSpan(input) {
  const mid = parseYear(input);
  const span = precisionOf(input);
  return [mid - span / 2, mid + span / 2 - INSIDE];
}

/** A hair less than the span, so the upper bound formats as the year written. */
const INSIDE = 1e-6;

function precisionOf(input) {
  const s = input.trim().toLowerCase().replace(/\./g, "");
  if (ISO.test(s)) {
    const year = Number(ISO.exec(s)[1]);
    return 1 / (isLeapYear(year) ? 366 : 365);
  }
  if (ISO_MONTH.test(s)) {
    const [, yearText, monthText] = ISO_MONTH.exec(s);
    const year = Number(yearText);
    const month = Number(monthText);
    const length = isLeapYear(year) ? 366 : 365;
    const next = month === 12 ? 366 + (isLeapYear(year) ? 1 : 0) : dayOfYear(year, month + 1, 1);
    return (next - dayOfYear(year, month, 1)) / length;
  }
  return 1; // a bare year, with or without an era suffix
}

/**
 * Render a decimal astronomical year as a historical year label.
 *
 * @param {number} year decimal astronomical year
 * @param {{circa?: boolean, bcSuffix?: string}} [options]
 * @returns {string} e.g. "1815", "1815 BC", "c. 1628 BC"
 */
export function formatYear(year, options = {}) {
  const { circa = false, bcSuffix = " BC" } = options;
  if (!Number.isFinite(year)) throw new TypeError(`Not a finite year: ${year}`);
  const whole = Math.floor(year);
  const label = whole > 0 ? String(whole) : `${1 - whole}${bcSuffix}`;
  return circa ? `c. ${label}` : label;
}

/** Duration in years between two decimal years, always non-negative. */
export function yearSpan(start, end) {
  return Math.abs(end - start);
}
