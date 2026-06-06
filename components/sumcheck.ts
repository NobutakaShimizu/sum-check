export type Term = {
  coeff: number
  /** variable indices (0-based); each index appears at most once (multilinear) */
  vars: number[]
}

export type CheatMode = 'wrong_claim' | 'wrong_polynomial'

export type ProverFlair = {
  proverNote: string
}

export type ProtocolInstance = {
  numVars: number
  field: number
  terms: Term[]
  trueSum: number
  claimedSum: number
  honest: boolean
  cheatMode?: CheatMode
  /** 0-based round index for wrong_polynomial */
  cheatRound?: number
  proverFlair?: ProverFlair
  difficulty?: Difficulty
  multilinear?: boolean
}

export type RoundState = {
  round: number
  a: number
  b: number
  checkPassed: boolean
  previousClaim: number
  r?: number
  newClaim?: number
}

export type SumCheckState = ProtocolInstance & {
  challenges: number[]
  rounds: RoundState[]
  finished: boolean
  finalCheck?: boolean
}

export const VARIABLE_NAMES = ['x', 'y', 'z', 'w', 'u', 'v'] as const

const FIELD_PRIMES = [5, 7, 11, 13, 17, 19] as const

export { FIELD_PRIMES }

export const DEFAULT_FIELD = FIELD_PRIMES[0]

export type Difficulty = 'easy' | 'medium' | 'hard'

export type DifficultySettings = {
  field: number
  numVars: number
  minTerms: number
  maxTermsExtra: number
  /** Per-variable inclusion probability when sampling multilinear terms */
  termVarProb: number
  earlySlipProb: number
  proverStyle: 'silly' | 'sharp'
}

export const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
] as const satisfies readonly { value: Difficulty; label: string }[]

export const DEFAULT_DIFFICULTY: Difficulty = 'easy'

export function difficultySettings(difficulty: Difficulty): DifficultySettings {
  switch (difficulty) {
    case 'easy':
      return {
        field: 5,
        numVars: 2,
        minTerms: 2,
        maxTermsExtra: 1,
        termVarProb: 0.45,
        earlySlipProb: 0.35,
        proverStyle: 'silly',
      }
    case 'medium':
      return {
        field: 11,
        numVars: 3,
        minTerms: 2,
        maxTermsExtra: 2,
        termVarProb: 0.5,
        earlySlipProb: 0.12,
        proverStyle: 'silly',
      }
    case 'hard':
      return {
        field: 19,
        numVars: 4,
        minTerms: 3,
        maxTermsExtra: 3,
        termVarProb: 0.55,
        earlySlipProb: 0,
        proverStyle: 'sharp',
      }
  }
}

export function isMultilinearTerm(term: Term): boolean {
  const seen = new Set<number>()
  for (const v of term.vars) {
    if (seen.has(v))
      return false
    seen.add(v)
  }
  return true
}

export function isMultilinearInstance(terms: Term[]): boolean {
  return terms.every(isMultilinearTerm)
}

export function termDegree(term: Term): number {
  return term.vars.length
}

export function difficultySummary(difficulty: Difficulty, honest = false): string {
  const settings = difficultySettings(difficulty)
  if (honest)
    return `p = ${settings.field}, ${settings.numVars} vars, multilinear, honest prover`
  const prover = settings.proverStyle === 'sharp' ? 'sharp prover' : 'silly prover'
  return `p = ${settings.field}, ${settings.numVars} vars, multilinear, ${prover}`
}

export function proverPanelTitle(honest: boolean): string {
  return honest ? 'Honest Prover' : 'Prover'
}

export function mod(n: number, field: number): number {
  return ((n % field) + field) % field
}

export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2)
    return false
  if (n === 2)
    return true
  if (n % 2 === 0)
    return false
  for (let d = 3; d * d <= n; d += 2) {
    if (n % d === 0)
      return false
  }
  return true
}

export function formatTerm(term: Term, field: number): string {
  const c = mod(term.coeff, field)
  if (term.vars.length === 0)
    return String(c)

  const varPart = formatVarPart(term)

  if (c === 1)
    return varPart
  return `${c}${varPart}`
}

function formatVarPart(term: Term): string {
  if (term.vars.length === 0)
    return ''

  const counts = new Map<number, number>()
  for (const v of term.vars)
    counts.set(v, (counts.get(v) ?? 0) + 1)

  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map((v) => {
      const name = VARIABLE_NAMES[v] ?? `x_{${v + 1}}`
      const exp = counts.get(v)!
      return exp === 1 ? name : `${name}^{${exp}}`
    })
    .join('')
}

export function formatPoly(terms: Term[], field: number): string {
  if (terms.length === 0)
    return '0'

  const parts: string[] = []

  for (const t of terms) {
    const c = mod(t.coeff, field)
    if (c === 0)
      continue

    const termStr = formatTerm({ ...t, coeff: c }, field)
    parts.push(parts.length === 0 ? termStr : ` + ${termStr}`)
  }

  return parts.length === 0 ? '0' : parts.join('')
}

export function instanceTex(instance: Pick<ProtocolInstance, 'numVars' | 'field' | 'terms'>): string {
  const vars = Array.from(
    { length: instance.numVars },
    (_, i) => VARIABLE_NAMES[i] ?? `x_{${i + 1}}`,
  )
  const poly = formatPoly(instance.terms, instance.field)
  return `f(${vars.join(',')}) = ${poly}`
}

function evalTerm(term: Term, assignment: number[], field: number): number {
  let val = mod(term.coeff, field)
  for (const v of term.vars)
    val = mod(val * assignment[v], field)
  return val
}

export function evalPoly(terms: Term[], assignment: number[], field: number): number {
  return terms.reduce((sum, term) => mod(sum + evalTerm(term, assignment, field), field), 0)
}

export function partialSum(
  terms: Term[],
  fixed: number[],
  numVars: number,
  field: number,
): number {
  const k = fixed.length
  const remaining = numVars - k
  let total = 0

  for (let mask = 0; mask < 1 << remaining; mask++) {
    const assign = [...fixed]
    for (let j = 0; j < remaining; j++)
      assign[k + j] = (mask >> j) & 1
    total = mod(total + evalPoly(terms, assign, field), field)
  }

  return total
}

export function computeClaimedSum(terms: Term[], numVars: number, field: number): number {
  return partialSum(terms, [], numVars, field)
}

export function computeGiEndpoints(
  terms: Term[],
  challenges: number[],
  round: number,
  numVars: number,
  field: number,
): { g0: number; g1: number } {
  const prefix = [...challenges.slice(0, round)]
  const g0 = partialSum(terms, [...prefix, 0], numVars, field)
  const g1 = partialSum(terms, [...prefix, 1], numVars, field)
  return { g0, g1 }
}

export function evalGi(g0: number, g1: number, r: number, field: number): number {
  const b = mod(g1 - g0, field)
  return mod(g0 + mod(b * r, field), field)
}

/** Dishonest linear g(X)=a+bX with g(0)+g(1)=previousClaim (passes sum check). */
export function dishonestGiCoefficients(
  trueG0: number,
  previousClaim: number,
  field: number,
): { a: number; b: number } {
  const a = mod(trueG0, field)
  const b = mod(previousClaim - mod(2 * a, field), field)
  return { a, b }
}

/** Linear g with g(0)+g(1) ≠ previousClaim — sum check fails. */
export function botchedGiCoefficients(
  trueG0: number,
  previousClaim: number,
  field: number,
): { a: number; b: number } {
  const { a, b } = dishonestGiCoefficients(trueG0, previousClaim, field)
  const t = randomNonzero(field)
  return { a: mod(a + t, field), b }
}

const SILLY_PROVER_NOTES = [
  'Silly prover: tries to pass every sum check… except when it doesn\'t.',
  'Silly prover: mostly sneaky, occasionally clumsy.',
  'Silly prover: wrong claim, but usually keeps g_i(0)+g_i(1) in line.',
] as const

const SILLY_SLIP_PROVER_NOTES = [
  'Silly prover: mostly sneaky — but one round will fail the sum check.',
  'Silly prover: watch for a polynomial you can reject early.',
  'Silly prover: one g_i is deliberately botched. Can you catch it?',
] as const

const SILLY_TYPING_LABELS = [
  'Prover is cooking',
  'Prover is scheming',
  'Prover is typing…',
  'Prover is doing math',
  'Prover is improvising',
] as const

const SHARP_PROVER_NOTES = [
  'Sharp prover: passes every sum check — only the oracle reveals the lie.',
  'Sharp prover: no slips; you must verify the final evaluation.',
  'Sharp prover: each g_i(0)+g_i(1) matches the claim until the end.',
] as const

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function sillyProverTypingLabel(difficulty: Difficulty = DEFAULT_DIFFICULTY): string {
  if (difficultySettings(difficulty).proverStyle === 'sharp')
    return 'Prover is computing'
  return pickRandom(SILLY_TYPING_LABELS)
}

function buildProverFlair(instance: ProtocolInstance, difficulty: Difficulty): ProverFlair {
  const settings = difficultySettings(difficulty)
  if (settings.proverStyle === 'sharp') {
    return { proverNote: pickRandom(SHARP_PROVER_NOTES) }
  }

  return {
    proverNote: pickRandom(
      instance.cheatMode === 'wrong_polynomial'
        ? SILLY_SLIP_PROVER_NOTES
        : SILLY_PROVER_NOTES,
    ),
  }
}

export function assignProverStrategy(
  instance: ProtocolInstance,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): ProtocolInstance {
  if (instance.honest)
    return instance

  const settings = difficultySettings(difficulty)
  let next: ProtocolInstance = {
    ...instance,
    cheatMode: 'wrong_claim',
    cheatRound: undefined,
  }

  if (Math.random() < settings.earlySlipProb) {
    next = {
      ...next,
      cheatMode: 'wrong_polynomial',
      cheatRound: Math.floor(Math.random() * instance.numVars),
    }
  }

  return {
    ...next,
    proverFlair: buildProverFlair(next, difficulty),
  }
}

/** @deprecated use assignProverStrategy */
export function assignSillyProverStrategy(instance: ProtocolInstance): ProtocolInstance {
  return assignProverStrategy(instance, 'easy')
}

export type ProtocolMessageKind = 'claim' | 'message' | 'challenge'

export function protocolMessageTag(kind: ProtocolMessageKind): string {
  switch (kind) {
    case 'claim':
      return 'Claim'
    case 'challenge':
      return 'Challenge'
    case 'message':
      return 'Message'
  }
}

/** @deprecated use protocolMessageTag */
export function proverMessageTag(
  _state: unknown,
  kind: 'claim' | 'poly' | 'oracle',
): string {
  if (kind === 'claim')
    return protocolMessageTag('claim')
  return protocolMessageTag('message')
}

export function randomFieldElement(field: number): number {
  return Math.floor(Math.random() * field)
}

export function randomWrongClaim(base: Pick<ProtocolInstance, 'trueSum' | 'field'>): number {
  let claimed = randomFieldElement(base.field)
  while (mod(claimed, base.field) === mod(base.trueSum, base.field))
    claimed = randomFieldElement(base.field)
  return claimed
}

function randomNonzero(field: number): number {
  let value = randomFieldElement(field)
  while (value === 0)
    value = randomFieldElement(field)
  return value
}

function randomFieldSize(): number {
  return FIELD_PRIMES[Math.floor(Math.random() * FIELD_PRIMES.length)]
}

function normalizeField(field?: number): number {
  if (field !== undefined && isPrime(field) && field >= 5 && field <= 19)
    return field
  return randomFieldSize()
}

function monomialKey(vars: number[]): string {
  return vars.join(',')
}

function randomTermVars(numVars: number, termVarProb: number): number[] {
  const vars: number[] = []
  for (let v = 0; v < numVars; v++) {
    if (Math.random() < termVarProb)
      vars.push(v)
  }
  return vars
}

function randomPolyTerms(numVars: number, field: number, settings: DifficultySettings): Term[] {
  const termCount = settings.minTerms + Math.floor(Math.random() * (settings.maxTermsExtra + 1))
  const seen = new Set<string>()
  const terms: Term[] = []

  while (terms.length < termCount) {
    const vars = randomTermVars(numVars, settings.termVarProb)
    const key = monomialKey(vars)
    if (seen.has(key))
      continue
    seen.add(key)
    terms.push({
      coeff: randomNonzero(field),
      vars,
    })
  }

  return terms
}

export function generateRandomBase(options?: {
  field?: number
  numVars?: number
  difficulty?: Difficulty
}): Omit<ProtocolInstance, 'claimedSum' | 'honest' | 'cheatMode' | 'cheatRound' | 'proverFlair'> {
  const difficulty = options?.difficulty ?? DEFAULT_DIFFICULTY
  const preset = difficultySettings(difficulty)
  const field = normalizeField(options?.field ?? preset.field)
  const numVars = options?.numVars ?? preset.numVars
  const terms = randomPolyTerms(numVars, field, preset)
  const trueSum = computeClaimedSum(terms, numVars, field)

  return {
    numVars,
    field,
    terms,
    trueSum,
    difficulty,
    multilinear: true,
  }
}

export function buildProtocolInstance(
  base: ReturnType<typeof generateRandomBase>,
  claimedSum: number,
  options?: { sillyProver?: boolean },
): ProtocolInstance {
  const claimed = mod(claimedSum, base.field)
  const honest = claimed === mod(base.trueSum, base.field)

  if (honest) {
    return {
      ...base,
      claimedSum: claimed,
      honest: true,
      cheatMode: undefined,
      cheatRound: undefined,
      proverFlair: undefined,
    }
  }

  let instance: ProtocolInstance = {
    ...base,
    claimedSum: claimed,
    honest: false,
    cheatMode: 'wrong_claim',
  }

  if (options?.sillyProver !== false) {
    instance = assignProverStrategy(
      instance,
      instance.difficulty ?? DEFAULT_DIFFICULTY,
    )
  }

  return instance
}

export function createInitialState(instance: ProtocolInstance): SumCheckState {
  return {
    ...instance,
    challenges: [],
    rounds: [],
    finished: false,
  }
}

export type AnimStepKind =
  | 'claim'
  | 'round-start'
  | 'poly'
  | 'check'
  | 'challenge'
  | 'reject'
  | 'oracle'
  | 'oracle-result'

export type AnimStep = {
  kind: AnimStepKind
  round?: number
}

export function buildAnimSteps(state: SumCheckState): AnimStep[] {
  const steps: AnimStep[] = [{ kind: 'claim' }]
  const checkFailed = state.finished && state.rounds.some(r => !r.checkPassed)

  for (const round of state.rounds) {
    steps.push({ kind: 'round-start', round: round.round })
    steps.push({ kind: 'poly', round: round.round })
    steps.push({ kind: 'check', round: round.round })
    if (round.checkPassed)
      steps.push({ kind: 'challenge', round: round.round })
    else {
      steps.push({ kind: 'reject', round: round.round })
      return steps
    }
  }

  if (state.finished && !checkFailed && state.rounds.length === state.numVars) {
    steps.push({ kind: 'oracle' })
    steps.push({ kind: 'oracle-result' })
  }

  return steps
}

export function isAnimStepVisible(
  steps: AnimStep[],
  animIndex: number,
  kind: AnimStepKind,
  round?: number,
): boolean {
  const stepIdx = steps.findIndex(
    s => s.kind === kind && (round === undefined || s.round === round),
  )
  return stepIdx >= 0 && animIndex >= stepIdx
}

export function honestGiCoefficients(
  state: SumCheckState,
  roundIndex: number,
): { a: number; b: number } {
  const { g0, g1 } = computeGiEndpoints(
    state.terms,
    state.challenges.slice(0, roundIndex),
    roundIndex,
    state.numVars,
    state.field,
  )
  return { a: g0, b: mod(g1 - g0, state.field) }
}

export function honestClaimTex(state: SumCheckState): string {
  return `\\sum_{b \\in \\binset^n} f(b) = H = ${state.trueSum}`
}

export function roundGiPolyTex(round: number, a: number, b: number, field: number): string {
  return `g_{${round}}(X) = ${a} + ${b}X \\pmod{${field}}`
}

export function honestRoundPolyTex(state: SumCheckState, round: RoundState): string {
  const { a, b } = honestGiCoefficients(state, round.round - 1)
  return roundGiPolyTex(round.round, a, b, state.field)
}

export function honestOracleTex(state: SumCheckState): string {
  const args = state.challenges.join(', ')
  const value = evalPoly(state.terms, state.challenges, state.field)
  return `f(${args}) = ${value}`
}

export type HonestProverMessage = {
  tag: 'Claim' | 'Message'
  tex: string
  differs: boolean
}

export function latestHonestProverMessage(
  state: SumCheckState,
  steps: AnimStep[],
  animIndex: number,
): HonestProverMessage | null {
  let latest: AnimStep | null = null
  for (let i = 0; i <= animIndex; i++) {
    const step = steps[i]
    if (step.kind === 'claim' || step.kind === 'poly' || step.kind === 'oracle')
      latest = step
  }
  if (!latest)
    return null

  if (latest.kind === 'claim') {
    return {
      tag: 'Claim',
      tex: honestClaimTex(state),
      differs: mod(state.claimedSum, state.field) !== mod(state.trueSum, state.field),
    }
  }

  if (latest.kind === 'poly' && latest.round !== undefined) {
    const round = state.rounds.find(r => r.round === latest!.round)
    if (!round)
      return null
    const { a, b } = honestGiCoefficients(state, round.round - 1)
    return {
      tag: 'Message',
      tex: honestRoundPolyTex(state, round),
      differs: a !== round.a || b !== round.b,
    }
  }

  if (latest.kind === 'oracle') {
    return {
      tag: 'Message',
      tex: honestOracleTex(state),
      differs: false,
    }
  }

  return null
}

export function computeRoundPolynomial(
  state: SumCheckState,
  roundIndex: number,
): { a: number; b: number; previousClaim: number } {
  const previousClaim = roundIndex === 0
    ? state.claimedSum
    : state.rounds[roundIndex - 1].newClaim!

  const { g0, g1 } = computeGiEndpoints(
    state.terms,
    state.challenges,
    roundIndex,
    state.numVars,
    state.field,
  )

  let a = g0
  let b = mod(g1 - g0, state.field)

  if (
    !state.honest
    && state.cheatMode === 'wrong_polynomial'
    && state.cheatRound === roundIndex
  ) {
    ({ a, b } = botchedGiCoefficients(g0, previousClaim, state.field))
  }
  else if (!state.honest && state.cheatMode === 'wrong_claim') {
    ({ a, b } = dishonestGiCoefficients(a, previousClaim, state.field))
  }

  return { a, b, previousClaim }
}

export function shouldAcceptProtocol(state: SumCheckState): boolean {
  if (!state.finished)
    return false
  if (state.rounds.some(round => !round.checkPassed))
    return false
  return state.finalCheck === true
}

export function advanceRound(
  state: SumCheckState,
  r?: number,
): SumCheckState {
  if (state.finished)
    return state

  const round = state.rounds.length
  if (round >= state.numVars)
    return state

  const { a, b, previousClaim } = computeRoundPolynomial(state, round)

  const checkPassed = mod(a + mod(a + b, state.field), state.field) === mod(previousClaim, state.field)
  const challenge = r ?? randomFieldElement(state.field)
  const g1Endpoint = mod(a + b, state.field)
  const newClaim = evalGi(a, g1Endpoint, challenge, state.field)

  const roundState: RoundState = {
    round: round + 1,
    a,
    b,
    checkPassed,
    previousClaim,
    r: challenge,
    newClaim,
  }

  if (!checkPassed) {
    return {
      ...state,
      rounds: [...state.rounds, {
        ...roundState,
        r: undefined,
        newClaim: undefined,
      }],
      finished: true,
      finalCheck: false,
    }
  }

  const challenges = [...state.challenges, challenge]
  const rounds = [...state.rounds, roundState]
  const finished = rounds.length === state.numVars

  let finalCheck: boolean | undefined
  if (finished) {
    const finalValue = evalPoly(state.terms, challenges, state.field)
    finalCheck = mod(finalValue, state.field) === mod(newClaim, state.field)
  }

  return {
    ...state,
    challenges,
    rounds,
    finished,
    finalCheck,
  }
}

export function instanceKindLabel(honest: boolean): string {
  return honest ? 'Yes instance' : 'No instance'
}

export function instanceDescription(instance: ProtocolInstance): string {
  if (instance.honest)
    return 'Yes instance: honest prover; claimed sum matches the true sum.'
  if (instance.proverFlair)
    return instance.proverFlair.proverNote
  return 'No instance: claimed sum differs from the true sum; sum checks may still pass until the oracle query.'
}
