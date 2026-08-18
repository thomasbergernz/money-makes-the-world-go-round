#!/usr/bin/env node
// Bulk-layer ingest: Smithsonian Global Volcanism Program -> our event schema.
//
// This is the proof that the schema and the manifest survive a real external
// dataset. It is not a general ingest framework; another source gets another
// small script shaped like this one.
//
// Usage:
//   node scripts/ingest-gvp.mjs                       # fetch from the GVP WFS
//   node scripts/ingest-gvp.mjs path/to/export.csv    # use a local export
//
// Output: public/data/gvp-volcanoes.csv, which the manifest marks bulk:true
// and the UI loads only when its chip is switched on.
//
// GVP data is published by the Smithsonian Institution. Cite it as
// Global Volcanism Program, Volcanoes of the World, Smithsonian Institution.

import { writeFileSync, readFileSync } from "node:fs";
import { csvParse, csvFormat } from "d3-dsv";

const WFS_URL =
  "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows" +
  "?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions" +
  "&outputFormat=application/json";

const OUT = "public/data/gvp-volcanoes.csv";

// Only eruptions at or above this Volcanic Explosivity Index are worth a lane:
// below VEI 4 an eruption has no plausible climate or economic signature, and
// including them would bury the events the timeline exists to correlate.
const MIN_VEI = 4;

const rows = process.argv[2] ? readLocal(process.argv[2]) : await fetchWfs();

const events = [];
const skipped = { noYear: 0, lowVei: 0, badRegion: 0 };

for (const row of rows) {
  const vei = Number(row.VEI ?? row.vei ?? "");
  if (!Number.isFinite(vei) || vei < MIN_VEI) {
    skipped.lowVei++;
    continue;
  }

  const startYear = Number(row.StartDateYear ?? row.startdateyear ?? "");
  if (!Number.isFinite(startYear) || startYear === 0) {
    skipped.noYear++;
    continue;
  }

  const region = regionFor(
    Number(row.Latitude ?? row.latitude),
    Number(row.Longitude ?? row.longitude),
  );
  if (!region) {
    skipped.badRegion++;
    continue;
  }

  const name = (row.VolcanoName ?? row.volcanoname ?? "Unnamed volcano").trim();
  const number = String(row.VolcanoNumber ?? row.volcanonumber ?? "").trim();

  events.push({
    // GVP encodes BC as a negative year in its own convention, where -1610
    // means 1610 BCE. Our parser refuses bare negatives precisely because ISO
    // reads them one year differently, so the era is spelled out here.
    id: `gvp-${number || slug(name)}-${Math.abs(startYear)}${startYear < 0 ? "bc" : ""}`,
    start: startYear < 0 ? `${Math.abs(startYear)} BC` : String(startYear),
    end: "",
    label: `${name} eruption (VEI ${vei})`,
    category: "nature",
    region,
    certainty: startYear < 1500 ? "approx" : "year",
    uncertainty: "",
    source: "Global Volcanism Program, Volcanoes of the World, Smithsonian Institution",
    link: number ? `https://volcano.si.edu/volcano.cfm?vn=${number}` : "",
  });
}

// Same first-wins rule the app uses, applied here so the file itself is clean.
const unique = [...new Map(events.map((event) => [event.id, event])).values()];
unique.sort((a, b) => a.label.localeCompare(b.label));

writeFileSync(OUT, `${csvFormat(unique)}\n`);
console.log(
  `${unique.length} eruptions written to ${OUT} ` +
    `(skipped ${skipped.lowVei} below VEI ${MIN_VEI}, ${skipped.noYear} undated, ` +
    `${skipped.badRegion} unplaceable)`,
);

// --- helpers ---------------------------------------------------------------

function readLocal(path) {
  return csvParse(readFileSync(path, "utf8"));
}

async function fetchWfs() {
  console.log(`Fetching ${WFS_URL}`);
  const response = await fetch(WFS_URL);
  if (!response.ok) {
    throw new Error(`GVP request failed: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  return json.features.map((feature) => feature.properties);
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
