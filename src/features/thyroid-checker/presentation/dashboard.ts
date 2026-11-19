import type { TestRange, ThyroidFieldKey } from '../domain/types';
import type { RangeAssessment } from '../domain/reference-ranges';
import { state } from './state';
import { formatDateDMY } from '../domain/appointments';
import { assessValue, standardRangeFor } from '../domain/reference-ranges';
import { canonicalUnit, formatNumber, isKnownUnit } from '../domain/units';

type RangeFilter = 'all' | '6m' | '1y';
type OverlayKey = 'freeT4' | 'freeT3';

interface SeriesValue {
  value: number;
  unit: string;
}

interface TshPoint {
  date: string;
  tsh: SeriesValue;
  tshStatus: RangeAssessment | null;
  tshRange: TestRange | null;
  freeT4: SeriesValue | null;
  freeT3: SeriesValue | null;
}

interface Stats {
  latest: TshPoint | null;
  average: number | null;
  min: number | null;
  max: number | null;
  inRangeCount: number;
  count: number;
}

let currentRange: RangeFilter = 'all';
const activeOverlays = new Set<OverlayKey>();

const CHART = { width: 640, height: 240, left: 44, right: 16, top: 14, bottom: 34 };
const OVERLAY_COLORS: Record<OverlayKey, string> = {
  freeT4: 'var(--e1)',
  freeT3: 'var(--e2)',
};
const OVERLAY_LABELS: Record<OverlayKey, string> = {
  freeT4: 'Free T4',
  freeT3: 'Free T3',
};

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function parseIso(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function measured(key: ThyroidFieldKey, value: number | null | undefined, units: Record<string, string> | undefined): SeriesValue | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return { value, unit: units?.[key] ?? canonicalUnit(key) };
}

function collectPoints(): TshPoint[] {
  const records = [...state.records].sort((a, b) => a.date.localeCompare(b.date));
  const points: TshPoint[] = [];

  for (const record of records) {
    if (record.tsh === null || record.tsh === undefined || !Number.isFinite(record.tsh)) continue;
    const unit = record.units?.tsh ?? canonicalUnit('tsh');
    const known = isKnownUnit('tsh', unit);
    const override = record.ranges?.tsh ?? null;
    const range = known || override ? override ?? standardRangeFor('tsh', unit) : null;
    points.push({
      date: record.date,
      tsh: { value: record.tsh, unit },
      tshStatus: assessValue(record.tsh, range),
      tshRange: range,
      freeT4: measured('freeT4', record.freeT4, record.units),
      freeT3: measured('freeT3', record.freeT3, record.units),
    });
  }
  return points;
}

function filterByRange(points: TshPoint[]): TshPoint[] {
  if (currentRange === 'all') return points;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (currentRange === '6m' ? 6 : 12));
  const cutoffTime = cutoff.getTime();
  return points.filter((point) => parseIso(point.date) >= cutoffTime);
}

function computeStats(points: TshPoint[]): Stats {
  const values = points.map((point) => point.tsh.value);
  return {
    latest: points[points.length - 1] ?? null,
    average: values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    inRangeCount: points.filter((point) => point.tshStatus === 'normal').length,
    count: points.length,
  };
}

function renderStats(stats: Stats): string {
  const latest = stats.latest;
  const badge = latest && latest.tshStatus !== 'normal'
    ? '<span class="thyroid-dash-badge thyroid-dash-badge-warn">out of range</span>'
    : '<span class="thyroid-dash-badge">in range</span>';
  const inRangePct = stats.count ? Math.round((stats.inRangeCount / stats.count) * 100) : 0;

  return `
    <div class="thyroid-dash-stat">
      <span class="thyroid-dash-stat-label">Latest</span>
      <strong>${esc(formatNumber(latest?.tsh.value ?? NaN))} <small>${esc(latest?.tsh.unit ?? '')}</small></strong>
      <span class="thyroid-dash-stat-sub">${latest ? esc(formatDateDMY(latest.date)) : ''} ${badge}</span>
    </div>
    <div class="thyroid-dash-stat">
      <span class="thyroid-dash-stat-label">Average</span>
      <strong>${esc(formatNumber(stats.average ?? NaN))}</strong>
      <span class="thyroid-dash-stat-sub">over ${stats.count} result${stats.count === 1 ? '' : 's'}</span>
    </div>
    <div class="thyroid-dash-stat">
      <span class="thyroid-dash-stat-label">Min / Max</span>
      <strong>${esc(formatNumber(stats.min ?? NaN))} / ${esc(formatNumber(stats.max ?? NaN))}</strong>
      <span class="thyroid-dash-stat-sub">${esc(latest?.tsh.unit ?? '')}</span>
    </div>
    <div class="thyroid-dash-stat">
      <span class="thyroid-dash-stat-label">In range</span>
      <strong>${inRangePct}%</strong>
      <span class="thyroid-dash-stat-sub">${stats.inRangeCount} of ${stats.count}</span>
    </div>
  `;
}

function buildLineChart(points: TshPoint[]): string {
  const { width, height, left, right, top, bottom } = CHART;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const toX = (index: number) => left + index * xStep;

  const tshValues = points.map((point) => point.tsh.value);
  const units = new Set(points.map((point) => point.tsh.unit));
  const singleUnit = units.size === 1;
  const range = singleUnit ? points[points.length - 1].tshRange : null;

  let yMin = Math.min(...tshValues);
  let yMax = Math.max(...tshValues);
  if (range) {
    if (range.low !== null) yMin = Math.min(yMin, range.low);
    if (range.high !== null) yMax = Math.max(yMax, range.high);
  }
  const padding = (yMax - yMin || Math.abs(yMax) || 1) * 0.12;
  yMin -= padding;
  yMax += padding;
  const ySpan = yMax - yMin || 1;
  const toY = (value: number) => top + plotHeight - ((value - yMin) / ySpan) * plotHeight;

  let svg = '';

  // Reference range band (only meaningful when all points share a unit).
  if (range && (range.low !== null || range.high !== null)) {
    const bandTop = toY(range.high ?? yMax);
    const bandBottom = toY(range.low ?? yMin);
    svg += `<rect x="${left}" y="${bandTop}" width="${plotWidth}" height="${Math.max(0, bandBottom - bandTop)}" fill="var(--ok)" opacity="0.09" />`;
    svg += `<line x1="${left}" y1="${bandTop}" x2="${width - right}" y2="${bandTop}" stroke="var(--ok)" stroke-width="1" stroke-dasharray="3 4" opacity="0.5" />`;
    svg += `<line x1="${left}" y1="${bandBottom}" x2="${width - right}" y2="${bandBottom}" stroke="var(--ok)" stroke-width="1" stroke-dasharray="3 4" opacity="0.5" />`;
  }

  // Horizontal grid + Y labels.
  for (let tick = 0; tick <= 4; tick++) {
    const value = yMin + (ySpan * tick) / 4;
    const y = toY(value);
    svg += `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="var(--line)" stroke-width="1" opacity="0.7" />`;
    svg += `<text x="${left - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--ink-2)">${esc(formatNumber(value))}</text>`;
  }

  // X labels: first, middle, last.
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  for (const index of labelIndexes) {
    svg += `<text x="${toX(index)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="var(--ink-2)">${esc(formatDateDMY(points[index].date).slice(0, 5))}</text>`;
  }

  // Overlay series on their own normalized scale so different units remain visible.
  for (const key of activeOverlays) {
    const values = points.map((point) => point[key]);
    const present = values.filter((value): value is SeriesValue => value !== null && value !== undefined);
    if (present.length < 2) continue;
    const overlayMin = Math.min(...present.map((value) => value.value));
    const overlayMax = Math.max(...present.map((value) => value.value));
    const overlayPad = (overlayMax - overlayMin || Math.abs(overlayMax) || 1) * 0.15;
    const low = overlayMin - overlayPad;
    const span = overlayMax - overlayMin + overlayPad * 2 || 1;
    const overlayY = (value: number) => top + plotHeight - ((value - low) / span) * plotHeight;
    const color = OVERLAY_COLORS[key];
    const segments: string[] = [];
    let started = false;
    points.forEach((point, index) => {
      const measurement = point[key];
      if (!measurement) { started = false; return; }
      const command = started ? 'L' : 'M';
      segments.push(`${command} ${toX(index)} ${overlayY(measurement.value)}`);
      started = true;
    });
    svg += `<path d="${segments.join(' ')}" fill="none" stroke="${color}" stroke-width="1.75" stroke-dasharray="5 4" stroke-linejoin="round" />`;
    points.forEach((point, index) => {
      const measurement = point[key];
      if (!measurement) return;
      svg += `<circle cx="${toX(index)}" cy="${overlayY(measurement.value)}" r="3" fill="var(--surface)" stroke="${color}" stroke-width="1.5"><title>${esc(formatDateDMY(point.date))}: ${OVERLAY_LABELS[key]} ${esc(formatNumber(measurement.value))} ${esc(measurement.unit)}</title></circle>`;
    });
  }

  // TSH line and points.
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(point.tsh.value)}`).join(' ');
  svg += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
  points.forEach((point, index) => {
    const outOfRange = point.tshStatus === 'low' || point.tshStatus === 'high';
    const flag = point.tshStatus === 'high' ? ' ↑' : point.tshStatus === 'low' ? ' ↓' : '';
    const expected = point.tshRange ? ` · expected ${esc(formatRangeText(point.tshRange))}` : '';
    svg += `<circle cx="${toX(index)}" cy="${toY(point.tsh.value)}" r="4.5" fill="${outOfRange ? 'var(--danger)' : 'var(--accent)'}" stroke="var(--surface)" stroke-width="2"><title>${esc(formatDateDMY(point.date))}: TSH ${esc(formatNumber(point.tsh.value))} ${esc(point.tsh.unit)}${flag}${expected}</title></circle>`;
  });

  let html = `<svg viewBox="0 0 ${width} ${height}" class="thyroid-dash-svg" role="img" aria-label="TSH trend line chart">${svg}</svg>`;
  if (!singleUnit) {
    html += '<p class="thyroid-dash-note">Results use different TSH units, so values are plotted as recorded. Compare values by their unit.</p>';
  }
  if (range) {
    html += `<p class="thyroid-dash-note">Shaded band: expected TSH ${esc(formatRangeText(range))} ${esc(points[points.length - 1].tsh.unit)}.</p>`;
  }
  return html;
}

function formatRangeText(range: TestRange): string {
  if (range.low !== null && range.high !== null) return `${formatNumber(range.low)} – ${formatNumber(range.high)}`;
  if (range.low !== null) return `≥ ${formatNumber(range.low)}`;
  if (range.high !== null) return `≤ ${formatNumber(range.high)}`;
  return '—';
}

export function renderTshDashboard(): void {
  const statsEl = document.getElementById('thyroid-dashboard-stats');
  const chartEl = document.getElementById('thyroid-dashboard-chart');
  const emptyEl = document.getElementById('thyroid-dashboard-empty');
  if (!statsEl || !chartEl || !emptyEl) return;

  const points = filterByRange(collectPoints());
  if (points.length < 2) {
    statsEl.innerHTML = '';
    chartEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  statsEl.innerHTML = renderStats(computeStats(points));
  chartEl.innerHTML = buildLineChart(points);
}

export function wireDashboardControls(): void {
  document.querySelectorAll<HTMLButtonElement>('.thyroid-dash-filter').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.thyroid-dash-filter').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      currentRange = button.dataset.range as RangeFilter;
      renderTshDashboard();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.thyroid-dash-overlay').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.overlay as OverlayKey;
      if (activeOverlays.has(key)) activeOverlays.delete(key);
      else activeOverlays.add(key);
      button.classList.toggle('active', activeOverlays.has(key));
      button.setAttribute('aria-pressed', String(activeOverlays.has(key)));
      renderTshDashboard();
    });
  });
}
