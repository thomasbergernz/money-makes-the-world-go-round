#!/usr/bin/env node
// Bulk-layer ingest: Smithsonian Global Volcanism Program -> our event schema.
//
// This is the proof that the schema and the manifest survive a real external
// dataset. It is not a general ingest framework; another source gets another
// small script shaped like this one.
//
// Usage:
//   node scripts/ingest-gvp.mjs                       # fetch from the GVP WFS
//   node scripts/ingest-gvp.mjs path/to/export.json   # use a saved response
//
// Output: public/data/gvp-volcanoes.csv, which the manifest marks bulk:true
// and the UI loads only when its chip is switched on.
//
// GVP data is published by the Smithsonian Institution. Cite it as
// Global Volcanism Program, Volcanoes of the World, Smithsonian Institution.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { csvParse, csvFormat } from "d3-dsv";

const WFS_URL =
  "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows" +
  "?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions" +
  "&outputFormat=application/json";

const OUT = "public/data/gvp-volcanoes.csv";

// Only eruptions at or above this Volcanic Explosivity Index are worth a lane.
// Below VEI 4 an eruption has no plausible climate or economic signature, and
// the catalogue holds ~11,000 entries — including them would bury the events
// the timeline exists to correlate.
const MIN_VEI = 4;

// The timeline's scope. GVP reaches back ~10,000 years; letting that through
// would stretch the axis and squeeze all of recorded history into a corner.
const EARLIEST_BCE = 3500;

const features = process.argv[2] ? readLocal(process.argv[2]) : await fetchWfs();
assertSchema(features);
const curated = loadCurated();

const events = [];
const skipped = { notEruption: 0, noVei: 0, lowVei: 0, noYear: 0, tooEarly: 0, badRegion: 0, curated: 0 };
const activityTypes = new Set();

for (const feature of features) {
  const row = feature.properties;

  // GVP catalogues discredited and uncertain events alongside confirmed ones.
  if (row.Activity_Type !== "Confirmed Eruption") {
    activityTypes.add(row.Activity_Type);
    skipped.notEruption++;
    continue;
  }

  const vei = row.ExplosivityIndexMax;
  if (vei === null || vei === undefined || vei === "") {
    skipped.noVei++;
    continue;
  }
  if (Number(vei) < MIN_VEI) {
    skipped.lowVei++;
    continue;
  }

  const year = Number(row.StartDateYear);
  if (!Number.isFinite(year) || year === 0) {
    skipped.noYear++;
    continue;
  }
  if (year < -EARLIEST_BCE) {
    skipped.tooEarly++;
    continue;
  }

  const [lon, lat] = feature.geometry?.coordinates ?? [];
  const region = regionFor(lat, lon);
  if (!region) {
    skipped.badRegion++;
    continue;
  }

  const name = String(row.Volcano_Name ?? "Unnamed volcano").trim();

  // An eruption already written up by hand keeps its curated entry, with its
  // curated wording and sources. Matching on name and year rather than on id
  // avoids hard-coding GVP volcano numbers into the curated files.
  if (isCurated(name, year)) {
    skipped.curated++;
    continue;
  }

  const uncertainty = Number(row.StartDateYearUncertainty) || 0;
  const start = gvpDate(year, row.StartDateMonth, row.StartDateDay);
  const end = row.EndDateYear ? gvpDate(Number(row.EndDateYear), row.EndDateMonth, row.EndDateDay) : "";

  events.push({
    id: `gvp-${row.Eruption_Number}`,
    start,
    // Only keep an end that actually extends the event; GVP records many
    // eruptions that start and stop within one day.
    end: end && end !== start ? end : "",
    label: `${name} eruption (VEI ${vei})`,
    category: "nature",
    region,
    certainty: certaintyFor(row, year, uncertainty),
    uncertainty: uncertainty || "",
    source: "Global Volcanism Program, Volcanoes of the World, Smithsonian Institution",
    link: row.Volcano_Number ? `https://volcano.si.edu/volcano.cfm?vn=${row.Volcano_Number}` : "",
  });
}

// Same first-wins rule the app uses, applied here so the file itself is clean.
const unique = [...new Map(events.map((event) => [event.id, event])).values()];
unique.sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(OUT, `${csvFormat(unique)}\n`);
console.log(
  `${unique.length} eruptions written to ${OUT}\n` +
    `skipped: ${skipped.notEruption} not confirmed eruptions, ${skipped.noVei} without a VEI, ` +
    `${skipped.lowVei} below VEI ${MIN_VEI}, ${skipped.noYear} undated, ` +
    `${skipped.tooEarly} earlier than ${EARLIEST_BCE} BC, ${skipped.badRegion} unplaceable, ` +
    `${skipped.curated} already curated`,
);
if (activityTypes.size) {
  console.log(`activity types skipped: ${[...activityTypes].join(", ")}`);
}

// --- date handling ---------------------------------------------------------

/**
 * A GVP date as a string our parser accepts.
 *
 * GVP writes BCE years as plain negatives, where -1815 means 1815 BCE. That is
 * one year away from the ISO 8601 reading, which is exactly why the parser
 * refuses bare negatives — so the era is spelled out here rather than passed
 * through. Month and day are 0 when unknown.
 */
function gvpDate(year, month, day) {
  if (year < 0) return `${-year} BC`; // BC is only ever year-precision for us
  const pad = (n) => String(n).padStart(2, "0");
  if (month > 0 && day > 0) return `${year}-${pad(month)}-${pad(day)}`;
  if (month > 0) return `${year}-${pad(month)}`;
  return String(year);
}

function certaintyFor(row, year, uncertainty) {
  // Our schema requires a contested date to state a range, so a queried date
  // with no stated uncertainty is only ever "approx".
  if (uncertainty > 0) return row.StartDateYearModifier === "?" ? "contested" : "approx";
  if (row.StartDateYearModifier === "?") return "approx";
  if (row.StartDateDay > 0) return "exact";
  if (year < 1500) return "approx";
  return "year";
}

// --- input -----------------------------------------------------------------

function readLocal(path) {
  return JSON.parse(readFileSync(path, "utf8")).features;
}

async function fetchWfs() {
  console.log(`Fetching ${WFS_URL}`);
  const response = await fetch(WFS_URL);
  if (!response.ok) {
    throw new Error(`GVP request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()).features;
}

/**
 * Fail loudly on a schema change. GVP's service can rename its columns; without
 * this the script would quietly write an empty file and the cause would read
 * like a data problem rather than a contract change.
 */
function assertSchema(sample) {
  if (!sample?.length) throw new Error("No features received from GVP");
  const seen = new Set(Object.keys(sample[0].properties ?? {}));
  const missing = [
    "Volcano_Name",
    "Eruption_Number",
    "Activity_Type",
    "ExplosivityIndexMax",
    "StartDateYear",
  ].filter((column) => !seen.has(column));
  if (missing.length) {
    throw new Error(
      `GVP schema mismatch: missing ${missing.join(", ")}. ` +
        `Properties received: ${[...seen].join(", ")}`,
    );
  }
  if (!sample[0].geometry?.coordinates) {
    throw new Error("GVP features carry no geometry; coordinates are needed to assign a region");
  }
}

/** Curated nature events, so the same eruption is not told twice. */
function loadCurated() {
  const path = "public/data/nature.csv";
  if (!existsSync(path)) return [];
  return csvParse(readFileSync(path, "utf8"))
    .filter((row) => row.category === "nature")
    .map((row) => [fold(row.label), Number(/(\d{1,6})/.exec(row.start)?.[1] ?? NaN)]);
}

/** Lowercase and strip diacritics, so "Eldgjá" matches GVP's "Eldgja". */
function fold(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function isCurated(name, startYear) {
  const needle = fold(name);
  return curated.some(([label, year]) => year === Math.abs(startYear) && label.includes(needle));
}

/**
 * Coarse region from coordinates. The lanes are continental, so this only has
 * to be right at continental resolution; anything it cannot place is dropped
 * rather than guessed into a lane.
 */
function regionFor(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lon >= -180 && lon <= -25) return "AMERICAS";
  if (lat >= 34 && lon >= -25 && lon <= 45) return "EUROPE";
  if (lat >= 12 && lat <= 42 && lon > 25 && lon <= 63) return "MIDDLE_EAST";
  if (lat >= -36 && lat < 34 && lon >= -25 && lon <= 52) return "AFRICA";
  if (lat >= 20 && lon > 95 && lon <= 150) return "ASIA_EAST";
  if (lat >= -11 && lat < 30 && lon > 60 && lon <= 150) return "ASIA_SOUTH";
  if (lat >= 35 && lon > 45) return "ASIA_EAST";
  if (lon > 110 || lon < -140) return "OCEANIA";
  return null;
}
