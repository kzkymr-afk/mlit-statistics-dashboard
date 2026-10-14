export function explorerBasePath(pathname) {
  return pathname === "/mlit-statistics-dashboard" || pathname.startsWith("/mlit-statistics-dashboard/")
    ? "/mlit-statistics-dashboard" : "";
}
export function acceptedExplorerHash(message) {
  if (!message || message.type !== "atlas-explorer-state" || typeof message.hash !== "string" ||
      !message.hash.startsWith("#") || message.hash.length > 12000 || /[\r\n\u0000]/.test(message.hash)) return null;
  const keys = new Set(["indicator", "companies", "from", "to", "reference", "compare", "graph", "coordinates", "view", "derivedMetric", "derivedCompany", "derivedWindow", "derivedState", "derivedQuery", "quarterCompany", "quarterMetric", "quarterPeriod", "quarterScope", "quarterQuery"]);
  const params = new URLSearchParams(message.hash.slice(1));
  for (const key of params.keys()) if (!keys.has(key)) return null;
  return `#${params.toString()}`;
}
export function acceptedExplorerMessage(event, expectedOrigin, expectedSource, advanced = false) {
  if (advanced || !expectedSource || event.origin !== expectedOrigin || event.source !== expectedSource) return null;
  return acceptedExplorerHash(event.data);
}
export function explorerRestoreMessage(hash, advanced = false) {
  return advanced ? null : { type: "atlas-explorer-restore", hash };
}
