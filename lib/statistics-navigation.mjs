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


/** Search the complete published registry, independently of navigation filters. */
export function searchCatalogTables(tables, datasets, query) {
  const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const terms = String(query).normalize("NFKC").trim().split(/\s+/).filter(Boolean).map(normalize);
  const titles = new Map(datasets.map((dataset) => [dataset.id, dataset.title]));
  return tables.filter((table) => {
    const text = normalize(`${table.title} ${table.statisticsName} ${table.id} ${table.datasetId} ${titles.get(table.datasetId) ?? ""}`);
    return terms.every((term) => text.includes(term));
  });
}

export function tableCoverageLabel(table) {
  if (table.registryStatus !== "ready") return "未収録・準備中";
  if (!table.observationCount) return "観測値未収録";
  return `${table.seriesCount.toLocaleString("ja-JP")}系列収録`;
}

/** Categories derive from the actual published indicator name, never from a fixed building use. */
export function indicatorCategory(name) {
  if (/受注/.test(name)) return "受注";
  if (/人員|従業員|社員|技術者|職員|労働|賃金|給与/.test(name)) return "人員・労働";
  if (/売上|利益|資産|負債|資本|配当|キャッシュ|財務|費用/.test(name)) return "財務・業績";
  return "その他の指標";
}
