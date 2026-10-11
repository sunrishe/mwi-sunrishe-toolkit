// market-history-charts
// 统计页图表的纯几何计算：数值轴刻度、分组柱、堆叠横条与环形弧段。
// 不依赖 DOM、DataHub 与 i18n：输入数值与坐标空间尺寸，输出可直接套进 SVG / HTML 的几何数据。
// 图表本身用 SVG 手绘（不引入图表库，保持单文件脚本体积），模板在 index.js 里组装。

const TWO_PI = Math.PI * 2;

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// 数值轴：把最大值向上取整到 1/2/5 × 10^n 的「好看」刻度；有负值时一并覆盖（净收支可能为负）。
export function buildValueAxis({min = 0, max = 0, tickCount = 4} = {}) {
  const rawMax = Number.isFinite(Number(max)) ? Math.max(0, Number(max)) : 0;
  const rawMin = Number.isFinite(Number(min)) ? Math.min(0, Number(min)) : 0;
  if (rawMax <= rawMin) return {min: 0, max: 1, step: 1, ticks: [
        0, 1
      ]};
  const rough = (rawMax - rawMin) / Math.max(1, tickCount);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = magnitude * (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10);
  const axisMin = Math.floor(rawMin / step) * step;
  const axisMax = Math.ceil(rawMax / step) * step;
  const ticks = [];
  for (let value = axisMin; value <= axisMax + step / 2; value += step) ticks.push(round(value, 6));
  return {min: axisMin, max: axisMax, step, ticks};
}

// 竖向柱的横向布局：count 个分组、每组 seriesCount 根柱子；返回每组的起点、柱宽、组中心与各柱 x。
export function layoutBarGroups({count, seriesCount = 1, plot}) {
  const groups = [];
  if (!(count > 0) || !(plot?.width > 0)) return groups;
  const seriesTotal = Math.max(1, Math.floor(seriesCount));
  const groupWidth = plot.width / count;
  const groupGap = Math.min(6, groupWidth * 0.28);
  const innerWidth = Math.max(1, groupWidth - groupGap);
  const seriesGap = seriesTotal > 1 ? Math.min(2, innerWidth * 0.12) : 0;
  const barWidth = Math.max(0.8, (innerWidth - seriesGap * (seriesTotal - 1)) / seriesTotal);
  for (let index = 0; index < count; index += 1) {
    const start = plot.x + groupWidth * index + groupGap / 2;
    const seriesX = [];
    for (let series = 0; series < seriesTotal; series += 1) seriesX.push(start + series * (barWidth + seriesGap));
    groups.push({x: start, width: barWidth, center: start + innerWidth / 2, seriesX});
  }
  return groups;
}

// 堆叠横条：把一组数值按比例分配到给定长度上（用于「物品排行」的出售 / 购买两段）。
export function layoutStackedSegments({values, length}) {
  const safeValues = values.map((value) => Math.max(0, Number(value) || 0));
  const total = safeValues.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || !(length > 0)) return safeValues.map(() => ({offset: 0, width: 0, ratio: 0}));
  const segments = [];
  let offset = 0;
  safeValues.forEach((value) => {
    const width = length * (value / total);
    segments.push({offset, width, ratio: value / total});
    offset += width;
  });
  return segments;
}

export function polarPoint(cx, cy, radius, angle) {
  return {x: round(cx + radius * Math.cos(angle)), y: round(cy + radius * Math.sin(angle))};
}

function arcPath({cx, cy, outerRadius, innerRadius, startAngle, endAngle}) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`, `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`, `L ${innerEnd.x} ${innerEnd.y}`, `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`, 'Z'
  ].join(' ');
}

// 整圈（只有一个扇区占满时，起止点重合的弧画不出来，改用两段半圆拼接）。
function ringPath({cx, cy, outerRadius, innerRadius}) {
  const outerTop = polarPoint(cx, cy, outerRadius, -Math.PI / 2);
  const outerBottom = polarPoint(cx, cy, outerRadius, Math.PI / 2);
  const innerTop = polarPoint(cx, cy, innerRadius, -Math.PI / 2);
  const innerBottom = polarPoint(cx, cy, innerRadius, Math.PI / 2);
  return [
    `M ${outerTop.x} ${outerTop.y}`, `A ${outerRadius} ${outerRadius} 0 1 1 ${outerBottom.x} ${outerBottom.y}`, `A ${outerRadius} ${outerRadius} 0 1 1 ${outerTop.x} ${outerTop.y}`, 'Z', `M ${innerTop.x} ${innerTop.y}`,
    `A ${innerRadius} ${innerRadius} 0 1 0 ${innerBottom.x} ${innerBottom.y}`, `A ${innerRadius} ${innerRadius} 0 1 0 ${innerTop.x} ${innerTop.y}`, 'Z'
  ].join(' ');
}

// 环形图弧段：从 12 点方向顺时针铺开，返回每段路径、起止角与占比（0 值段不画但保留占位）。
export function layoutDoughnutArcs({values, cx, cy, outerRadius, innerRadius = outerRadius * 0.62}) {
  const safeValues = values.map((value) => Math.max(0, Number(value) || 0));
  const total = safeValues.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return [];
  const arcs = [];
  let angle = -Math.PI / 2;
  safeValues.forEach((value, index) => {
    const sweep = (value / total) * TWO_PI;
    const endAngle = angle + sweep;
    arcs.push({
      index,
      ratio: value / total,
      startAngle: angle,
      endAngle,
      path:
        value <= 0
          ? ''
          : sweep >= TWO_PI - 1e-6
            ? ringPath({cx, cy, outerRadius, innerRadius})
            : arcPath({cx, cy, outerRadius, innerRadius, startAngle: angle, endAngle})
    });
    angle = endAngle;
  });
  return arcs;
}

// 横轴标签抽样：桶太多时隔几个画一个，最多画 maxLabels 个。
export function pickLabelStep(count, maxLabels = 8) {
  if (!(count > 0) || !(maxLabels > 0)) return 1;
  return Math.max(1, Math.ceil(count / maxLabels));
}

export function percentageText(ratio, digits = 1) {
  if (!Number.isFinite(Number(ratio))) return '0%';
  const percent = Number(ratio) * 100;
  const fixed = percent.toFixed(digits);
  return (fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed) + '%';
}
