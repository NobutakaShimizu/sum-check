<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import MathInline from './Math.vue'
import {
  buildProtocolInstance,
  createInitialState,
  DEFAULT_DIFFICULTY,
  difficultySettings,
  difficultySummary,
  DIFFICULTY_OPTIONS,
  evalPoly,
  generateRandomBase,
  instanceTex,
  mod,
  protocolMessageTag,
  randomWrongClaim,
  roundGiPolyTex,
  shouldAcceptProtocol,
  sillyProverTypingLabel,
  advanceRound,
  computeRoundPolynomial,
  type Difficulty,
  type SumCheckState,
} from './sumcheck'

type ChatMessage = {
  id: number
  role: 'prover' | 'verifier'
  tag: string
  tex: string
}

type Phase = 'await_challenge' | 'judgment' | 'done'

const state = ref<SumCheckState | null>(null)
const messages = ref<ChatMessage[]>([])
const phase = ref<Phase>('await_challenge')
const challengeInput = ref<number | ''>('')
const verdict = ref<'correct' | 'wrong' | null>(null)
const nextMessageId = ref(0)
const typingProver = ref(false)
const typingLabel = ref('Prover is cooking')
const difficultyChoice = ref<Difficulty>(DEFAULT_DIFFICULTY)

const chatEl = ref<HTMLElement | null>(null)

let proverAnimToken = 0

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

const instancePolyTex = computed(() =>
  state.value ? `${instanceTex(state.value)} \\pmod{${state.value.field}}` : '',
)

const claimedTex = computed(() =>
  state.value ? `H = ${state.value.claimedSum}` : '',
)

const canTypeChallenge = computed(() =>
  phase.value === 'await_challenge'
  && state.value
  && !state.value.finished
  && !typingProver.value,
)

const canSend = computed(() =>
  canTypeChallenge.value
  && challengeInput.value !== '',
)

const proverIsSilly = computed(() =>
  difficultySettings(difficultyChoice.value).proverStyle === 'silly',
)

function pushMessage(role: ChatMessage['role'], tag: string, tex: string) {
  messages.value.push({
    id: nextMessageId.value++,
    role,
    tag,
    tex,
  })
}

async function pushProverMessage(tag: string, tex: string) {
  const token = ++proverAnimToken
  const typingMs = 560 + Math.floor(Math.random() * 480)
  typingProver.value = true
  typingLabel.value = sillyProverTypingLabel(difficultyChoice.value)
  await scrollChat()
  await delay(typingMs)
  if (token !== proverAnimToken)
    return
  pushMessage('prover', tag, tex)
  typingProver.value = false
  await scrollChat()
}

async function scrollChat() {
  await nextTick()
  const el = chatEl.value
  if (el)
    el.scrollTop = el.scrollHeight
}

function appendProverPolynomial(roundIndex: number) {
  if (!state.value)
    return Promise.resolve()
  const { a, b } = computeRoundPolynomial(state.value, roundIndex)
  return pushProverMessage(
    protocolMessageTag('message'),
    roundGiPolyTex(roundIndex + 1, a, b, state.value.field),
  )
}

function appendOracleMessage() {
  if (!state.value)
    return Promise.resolve()
  const args = state.value.challenges.join(', ')
  const value = evalPoly(state.value.terms, state.value.challenges, state.value.field)
  return pushProverMessage(
    protocolMessageTag('message'),
    `f(${args}) = ${value}`,
  )
}

function startExercise() {
  proverAnimToken++
  typingProver.value = false
  verdict.value = null
  challengeInput.value = ''
  messages.value = []
  nextMessageId.value = 0

  const base = generateRandomBase({ difficulty: difficultyChoice.value })
  const claimedSum = randomWrongClaim(base)
  const instance = buildProtocolInstance(base, claimedSum)
  state.value = createInitialState(instance)
  phase.value = 'await_challenge'

  void bootstrapExercise()
}

async function bootstrapExercise() {
  if (!state.value)
    return

  await pushProverMessage(
    protocolMessageTag('claim'),
    `\\sum_{b \\in \\binset^n} f(b) = H = ${state.value.claimedSum}`,
  )
  await appendProverPolynomial(0)
}

function sendChallenge() {
  if (!canSend.value || !state.value)
    return

  const r = mod(Number(challengeInput.value), state.value.field)
  const roundNum = state.value.rounds.length + 1
  pushMessage('verifier', protocolMessageTag('challenge'), `r_{${roundNum}} = ${r}`)

  state.value = advanceRound(state.value, r)
  challengeInput.value = ''
  verdict.value = null
  void scrollChat()

  const lastRound = state.value.rounds.at(-1)
  if (!lastRound?.checkPassed) {
    phase.value = 'done'
    return
  }

  if (state.value.finished) {
    phase.value = 'judgment'
    void appendOracleMessage()
    return
  }

  phase.value = 'await_challenge'
  void appendProverPolynomial(state.value.rounds.length)
}

function judge(accepted: boolean) {
  if (!state.value)
    return

  const shouldAccept = shouldAcceptProtocol(state.value)
  verdict.value = accepted === shouldAccept ? 'correct' : 'wrong'
}

startExercise()

watch(difficultyChoice, () => {
  startExercise()
})
</script>

<template>
  <div v-if="state" class="sumcheck-exercise">
    <div class="exercise-header">
      <div class="meta-row">
        <div class="meta-card">
          <div class="meta-label">Instance</div>
          <MathInline :tex="instancePolyTex" />
        </div>
        <label class="meta-card compact field-picker">
          <div class="meta-label">Difficulty</div>
          <select v-model="difficultyChoice" class="field-select">
            <option
              v-for="option in DIFFICULTY_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <div class="difficulty-hint">{{ difficultySummary(difficultyChoice) }}</div>
        </label>
        <div class="meta-card compact">
          <div class="meta-label">Claimed value</div>
          <MathInline :tex="claimedTex" />
        </div>
      </div>
      <button type="button" class="btn icon-btn" title="New random instance" @click="startExercise">
        ↻
      </button>
    </div>

    <div ref="chatEl" class="chat-log">
      <TransitionGroup name="chat" tag="div" class="chat-messages">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="chat-row"
          :class="msg.role"
        >
          <div class="chat-bubble" :class="{ 'prover-bubble': msg.role === 'prover' }">
            <div class="chat-meta">
              <span class="chat-role">{{ msg.role === 'prover' ? 'Prover' : 'Verifier' }}</span>
              <span class="chat-tag" :class="{ silly: msg.role === 'prover' && proverIsSilly }">{{ msg.tag }}</span>
            </div>
            <div class="chat-body">
              <MathInline :tex="msg.tex" />
            </div>
          </div>
        </div>
      </TransitionGroup>

      <div v-if="typingProver" class="chat-row prover typing-row">
        <div class="chat-bubble typing-bubble">
          <span class="typing-label">{{ typingLabel }}</span>
          <span class="typing-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
        </div>
      </div>
    </div>

    <div v-if="verdict" class="verdict" :class="verdict">
      <template v-if="verdict === 'correct'">
        Correct!
      </template>
      <template v-else>
        Wrong...
        <span class="verdict-detail">
          (True sum: <MathInline :tex="`\\sum_{b \\in \\binset^n} f(b) = ${state.trueSum}`" />)
        </span>
      </template>
    </div>

    <div class="exercise-actions">
      <label class="challenge-field">
        <span>Send to Prover</span>
        <input
          v-model.number="challengeInput"
          type="number"
          class="challenge-input"
          min="0"
          :max="state.field - 1"
          :disabled="!canTypeChallenge"
          :placeholder="`0..${state.field - 1}`"
        >
      </label>
      <button type="button" class="btn primary" :disabled="!canSend" @click="sendChallenge">
        Send
      </button>
      <button type="button" class="btn accept" @click="judge(true)">
        Accept
      </button>
      <button type="button" class="btn reject" @click="judge(false)">
        Reject
      </button>
    </div>
  </div>
</template>

<style scoped>
.sumcheck-exercise {
  display: flex;
  flex-direction: column;
  height: 26rem;
  max-height: 26rem;
  gap: 0.45rem;
  font-size: 0.78rem;
  line-height: 1.25;
  text-align: left;
}

.exercise-header {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  flex-shrink: 0;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
}

.meta-card {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  padding: 0.35rem 0.45rem;
  min-width: 0;
}

.meta-card.compact {
  flex-shrink: 0;
}

.field-picker {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.field-select {
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.12rem 0.3rem;
  font-size: 0.72rem;
  background: white;
  min-width: 4.5rem;
}

.difficulty-hint {
  font-size: 0.58rem;
  color: #64748b;
  line-height: 1.2;
}

.meta-label {
  font-size: 0.62rem;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 0.15rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.chat-log {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  padding: 0.45rem;
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.chat-log > * {
  flex-shrink: 0;
}

.chat-row {
  display: flex;
}

.chat-row.prover {
  justify-content: flex-end;
}

.chat-row.verifier {
  justify-content: flex-start;
}

.chat-bubble {
  max-width: 88%;
  border-radius: 10px;
  padding: 0.4rem 0.5rem;
  background: white;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.chat-row.prover .chat-bubble {
  border-right: 3px solid #1976d2;
}

.chat-row.prover .prover-bubble {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 55%, #fdf4ff 100%);
  box-shadow:
    0 2px 8px rgb(25 118 210 / 14%),
    0 0 0 1px rgb(25 118 210 / 8%);
}

.chat-row.prover .prover-bubble::after {
  content: '';
  position: absolute;
  inset: -40% -20%;
  background: linear-gradient(
    120deg,
    transparent 30%,
    rgb(255 255 255 / 75%) 50%,
    transparent 70%
  );
  transform: translateX(-120%) rotate(8deg);
  animation: prover-shimmer 0.9s ease-out 0.12s forwards;
  pointer-events: none;
}

.chat-row.verifier .chat-bubble {
  border-left: 3px solid #7b1fa2;
}

.chat-row.prover-enter-active {
  animation: prover-funky-in 0.78s cubic-bezier(0.22, 1.28, 0.36, 1) forwards;
}

.chat-row.prover-enter-from {
  opacity: 0;
}

.chat-row.verifier-enter-active {
  animation: verifier-slide-in 0.34s ease-out forwards;
}

.chat-row.verifier-enter-from {
  opacity: 0;
}

.typing-row {
  animation: typing-pop 0.42s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
}

.typing-bubble {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-right: 3px solid #1976d2;
  background: linear-gradient(135deg, #dbeafe, #fce7f3, #e0e7ff);
  background-size: 200% 200%;
  animation:
    typing-wobble 0.62s ease-in-out infinite,
    typing-gradient 2.4s ease infinite;
}

.typing-label {
  font-size: 0.62rem;
  font-weight: 700;
  color: #1d4ed8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
}

.typing-dots span {
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 999px;
  background: #1976d2;
  animation: typing-dot 0.9s ease-in-out infinite;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes prover-funky-in {
  0% {
    opacity: 0;
    transform: translateX(95%) scale(0.45) rotate(7deg);
    filter: hue-rotate(45deg) blur(3px);
  }

  58% {
    opacity: 1;
    transform: translateX(-6%) scale(1.06) rotate(-2deg);
    filter: hue-rotate(0deg) blur(0);
  }

  78% {
    transform: translateX(3%) scale(0.98) rotate(1deg);
  }

  100% {
    opacity: 1;
    transform: translateX(0) scale(1) rotate(0);
    filter: none;
  }
}

@keyframes prover-shimmer {
  to {
    transform: translateX(120%) rotate(8deg);
  }
}

@keyframes verifier-slide-in {
  from {
    opacity: 0;
    transform: translateX(-24%);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes typing-pop {
  from {
    opacity: 0;
    transform: translateX(40%) scale(0.7);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes typing-wobble {
  0%,
  100% {
    transform: rotate(-1.2deg) scale(1);
  }

  50% {
    transform: rotate(1.2deg) scale(1.03);
  }
}

@keyframes typing-gradient {
  0%,
  100% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }
}

@keyframes typing-dot {
  0%,
  80%,
  100% {
    transform: translateY(0) scale(1);
    opacity: 0.45;
  }

  40% {
    transform: translateY(-0.18rem) scale(1.15);
    opacity: 1;
  }
}

.chat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  margin-bottom: 0.15rem;
}

.chat-role {
  font-size: 0.62rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
}

.chat-tag {
  font-size: 0.58rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}

.chat-tag.silly {
  background: linear-gradient(135deg, #dbeafe, #fce7f3);
  color: #1e40af;
  font-weight: 600;
}

.chat-body {
  overflow-x: auto;
}

.verdict {
  flex-shrink: 0;
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
  padding: 0.35rem;
  border-radius: 8px;
}

.verdict.correct {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.verdict.wrong {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.verdict-detail {
  display: inline-block;
  margin-left: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
}

.exercise-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.challenge-field {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  flex: 1 1 8rem;
  min-width: 0;
}

.challenge-input {
  flex: 1 1 4rem;
  min-width: 0;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.72rem;
}

.challenge-input:disabled {
  opacity: 0.45;
}

.btn {
  border: 1px solid #7b1fa2;
  border-radius: 4px;
  background: white;
  padding: 0.2rem 0.55rem;
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

.btn.accept {
  border-color: #16a34a;
  color: #16a34a;
}

.btn.accept:hover:not(:disabled) {
  background: #f0fdf4;
}

.btn.reject {
  border-color: #dc2626;
  color: #dc2626;
}

.btn.reject:hover:not(:disabled) {
  background: #fef2f2;
}

.btn.icon-btn {
  font-weight: 700;
  min-width: 1.8rem;
  padding-inline: 0.4rem;
  flex-shrink: 0;
}

:deep(.katex) {
  font-size: 0.92em;
}
</style>
