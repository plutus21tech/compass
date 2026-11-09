/** Fewer answers than this and a question's rate says too little to show. */
export const MIN_ANSWERS = 5

export interface MissedAttempt {
  userId: string
  createdAt: Date
  answers: readonly { questionId: string; correct: boolean }[]
}

export interface MissedQuestion {
  id: string
  questionText: string
  retiredAt: Date | null
}

export interface MostMissedRow {
  questionId: string
  question: string
  attempts: number
  wrong: number
  wrongRate: number
  firstAttempts: number
  firstWrong: number
  retired: boolean
}

interface Tally {
  attempts: number
  wrong: number
  /** Each person's earliest answer to this question. */
  first: Map<string, { at: number; correct: boolean }>
}

/**
 * How often each question is answered wrongly, over every attempt and over each person's first attempt
 * at it. Academy attempts only (the caller passes nothing else). Retired questions are kept, labelled.
 * Questions nobody has answered are left out; the worst come first.
 */
export function mostMissed(
  attempts: readonly MissedAttempt[],
  questions: readonly MissedQuestion[],
): MostMissedRow[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const tallies = new Map<string, Tally>()

  for (const attempt of attempts) {
    const at = attempt.createdAt.getTime()
    const seen = new Set<string>()
    for (const answer of attempt.answers) {
      if (!byId.has(answer.questionId) || seen.has(answer.questionId)) continue
      seen.add(answer.questionId)
      const tally = tallies.get(answer.questionId) ?? { attempts: 0, wrong: 0, first: new Map() }
      tally.attempts += 1
      if (!answer.correct) tally.wrong += 1
      const earlier = tally.first.get(attempt.userId)
      if (!earlier || at < earlier.at) tally.first.set(attempt.userId, { at, correct: answer.correct })
      tallies.set(answer.questionId, tally)
    }
  }

  const rows = [...tallies].map(([questionId, tally]): MostMissedRow => {
    const question = byId.get(questionId)!
    const firsts = [...tally.first.values()]
    return {
      questionId,
      question: question.questionText,
      attempts: tally.attempts,
      wrong: tally.wrong,
      wrongRate: tally.wrong / tally.attempts,
      firstAttempts: firsts.length,
      firstWrong: firsts.filter((f) => !f.correct).length,
      retired: question.retiredAt !== null,
    }
  })
  return rows.sort(
    (a, b) => b.wrongRate - a.wrongRate || b.attempts - a.attempts || a.question.localeCompare(b.question),
  )
}

/** The note that stands in for a row's numbers while there are too few answers. */
export const answerNote = (attempts: number): string | null =>
  attempts < MIN_ANSWERS ? 'Not enough answers yet' : null
