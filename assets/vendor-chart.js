/**
 * Vendor imports for Chart.js pages (chart).
 */

// Chart.js and plugins
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Chart.js plugins
import ChartDataLabels from 'chartjs-plugin-datalabels';
import zoomPlugin from 'chartjs-plugin-zoom';

Chart.register(ChartDataLabels);
Chart.register(zoomPlugin);

export { Chart };
