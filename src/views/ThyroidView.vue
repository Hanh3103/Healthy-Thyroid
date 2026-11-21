<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import AppButton from '../shared/ui/AppButton.vue';
import AppDialog from '../shared/ui/AppDialog.vue';
import AppPanel from '../shared/ui/AppPanel.vue';
import AppSectionHeader from '../shared/ui/AppSectionHeader.vue';
import AppointmentCard from '../features/thyroid/AppointmentCard.vue';
import OcrScanner from '../features/thyroid/OcrScanner.vue';
import RecordsTable from '../features/thyroid/RecordsTable.vue';
import ThyroidDashboard from '../features/thyroid/ThyroidDashboard.vue';
import ThyroidForm from '../features/thyroid/ThyroidForm.vue';
import { useThyroid } from '../features/thyroid/useThyroid';

const vm = reactive(useThyroid());
const apptDatePicker = ref<HTMLInputElement | null>(null);
const frequencyChoices = [2, 3, 4, 6, 12];

function openAppointmentPicker(): void {
  const picker = apptDatePicker.value;
  if (!picker) return;
  if (typeof picker.showPicker === 'function') picker.showPicker();
  else picker.click();
}

onMounted(() => {
  void vm.init();
});

function saveAppointment(): void {
  vm.saveAppointment({
    date: vm.appointmentForm.date,
    time: vm.appointmentForm.time,
    note: vm.appointmentForm.note,
  });
}
</script>

<template>
  <div class="thyroid-view">
    <AppPanel aria-labelledby="thyroid-main-title">
      <AppSectionHeader title-id="thyroid-main-title">
        <template #title>Thyroid Checker</template>
        <template #meta>
          <small>Track thyroid labs, reference ranges and blood-control appointments.</small>
        </template>
      </AppSectionHeader>

      <ThyroidDashboard />
      <AppointmentCard />
      <OcrScanner />
      <ThyroidForm />
    </AppPanel>

    <AppPanel aria-labelledby="thyroid-history-title">
      <AppSectionHeader title="History" title-id="thyroid-history-title" />
      <RecordsTable />
    </AppPanel>

    <AppDialog v-model="vm.dialogs.appointment" title="Blood control appointment" class="modal">
      <div class="modal-content">
        <div class="modal-head">
          <h3>Blood control appointment</h3>
          <button type="button" class="modal-close" title="Close" @click="vm.closeAppointmentDialog()">×</button>
        </div>
        <form @submit.prevent="saveAppointment">
          <label>
            Date (DD/MM/YYYY)
            <span class="thyroid-date-row">
              <input
                id="thyroid-appt-date"
                type="text"
                inputmode="numeric"
                :value="vm.formatDate(vm.appointmentForm.date)"
                @change="vm.setAppointmentDateText(($event.target as HTMLInputElement).value)"
              />
              <button type="button" class="thyroid-date-picker-btn" title="Choose a date" @click="openAppointmentPicker">
                ▦
              </button>
              <input
                id="thyroid-appt-date-picker"
                ref="apptDatePicker"
                v-model="vm.appointmentForm.date"
                type="date"
                class="thyroid-date-picker-hidden"
                tabindex="-1"
                aria-hidden="true"
              />
            </span>
          </label>
          <p id="thyroid-appt-suggested" class="thyroid-appt-hint">
            Suggested: {{ vm.formatDate(vm.appointmentCard.targetDate) }}
          </p>
          <label>
            Time (optional)
            <input id="thyroid-appt-time" v-model="vm.appointmentForm.time" type="time" />
          </label>
          <label>
            Note (optional)
            <input id="thyroid-appt-note" v-model="vm.appointmentForm.note" type="text" />
          </label>
          <div class="modal-actions">
            <AppButton @click="vm.closeAppointmentDialog()">Cancel</AppButton>
            <AppButton id="thyroid-appt-save-btn" variant="primary" type="submit">Save appointment</AppButton>
          </div>
        </form>
      </div>
    </AppDialog>

    <AppDialog v-model="vm.dialogs.frequency" title="Blood control frequency" class="modal">
      <div class="modal-content">
        <div class="modal-head">
          <h3>Blood control frequency</h3>
          <button type="button" class="modal-close" title="Close" @click="vm.closeFrequencyDialog()">×</button>
        </div>
        <form @submit.prevent="vm.setFrequency(vm.frequencyInput)">
          <label>How often should blood control happen?</label>
          <div class="thyroid-freq-choices">
            <label v-for="choice in frequencyChoices" :key="choice" class="thyroid-choice">
              <input id="thyroid-freq-input" type="radio" name="thyroid-freq-choice" :value="choice" v-model.number="vm.frequencyInput" />
              <span>{{ choice }}× / year</span>
            </label>
          </div>
          <div class="modal-actions">
            <AppButton @click="vm.closeFrequencyDialog()">Cancel</AppButton>
            <AppButton id="thyroid-freq-save-btn" variant="primary" type="submit">Save frequency</AppButton>
          </div>
        </form>
      </div>
    </AppDialog>

    <AppDialog v-model="vm.dialogs.firstRun" title="Set up blood control" class="modal">
      <div class="modal-content">
        <div class="modal-head">
          <h3>How often do you need blood control?</h3>
        </div>
        <form @submit.prevent="vm.completeFirstRun(vm.firstRunFrequency, vm.firstRunHasAppointment)">
          <div class="thyroid-freq-choices">
            <label v-for="choice in frequencyChoices" :key="choice" class="thyroid-choice">
              <input type="radio" name="thyroid-first-run-freq" :value="choice" v-model.number="vm.firstRunFrequency" />
              <span>{{ choice }}× / year</span>
            </label>
          </div>
          <label class="thyroid-choice" style="margin-top: var(--spacing-12)">
            <input type="radio" name="thyroid-has-appt" :value="true" v-model="vm.firstRunHasAppointment" />
            <span>I already have an appointment</span>
          </label>
          <label class="thyroid-choice">
            <input type="radio" name="thyroid-has-appt" :value="false" v-model="vm.firstRunHasAppointment" />
            <span>I still need to book one</span>
          </label>
          <div class="modal-actions">
            <AppButton id="thyroid-first-run-continue" variant="primary" type="submit">Continue</AppButton>
          </div>
        </form>
      </div>
    </AppDialog>
  </div>
</template>
