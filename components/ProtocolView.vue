<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import MathInline from './Math.vue'
import {
  buildAnimSteps,
  claimAnimIndexForOracle,
  claimAnimIndexForProverPoly,
  claimAnimIndexForVerifierCheck,
  computePendingProverPoly,
  DEFAULT_DIFFICULTY,
  difficultySettings,
  evalPoly,
  isAnimStepVisible,
  mod,
  proverPanelTitle,
  roundGiPolyTex,
  type AnimStepKind,
  type RoundState,
  type SumCheckState,
} from './sumcheck'

const props = defineProps<{
  state: SumCheckState
  polyTex: string
  honest: boolean
  animStepIndex: number
  claimAnimIndex: number
  selectedClaimIndex: number | null
  animating?: boolean
  revealedProverRound: number
  hideSillyProverNote?: boolean
}>()

const emit = defineEmits<{
  selectClaimIndex: [index: number]
}>()

const useManualR = defineModel<boolean>('useManualR', { default: false })
const manualR = defineModel<number | ''>('manualR', { default: '' })

const exchangeEl = ref<HTMLElement | null>(null)
const pendingRevealKey = ref(0)

const animSteps = computed(() => buildAnimSteps(props.state))

function visible(kind: AnimStepKind, round?: number): boolean {
  return isAnimStepVisible(animSteps.value, props.animStepIndex, kind, round)
}

function isLatest(kind: AnimStepKind, round?: number): boolean {
  const latest = animSteps.value[props.animStepIndex]
  return latest?.kind === kind && latest?.round === round
}

function roundInState(roundNum: number): boolean {
  return props.state.rounds.some(r => r.round === roundNum)
}

function roundHeaderVisibleInLoop(roundNum: number): boolean {
  return roundNum <= props.revealedProverRound && roundInState(roundNum)
}

function roundPolyTex(round: RoundState): string {
  return roundGiPolyTex(round.round, round.a, round.b, props.state.field)
}

function roundCheckTex(round: RoundState): string {
  const sum = mod(round.a + round.a + round.b, props.state.field)
  return `g_{${round.round}}(0)+g_{${round.round}}(1) = ${sum}`
}

function roundChallengeTex(round: RoundState): string {
  return `r_{${round.round}} = ${round.r}`
}

function roundNewClaimTex(round: RoundState): string {
  return `g_{${round.round}}(${round.r}) = ${round.newClaim}`
}

function finalValueTex(): string {
  const args = props.state.challenges.join(', ')
  const value = evalPoly(props.state.terms, props.state.challenges, props.state.field)
  return `f(${args}) = ${value}`
}

function finalFailTex(): string {
  const args = props.state.challenges.join(', ')
  const claim = props.state.rounds.at(-1)?.newClaim
  return `f(${args}) \\neq ${claim}`
}

const challengesTex = computed(() => {
  const parts: string[] = []
  for (let i = 0; i <= props.animStepIndex; i++) {
    const step = animSteps.value[i]
    if (step?.kind !== 'challenge' || step.round === undefined)
      continue
    const round = props.state.rounds.find(r => r.round === step.round)
    if (round?.r !== undefined)
      parts.push(`r_{${round.round}}=${round.r}`)
  }
  return parts.length ? parts.join(',\\ ') : '\\text{(none yet)}'
})

const currentClaimTex = computed(() => {
  let claim = `H = ${props.state.claimedSum}`
  for (let i = 0; i <= props.claimAnimIndex; i++) {
    const step = animSteps.value[i]
    if (step?.kind === 'check' && step.round !== undefined) {
      const round = props.state.rounds.find(r => r.round === step.round)
      if (round?.checkPassed && round.newClaim !== undefined)
        claim = `g_{${round.round}}(${round.r}) = ${round.newClaim}`
    }
  }
  return claim
})

const pendingProverPoly = computed(() => computePendingProverPoly(props.state))

const visiblePendingProverPoly = computed(() => {
  const pending = pendingProverPoly.value
  if (!pending)
    return null
  if (pending.round > props.revealedProverRound)
    return null
  if (pending.round <= props.state.rounds.length)
    return null
  return pending
})

const pendingRoundHeaderVisible = computed(() => {
  const pending = visiblePendingProverPoly.value
  if (!pending)
    return false
  return pending.round <= props.revealedProverRound && !roundInState(pending.round)
})

const showHint = computed(() =>
  props.state.rounds.length === 0
  && props.revealedProverRound === 0
  && props.animStepIndex === 0,
)

const checkFailed = computed(() =>
  props.state.finished
  && props.state.rounds.some(round => !round.checkPassed),
)

const oracleFinished = computed(() =>
  props.state.finished
  && !checkFailed.value
  && props.state.rounds.length === props.state.numVars,
)

const proverNoteTex = computed(() => {
  if (props.honest)
    return 'Honest prover: each g_i(X) matches the true partial sum.'
  return props.state.proverFlair?.proverNote
    ?? 'Dishonest prover: keeps each g_i(0)+g_i(1) equal to the current claim (initial claim is wrong).'
})

const proverIsSilly = computed(() => {
  if (props.honest)
    return false
  const difficulty = props.state.difficulty ?? DEFAULT_DIFFICULTY
  return difficultySettings(difficulty).proverStyle === 'silly'
})

const showProverNote = computed(() =>
  !(props.hideSillyProverNote && proverIsSilly.value),
)

const proverRoleLabel = 'Prover'

const verifierRoleLabel = 'Verifier'

function isClaimSelected(index: number): boolean {
  return props.selectedClaimIndex === index
}

function selectClaimIndex(index: number) {
  if (props.animating)
    return
  emit('selectClaimIndex', index)
}

function selectProverClaim(roundNum: number) {
  selectClaimIndex(claimAnimIndexForProverPoly(animSteps.value, roundNum))
}

function selectVerifierClaim(roundNum: number) {
  selectClaimIndex(claimAnimIndexForVerifierCheck(animSteps.value, roundNum))
}

function selectOracleClaim() {
  selectClaimIndex(claimAnimIndexForOracle(animSteps.value))
}

function msgCardClaimClass(index: number): Record<string, boolean> {
  return {
    'msg-selectable': !props.animating,
    'claim-selected': isClaimSelected(index),
  }
}

function animClass(
  kind: AnimStepKind,
  round?: number,
  style: 'from-right' | 'from-left' | 'fade' | 'ttb' = 'fade',
): Record<string, boolean> {
  if (!isLatest(kind, round))
    return {}
  return {
    'anim-chat': true,
    [`anim-chat-${style}`]: true,
  }
}

watch(
  () => props.revealedProverRound,
  (next, prev) => {
    if (next > prev)
      pendingRevealKey.value++
  },
)

watch(
  () => props.animStepIndex,
  async () => {
    await nextTick()
    const el = exchangeEl.value
    if (!el)
      return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  },
)
</script>

<template>
  <div class="protocol-view">
    <div class="party verifier">
      <div class="party-head">Verifier</div>
      <div class="party-body">
        <div class="party-note">
          Knows target sum over <MathInline tex="\binset^n" /> and checks each
          <MathInline tex="g_i(0)+g_i(1)" />.
        </div>
        <div class="party-state">
          <div class="state-label">Current claim</div>
          <MathInline :tex="currentClaimTex" />
        </div>
        <label class="manual-r">
          <span class="manual-r-head">
            <input v-model="useManualR" type="checkbox" :disabled="animating">
            <span>Manual <MathInline tex="r_i" /></span>
          </span>
          <input
            v-model="manualR"
            type="number"
            class="r-input"
            :disabled="!useManualR || animating"
            :placeholder="`0..${state.field - 1}`"
          >
        </label>
      </div>
    </div>

    <div ref="exchangeEl" class="exchange">
      <div v-if="showHint" class="hint">
        Click <strong>Next round</strong>: Prover sends <MathInline tex="g_i" />, then Verifier sends <MathInline tex="r_i" />.
      </div>

      <template v-for="round in state.rounds" :key="round.round">
        <div
          v-if="roundHeaderVisibleInLoop(round.round)"
          class="round-divider"
        >
          Round {{ round.round }}
          <span v-if="visible('check', round.round)" class="badge" :class="round.checkPassed ? 'ok' : 'ng'">
            {{ round.checkPassed ? 'check OK' : 'check FAIL' }}
          </span>
        </div>

        <div
          v-if="visible('poly', round.round)"
          class="chat-row prover"
        >
          <div
            class="chat-bubble"
            :class="[
              { 'silly-prover': proverIsSilly },
              msgCardClaimClass(claimAnimIndexForProverPoly(animSteps, round.round)),
            ]"
            role="button"
            tabindex="0"
            title="Click to show claim at this step"
            @click="selectProverClaim(round.round)"
            @keydown.enter.prevent="selectProverClaim(round.round)"
            @keydown.space.prevent="selectProverClaim(round.round)"
          >
            <div class="chat-meta">
              <span class="chat-role">{{ proverRoleLabel }}</span>
            </div>
            <div class="chat-body">
              <MathInline :tex="roundPolyTex(round)" />
            </div>
          </div>
        </div>

        <div
          v-if="visible('check', round.round)"
          class="chat-row verifier thought-row"
        >
          <div
            class="thought-cloud"
            :class="round.checkPassed ? 'ok' : 'ng'"
          >
            <div class="thought-trail" aria-hidden="true">
              <span class="thought-dot" />
              <span class="thought-dot" />
              <span class="thought-dot" />
            </div>
            <div
              class="thought-cloud-body"
              :class="animClass('check', round.round, 'from-left')"
            >
              <div class="thought-body">
                Verifier checks
                <MathInline :tex="roundCheckTex(round)" />
                {{ round.checkPassed ? '=' : '≠' }}
                previous claim
                <MathInline :tex="`${round.previousClaim}`" />
                <template v-if="round.checkPassed">
                  and sets claim to
                  <MathInline :tex="roundNewClaimTex(round)" />
                </template>
                <template v-else>
                  and rejects.
                </template>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="round.checkPassed && visible('challenge', round.round)"
          class="chat-row verifier"
        >
          <div
            class="chat-bubble"
            :class="[
              animClass('challenge', round.round, 'from-left'),
              msgCardClaimClass(claimAnimIndexForVerifierCheck(animSteps, round.round)),
            ]"
            role="button"
            tabindex="0"
            title="Click to show claim at this step"
            @click="selectVerifierClaim(round.round)"
            @keydown.enter.prevent="selectVerifierClaim(round.round)"
            @keydown.space.prevent="selectVerifierClaim(round.round)"
          >
            <div class="chat-meta">
              <span class="chat-role">{{ verifierRoleLabel }}</span>
            </div>
            <div class="chat-body">
              <MathInline :tex="roundChallengeTex(round)" />
            </div>
          </div>
        </div>
      </template>

      <template v-if="visiblePendingProverPoly">
        <div v-if="pendingRoundHeaderVisible" class="round-divider">
          Round {{ visiblePendingProverPoly.round }}
        </div>

        <div class="chat-row prover pending-prover">
          <div
            :key="`pending-${visiblePendingProverPoly.round}-${pendingRevealKey}`"
            class="chat-bubble anim-chat anim-chat-from-right"
            :class="[
              { 'silly-prover': proverIsSilly },
              msgCardClaimClass(claimAnimIndexForProverPoly(animSteps, visiblePendingProverPoly.round)),
            ]"
            role="button"
            tabindex="0"
            title="Click to show claim at this step"
            @click="selectProverClaim(visiblePendingProverPoly.round)"
            @keydown.enter.prevent="selectProverClaim(visiblePendingProverPoly.round)"
            @keydown.space.prevent="selectProverClaim(visiblePendingProverPoly.round)"
          >
            <div class="chat-meta">
              <span class="chat-role">{{ proverRoleLabel }}</span>
            </div>
            <div class="chat-body">
              <MathInline :tex="roundGiPolyTex(visiblePendingProverPoly.round, visiblePendingProverPoly.a, visiblePendingProverPoly.b, state.field)" />
            </div>
          </div>
        </div>
      </template>

      <div
        v-if="checkFailed && visible('reject', state.rounds.at(-1)?.round)"
        class="final-block ng"
        :class="animClass('reject', state.rounds.at(-1)?.round, 'fade')"
      >
        <div class="final-text">
          Verifier rejects: check failed at round {{ state.rounds.at(-1)?.round }}.
        </div>
      </div>

      <div
        v-else-if="oracleFinished && visible('oracle')"
        class="final-block"
        :class="[state.finalCheck ? 'ok' : 'ng']"
      >
        <div class="chat-row prover">
          <div
            class="chat-bubble"
            :class="[
              animClass('oracle', undefined, 'from-right'),
              { 'silly-prover': proverIsSilly },
              msgCardClaimClass(claimAnimIndexForOracle(animSteps)),
            ]"
            role="button"
            tabindex="0"
            title="Click to show claim at this step"
            @click="selectOracleClaim()"
            @keydown.enter.prevent="selectOracleClaim()"
            @keydown.space.prevent="selectOracleClaim()"
          >
            <div class="chat-meta">
              <span class="chat-role">{{ proverRoleLabel }}</span>
            </div>
            <div class="chat-body">
              <MathInline :tex="finalValueTex()" />
            </div>
          </div>
        </div>
        <div
          v-if="visible('oracle-result')"
          class="final-text"
          :class="animClass('oracle-result', undefined, 'fade')"
        >
          <template v-if="state.finalCheck">
            Verifier accepts: oracle value matches the final claim.
          </template>
          <template v-else>
            Verifier rejects:
            <MathInline :tex="finalFailTex()" />
          </template>
        </div>
      </div>
    </div>

    <div class="party prover">
      <div class="party-head">{{ proverPanelTitle(honest) }}</div>
      <div class="party-body">
        <div v-if="showProverNote" class="party-note" :class="{ silly: proverIsSilly }">
          {{ proverNoteTex }}
        </div>
        <div class="party-state">
          <div class="state-label">Polynomial</div>
          <MathInline :tex="polyTex" />
        </div>
        <div class="party-state">
          <div class="state-label">Challenges received</div>
          <MathInline :tex="challengesTex" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.protocol-view {
  --protocol-anim-ms: 650ms;
  display: grid;
  grid-template-columns: minmax(110px, 18%) 1fr minmax(110px, 18%);
  gap: 0.55rem;
  align-items: stretch;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
}

.party {
  border: 2px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.party.prover {
  border-color: #1976d2;
}

.party.verifier {
  border-color: #7b1fa2;
}

.party-head {
  padding: 0.35rem 0.45rem;
  font-weight: 700;
  text-align: center;
  color: white;
}

.prover .party-head {
  background: #1976d2;
}

.verifier .party-head {
  background: #7b1fa2;
}

.party-body {
  padding: 0.45rem;
  display: grid;
  gap: 0.45rem;
  font-size: 0.72rem;
  min-height: 0;
  overflow-y: auto;
}

.party-note {
  color: #64748b;
  line-height: 1.35;
}

.party-note.silly {
  color: #1d4ed8;
  font-style: italic;
  background: linear-gradient(135deg, #eff6ff, #fdf4ff);
  border-radius: 6px;
  padding: 0.35rem;
}

.party-state {
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem;
  background: #f8fafc;
}

.state-label {
  font-size: 0.64rem;
  color: #64748b;
  margin-bottom: 0.15rem;
  font-weight: 600;
}

.manual-r {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.68rem;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem;
  background: #f8fafc;
}

.manual-r-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.1rem;
}

.manual-r-head span {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  line-height: 1;
}

.r-input {
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.12rem 0.3rem;
  font-size: 0.72rem;
  line-height: 1.2;
  width: 100%;
  box-sizing: border-box;
}

.r-input:disabled {
  opacity: 0.45;
}

.exchange {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.15rem 0.65rem 1.25rem;
  scroll-padding-bottom: 1rem;
}

.exchange > * {
  flex-shrink: 0;
}

.hint {
  color: #64748b;
  font-size: 0.74rem;
  text-align: center;
  padding: 0.5rem;
}

.round-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
}

.chat-row {
  display: flex;
  width: 100%;
  overflow: visible;
}

.chat-row.prover {
  justify-content: flex-end;
  padding-left: 14%;
  padding-right: 0.5rem;
}

.chat-row.verifier {
  justify-content: flex-start;
  padding-right: 14%;
  padding-left: 0.5rem;
}

.chat-bubble {
  position: relative;
  max-width: 100%;
  border-radius: 12px;
  padding: 0.4rem 0.5rem;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
  overflow: visible;
}

.chat-bubble.msg-selectable {
  cursor: pointer;
}

.chat-bubble.msg-selectable:hover {
  box-shadow: 0 2px 8px rgb(15 23 42 / 12%);
}

.chat-bubble.claim-selected {
  outline: 2px solid #f97316;
  outline-offset: 1px;
}

.chat-row.prover .chat-bubble {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.chat-row.prover .chat-bubble::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 50%;
  left: auto;
  bottom: auto;
  margin-top: -7px;
  width: 14px;
  height: 14px;
  background: #eff6ff;
  border-right: 1px solid #bfdbfe;
  border-top: 1px solid #bfdbfe;
  transform: rotate(45deg);
  border-top-right-radius: 2px;
}

.chat-row.verifier .chat-bubble {
  background: #f3e8ff;
  border: 1px solid #d8b4fe;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}

.chat-row.verifier .chat-bubble::after {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  right: auto;
  bottom: auto;
  margin-top: -7px;
  width: 14px;
  height: 14px;
  background: #f3e8ff;
  border-left: 1px solid #d8b4fe;
  border-bottom: 1px solid #d8b4fe;
  transform: rotate(45deg);
  border-bottom-left-radius: 2px;
}

.chat-meta {
  margin-bottom: 0.15rem;
}

.chat-role {
  font-size: 0.62rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.chat-row.prover .chat-role {
  color: #1d4ed8;
}

.chat-row.verifier .chat-role {
  color: #7e22ce;
}

.chat-bubble.silly-prover {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px dashed rgb(25 118 210 / 35%);
}

.chat-bubble.silly-prover::after {
  background: #dbeafe;
  border-right-color: rgb(25 118 210 / 35%);
  border-top-color: rgb(25 118 210 / 35%);
}

.chat-body {
  overflow-x: auto;
}

.chat-row.thought-row {
  padding-left: 0.85rem;
  padding-right: 12%;
}

.thought-cloud {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  max-width: 100%;
  overflow: visible;
}

.thought-cloud-body {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.45rem 0.6rem 0.5rem;
  border-radius: 1.5rem 1.85rem 1.65rem 1.55rem / 1.55rem 1.75rem 1.45rem 1.85rem;
  border: 1.5px solid transparent;
}

.thought-trail {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
  pointer-events: none;
}

.thought-trail .thought-dot {
  display: block;
  border-radius: 50%;
  border: 1.5px solid transparent;
  flex-shrink: 0;
}

.thought-trail .thought-dot:nth-child(1) {
  width: 0.62rem;
  height: 0.62rem;
}

.thought-trail .thought-dot:nth-child(2) {
  width: 0.48rem;
  height: 0.48rem;
}

.thought-trail .thought-dot:nth-child(3) {
  width: 0.34rem;
  height: 0.34rem;
}

.thought-cloud.ok .thought-cloud-body,
.thought-cloud.ok .thought-trail .thought-dot {
  background: #f0fdf4;
  border-color: #86efac;
  color: #166534;
}

.thought-cloud.ng .thought-cloud-body,
.thought-cloud.ng .thought-trail .thought-dot {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #991b1b;
}

.thought-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem;
  line-height: 1.4;
  font-size: 0.68rem;
}

.badge {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 0.08rem 0.35rem;
  border-radius: 999px;
}

.badge.ok {
  background: #dcfce7;
  color: #166534;
}

.badge.ng {
  background: #fee2e2;
  color: #991b1b;
}

.final-block {
  border-radius: 8px;
  padding: 0.35rem;
}

.final-block.ok {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.final-block.ng {
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.final-text {
  margin-top: 0.25rem;
  padding: 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.final-block.ok .final-text {
  color: #166534;
}

.final-block.ng .final-text {
  color: #991b1b;
}

.anim-chat {
  animation-duration: var(--protocol-anim-ms);
  animation-timing-function: ease-out;
  animation-fill-mode: both;
}

.anim-chat-from-right {
  animation-name: chat-in-prover;
}

.anim-chat-from-left {
  animation-name: chat-in-verifier;
}

.anim-chat-ttb {
  animation-name: chat-in-system;
}

.anim-chat-fade {
  animation-name: chat-fade-in;
}

@keyframes chat-in-prover {
  from {
    opacity: 0;
    transform: translateX(14px) scale(0.94);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes chat-in-verifier {
  from {
    opacity: 0;
    transform: translateX(-12px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes chat-in-system {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes chat-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

:deep(.katex) {
  font-size: 0.95em;
}
</style>
