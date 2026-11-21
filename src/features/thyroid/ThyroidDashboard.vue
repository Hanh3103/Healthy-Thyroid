<script setup lang="ts">
import { reactive } from 'vue';
import { useThyroid } from './useThyroid';
import type { DashboardRange, OverlayKey } from './model';

const vm = reactive(useThyroid());

const ranges: Array<{ value: DashboardRange; label: string }> = [
  { value: 'all', label: 'All' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
];

const overlayOptions: Array<{ key: OverlayKey; label: string; swatch: string }> = [
  { key: 'freeT4', label: 'Free T4', swatch: 'thyroid-dash-swatch-ft4' },
  { key: 'freeT3', label: 'Free T3', swatch: 'thyroid-dash-swatch-ft3' },
];

function isOverlayActive(key: OverlayKey): boolean {
  return vm.dashboard.overlays.includes(key);
}

function latestBadgeClass(): string {
  const status = vm.dashboard.stats.latest?.tshStatus;
  return status === 'normal'
    ? 'thyroid-dash-badge'
    : 'thyroid-dash-badge thyroid-dash-badge-warn';
}
</script>

<template>
  <div class="thyroid-dashboard">
    <div class="thyroid-dashboard-controls">
      <div class="thyroid-dashboard-filters">
        <button
          v-for="option in ranges"
          :key="option.value"
          type="button"
          class="thyroid-dash-filter"
          :class="{ active: vm.dashboard.range === option.value }"
          @click="vm.setDashboardRange(option.value)"
        >{{ option.label }}</button>
      </div>

      <span class="thyroid-dash-series-label">
        <span class="thyroid-dash-swatch thyroid-dash-swatch-tsh"></span>
        TSH
      </span>
      <button
        v-for="option in overlayOptions"
        :key="option.key"
        type="button"
        class="thyroid-dash-overlay"
        :class="{ active: isOverlayActive(option.key) }"
        :aria-pressed="isOverlayActive(option.key)"
        @click="vm.toggleOverlay(option.key)"
      >
        <span class="thyroid-dash-swatch" :class="option.swatch"></span>
        {{ option.label }}
      </button>
    </div>

    <div v-if="!vm.dashboard.hasData" class="thyroid-dashboard-empty">
      {{ vm.dashboard.emptyMessage }}
    </div>

    <template v-else>
      <div class="thyroid-dashboard-stats">
        <div class="thyroid-dash-stat">
          <span class="thyroid-dash-stat-label">Latest</span>
          <strong>
            {{ vm.formatNumber(vm.dashboard.stats.latest?.tsh.value ?? 0) }}
            <small>{{ vm.dashboard.stats.latest?.tsh.unit ?? '' }}</small>
          </strong>
          <span class="thyroid-dash-stat-sub">
            {{ vm.formatDate(vm.dashboard.stats.latest?.date ?? '') }}
            <span :class="latestBadgeClass()">
              {{ vm.dashboard.stats.latest?.tshStatus === 'normal' ? 'in range' : 'out of range' }}
            </span>
          </span>
        </div>
        <div class="thyroid-dash-stat">
          <span class="thyroid-dash-stat-label">Average</span>
          <strong>{{ vm.formatNumber(vm.dashboard.stats.average ?? 0) }}</strong>
          <span class="thyroid-dash-stat-sub">
            over {{ vm.dashboard.stats.count }} result{{ vm.dashboard.stats.count === 1 ? '' : 's' }}
          </span>
        </div>
        <div class="thyroid-dash-stat">
          <span class="thyroid-dash-stat-label">Min / Max</span>
          <strong>
            {{ vm.formatNumber(vm.dashboard.stats.min ?? 0) }} / {{ vm.formatNumber(vm.dashboard.stats.max ?? 0) }}
          </strong>
          <span class="thyroid-dash-stat-sub">{{ vm.dashboard.stats.latest?.tsh.unit ?? '' }}</span>
        </div>
        <div class="thyroid-dash-stat">
          <span class="thyroid-dash-stat-label">In range</span>
          <strong>
            {{ vm.dashboard.stats.count ? Math.round((vm.dashboard.stats.inRangeCount / vm.dashboard.stats.count) * 100) : 0 }}%
          </strong>
          <span class="thyroid-dash-stat-sub">
            {{ vm.dashboard.stats.inRangeCount }} of {{ vm.dashboard.stats.count }}
          </span>
        </div>
      </div>

      <div class="thyroid-dashboard-chart" v-html="vm.dashboard.chart"></div>
    </template>
  </div>
</template>
