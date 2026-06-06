<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import MathInline from './Math.vue'
import ProtocolView from './ProtocolView.vue'
import {
  advanceRound,
  buildAnimSteps,
  buildProtocolInstance,
  createInitialState,
  DEFAULT_DIFFICULTY,
  difficultySettings,
  difficultySummary,
  DIFFICULTY_OPTIONS,
  findRoundVerifierAnimEnd,
  generateRandomBase,
  instanceDescription,
  instanceKindLabel,
  instanceTex,
  mod,
  type Difficulty,
  type SumCheckState,
} from './sumcheck'

const props = withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false,
})

const ANIM_STEP_MS = 680

const base = ref<ReturnType<typeof generateRandomBase> | null>(null)
const difficultyChoice = ref<Difficulty>(DEFAULT_DIFFICULTY)
const claimInput = ref<number | ''>('')
const state = ref<SumCheckState | null>(null)
const animStepIndex = ref(0)
const animating = ref(false)
const protocolViewKey = ref(0)
const revealedProverRound = ref(1)

const manualR = ref<number | ''>('')
const useManualR = ref(false)

let animToken = 0
let sessionToken = 0
let animTimer: ReturnType<typeof setTimeout> | null = null

const isYesInstance = computed(() => {
  if (!base.value || claimInput.value === '')
    return false
  return mod(Number(claimInput.value), base.value.field) === mod(base.value.trueSum, base.value.field)
})

const instanceKind = computed(() => isYesInstance.value ? 'yes' : 'no')

const polyTex = computed(() =>
  base.value ? instanceTex(base.value) : '',
)

const instancePolyModTex = computed(() => {
  if (!base.value)
    return ''
  return `${instanceTex(base.value)} \\pmod{${base.value.field}}`
})


const activeInstanceDesc = computed(() => {
  if (!state.value)
    return ''
  if (!state.value.honest) {
    const difficulty = state.value.difficulty ?? DEFAULT_DIFFICULTY
    if (difficultySettings(difficulty).proverStyle === 'silly') {
      return 'No instance: claimed sum differs from the true sum.'
    }
  }
  return instanceDescription(state.value)
})

function cancelAnimation() {
  animToken++
  animating.value = false
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }
}

function sleep(ms: number, token: number): Promise<boolean> {
  return new Promise((resolve) => {
    animTimer = setTimeout(() => {
      animTimer = null
      resolve(token === animToken)
    }, ms)
  })
}

async function animateToIndex(targetIndex: number) {
  if (!state.value)
    return

  const token = ++animToken
  animating.value = true

  while (animStepIndex.value < targetIndex) {
    animStepIndex.value++
    const keepGoing = await sleep(ANIM_STEP_MS, token)
    if (!keepGoing) {
      animating.value = false
      return
    }
  }

  if (token === animToken)
    animating.value = false
}

function syncProtocolState() {
  cancelAnimation()
  sessionToken++
  protocolViewKey.value++
  if (!base.value || claimInput.value === '') {
    state.value = null
    animStepIndex.value = 0
    return
  }

  const instance = buildProtocolInstance(base.value, Number(claimInput.value))
  state.value = createInitialState(instance)
  animStepIndex.value = 0
  revealedProverRound.value = 0
  manualR.value = ''
}

function regenerateInstance() {
  base.value = generateRandomBase({ difficulty: difficultyChoice.value })
  claimInput.value = base.value.trueSum
  syncProtocolState()
}

function resetProtocol() {
  syncProtocolState()
}

async function animateProverSend(roundNum: number, token: number) {
  if (!state.value || token !== sessionToken)
    return

  revealedProverRound.value = roundNum
  animating.value = true
  const anim = ++animToken
  await sleep(ANIM_STEP_MS, anim)
  if (anim === animToken)
    animating.value = false
}

async function animateVerifierRound(roundNum: number, token: number) {
  if (!state.value || token !== sessionToken)
    return

  const steps = buildAnimSteps(state.value)
  const range = findRoundVerifierAnimEnd(steps, roundNum)
  if (!range)
    return

  await animateToIndex(range.endIndex)
}

async function step() {
  if (!state.value || state.value.finished || animating.value)
    return
  if (state.value.rounds.length >= state.value.numVars)
    return

  const token = sessionToken
  const nextRound = state.value.rounds.length + 1

  await animateProverSend(nextRound, token)

  if (token !== sessionToken)
    return

  const r = useManualR.value && manualR.value !== ''
    ? mod(Number(manualR.value), state.value.field)
    : undefined
  state.value = advanceRound(state.value, r)
  manualR.value = ''

  if (token !== sessionToken)
    return

  const roundNum = state.value.rounds.at(-1)?.round
  if (!roundNum)
    return

  await animateVerifierRound(roundNum, token)

  if (token !== sessionToken || !state.value)
    return

  if (
    state.value.finished
    && !state.value.rounds.some(round => !round.checkPassed)
    && state.value.rounds.length === state.value.numVars
  ) {
    const steps = buildAnimSteps(state.value)
    await animateToIndex(steps.length - 1)
  }
}

async function runAll() {
  if (!state.value)
    return

  syncProtocolState()
  if (!state.value)
    return

  const token = sessionToken

  while (!state.value.finished) {
    if (token !== sessionToken)
      return

    const nextRound = state.value.rounds.length + 1

    await animateProverSend(nextRound, token)

    if (token !== sessionToken)
      return

    state.value = advanceRound(state.value)

    const roundNum = state.value.rounds.at(-1)?.round
    if (!roundNum)
      return

    await animateVerifierRound(roundNum, token)
  }

  if (token !== sessionToken || !state.value)
    return

  const steps = buildAnimSteps(state.value)
  if (steps.some(step => step.kind === 'oracle'))
    await animateToIndex(steps.length - 1)
}

watch(claimInput, () => {
  syncProtocolState()
})

watch(difficultyChoice, () => {
  regenerateInstance()
})

onUnmounted(() => {
  cancelAnimation()
})

regenerateInstance()
</script>

<template>
  <div class="sumcheck-sim" :class="{ compact }">
    <div class="panel controls">
      <div v-if="base" class="instance-display" :class="instanceKind">
        <div class="instance-head">
          <span class="instance-label" :title="activeInstanceDesc">
            {{ instanceKindLabel(isYesInstance) }}
          </span>
          <div class="instance-poly">
            <MathInline :tex="instancePolyModTex" />
          </div>
        </div>
      </div>

      <div class="controls-toolbar">
        <label class="inline-field">
          <span>Difficulty</span>
          <select v-model="difficultyChoice" class="field-select">
            <option
              v-for="option in DIFFICULTY_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <span class="inline-stat difficulty-hint">
          {{ difficultySummary(difficultyChoice, base?.numVars, base?.field) }}
        </span>

        <button type="button" class="btn icon-btn" title="Generate new instance" @click="regenerateInstance">
          ↻
        </button>

        <label class="inline-field">
          <span>Claim sum</span>
          <input
            v-model.number="claimInput"
            type="number"
            class="claim-input"
            min="0"
            :max="base ? base.field - 1 : undefined"
            :disabled="!base"
            :placeholder="base ? `0..${base.field - 1}` : ''"
          >
        </label>

        <span class="inline-stat">
          <span class="stat-label">True sum</span>
          <MathInline v-if="base" :tex="`\\sum f = ${base.trueSum}`" />
        </span>
      </div>
    </div>

    <div v-if="state" class="panel trace">
      <div class="panel-title">
        Sum-Check Protocol
        <span class="instance-badge" :class="instanceKind">
          {{ instanceKindLabel(state.honest) }}
        </span>
      </div>

      <div class="btn-row protocol-actions">
        <button type="button" class="btn primary" :disabled="state.finished || animating" @click="step">
          Next round
        </button>
        <button type="button" class="btn" :disabled="animating" @click="runAll">
          Run all
        </button>
        <button type="button" class="btn ghost" :disabled="animating" @click="resetProtocol">
          Reset
        </button>
      </div>

      <div class="trace-body">
        <ProtocolView
          :key="protocolViewKey"
          v-model:use-manual-r="useManualR"
          v-model:manual-r="manualR"
          :state="state"
          :poly-tex="polyTex"
          :honest="state.honest"
          :anim-step-index="animStepIndex"
          :animating="animating"
          :revealed-prover-round="revealedProverRound"
          hide-silly-prover-note
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sumcheck-sim {
  display: flex;
  flex-direction: column;
  height: 26rem;
  max-height: 26rem;
  overflow: hidden;
  gap: 0.5rem;
  font-size: 0.78rem;
  line-height: 1.25;
  text-align: left;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.panel {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  padding: 0.5rem 0.6rem;
}

.panel.controls {
  padding: 0.35rem 0.5rem;
  flex-shrink: 0;
}

.panel.trace {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.instance-display {
  border: 2px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  padding: 0.25rem 0.4rem;
}

.instance-display.yes {
  border-color: #22c55e;
}

.instance-display.no {
  border-color: #ef4444;
}

.instance-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 0;
}

.instance-label {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

.instance-display.yes .instance-label {
  color: #166534;
}

.instance-display.no .instance-label {
  color: #991b1b;
}

.instance-poly {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.controls-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.55rem;
}

.inline-field {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  white-space: nowrap;
}

.inline-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  white-space: nowrap;
}

.stat-label {
  color: #64748b;
  font-size: 0.66rem;
}

.difficulty-hint {
  color: #64748b;
  font-size: 0.66rem;
}

.compact-select,
.field-select,
.claim-input {
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.12rem 0.3rem;
  font-size: 0.72rem;
  line-height: 1.2;
}

.compact-select {
  width: 2.6rem;
}

.field-select {
  width: 4.8rem;
}

.claim-input {
  width: 3.2rem;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  font-weight: 700;
  color: #7b1fa2;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

.instance-badge {
  font-size: 0.64rem;
  font-weight: 600;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
}

.instance-badge.yes {
  background: #dcfce7;
  color: #166534;
}

.instance-badge.no {
  background: #fee2e2;
  color: #991b1b;
}

.btn {
  border: 1px solid #7b1fa2;
  border-radius: 4px;
  background: white;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 1.2;
  color: #7b1fa2;
}

.btn:hover:not(:disabled) {
  background: #f3e5f5;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: #7b1fa2;
  border-color: #7b1fa2;
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #6a1b9a;
}

.btn.ghost {
  background: transparent;
  border-color: #7b1fa2;
  color: #7b1fa2;
}

.btn.ghost:hover:not(:disabled) {
  background: #f3e5f5;
}

.btn.icon-btn {
  font-weight: 700;
  min-width: 1.6rem;
  padding-inline: 0.35rem;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.protocol-actions {
  margin-bottom: 0.4rem;
  align-items: center;
  flex-shrink: 0;
}

.trace-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.katex) {
  font-size: 0.92em;
}

.controls :deep(.katex) {
  font-size: 0.88em;
}
</style>
