export interface HomeSummaryInput {
  needsYou: number | null
  department: string | null
  departmentOutToday: number | null
}

function needsYouSentence(count: number): string {
  if (count === 0) return 'Nothing needs you right now.'
  return count === 1 ? '1 thing needs you.' : `${count} things need you.`
}

function departmentSentence(department: string, out: number): string {
  if (out === 0) return `Everyone in ${department} is in today.`
  return out === 1
    ? `1 person in ${department} is out today.`
    : `${out} people in ${department} are out today.`
}

export function homeSummary(input: HomeSummaryInput): string {
  const sentences: string[] = []
  if (input.needsYou !== null) sentences.push(needsYouSentence(input.needsYou))
  if (input.department !== null && input.departmentOutToday !== null) {
    sentences.push(departmentSentence(input.department, input.departmentOutToday))
  }
  return sentences.join(' ')
}
