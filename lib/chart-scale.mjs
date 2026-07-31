const DEFAULT_TICK_COUNT = 5;
const MAX_TICK_COUNT = 50;

/**
 * @typedef {object} AxisScaleOptions
 * @property {boolean} [includeZero]
 * @property {number | null} [min]
 * @property {number | null} [max]
 * @property {number | null} [step]
 */

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanNumber(value) {
  if (Object.is(value, -0)) return 0;
  return Number(value.toPrecision(12));
}

export function niceStep(span, targetTickCount = DEFAULT_TICK_COUNT) {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const roughStep = span / Math.max(1, targetTickCount);
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / power;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return cleanNumber(niceFraction * power);
}

function axisTicks(min, max, step) {
  const count = Math.floor((max - min) / step + 1e-9);
  const ticks = [];
  for (let index = 0; index <= Math.min(count, MAX_TICK_COUNT); index += 1) {
    ticks.push(cleanNumber(min + step * index));
  }
  if (ticks.length === 0 || Math.abs(ticks.at(-1) - max) > step * 1e-8) {
    ticks.push(cleanNumber(max));
  }
  return ticks;
}

/**
 * 数値系列から、1・2・5刻みの読みやすい軸範囲と目盛りを作る。
 * min / max / step が指定された場合は、その値を優先する。
 * @param {number[]} values
 * @param {AxisScaleOptions} [options]
 */
export function buildAxisScale(
  values,
  { includeZero = false, min = null, max = null, step = null } = {},
) {
  const numericValues = values.filter(Number.isFinite);
  let dataMin = numericValues.length ? Math.min(...numericValues) : 0;
  let dataMax = numericValues.length ? Math.max(...numericValues) : 1;
  const customMin = finiteNumber(min);
  const customMax = finiteNumber(max);
  const customStep = finiteNumber(step);

  if (includeZero) {
    dataMin = Math.min(0, dataMin);
    dataMax = Math.max(0, dataMax);
  }
  if (dataMin === dataMax) {
    const padding = Math.abs(dataMin || 1) * 0.1;
    dataMin -= padding;
    dataMax += padding;
  }

  const requestedMin = customMin ?? dataMin;
  const requestedMax = customMax ?? dataMax;
  let interval =
    customStep !== null && customStep > 0
      ? customStep
      : niceStep(requestedMax - requestedMin);
  let axisMin =
    customMin ?? cleanNumber(Math.floor(dataMin / interval) * interval);
  let axisMax =
    customMax ?? cleanNumber(Math.ceil(dataMax / interval) * interval);

  if (!(axisMax > axisMin)) {
    axisMin = dataMin;
    axisMax = dataMax;
    interval = niceStep(axisMax - axisMin);
    axisMin = cleanNumber(Math.floor(axisMin / interval) * interval);
    axisMax = cleanNumber(Math.ceil(axisMax / interval) * interval);
  }

  const estimatedTickCount = (axisMax - axisMin) / interval;
  if (estimatedTickCount > MAX_TICK_COUNT) {
    interval = niceStep(axisMax - axisMin, 10);
    if (customMin === null) {
      axisMin = cleanNumber(Math.floor(axisMin / interval) * interval);
    }
    if (customMax === null) {
      axisMax = cleanNumber(Math.ceil(axisMax / interval) * interval);
    }
  }

  return {
    min: axisMin,
    max: axisMax,
    step: interval,
    ticks: axisTicks(axisMin, axisMax, interval),
  };
}
