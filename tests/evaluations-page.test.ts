import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { flowStart, nextBlocker } from '@/components/weekly/page/QuestionFlowDialog'
import { leadsSomeone, MyTeamTab, unreadSelfReviews } from '@/components/weekly/page/MyTeamTab'
import { answeredRows, progressFor, roundTotals, WhoYouEvaluate } from '@/components/weekly/page/RoundLists'
import { RoundTimeline } from '@/components/weekly/page/RoundTimeline'
import { selfCardModel, weeklyCardModel } from '@/components/weekly/page/ThisWeekTab'
import { TodoCard } from '@/components/weekly/page/TodoCard'
import { SurveyForm, surveySendStatus } from '@/components/weekly/survey/PulseSurveyCard'
import type { MySelfReview, TeamSelfReviewItem } from '@/lib/weekly/service/self-review'
import { buildTimeline, inboxQueue, pendingQuestions, tallyWeeks } from '@/lib/weekly/timeline'
import type {
  CycleSummary, EvaluateeProgress, HistoryEntry, HistoryGroup, InboxPrompt, InboxResponse, MyMappingResponse, PersonRef,
} from '@/lib/weekly/view-types'

const noop = () => {}

/** Fictional people only. */
const YUSRA: PersonRef = { id: 'u-yusra', name: 'Yusra Example', position: 'Designer' }
const OMAR: PersonRef = { id: 'u-omar', name: 'Omar Example', position: 'Lead' }

// Week 1 starts Mon 26 Oct 2026, so week 3 is 9–15 Nov and is due Fri 13 Nov.
function cycle(o: Partial<CycleSummary> = {}): CycleSummary {
  return {
    id: 'c1', periodId: 'p1', periodName: 'Q4 2026', status: 'RUNNING', weekOneStartsOn: '2026-10-25T19:00:00.000Z',
    totalWeeks: 10, questionWeeks: 8, currentWeek: 3, simulatedWeek: null, ...o,
  }
}

let n = 0
function prompt(o: Partial<InboxPrompt> = {}): InboxPrompt {
  n += 1
  return {
    id: `q${n}`, weekIndex: 3, kind: 'STANDARD', status: 'OPEN', text: 'How clearly do they explain decisions?', topic: 'Explaining decisions',
    perspective: 'LEAD', evaluatee: YUSRA, options: [{ id: 'o1', text: 'Always clear' }, { id: 'o2', text: 'Usually clear' }],
    answer: null, submittedAt: null, canEdit: true, overdue: false, ...o,
  }
}
const answered = (o: Partial<InboxPrompt> = {}) =>
  prompt({ status: 'SUBMITTED', answer: { optionId: 'o1', note: null, commentText: null }, submittedAt: '2026-11-10T06:00:00.000Z', ...o })

function inbox(prompts: InboxPrompt[], o: Partial<InboxResponse> = {}): InboxResponse {
  return { cycle: cycle(), prompts, progress: [], weekSubmittedAt: null, ...o }
}

function entry(o: Partial<HistoryEntry> = {}): HistoryEntry {
  n += 1
  return {
    id: `h${n}`, weekIndex: 1, kind: 'STANDARD', topic: 'Deadlines', text: 'Q', status: 'SUBMITTED', options: [], answer: null,
    submittedAt: '2026-10-28T06:00:00.000Z', canEdit: false, ...o,
  }
}
const group = (entries: HistoryEntry[], evaluatee = YUSRA): HistoryGroup => ({ evaluatee, perspective: 'LEAD', entries })

test('timeline: answered, missed, this week, future and catch-up weeks', () => {
  const tallies = tallyWeeks([group([entry({ weekIndex: 1 }), entry({ weekIndex: 2, status: 'OPEN', submittedAt: null }), entry({ weekIndex: 2 })])])
  const weeks = buildTimeline(cycle(), tallies)
  assert.equal(weeks.length, 10)
  assert.deepEqual(weeks.slice(0, 4).map((w) => w.state), ['answered', 'missed', 'current', 'future'])
  assert.deepEqual(weeks.slice(8).map((w) => [w.label, w.kind, w.state]), [['Catch-up', 'catch-up', 'catch-up'], ['Catch-up', 'catch-up', 'catch-up']])
  assert.equal(weeks[2].label, 'Week 3')
})

test('timeline: a past week with no questions is quiet, and optional comments never make a week missed', () => {
  const tallies = tallyWeeks([group([entry({ weekIndex: 2, kind: 'COMMENT', status: 'OPEN' })])])
  assert.deepEqual(buildTimeline(cycle(), tallies).slice(0, 2).map((w) => w.state), ['quiet', 'quiet'])
  const closed = buildTimeline(cycle({ status: 'CLOSED', currentWeek: 10 }), tallyWeeks([group([entry({ weekIndex: 3 })])]))
  assert.equal(closed[2].state, 'answered')
  assert.ok(closed.every((w) => w.state !== 'current'))
})

test('the timeline card says where you are and when the round closes', () => {
  const weeks = buildTimeline(cycle(), tallyWeeks([group([entry({ weekIndex: 1 }), entry({ weekIndex: 2, status: 'EXPIRED' })])]))
  const html = renderToStaticMarkup(createElement(RoundTimeline, { cycle: cycle(), weeks }))
  assert.match(html, /Q4 2026 round/)
  assert.match(html, /Week 3 of 10 · round closes /)
  assert.match(html, /You are here/)
  assert.match(html, />Missed</)
  assert.match(html, /aria-current="step"/)
  assert.match(html, /New questions every Monday, due Friday/)
  assert.match(html, />Results</)
})

test('question queue: missed questions first, then this week by person; comments are not required', () => {
  const late = prompt({ weekIndex: 2 })
  const zed = prompt({ evaluatee: { id: 'z', name: 'Zed Example', position: null } })
  const amy = prompt({ evaluatee: { id: 'a', name: 'Amy Example', position: null } })
  const note = prompt({ kind: 'COMMENT' })
  const queue = inboxQueue([zed, amy, late, note], 3)
  assert.equal(queue[0].id, late.id)
  assert.equal(queue[1].id, amy.id)
  assert.equal(pendingQuestions(queue).length, 3)
})

test('the flow opens at the first unanswered question, or at the review when all are answered', () => {
  const a = answered()
  const b = prompt()
  assert.equal(flowStart(inboxQueue([a, b], 3)), b.id)
  assert.equal(flowStart(inboxQueue([answered(), answered()], 3)), 'review')
})

test('Next is disabled until a statement is picked, and says why', () => {
  assert.equal(nextBlocker(prompt()), 'Choose a statement to continue')
  assert.equal(nextBlocker(prompt({ status: 'DRAFT', answer: { optionId: 'o1', note: null, commentText: null } })), 'Add the note to continue')
  assert.equal(nextBlocker(answered()), null)
  assert.equal(nextBlocker(prompt({ kind: 'COMMENT' })), null)
})

test('weekly card: start, continue, ready to send, done', () => {
  const start = weeklyCardModel(inbox([prompt(), prompt(), prompt()]))
  assert.deepEqual([start.state, start.title, start.action, start.primary], ['todo', '3 questions about Yusra Example', 'Start', true])
  assert.match(start.line, /^Due Fri 13 Nov$/)
  assert.deepEqual(start.progress, { done: 0, total: 3 })

  const going = weeklyCardModel(inbox([answered(), prompt(), prompt({ weekIndex: 2 })]))
  assert.equal(going.action, 'Continue')
  assert.match(going.line, /1 from an earlier week/)
  assert.deepEqual(going.progress, { done: 1, total: 3 })

  const ready = weeklyCardModel(inbox([answered(), answered()]))
  assert.deepEqual([ready.state, ready.action, ready.status], ['ready', 'Review and send', 'Ready to send'])

  const done = weeklyCardModel(inbox([answered(), answered()], { weekSubmittedAt: '2026-11-10T07:00:00.000Z' }))
  assert.deepEqual([done.state, done.title, done.action, done.primary], ['done', 'You’re done for this week', 'View answers', false])
})

test('weekly card: no round, closed round, a quiet week and a catch-up week', () => {
  assert.equal(weeklyCardModel(null).state, 'no-round')
  assert.equal(weeklyCardModel({ cycle: null, prompts: [], progress: [] }).action, null)
  const closed = weeklyCardModel(inbox([], { cycle: cycle({ status: 'CLOSED' }) }))
  assert.deepEqual([closed.state, closed.title], ['closed', 'The Q4 2026 round is closed'])
  assert.equal(weeklyCardModel(inbox([])).title, 'No questions this week')
  assert.equal(weeklyCardModel(inbox([], { cycle: cycle({ currentWeek: 9 }) })).title, 'Catch-up week, no new questions')
  // A question missed earlier still shows in a catch-up week.
  assert.equal(weeklyCardModel(inbox([prompt({ weekIndex: 6 })], { cycle: cycle({ currentWeek: 9 }) })).state, 'todo')
})

test('self-evaluation card: open now, sent earlier, none yet', () => {
  const history = [{
    id: 's1', month: 1, monthName: 'October', title: 'What you delivered', parts: ['a', 'b', 'c'], answers: ['x', 'y', 'z'],
    wantsDiscussion: false, submittedAt: '2026-10-29T06:00:00.000Z', reads: [],
  }]
  const open: MySelfReview = {
    periodName: 'Q4 2026', history,
    current: { month: 2, title: 'What you delivered', parts: ['a', 'b', 'c'], discussOption: true, recipients: [OMAR], monthName: 'November' },
  }
  const model = selfCardModel(open)
  assert.deepEqual([model.title, model.action, model.sent], ['November: What you delivered', 'Start', 'October sent on Thu 29 Oct'])
  const waiting = selfCardModel({ ...open, current: null })
  assert.deepEqual([waiting.title, waiting.action], ['Nothing due right now', 'View October'])
  assert.deepEqual([selfCardModel(null).title, selfCardModel(null).action], ['No self-evaluations yet', null])
})

test('every to-do card has the same anatomy: label, tag, title, line, footer status and one button', () => {
  const html = renderToStaticMarkup(
    createElement(TodoCard, {
      label: 'Weekly questions', tag: 'Required', icon: createElement('i'), title: '3 questions about Yusra Example', line: 'Due Fri 13 Nov',
      status: 'Saved as you go', action: createElement('button', null, 'Start'),
    })
  )
  for (const text of ['Weekly questions', 'Required', '3 questions about Yusra Example', 'Due Fri 13 Nov', 'Saved as you go', '>Start<']) {
    assert.ok(html.includes(text), text)
  }
  assert.match(html, /h-full flex-col/)
})

test('survey: one switch hides the name on every answer, and Send says why it is disabled', () => {
  assert.equal(surveySendStatus(2, false), 'Answer the required questions to send')
  assert.equal(surveySendStatus(1, false), 'Answer the last required question to send')
  assert.equal(surveySendStatus(0, false), 'Sent to HR with your name')
  assert.equal(surveySendStatus(0, true), 'Sent without your name')
  const html = renderToStaticMarkup(
    createElement(SurveyForm, {
      onSent: noop,
      data: {
        periodName: 'Q4 2026', week: 3, notice: '',
        questions: [
          { id: 's1', orderIndex: 1, text: 'My work is recognised and valued.', kind: 'AGREE', options: [], required: true, explainChoice: false },
          { id: 's2', orderIndex: 2, text: 'I feel fairly rewarded.', kind: 'AGREE', options: [], required: true, explainChoice: false },
        ],
      },
    })
  )
  assert.equal(html.match(/Hide my name from HR/g)?.length, 1)
  assert.doesNotMatch(html, /Submit this answer anonymously/)
  assert.match(html, /Only HR sees this\./)
  assert.match(html, /Answer the required questions to send/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>Send<\/button>/)
  // The switch sets `anonymous` on every answer the form sends.
  const source = readFileSync('components/weekly/survey/PulseSurveyCard.tsx', 'utf8')
  assert.equal(source.match(/anonymous: hideName/g)?.length, 2)
})

const PROGRESS: EvaluateeProgress[] = [
  { evaluatee: YUSRA, perspective: 'LEAD', answered: 2, satisfied: 2, total: 5 },
  { evaluatee: OMAR, perspective: 'UPWARD', answered: 1, satisfied: 1, total: 4 },
]

test('answered this round: one row per week and person, newest week first', () => {
  const rows = answeredRows([
    group([entry({ weekIndex: 1, topic: 'Deadlines' }), entry({ weekIndex: 2, topic: 'Feedback' }), entry({ weekIndex: 2, topic: 'Decisions' }), entry({ weekIndex: 3, status: 'OPEN' })]),
  ])
  assert.deepEqual(rows.map((r) => [r.week, r.topics, r.person]), [[2, 'Feedback, Decisions', 'Yusra Example'], [1, 'Deadlines', 'Yusra Example']])
  assert.deepEqual(roundTotals(PROGRESS), { answered: 3, total: 9 })
  assert.deepEqual(progressFor(PROGRESS, 'u-yusra'), { answered: 2, total: 5 })
  assert.equal(progressFor(PROGRESS, 'nobody'), null)
})

function mapping(o: Partial<MyMappingResponse> = {}): MyMappingResponse {
  return {
    period: { id: 'p1', name: 'Q4 2026', locked: false }, leads: [OMAR], reports: [YUSRA], peers: [], requests: [], candidates: [],
    confirmedAt: null, toReview: [], aboutMe: [], ...o,
  }
}

test('who you evaluate: three fixed rows, an empty group says None this round', () => {
  const html = renderToStaticMarkup(createElement(WhoYouEvaluate, { mapping: mapping(), progress: PROGRESS, onChanged: async () => {} }))
  for (const label of ['Your lead', 'Your team', 'Your peers']) assert.ok(html.includes(label), label)
  assert.match(html, /Omar Example/)
  assert.match(html, /2 of 5 answered/)
  assert.equal(html.match(/None this round/g)?.length, 1)
  assert.match(html, /Something wrong\?/)
  assert.match(html, />Ask for a change</)
  const nobody = renderToStaticMarkup(createElement(WhoYouEvaluate, { mapping: mapping({ leads: [], reports: [] }), progress: [], onChanged: async () => {} }))
  assert.match(nobody, /No one to evaluate this round/)
})

const teamItem = (o: Partial<TeamSelfReviewItem> = {}): TeamSelfReviewItem => ({
  id: 't1', person: YUSRA, month: 1, monthName: 'October', title: 'What you delivered', parts: [], answers: [], wantsDiscussion: false,
  submittedAt: '2026-10-30T06:00:00.000Z', readAt: null, reply: null, ...o,
})

test('my team: only leads get the tab, with a count of unread self-evaluations', () => {
  assert.equal(leadsSomeone(mapping(), null), true)
  assert.equal(leadsSomeone(mapping({ reports: [] }), []), false)
  assert.equal(leadsSomeone(null, [teamItem()]), true)
  assert.equal(unreadSelfReviews([teamItem(), teamItem({ id: 't2', readAt: '2026-11-01T06:00:00.000Z' })]), 1)
  const html = renderToStaticMarkup(createElement(MyTeamTab, { team: [], mapping: mapping(), progress: PROGRESS, onGoToThisWeek: noop }))
  assert.match(html, /Only you and HR see this tab\./)
  assert.match(html, /Nothing sent yet/)
  assert.match(html, /Yusra Example/)
  assert.match(html, /2 of 5 answered/)
  assert.match(html, />Go to This week</)
})

test('the page keeps everything the earlier page had, and adds no new endpoint', () => {
  const tab = readFileSync('components/weekly/page/ThisWeekTab.tsx', 'utf8')
  for (const block of ['<LateFormsSection', '<MyMappingCard', '<FormsSection', '<SelfReviewCard', '<SurveyForm', '<QuestionFlowDialog']) {
    assert.ok(tab.includes(block), block)
  }
  const hook = readFileSync('components/weekly/page/use-evaluations.ts', 'utf8')
  const urls = [...hook.matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(urls, [
    '/api/weekly/card', '/api/weekly/history', '/api/weekly/inbox', '/api/weekly/mapping', '/api/weekly/self-review',
    '/api/weekly/self-review/team', '/api/weekly/survey',
  ])
  const page = readFileSync('components/weekly/WeeklyEvaluationsPage.tsx', 'utf8')
  assert.match(page, /<RoundTimeline/)
  assert.match(page, /isLead && \(/)
})
