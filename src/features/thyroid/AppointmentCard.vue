<script setup lang="ts">
import { reactive } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import { useThyroid } from './useThyroid';

const vm = reactive(useThyroid());
</script>

<template>
  <div v-if="vm.appointmentCard.bannerVisible" id="thyroid-appt-banner" class="thyroid-appt-banner" role="status">
    <span>{{ vm.appointmentCard.bannerText }}</span>
    <button type="button" class="ghost btn-sm" title="Dismiss" @click="vm.dismissBanner()">×</button>
  </div>

  <div
    id="thyroid-appointment-card"
    class="thyroid-appointment-card"
    :class="{
      'thyroid-appt-due': vm.appointmentCard.dueSoon,
      'thyroid-appt-overdue': vm.appointmentCard.overdue,
    }"
  >
    <div class="thyroid-appt-main">
      <span class="thyroid-appt-label">Next blood control</span>
      <strong data-appt-date>{{ vm.appointmentCard.dateText }}</strong>
      <span class="thyroid-appt-countdown" data-appt-countdown>{{ vm.appointmentCard.countdown }}</span>
    </div>
    <div class="thyroid-appt-actions">
      <span class="thyroid-appt-status" data-appt-status>{{ vm.appointmentCard.status }}</span>
      <AppButton id="thyroid-appt-add-btn" @click="vm.openAppointmentDialog()">
        {{ vm.appointmentCard.addLabel }}
      </AppButton>
      <AppButton id="thyroid-appt-edit-freq-btn" @click="vm.openFrequencyDialog()">Edit frequency</AppButton>
    </div>
  </div>
</template>
