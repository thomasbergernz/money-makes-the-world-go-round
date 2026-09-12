// Curated links between events.
//
// An event's `follows` column names the events it is documented or argued to
// follow — Tambora, the Year Without a Summer, the fodder crisis, the
// Laufmaschine. The index resolves those ids in both directions so the cursor
// panel and the digest can show a chain, not just a coincidence in time.
//
// Resolution is deliberately forgiving at runtime: a target that is not in
// the current corpus (a bulk layer toggled off, a dangling id) is skipped,
// never a crash. Integrity across the curated datasets is a test's job.

/**
 * Build a bidirectional link index over a corpus.
 *
 * @param {Array<{id: string, follows: string[]}>} events
 * @returns {{
 *   follows: (id: string) => Array, // the events `id` follows, resolved
 *   followedBy: (id: string) => Array, // the events that follow `id`
 * }}
 */
export function buildLinkIndex(events) {
  const byId = new Map(events.map((event) => [event.id, event]));
  const upstream = new Map();
  const downstream = new Map();

  for (const event of events) {
    for (const targetId of event.follows ?? []) {
      const target = byId.get(targetId);
      if (!target) continue;
      push(upstream, event.id, target);
      push(downstream, targetId, event);
    }
  }

  const walk = (map) => (id) => {
    // Breadth-first, so the result reads outward hop by hop. The visited set
    // is the cycle guard; curated data should never cycle, but a data mistake
    // must degrade to a truncated chain, not a hung tab.
    const seen = new Set([id]);
    const chain = [];
    let frontier = map.get(id) ?? [];
    while (frontier.length) {
      const next = [];
      for (const event of frontier) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        chain.push(event);
        next.push(...(map.get(event.id) ?? []));
      }
      frontier = next;
    }
    return chain;
  };

  return {
    follows: (id) => upstream.get(id) ?? [],
    followedBy: (id) => downstream.get(id) ?? [],
    chainUp: walk(upstream),
    chainDown: walk(downstream),
  };
}

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}
