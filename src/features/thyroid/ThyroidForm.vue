<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import { useThyroid } from './useThyroid';
import type { ThyroidFieldKey } from './model';

const vm = reactive(useThyroid());

const formEl = ref<HTMLElement | null>(null);
const gridEl = ref<HTMLElement | null>(null);
const datePicker = ref<HTMLInputElement | null>(null);

const newName = ref('');
const newUnit = ref('');
const newLow = ref('');
const newHigh = ref('');

watch(() => vm.editRequestId, () => {
  formEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function inputNumber(event: Event): number | null {
  return vm.parseNumber((event.target as HTMLInputElement).value);
}

function onBuiltInUnit(key: ThyroidFieldKey, event: Event): void {
  vm.setBuiltInUnit(key, (event.target as HTMLInputElement).value);
}

function onBuiltInValue(key: ThyroidFieldKey, event: Event): void {
  vm.setBuiltInValue(key, inputNumber(event));
}

function onBuiltInLow(key: ThyroidFieldKey, event: Event): void {
  vm.setBuiltInRange(key, inputNumber(event), vm.draft.ranges[key]?.high ?? null);
}

function onBuiltInHigh(key: ThyroidFieldKey, event: Event): void {
  vm.setBuiltInRange(key, vm.draft.ranges[key]?.low ?? null, inputNumber(event));
}

function onCustomUnit(id: string, event: Event): void {
  vm.setCustomUnit(id, (event.target as HTMLInputElement).value);
}

function onCustomValue(id: string, event: Event): void {
  vm.setCustomValue(id, inputNumber(event));
}

function onCustomLow(id: string, event: Event): void {
  const entry = vm.draft.custom[id];
  vm.setCustomRange(id, inputNumber(event), entry?.range?.high ?? null);
}

function onCustomHigh(id: string, event: Event): void {
  const entry = vm.draft.custom[id];
  vm.setCustomRange(id, entry?.range?.low ?? null, inputNumber(event));
}

function addCustomTest(): void {
  vm.addCustomTest({
    name: newName.value,
    unit: newUnit.value,
    low: vm.parseNumber(newLow.value),
    high: vm.parseNumber(newHigh.value),
  });
  if (vm.addTestStatus.startsWith('Added ')) {
    newName.value = '';
    newUnit.value = '';
    newLow.value = '';
    newHigh.value = '';
  }
}

function archiveCustomTest(id: string, name: string): void {
  if (window.confirm(`Archive “${name}”? Existing results keep their values.`)) {
    vm.archiveCustomTest(id);
  }
}

function openDatePicker(): void {
  const picker = datePicker.value;
  if (!picker) return;
  if (typeof picker.showPicker === 'function') picker.showPicker();
  else picker.click();
}

function onDatePicker(event: Event): void {
  const iso = (event.target as HTMLInputElement).value;
  if (iso) vm.setDate(iso);
}

/** Moves focus within the field grid, mirroring the old keyboard navigation. */
function focusInGrid(current: HTMLInputElement, selector: string, offset: number, select = false): boolean {
  const fields = Array.from(gridEl.value?.querySelectorAll<HTMLInputElement>(selector) ?? []);
  const index = fields.indexOf(current);
  const next = index >= 0 ? fields[index + offset] : undefined;
  if (!next) return false;
  next.focus();
  if (select) next.select();
  return true;
}

/** In a text field, only leave it when the caret is already at the edge. */
function canLeaveTextInput(input: HTMLInputElement, direction: 'left' | 'right'): boolean {
  if (input.type !== 'text') return true;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start === null || end === null) return true;
  if (start !== end) return false;
  return direction === 'right' ? start === input.value.length : start === 0;
}

function onGridKeydown(event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (event.key === 'Enter' && target.dataset.valueInput) {
    event.preventDefault();
    focusInGrid(target, 'input[data-value-input="true"]', 1, true);
    return;
  }
  if (event.key === 'Enter' && target.dataset.unitKind) {
    event.preventDefault();
    focusInGrid(target, 'input[data-unit-kind]', 1);
    return;
  }
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && target.dataset.unitKind) {
    if (focusInGrid(target, 'input[data-unit-kind]', event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault();
    return;
  }
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  if (!target.dataset.navField) return;

  const direction = event.key === 'ArrowRight' ? 'right' : 'left';
  if (!canLeaveTextInput(target, direction)) return;
  if (focusInGrid(target, 'input[data-nav-field]', direction === 'right' ? 1 : -1)) event.preventDefault();
}
</script>

<template>
  <form id="thyroid-record-form" ref="formEl" class="thyroid-form" @submit.prevent="vm.submitForm()">
    <h3 id="thyroid-form-heading">{{ vm.formHeading }}</h3>

    <label>
      Test date
      <span class="thyroid-date-row">
        <input
          id="thyroid-date-input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="DD/MM/YYYY"
          :value="vm.formDateText"
          @change="vm.setDateText(($event.target as HTMLInputElement).value)"
        />
        <button type="button" class="thyroid-date-picker-btn" title="Choose a date" @click="openDatePicker">
          ▦
        </button>
        <input
          id="thyroid-date-picker"
          ref="datePicker"
          type="date"
          class="thyroid-date-picker-hidden"
          :value="vm.formDateIso"
          tabindex="-1"
          aria-hidden="true"
          @change="onDatePicker"
        />
      </span>
    </label>

    <div id="thyroid-field-grid" ref="gridEl" class="thyroid-field-grid" @keydown="onGridKeydown">
      <table class="thyroid-field-table">
        <thead>
          <tr>
            <th>Test</th>
            <th>Unit</th>
            <th>Expected Range</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in vm.fields" :key="field.key">
            <td>
              <label
                :for="`thyroid-${field.key}-input`"
                class="thyroid-marker"
                :title="`${field.fullName}\n${field.description}`"
              >{{ field.label }}</label>
            </td>
            <td>
              <input
                :id="`thyroid-unit-${field.key}`"
                class="thyroid-unit-input"
                type="text"
                :value="vm.builtInUnit(field.key)"
                :title="`Known units: ${vm.unitOptions(field.key).join(', ')}. You can type any other unit.`"
                :aria-label="`${field.label} unit`"
                data-unit-kind="builtin"
                :data-unit-key="field.key"
                data-nav-field="true"
                @change="onBuiltInUnit(field.key, $event)"
              />
            </td>
            <td>
              <div
                class="thyroid-range-inputs"
                :title="vm.builtInPlaceholder(field.key, vm.builtInUnit(field.key)).title"
              >
                <input
                  :id="`thyroid-range-${field.key}-low`"
                  class="thyroid-range-input"
                  type="number"
                  step="any"
                  inputmode="decimal"
                  data-nav-field="true"
                  :value="vm.draft.ranges[field.key]?.low ?? ''"
                  :placeholder="vm.builtInPlaceholder(field.key, vm.builtInUnit(field.key)).low"
                  :aria-label="`${field.label} expected minimum`"
                  @change="onBuiltInLow(field.key, $event)"
                />
                <span class="thyroid-range-sep">–</span>
                <input
                  :id="`thyroid-range-${field.key}-high`"
                  class="thyroid-range-input"
                  type="number"
                  step="any"
                  inputmode="decimal"
                  data-nav-field="true"
                  :value="vm.draft.ranges[field.key]?.high ?? ''"
                  :placeholder="vm.builtInPlaceholder(field.key, vm.builtInUnit(field.key)).high"
                  :aria-label="`${field.label} expected maximum`"
                  @change="onBuiltInHigh(field.key, $event)"
                />
              </div>
            </td>
            <td>
              <input
                :id="`thyroid-${field.key}-input`"
                type="number"
                :step="field.step ?? '0.01'"
                inputmode="decimal"
                placeholder="Value"
                data-value-input="true"
                data-nav-field="true"
                :value="vm.draft.values[field.key] ?? ''"
                @change="onBuiltInValue(field.key, $event)"
              />
            </td>
          </tr>

          <tr v-for="definition in vm.activeCustomTests" :key="definition.id" :data-custom-row="definition.id">
            <td>
              <span class="thyroid-custom-label">
                <label
                  :for="`thyroid-custom-${definition.id}-input`"
                  class="thyroid-marker"
                  title="Custom test — saved for future blood results"
                >{{ definition.name }}</label>
                <button
                  type="button"
                  class="ghost btn-sm thyroid-archive-btn"
                  :data-custom-archive="definition.id"
                  title="Archive this test"
                  @click="archiveCustomTest(definition.id, definition.name)"
                >×</button>
              </span>
            </td>
            <td>
              <input
                :id="`thyroid-unit-${definition.id}`"
                class="thyroid-unit-input"
                type="text"
                :value="vm.customUnit(definition)"
                title="Type the unit printed on your lab report."
                :aria-label="`${definition.name} unit`"
                data-unit-kind="custom"
                :data-unit-key="definition.id"
                data-nav-field="true"
                @change="onCustomUnit(definition.id, $event)"
              />
            </td>
            <td>
              <div
                class="thyroid-range-inputs"
                :title="vm.customPlaceholder(definition, vm.customUnit(definition)).title"
              >
                <input
                  :id="`thyroid-range-${definition.id}-low`"
                  class="thyroid-range-input"
                  type="number"
                  step="any"
                  inputmode="decimal"
                  data-nav-field="true"
                  :value="vm.draft.custom[definition.id]?.range?.low ?? ''"
                  :placeholder="vm.customPlaceholder(definition, vm.customUnit(definition)).low"
                  :aria-label="`${definition.name} expected minimum`"
                  @change="onCustomLow(definition.id, $event)"
                />
                <span class="thyroid-range-sep">–</span>
                <input
                  :id="`thyroid-range-${definition.id}-high`"
                  class="thyroid-range-input"
                  type="number"
                  step="any"
                  inputmode="decimal"
                  data-nav-field="true"
                  :value="vm.draft.custom[definition.id]?.range?.high ?? ''"
                  :placeholder="vm.customPlaceholder(definition, vm.customUnit(definition)).high"
                  :aria-label="`${definition.name} expected maximum`"
                  @change="onCustomHigh(definition.id, $event)"
                />
              </div>
            </td>
            <td>
              <input
                :id="`thyroid-custom-${definition.id}-input`"
                type="number"
                step="any"
                inputmode="decimal"
                placeholder="Value"
                data-value-input="true"
                data-nav-field="true"
                :value="vm.draft.custom[definition.id]?.value ?? ''"
                @change="onCustomValue(definition.id, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="thyroid-add-test">
      <h4>Add a custom test</h4>
      <div class="thyroid-add-test-grid">
        <label>
          Test name
          <input
            id="thyroid-new-test-name"
            v-model="newName"
            type="text"
            placeholder="e.g. Vitamin D"
            @keydown.enter.prevent="addCustomTest"
          />
        </label>
        <label>
          Unit
          <input
            id="thyroid-new-test-unit"
            v-model="newUnit"
            type="text"
            placeholder="ng/mL"
            @keydown.enter.prevent="addCustomTest"
          />
        </label>
        <label>
          Expected min
          <input
            id="thyroid-new-test-low"
            v-model="newLow"
            type="number"
            step="any"
            placeholder="Optional"
            @keydown.enter.prevent="addCustomTest"
          />
        </label>
        <label>
          Expected max
          <input
            id="thyroid-new-test-high"
            v-model="newHigh"
            type="number"
            step="any"
            placeholder="Optional"
            @keydown.enter.prevent="addCustomTest"
          />
        </label>
        <AppButton variant="primary" @click="addCustomTest">Add test</AppButton>
      </div>
      <div class="thyroid-add-test-actions">
        <span id="thyroid-add-test-status" class="status" role="status">{{ vm.addTestStatus }}</span>
      </div>
    </div>

    <p class="thyroid-footnote">
      Reference ranges are general defaults. Enter the range printed on your own lab report when it differs.
      Changing a known unit converts existing values and ranges automatically.
    </p>

    <p id="thyroid-form-status" class="status" role="status">{{ vm.formStatus }}</p>

    <AppFormActions>
      <AppButton variant="primary" type="submit">Save result</AppButton>
      <AppButton type="button" @click="vm.clearForm()">Clear</AppButton>
    </AppFormActions>
  </form>
</template>
