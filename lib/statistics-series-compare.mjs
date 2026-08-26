// Shared between the workbench UI (components/StatisticsSystemWorkbench.tsx)
// and the system pages export script (scripts/export-system-pages-data.mjs).
// Keeps the combo-identity format identical on both sides so a client-built
// coordinate key always matches a server-built availability index key.

export const COMBO_KEY_SEPARATOR = "";
export const MAX_BULK_ADD_SERIES = 12;

export const AVAILABILITY_STATUS_LABELS = {
  not_disclosed: "非開示",
  publication_pending: "公表待ち",
  unavailable: "データなし",
};

/**
 * Builds the same "key=valuekey=value" identity string used by
 * seriesIdFor()/favoriteIdFor() elsewhere in the app, sorted by dimension
 * apiKey so argument order never affects the result.
 */
export function comboIdentity(coordinates) {
  return Object.entries(coordinates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(COMBO_KEY_SEPARATOR);
}

/**
 * Looks up the availability status for one candidate combination of
 * dimension values. `combos` is the {identity: status} map published as
 * tables/{tableId}/availability.json.gz. A combo absent from the index
 * (or no index at all) is treated as "available" — the index only ever
 * records exceptions, never confirms availability.
 */
export function availabilityStatusFor(combos, coordinates) {
  if (!combos) return "available";
  return combos[comboIdentity(coordinates)] ?? "available";
}

/**
 * Classifies one series' aggregate observation status. Mirrors the
 * exceptionalStatus values stored per point in the series bundles
 * (not_disclosed / publication_pending / null=confirmed_value).
 */
export function classifyComboStatus({
  hasReal,
  hasNotDisclosed,
  hasPublicationPending,
  observationCount,
}) {
  if (hasReal) return "available";
  if (!observationCount) return "unavailable";
  if (hasNotDisclosed) return "not_disclosed";
  if (hasPublicationPending) return "publication_pending";
  return "unavailable";
}

/**
 * Cartesian product of several dimensions' value codes, e.g.
 * [{apiKey:"tab", codes:["a","b"]}, {apiKey:"cat01", codes:["x"]}]
 * -> [{tab:"a", cat01:"x"}, {tab:"b", cat01:"x"}]
 * Callers should bound the input size themselves (see
 * AVAILABILITY_INDEX_MAX_COMBOS in the export script) — this performs no
 * capping on its own.
 */
export function cartesianCombinations(dimensionValueLists) {
  return dimensionValueLists.reduce(
    (combinations, { apiKey, codes }) =>
      combinations.flatMap((combination) =>
        codes.map((code) => ({ ...combination, [apiKey]: code })),
      ),
    [{}],
  );
}

/** Caps how many checked values a single bulk-add action may expand to. */
export function selectableCompareLimit(
  remainingCapacity,
  maxBulkAdd = MAX_BULK_ADD_SERIES,
) {
  return Math.max(0, Math.min(remainingCapacity, maxBulkAdd));
}

/**
 * Expands a multi-selected dimension into one coordinate map per checked
 * code, holding every other dimension's current single selection fixed.
 */
export function expandCompareSelections({
  baseSelections,
  dimensionApiKey,
  codes,
  remainingCapacity,
  maxBulkAdd = MAX_BULK_ADD_SERIES,
}) {
  const limit = selectableCompareLimit(remainingCapacity, maxBulkAdd);
  return codes.slice(0, limit).map((code) => ({
    ...baseSelections,
    [dimensionApiKey]: code,
  }));
}
