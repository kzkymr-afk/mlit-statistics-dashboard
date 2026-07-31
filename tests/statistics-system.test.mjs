import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import {
  buildValueLookup,
  fiscalYearFromTimeCode,
  normalizeMetaInfo,
  normalizeObservation,
  normalizeSimpleStatsDataCsv,
  normalizeStatsList,
  seriesLabel,
} from "../scripts/lib/estat-normalize.mjs";
import {
  finalizeTable,
  makeObservationWriter,
  openStatisticsDatabase,
  replaceDimensions,
  upsertDataset,
  upsertObservationSource,
  upsertStatisticalTable,
} from "../scripts/lib/statistics-system-db.mjs";

const statsListFixture = {
  GET_STATS_LIST: {
    DATALIST_INF: {
      TABLE_INF: {
        "@id": "0003412312",
        STAT_NAME: { $: "建築着工統計調査" },
        TITLE: { $: "用途別、構造別／建築物の数、床面積" },
        CYCLE: "年度次",
        SURVEY_DATE: "2024",
        OPEN_DATE: "2025-04-30",
        UPDATED_DATE: "2025-04-30",
        OVERALL_TOTAL_NUMBER: "2",
      },
    },
  },
};

const metaFixture = {
  GET_META_INFO: {
    METADATA_INF: {
      CLASS_INF: {
        CLASS_OBJ: [
          {
            "@id": "tab",
            "@name": "表章項目",
            CLASS: [
              { "@code": "10", "@name": "床面積", "@level": "1", "@unit": "㎡" },
            ],
          },
          {
            "@id": "area",
            "@name": "地域",
            CLASS: [
              { "@code": "00000", "@name": "全国", "@level": "1" },
              {
                "@code": "13000",
                "@name": "東京都",
                "@level": "2",
                "@parentCode": "00000",
              },
            ],
          },
          {
            "@id": "cat01",
            "@name": "用途",
            CLASS: [
              { "@code": "01", "@name": "居住専用住宅", "@level": "1" },
            ],
          },
          {
            "@id": "time",
            "@name": "時間軸",
            CLASS: [
              { "@code": "2023100000", "@name": "2023年度", "@level": "1" },
            ],
          },
        ],
      },
    },
  },
};

test("e-Statの統計表と公式分類コードを正規化する", () => {
  const tables = normalizeStatsList(statsListFixture);
  assert.deepEqual(tables, [
    {
      id: "0003412312",
      statisticsName: "建築着工統計調査",
      title: "用途別、構造別/建築物の数、床面積",
      cycle: "年度次",
      surveyDate: "2024",
      openDate: "2025-04-30",
      updatedDate: "2025-04-30",
      overallTotalNumber: 2,
    },
  ]);

  const dimensions = normalizeMetaInfo(metaFixture, tables[0].id);
  assert.equal(dimensions.length, 4);
  assert.equal(dimensions[0].apiKey, "tab");
  assert.equal(dimensions[1].apiKey, "area");
  assert.equal(dimensions[1].values[1].parentCode, "00000");
});

test("Excelセルではなく分類条件付き観測値として保持する", () => {
  const observation = normalizeObservation(
    {
      "@tab": "10",
      "@area": "13000",
      "@cat01": "01",
      "@time": "2023100000",
      "@unit": "㎡",
      $: "12,345.6",
    },
    "0003412312",
  );
  assert.equal(observation.numericValue, 12345.6);
  assert.equal(observation.status, "confirmed_value");
  assert.equal(observation.timeCode, "2023100000");
  assert.deepEqual(observation.coordinates, {
    tab: "10",
    area: "13000",
    cat01: "01",
  });
  assert.equal(fiscalYearFromTimeCode(observation.timeCode), 2023);

  const dimensions = normalizeMetaInfo(metaFixture, "0003412312");
  assert.equal(
    seriesLabel(observation.coordinates, buildValueLookup(dimensions)),
    "床面積 / 東京都 / 居住専用住宅",
  );
});

test("e-StatのCSV応答を公式コード付き観測値へ変換する", () => {
  const csv = [
    '"RESULT"',
    '"STATUS","0"',
    '"TOTAL_NUMBER","1"',
    '"VALUE"',
    '"tab_code","表章項目","area_code","地域","time_code","時間軸","unit","value","annotation"',
    '"10","床面積","13000","東京都","2023100000","2023年度","㎡","12,345.6","注記,あり"',
  ].join("\r\n");
  const page = normalizeSimpleStatsDataCsv(csv);
  assert.equal(page.totalNumber, 1);
  assert.deepEqual(page.values, [
    {
      "@tab": "10",
      "@area": "13000",
      "@time": "2023100000",
      "@unit": "㎡",
      "@annotation": "注記,あり",
      $: "12,345.6",
    },
  ]);
});

test("項目レジストリから系列・年度値・出典まで辿れる", () => {
  const temporaryDirectory = mkdtempSync(
    resolve(tmpdir(), "mlit-statistics-system-"),
  );
  try {
    const db = openStatisticsDatabase(
      resolve(temporaryDirectory, "statistics.sqlite"),
    );
    const dataset = {
      id: "building-starts",
      title: "建築着工統計",
      governmentStatisticsCode: "00600120",
      providedStatisticsId: "000001016965",
      sourceUrl: "https://www.e-stat.go.jp/",
      fiscalYearFrom: 2013,
    };
    const table = normalizeStatsList(statsListFixture)[0];
    const dimensions = normalizeMetaInfo(metaFixture, table.id);
    upsertDataset(db, dataset);
    upsertStatisticalTable(
      db,
      dataset.id,
      table,
      "2026-07-30T00:00:00Z",
    );
    replaceDimensions(db, table.id, dimensions);
    upsertObservationSource(db, {
      id: `estat-api:${table.id}:current`,
      tableId: table.id,
      sourceUrl: `https://www.e-stat.go.jp/dbview?sid=${table.id}`,
      publishedAt: table.updatedDate,
      retrievedAt: "2026-07-30T00:00:00Z",
    });
    const lookup = buildValueLookup(dimensions);
    const write = makeObservationWriter(db, {
      tableId: table.id,
      dimensions,
      sourceId: `estat-api:${table.id}:current`,
      fetchedAt: "2026-07-30T00:00:00Z",
      timeCodes: ["2023100000", "2024100000"],
      seriesLabel: (coordinates) => seriesLabel(coordinates, lookup),
    });
    write([
      normalizeObservation(
        {
          "@tab": "10",
          "@area": "13000",
          "@cat01": "01",
          "@time": "2023100000",
          "@unit": "㎡",
          $: "12345.6",
        },
        table.id,
      ),
      normalizeObservation(
        {
          "@tab": "10",
          "@area": "13000",
          "@cat01": "01",
          "@time": "2024100000",
          "@unit": "㎡",
          $: "0",
        },
        table.id,
      ),
    ]);
    write.finish();
    finalizeTable(db, table.id, ["2023100000", "2024100000"]);

    const row = db
      .prepare(
        `SELECT s.label, s.observation_count, o.time_code,
                o.numeric_value, src.source_url
           FROM series s
           JOIN observations o ON o.series_id = s.id
           JOIN observation_sources src ON src.id = o.source_id`,
      )
      .get();
    assert.deepEqual({ ...row }, {
      label: "床面積 / 東京都 / 居住専用住宅",
      observation_count: 2,
      time_code: "2023100000",
      numeric_value: 12345.6,
      source_url: `https://www.e-stat.go.jp/dbview?sid=${table.id}`,
    });
    const seriesId = db.prepare("SELECT id FROM series").get().id;
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM observations").get().count,
      1,
    );
    db.close();

    const publicDirectory = resolve(temporaryDirectory, "public-system");
    const exportResult = spawnSync(
      process.execPath,
      [
        resolve(
          import.meta.dirname,
          "../scripts/export-system-pages-data.mjs",
        ),
      ],
      {
        env: {
          ...process.env,
          MLIT_SYSTEM_DATABASE_PATH: resolve(
            temporaryDirectory,
            "statistics.sqlite",
          ),
          MLIT_SYSTEM_PUBLIC_DIR: publicDirectory,
        },
        encoding: "utf8",
      },
    );
    assert.equal(exportResult.status, 0, exportResult.stderr);
    const catalog = JSON.parse(
      readFileSync(resolve(publicDirectory, "catalog.json"), "utf8"),
    );
    assert.equal(catalog.schemaVersion, 2);
    assert.equal(catalog.tables[0].seriesCount, 1);
    const meta = JSON.parse(
      gunzipSync(
        readFileSync(
          resolve(publicDirectory, "tables", table.id, "meta.json.gz"),
        ),
      ).toString("utf8"),
    );
    assert.equal(meta.dimensions[0].name, "表章項目");
    assert.deepEqual(meta.defaultSelection, {
      tab: "10",
      area: "13000",
      cat01: "01",
    });
    const bundle = JSON.parse(
      gunzipSync(
        readFileSync(
          resolve(
            publicDirectory,
            "shards",
            `building-starts-${seriesId.slice(0, 2)}.json.gz`,
          ),
        ),
      ).toString("utf8"),
    );
    assert.equal(bundle.series[seriesId][0], "m2");
    assert.equal(bundle.series[seriesId][1], 3);
    assert.equal(bundle.series[seriesId][2].length, 1);
    assert.equal(bundle.series[seriesId][2][0][1], 12345.6);
    assert.equal(bundle.series[seriesId][2][0][2], null);
    assert.equal(
      catalog.sources[table.id].sourceUrl,
      `https://www.e-stat.go.jp/dbview?sid=${table.id}`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
