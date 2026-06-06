<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import MathInline from './Math.vue'
import {
  buildAnimSteps,
  computePendingProverPoly,
  currentClaimEquationTex as buildCurrentClaimEquationTex,
  DEFAULT_DIFFICULTY,
  difficultySettings,
  evalPoly,
  honestGiCoefficients,
  honestGiPolyTex,
  honestOracleTex,
  honestRoundPolyTex,
  isAnimStepVisible,
  mod,
  proverPanelTitle,
  protocolMessageTag,
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
  animating?: boolean
  revealedProverRound: number
  hideSillyProverNote?: boolean
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
  for (let i = 0; i <= props.animStepIndex; i++) {
    const step = animSteps.value[i]
    if (step?.kind === 'check' && step.round !== undefined) {
      const round = props.state.rounds.find(r => r.round === step.round)
      if (round?.checkPassed && round.newClaim !== undefined)
        claim = `g_{${round.round}}(${round.r}) = ${round.newClaim}`
    }
  }
  return claim
})

const exchangeClaimTex = computed(() =>
  buildCurrentClaimEquationTex(
    props.state,
    animSteps.value,
    props.animStepIndex,
  ),
)

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

const proverMessageDir = 'Verifier ← Prover'

const verifierMessageDir = 'Prover ← Verifier'

function roundPolyDiffers(round: RoundState): boolean {
  const { a, b } = honestGiCoefficients(props.state, round.round - 1)
  return a !== round.a || b !== round.b
}

function pendingPolyDiffers(pending: { round: number; a: number; b: number }): boolean {
  const { a, b } = honestGiCoefficients(props.state, pending.round - 1)
  return a !== pending.a || b !== pending.b
}

function oracleDiffers(): boolean {
  return props.state.finished && props.state.finalCheck === false
}

function animClass(
  kind: AnimStepKind,
  round?: number,
  direction: 'ltr' | 'rtl' | 'fade' | 'ttb' = 'fade',
): Record<string, boolean> {
  if (!isLatest(kind, round))
    return {}
  return {
    'anim-reveal': true,
    [`anim-reveal-${direction}`]: true,
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
      <div class="exchange-claim">
        <div class="exchange-claim-label">Current claim</div>
        <MathInline :tex="exchangeClaimTex" />
      </div>

      <div v-if="showHint" class="hint">
        Click <strong>Next round</strong>: Prover sends <MathInline tex="g_i" />, then Verifier sends <MathInline tex="r_i" />.
      </div>

      <template v-for="round in state.rounds" :key="round.round">
        <div
          v-if="visible('round-start', round.round)"
          class="round-divider"
          :class="animClass('round-start', round.round, 'fade')"
        >
          Round {{ round.round }}
          <span v-if="visible('check', round.round)" class="badge" :class="round.checkPassed ? 'ok' : 'ng'">
            {{ round.checkPassed ? 'check OK' : 'check FAIL' }}
          </span>
        </div>

        <div class="msg-row to-verifier">
          <div class="msg-track">
            <div class="arrow to-verifier" aria-hidden="true">
              <span class="arrow-head">◀</span>
              <span class="arrow-line" />
            </div>
            <div class="msg-card" :class="{ 'silly-prover': proverIsSilly }">
              <div class="msg-meta">
                <span class="msg-dir">{{ proverMessageDir }}</span>
                <span class="msg-tag" :class="{ silly: proverIsSilly }">{{ protocolMessageTag('message') }}</span>
              </div>
              <div class="msg-body">
                <MathInline :tex="roundPolyTex(round)" />
              </div>
              <div v-if="!honest && roundPolyDiffers(round)" class="msg-honest-compare differs">
                <div class="compare-label">Honest prover would send</div>
                <MathInline :tex="honestRoundPolyTex(state, round)" />
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="visible('check', round.round)"
          class="verifier-check"
          :class="[round.checkPassed ? 'ok' : 'ng', animClass('check', round.round, 'ttb')]"
        >
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

        <div
          v-if="round.checkPassed && visible('challenge', round.round)"
          class="msg-row to-prover"
        >
          <div class="msg-track" :class="animClass('challenge', round.round, 'ltr')">
            <div class="msg-card">
              <div class="msg-meta">
                <span class="msg-dir">{{ verifierMessageDir }}</span>
                <span class="msg-tag">{{ protocolMessageTag('challenge') }}</span>
              </div>
              <div class="msg-body">
                <MathInline :tex="roundChallengeTex(round)" />
              </div>
            </div>
            <div class="arrow to-prover" aria-hidden="true">
              <span class="arrow-line" />
              <span class="arrow-head">▶</span>
            </div>
          </div>
        </div>
      </template>

      <div
        v-if="visiblePendingProverPoly"
        :key="`pending-${visiblePendingProverPoly.round}-${pendingRevealKey}`"
        class="msg-row to-verifier pending-prover"
      >
        <div class="msg-track anim-reveal anim-reveal-rtl">
          <div class="arrow to-verifier" aria-hidden="true">
            <span class="arrow-head">◀</span>
            <span class="arrow-line" />
          </div>
          <div class="msg-card" :class="{ 'silly-prover': proverIsSilly }">
            <div class="msg-meta">
              <span class="msg-dir">{{ proverMessageDir }}</span>
              <span class="msg-tag" :class="{ silly: proverIsSilly }">{{ protocolMessageTag('message') }}</span>
            </div>
            <div class="msg-body">
              <MathInline :tex="roundGiPolyTex(visiblePendingProverPoly.round, visiblePendingProverPoly.a, visiblePendingProverPoly.b, state.field)" />
            </div>
            <div v-if="!honest && pendingPolyDiffers(visiblePendingProverPoly)" class="msg-honest-compare differs">
              <div class="compare-label">Honest prover would send</div>
              <MathInline :tex="honestGiPolyTex(state, visiblePendingProverPoly.round)" />
            </div>
          </div>
        </div>
      </div>

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
        <div class="msg-row to-verifier">
          <div class="msg-track" :class="animClass('oracle', undefined, 'rtl')">
            <div class="arrow to-verifier" aria-hidden="true">
              <span class="arrow-head">◀</span>
              <span class="arrow-line" />
            </div>
            <div class="msg-card" :class="{ 'silly-prover': proverIsSilly }">
              <div class="msg-meta">
                <span class="msg-dir">{{ proverMessageDir }}</span>
                <span class="msg-tag" :class="{ silly: proverIsSilly }">{{ protocolMessageTag('message') }}</span>
              </div>
              <div class="msg-body">
                <MathInline :tex="finalValueTex()" />
              </div>
              <div v-if="!honest && oracleDiffers()" class="msg-honest-compare differs">
                <div class="compare-label">Honest prover would send</div>
                <MathInline :tex="honestOracleTex(state)" />
              </div>
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
  --protocol-anim-head-ms: 260ms;
  --protocol-anim-head-delay: 480ms;
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
  padding: 0.15rem 0.25rem 1rem;
  scroll-padding-bottom: 1rem;
}

.exchange-claim {
  position: sticky;
  top: 0;
  z-index: 2;
  text-align: center;
  padding: 0.35rem 0.45rem 0.45rem;
  background: linear-gradient(to bottom, #ffffff 75%, rgb(255 255 255 / 0));
  border-bottom: 1px solid #e2e8f0;
}

.exchange-claim-label {
  font-size: 0.64rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

.msg-row {
  width: 100%;
}

.msg-track {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.25rem;
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.msg-row.to-prover .msg-track {
  grid-template-columns: 1fr auto;
}

.msg-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  padding: 0.35rem 0.45rem;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.msg-row.to-verifier .msg-card {
  border-right: 3px solid #1976d2;
}

.msg-row.to-prover .msg-card {
  border-left: 3px solid #7b1fa2;
}

.msg-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  margin-bottom: 0.2rem;
}

.msg-dir {
  font-size: 0.62rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.msg-tag {
  font-size: 0.6rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}

.msg-tag.silly {
  background: linear-gradient(135deg, #dbeafe, #fce7f3);
  color: #1e40af;
  font-weight: 600;
}

.msg-card.silly-prover {
  background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 70%, #fdf4ff 100%);
  border: 1px dashed rgb(25 118 210 / 35%);
}

.msg-body {
  overflow-x: auto;
}

.msg-honest-compare {
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px dashed #cbd5e1;
  font-size: 0.68rem;
}

.msg-honest-compare.differs {
  border-top-color: #fecaca;
  background: #fef2f2;
  margin-inline: -0.45rem;
  margin-bottom: -0.35rem;
  padding: 0.35rem 0.45rem;
  border-radius: 0 0 6px 6px;
}

.compare-label {
  font-size: 0.58rem;
  font-weight: 700;
  color: #991b1b;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin-bottom: 0.15rem;
}

.arrow {
  display: flex;
  align-items: center;
  color: #64748b;
  min-width: 2.2rem;
}

.arrow.to-verifier {
  flex-direction: row;
}

.arrow.to-prover {
  flex-direction: row;
}

.arrow-line {
  flex: 1;
  height: 2px;
  background: currentcolor;
  transform-origin: right center;
}

.msg-row.to-prover .arrow-line {
  transform-origin: left center;
}

.msg-row.to-verifier .msg-track.anim-reveal-rtl .arrow-line {
  background: linear-gradient(to left, rgb(25 118 210 / 25%), #1976d2);
  background-size: 220% 100%;
  background-position: 0% 0;
  animation: arrow-grad-rtl-to-verifier var(--protocol-anim-ms) ease-out forwards;
}

.msg-row.to-prover .msg-track.anim-reveal-ltr .arrow-line {
  background: linear-gradient(to right, rgb(123 31 162 / 25%), #7b1fa2);
  background-size: 220% 100%;
  background-position: 100% 0;
  animation: arrow-grad-ltr-to-prover var(--protocol-anim-ms) ease-out forwards;
}

.msg-row.to-verifier .msg-track.anim-reveal-rtl .arrow-head {
  opacity: 0;
  animation: arrow-head-in var(--protocol-anim-head-ms) ease-out var(--protocol-anim-head-delay) forwards;
}

.msg-row.to-prover .msg-track.anim-reveal-ltr .arrow-head {
  opacity: 0;
  animation: arrow-head-in var(--protocol-anim-head-ms) ease-out var(--protocol-anim-head-delay) forwards;
}

.arrow-head {
  font-size: 0.72rem;
  line-height: 1;
}

.msg-row.to-verifier .arrow {
  color: #1976d2;
}

.msg-row.to-prover .arrow {
  color: #7b1fa2;
}

.verifier-check {
  margin: 0 1.8rem;
  padding: 0.3rem 0.45rem;
  border-radius: 6px;
  font-size: 0.68rem;
  line-height: 1.4;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  width: auto;
}

.verifier-check.ok {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.verifier-check.ng {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
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

.anim-reveal {
  animation-duration: var(--protocol-anim-ms);
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

.anim-reveal-ltr {
  clip-path: inset(0 100% 0 0 round 8px);
  animation-name: reveal-clip-ltr;
}

.anim-reveal-rtl {
  clip-path: inset(0 0 0 100% round 8px);
  animation-name: reveal-clip-rtl;
}

.msg-row.to-prover .msg-track.anim-reveal-ltr::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    transparent 0%,
    rgb(123 31 162 / 22%) 45%,
    rgb(123 31 162 / 38%) 55%,
    transparent 100%
  );
  transform: translateX(-110%);
  animation: reveal-glow-ltr var(--protocol-anim-ms) ease-out forwards;
  pointer-events: none;
  z-index: 1;
}

.msg-row.to-verifier .msg-track.anim-reveal-rtl::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to left,
    transparent 0%,
    rgb(25 118 210 / 22%) 45%,
    rgb(25 118 210 / 38%) 55%,
    transparent 100%
  );
  transform: translateX(110%);
  animation: reveal-glow-rtl var(--protocol-anim-ms) ease-out forwards;
  pointer-events: none;
  z-index: 1;
}

.anim-reveal-ttb {
  clip-path: inset(0 0 100% 0 round 6px);
  animation-name: reveal-clip-ttb;
}

.anim-reveal-ttb::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgb(71 85 105 / 14%) 45%,
    rgb(71 85 105 / 28%) 55%,
    transparent 100%
  );
  transform: translateY(-110%);
  animation: reveal-glow-ttb var(--protocol-anim-ms) ease-out forwards;
  pointer-events: none;
  z-index: 1;
}

.anim-reveal-fade {
  opacity: 0;
  animation-name: reveal-fade-in;
}

@keyframes reveal-clip-ltr {
  to {
    clip-path: inset(0 0 0 0 round 8px);
  }
}

@keyframes reveal-clip-rtl {
  to {
    clip-path: inset(0 0 0 0 round 8px);
  }
}

@keyframes reveal-clip-ttb {
  to {
    clip-path: inset(0 0 0 0 round 6px);
  }
}

@keyframes reveal-glow-ltr {
  to {
    transform: translateX(110%);
  }
}

@keyframes reveal-glow-rtl {
  to {
    transform: translateX(-110%);
  }
}

@keyframes reveal-glow-ttb {
  to {
    transform: translateY(110%);
  }
}

@keyframes reveal-fade-in {
  to {
    opacity: 1;
  }
}

@keyframes arrow-grad-rtl-to-verifier {
  to {
    background-position: 100% 0;
  }
}

@keyframes arrow-grad-ltr-to-prover {
  to {
    background-position: 0% 0;
  }
}

@keyframes arrow-head-in {
  to {
    opacity: 1;
  }
}

:deep(.katex) {
  font-size: 0.95em;
}
</style>
