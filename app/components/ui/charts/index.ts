/**
 * Chart kit barrel. Dependency-free SVG charts in the brand, each with a
 * hover layer, keyboard access and a table twin through ChartCard.
 *
 * The usual shape on a screen:
 *
 *   <ChartCard title="Sessions" legend={lineChartLegend(series)} table={lineChartTable(series)}>
 *     <LineChart series={series} />
 *   </ChartCard>
 */

export {
  CATEGORICAL,
  SEQUENTIAL,
  OTHER_COLOR,
  MAX_SERIES,
  LOW_CONTRAST_SLOTS,
  SUPPRESSION_THRESHOLD,
  SUPPRESSED_LABEL,
  seriesColor,
  sequentialColor,
  sequentialStep,
} from "./palette";

export { default as ChartCard } from "./ChartCard";
export type { ChartLegendItem, ChartTableData } from "./ChartCard";

export {
  default as LineChart,
  foldLineSeries,
  lineChartLegend,
  lineChartTable,
} from "./LineChart";
export type { LineSeries, LinePoint } from "./LineChart";

export { default as BarChart, barChartTable } from "./BarChart";
export type { BarDatum } from "./BarChart";

export { default as DonutChart, foldDonut, donutChartTable } from "./DonutChart";
export type { DonutDatum } from "./DonutChart";

export { default as Heatmap, heatmapTable } from "./Heatmap";

export { default as Sparkline } from "./Sparkline";
