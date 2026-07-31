export const ALL_CYCLES = "all";

export function tableMatchesCycle(table, cycle) {
  return cycle === ALL_CYCLES || table.cycle === cycle;
}

export function filterTablesByNavigation(tables, datasetIds, cycle) {
  const allowedDatasetIds = new Set(datasetIds);
  return tables.filter(
    (table) =>
      allowedDatasetIds.has(table.datasetId) && tableMatchesCycle(table, cycle),
  );
}

export function preferredTableId(tables, currentTableId, defaultTableIds) {
  if (tables.some((table) => table.id === currentTableId)) {
    return currentTableId;
  }
  return (
    tables.find((table) => table.id === defaultTableIds[table.datasetId])?.id ??
    tables[0]?.id ??
    ""
  );
}
