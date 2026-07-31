export const FAVORITES_STORAGE_KEY =
  "mlit-statistics-dashboard:favorite-items:v1";
export const MAX_FAVORITES = 12;

function safeText(value, maxLength = 240) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function safeSelections(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, code]) =>
          typeof key === "string" &&
          key.length <= 40 &&
          typeof code === "string" &&
          code.length <= 120,
      )
      .slice(0, 20),
  );
}

export function favoriteIdFor(tableId, selections) {
  const identity = Object.entries(safeSelections(selections))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\u001f");
  return `${safeText(tableId, 120)}\u001f${identity}`;
}

export function normalizeFavorites(value) {
  if (!Array.isArray(value)) return [];
  const favorites = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const datasetId = safeText(item.datasetId, 120);
    const tableId = safeText(item.tableId, 120);
    const tableTitle = safeText(item.tableTitle);
    const statisticsName = safeText(item.statisticsName);
    const label = safeText(item.label);
    const selections = safeSelections(item.selections);
    if (!datasetId || !tableId || !tableTitle || !label) continue;
    const id = favoriteIdFor(tableId, selections);
    if (seen.has(id)) continue;
    seen.add(id);
    favorites.push({
      id,
      datasetId,
      tableId,
      tableTitle,
      statisticsName,
      label,
      selections,
      timeFrom: safeText(item.timeFrom, 40),
      timeTo: safeText(item.timeTo, 40),
      timeFromLabel: safeText(item.timeFromLabel, 80),
      timeToLabel: safeText(item.timeToLabel, 80),
      savedAt: safeText(item.savedAt, 40),
    });
    if (favorites.length >= MAX_FAVORITES) break;
  }
  return favorites;
}

export function upsertFavorite(current, favorite) {
  return normalizeFavorites([
    favorite,
    ...normalizeFavorites(current).filter((item) => item.id !== favorite.id),
  ]);
}
