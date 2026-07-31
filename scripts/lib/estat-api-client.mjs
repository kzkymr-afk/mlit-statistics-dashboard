const DEFAULT_API_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function apiError(path, response, body) {
  const status =
    body?.GET_STATS_LIST?.RESULT ??
    body?.GET_META_INFO?.RESULT ??
    body?.GET_STATS_DATA?.RESULT ??
    body?.GET_DATA_CATALOG?.RESULT;
  const message =
    status?.ERROR_MSG ??
    status?.STATUS ??
    `${response.status} ${response.statusText}`;
  return new Error(`e-Stat API ${path}: ${message}`);
}

export class EStatApiClient {
  constructor({
    appId,
    apiBase = DEFAULT_API_BASE,
    fetchImpl = fetch,
    userAgent = "MLITStatisticsSystem/2.0",
    maxRetries = 6,
    requestTimeoutMs = 120_000,
  }) {
    if (!appId?.trim()) {
      throw new Error(
        "ESTAT_APP_IDが必要です。e-Statで発行したアプリケーションIDを設定してください。",
      );
    }
    this.appId = appId.trim();
    this.apiBase = apiBase.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.userAgent = userAgent;
    this.maxRetries = maxRetries;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async request(path, parameters = {}) {
    const url = new URL(`${this.apiBase}/${path}`);
    url.searchParams.set("appId", this.appId);
    url.searchParams.set("lang", "J");
    for (const [key, value] of Object.entries(parameters)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          headers: {
            accept: "application/json",
            "user-agent": this.userAgent,
          },
        });
        let body;
        try {
          body = await response.json();
        } catch {
          throw new Error(
            `e-Stat API ${path}: JSONではない応答を受信しました (${response.status})`,
          );
        }
        if (!response.ok) {
          const retryable =
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          const error = apiError(path, response, body);
          error.retryable = retryable;
          throw error;
        }
        const result =
          body?.GET_STATS_LIST?.RESULT ??
          body?.GET_META_INFO?.RESULT ??
          body?.GET_STATS_DATA?.RESULT ??
          body?.GET_DATA_CATALOG?.RESULT;
        const status = Number(result?.STATUS ?? 0);
        if (status !== 0) {
          const error = apiError(path, response, body);
          error.retryable = false;
          throw error;
        }
        return { body, url: url.toString() };
      } catch (error) {
        lastError = error;
        if (error?.retryable === false) throw error;
        if (attempt >= this.maxRetries) break;
        const delay = Math.min(10_000, 750 * 2 ** attempt);
        process.stderr.write(
          `e-Stat API ${path}: temporary failure, retry ${attempt + 1}/${this.maxRetries}\n`,
        );
        await wait(delay);
      }
    }
    throw lastError;
  }

  async statsList(parameters) {
    return this.request("getStatsList", parameters);
  }

  async metaInfo(statsDataId) {
    return this.request("getMetaInfo", {
      statsDataId,
      explanationGetFlg: "Y",
    });
  }

  async dataCatalog(parameters) {
    return this.request("getDataCatalog", parameters);
  }

  async statsData(
    statsDataId,
    startPosition = 1,
    limit = 100_000,
    filters = {},
  ) {
    return this.request("getStatsData", {
      statsDataId,
      startPosition,
      limit,
      ...filters,
      metaGetFlg: "N",
      explanationGetFlg: "N",
      annotationGetFlg: "Y",
      replaceSpChar: 0,
    });
  }

  async statsDataCsv(
    statsDataId,
    startPosition = 1,
    limit = 100_000,
    filters = {},
  ) {
    const apiRoot = this.apiBase.replace(/\/json$/, "");
    const url = new URL(`${apiRoot}/getSimpleStatsData`);
    const parameters = {
      appId: this.appId,
      lang: "J",
      statsDataId,
      startPosition,
      limit,
      ...filters,
      metaGetFlg: "N",
      explanationGetFlg: "N",
      annotationGetFlg: "Y",
      replaceSpChar: 0,
    };
    for (const [key, value] of Object.entries(parameters)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          headers: {
            accept: "text/csv,text/plain",
            "user-agent": this.userAgent,
          },
        });
        const text = await response.text();
        if (!response.ok) {
          const error = new Error(
            `e-Stat API getSimpleStatsData: ${response.status} ${response.statusText}`,
          );
          error.retryable =
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          throw error;
        }
        return { text, url: url.toString() };
      } catch (error) {
        lastError = error;
        if (error?.retryable === false) throw error;
        if (attempt >= this.maxRetries) break;
        const delay = Math.min(10_000, 750 * 2 ** attempt);
        process.stderr.write(
          `e-Stat API getSimpleStatsData: temporary failure, retry ${attempt + 1}/${this.maxRetries}\n`,
        );
        await wait(delay);
      }
    }
    throw lastError;
  }
}
