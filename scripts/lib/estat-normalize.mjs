import { createHash } from "node:crypto";

const AXIS_ORDER = [
  "tab",
  "area",
  ...Array.from({ length: 15 }, (_, index) =>
    `cat${String(index + 1).padStart(2, "0")}`,
  ),
  "time",
];

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function scalar(value) {
  if (value && typeof value === "object" && "$" in value) {
    return String(value.$ ?? "");
  }
  return String(value ?? "");
}

export function compactText(value) {
  return scalar(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStatsList(response) {
  const data = response?.GET_STATS_LIST?.DATALIST_INF;
  return asArray(data?.TABLE_INF)
    .map((entry) => ({
      id: compactText(entry?.["@id"]),
      statisticsName: compactText(entry?.STAT_NAME),
      title: compactText(entry?.TITLE),
      cycle: compactText(entry?.CYCLE),
      surveyDate: compactText(entry?.SURVEY_DATE),
      openDate: compactText(entry?.OPEN_DATE),
      updatedDate: compactText(entry?.UPDATED_DATE),
      overallTotalNumber: Number(
        compactText(entry?.OVERALL_TOTAL_NUMBER) || "0",
      ),
    }))
    .filter((entry) => entry.id);
}

export function normalizeMetaInfo(response, tableId) {
  const metadata = response?.GET_META_INFO?.METADATA_INF;
  const classObjects = asArray(metadata?.CLASS_INF?.CLASS_OBJ);
  return classObjects.map((object, dimensionIndex) => {
    const apiKey = compactText(object?.["@id"]);
    const values = asArray(object?.CLASS).map((entry, valueIndex) => ({
      code: compactText(entry?.["@code"]),
      name: compactText(entry?.["@name"]),
      level: Number.isFinite(Number(entry?.["@level"]))
        ? Number(entry["@level"])
        : null,
      parentCode: compactText(
        entry?.["@parentCode"] ?? entry?.["@parent-code"],
      ),
      unit: compactText(entry?.["@unit"]),
      sortOrder: valueIndex,
    }));
    return {
      id: `${tableId}:${apiKey}`,
      tableId,
      apiKey,
      name: compactText(object?.["@name"]) || apiKey,
      description: compactText(object?.DESCRIPTION),
      sortOrder:
        AXIS_ORDER.indexOf(apiKey) >= 0
          ? AXIS_ORDER.indexOf(apiKey)
          : AXIS_ORDER.length + dimensionIndex,
      values: values.filter((entry) => entry.code),
    };
  });
}

export function statsDataValues(response) {
  return asArray(
    response?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE,
  );
}

export function nextKey(response) {
  const raw =
    response?.GET_STATS_DATA?.STATISTICAL_DATA?.RESULT_INF?.NEXT_KEY ??
    response?.GET_STATS_DATA?.STATISTICAL_DATA?.RESULT_INF?.NEXTKEY ??
    response?.GET_STATS_DATA?.RESULT?.NEXT_KEY;
  const value = Number(compactText(raw));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function statsDataTotalNumber(response) {
  const raw =
    response?.GET_STATS_DATA?.STATISTICAL_DATA?.RESULT_INF
      ?.TOTAL_NUMBER ??
    response?.GET_STATS_DATA?.RESULT?.TOTAL_NUMBER;
  const value = Number(compactText(raw));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function normalizeSimpleStatsDataCsv(text) {
  const rows = parseCsvRows(text);
  const scalarRow = (name) => rows.find((row) => row[0] === name);
  const status = Number(scalarRow("STATUS")?.[1] ?? 0);
  if (status !== 0) {
    throw new Error(
      `e-Stat API getSimpleStatsData: ${
        scalarRow("ERROR_MSG")?.[1] || `status ${status}`
      }`,
    );
  }
  const valueMarker = rows.findIndex((row) => row[0] === "VALUE");
  const header = rows[valueMarker + 1];
  if (valueMarker < 0 || !header) {
    throw new Error(
      "e-Stat API getSimpleStatsData: VALUEヘッダーがありません。",
    );
  }
  const dimensionColumns = header
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => /^(tab|area|cat\d+|time)_code$/.test(name))
    .map(({ name, index }) => ({
      apiKey: name.replace(/_code$/, ""),
      index,
    }));
  const unitIndex = header.indexOf("unit");
  const valueIndex = header.indexOf("value");
  const annotationIndex = header.indexOf("annotation");
  const values = rows
    .slice(valueMarker + 2)
    .filter((row) => row.some((field) => field !== ""))
    .map((row) => {
      const value = {};
      for (const column of dimensionColumns) {
        value[`@${column.apiKey}`] = row[column.index] ?? "";
      }
      if (unitIndex >= 0) value["@unit"] = row[unitIndex] ?? "";
      if (annotationIndex >= 0) {
        value["@annotation"] = row[annotationIndex] ?? "";
      }
      value.$ = valueIndex >= 0 ? row[valueIndex] ?? "" : "";
      return value;
    });
  const totalNumber = Number(scalarRow("TOTAL_NUMBER")?.[1]);
  if (!Number.isFinite(totalNumber)) {
    throw new Error(
      "e-Stat API getSimpleStatsData: TOTAL_NUMBERがありません。",
    );
  }
  return { totalNumber, values };
}

function numericValue(rawValue) {
  const normalized = compactText(rawValue).replaceAll(",", "");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function observationStatus(rawValue, parsedValue) {
  if (parsedValue !== null) return "confirmed_value";
  const normalized = compactText(rawValue);
  if (!normalized || normalized === "-" || normalized === "…") {
    return "missing";
  }
  if (/^[*＊xX]+$/.test(normalized)) return "suppressed";
  return "non_numeric";
}

function dimensionCoordinates(value) {
  const coordinates = {};
  for (const [key, raw] of Object.entries(value ?? {})) {
    if (!key.startsWith("@")) continue;
    const apiKey = key.slice(1);
    if (apiKey === "time" || apiKey === "unit" || apiKey === "annotation") {
      continue;
    }
    if (AXIS_ORDER.includes(apiKey)) {
      coordinates[apiKey] = compactText(raw);
    }
  }
  return coordinates;
}

export function seriesIdFor(tableId, coordinates) {
  const identity = Object.entries(coordinates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\u001f");
  return createHash("sha256")
    .update(`${tableId}\u001f${identity}`)
    .digest("hex")
    .slice(0, 32);
}

export function normalizeObservation(value, tableId, seriesCache) {
  const rawValue = compactText(value?.$);
  const parsedValue = numericValue(rawValue);
  const coordinates = dimensionCoordinates(value);
  const unit = compactText(value?.["@unit"]);
  const timeCode = compactText(value?.["@time"]);
  const identity = Object.entries(coordinates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, coordinateValue]) => `${key}=${coordinateValue}`)
    .join("\u001f");
  let seriesId;
  if (seriesCache?.identity === identity) {
    seriesId = seriesCache.seriesId;
  } else {
    seriesId = seriesIdFor(tableId, coordinates);
    if (seriesCache) {
      seriesCache.identity = identity;
      seriesCache.seriesId = seriesId;
    }
  }
  return {
    seriesId,
    tableId,
    coordinates,
    timeCode,
    rawValue,
    numericValue: parsedValue,
    unit,
    annotation: compactText(value?.["@annotation"]),
    status: observationStatus(rawValue, parsedValue),
  };
}

export function buildValueLookup(dimensions) {
  const lookup = new Map();
  for (const dimension of dimensions) {
    const values = new Map(
      dimension.values.map((value) => [value.code, value.name]),
    );
    lookup.set(dimension.apiKey, values);
  }
  return lookup;
}

export function seriesLabel(coordinates, valueLookup) {
  const parts = [];
  for (const apiKey of AXIS_ORDER) {
    if (apiKey === "time") continue;
    const code = coordinates[apiKey];
    if (!code) continue;
    const label = valueLookup.get(apiKey)?.get(code) || code;
    parts.push(label);
  }
  return parts.join(" / ") || "総数";
}

export function fiscalYearFromTimeCode(timeCode) {
  const normalized = compactText(timeCode);
  const match = normalized.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}
