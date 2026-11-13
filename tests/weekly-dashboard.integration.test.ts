import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { dashboardView, lowEvidenceRows, sendHrReminders } from '../lib/weekly/service/dashboard'
import { WeeklyError } from '../lib/weekly/service/errors'
import { markNotObserved } from '../lib/weekly/service/inbox'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

test('at the start every person and group is low on evidence', WEEKLY_DB_TEST, async () => {
  await releaseWeekOne(cycleId)
  const rows = await lowEvidenceRows(cycleId)
  // ana and ben each have a LEAD and a PEER group; the lead has an UPWARD group.
  assert.deepEqual(rows.map((r) => `${r.evaluatee.id}|${r.perspective}`).sort(), [`${W.ana.id}|LEAD`, `${W.ana.id}|PEER`, `${W.ben.id}|LEAD`, `${W.ben.id}|PEER`, `${W.lead.id}|UPWARD`])
})

test('the dashboard shows coverage and response rates', WEEKLY_DB_TEST, async () => {
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  await answerAs(prompts.get(W.lead.id)!, 3)
  await answerAs(prompts.get(W.ana.id)!, 2)
  await markNotObserved(weeklyActor(W.ben), { evaluatorId: W.ben.id, actingAs: false }, prompts.get(W.ben.id)!.id, at(1, 2))

  await assert.rejects(dashboardView(weeklyActor(W.lead), cycleId, at(2)), (e: unknown) => e instanceof WeeklyError && e.status === 403)
  const view = await dashboardView(HR_ACTOR, cycleId, at(2))
  assert.equal(view.cycle.currentWeek, 2)
  const leadGroup = view.coverage.find((c) => c.evaluatee.id === prompts.get(W.lead.id)!.evaluateeId && c.perspective === 'LEAD')!
  // Three common topics and Product's two (section 9: five topics per team member).
  assert.deepEqual([leadGroup.satisfied, leadGroup.total, leadGroup.lowEvidence], [1, 5, true])
  const stats = new Map(view.evaluators.map((e) => [e.evaluator.id, e]))
  assert.deepEqual([stats.get(W.lead.id)!.answered, stats.get(W.lead.id)!.responseRate], [1, 1])
  assert.deepEqual([stats.get(W.ben.id)!.notObserved, stats.get(W.ben.id)!.responseRate], [1, 1])
  assert.deepEqual([stats.get(W.ana.id)!.answered, stats.get(W.ana.id)!.open, stats.get(W.ana.id)!.overdue, stats.get(W.ana.id)!.responseRate], [1, 0, 0, 1])
  assert.deepEqual(view.drift, [], 'too few answers to compare evaluators')
})

test('progress is shown by week and by department', WEEKLY_DB_TEST, async () => {
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  await answerAs(prompts.get(W.ana.id)!, 2)
  const view = await dashboardView(HR_ACTOR, cycleId, at(2))
  assert.deepEqual(view.byWeek.map(({ pending, ...w }) => w), [{ week: 1, asked: 3, answered: 1 }])
  // Who still has week 1 open: ben and the lead, not ana, who answered.
  assert.deepEqual(view.byWeek[0].pending.map((p) => [p.evaluator.id, p.open, p.remindedToday]).sort(), [[W.ben.id, 1, false], [W.lead.id, 1, false]].sort())
  assert.deepEqual(view.byDepartment, [{ department: 'Product', evaluators: 3, asked: 3, answered: 1 }])
})

test('HR reminds one pending person; the overdue copy goes out and the week shows them reminded', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  try {
    await releaseWeekOne(cycleId)
    const mails: Array<{ to: string; subject: string; html: string }> = []
    const send = async (to: string, subject: string, html: string) => { mails.push({ to, subject, html }) }
    await assert.rejects(sendHrReminders(weeklyActor(W.ana), cycleId, at(2), send, 'https://compass.example', W.ben.id), (e: unknown) => e instanceof WeeklyError && e.status === 403)
    // "Send reminders" earlier the same day must not use up the per-person button.
    await sendHrReminders(HR_ACTOR, cycleId, at(2), async () => {}, 'https://compass.example')
    const result = await sendHrReminders(HR_ACTOR, cycleId, at(2), send, 'https://compass.example', W.ben.id)
    assert.equal(result.sent, 1)
    assert.deepEqual(mails.map((m) => m.to), [`${W.ben.id}@example.test`], 'only the person HR picked')
    // Week 1's question is still open in week 2, so it is overdue.
    assert.match(mails[0].subject, /^Overdue: 1 evaluation question/)
    assert.match(mails[0].html, /profit sharing/)
    const week = (await dashboardView(HR_ACTOR, cycleId, at(2))).byWeek[0]
    assert.deepEqual(week.pending.map((p) => [p.evaluator.id, p.remindedToday]).sort(), [[W.ana.id, false], [W.ben.id, true], [W.lead.id, false]].sort())
    assert.equal((await sendHrReminders(HR_ACTOR, cycleId, at(2, 1, 15), send, 'https://compass.example', W.ben.id)).sent, 0, 'once a day')
    // The next day, "Send reminders" skips anyone already reminded one by one that day.
    await sendHrReminders(HR_ACTOR, cycleId, at(2, 2), send, 'https://compass.example', W.ben.id)
    const before = mails.length
    await sendHrReminders(HR_ACTOR, cycleId, at(2, 2, 12), send, 'https://compass.example')
    assert.deepEqual(mails.slice(before).map((m) => m.to).sort(), [`${W.ana.id}@example.test`, `${W.lead.id}@example.test`].sort())
    await answerAs((await prisma.weeklyPrompt.findFirstOrThrow({ where: { cycleId, evaluatorId: W.ana.id, kind: 'STANDARD' } })), 2)
    await assert.rejects(sendHrReminders(HR_ACTOR, cycleId, at(2), send, 'https://compass.example', W.ana.id), (e: unknown) => e instanceof WeeklyError && e.status === 409, 'nothing open')
  } finally {
    delete process.env.WEEKLY_SEND_EMAILS
  }
})

test('partners are left out of progress and are never reminded', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  try {
    await releaseWeekOne(cycleId)
    // A partner on the C-suite list (they evaluate at the end of the quarter).
    await prisma.user.update({ where: { id: W.ben.id }, data: { name: 'Maryam Khalil' } })
    const view = await dashboardView(HR_ACTOR, cycleId, at(2))
    assert.deepEqual(view.byWeek.map(({ pending, ...w }) => w), [{ week: 1, asked: 2, answered: 0 }])
    assert.ok(!view.byWeek[0].pending.some((p) => p.evaluator.id === W.ben.id))
    assert.ok(!view.evaluators.some((e) => e.evaluator.id === W.ben.id))
    assert.equal(view.byDepartment[0].evaluators, 2)
    const sent: string[] = []
    const send = async (to: string) => { sent.push(to) }
    await sendHrReminders(HR_ACTOR, cycleId, at(2), send, 'https://compass.example')
    assert.deepEqual(sent.sort(), [`${W.ana.id}@example.test`, `${W.lead.id}@example.test`].sort())
    await assert.rejects(sendHrReminders(HR_ACTOR, cycleId, at(2), send, 'https://compass.example', W.ben.id), (e: unknown) => e instanceof WeeklyError && e.status === 409)
  } finally {
    delete process.env.WEEKLY_SEND_EMAILS
  }
})

test('HR sends a reminder to everyone with open questions, at most once a day', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  try {
    const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
    await answerAs(prompts.get(W.lead.id)!, 3)
    const sent: string[] = []
    const send = async (to: string) => { sent.push(to) }
    await assert.rejects(sendHrReminders(weeklyActor(W.ana), cycleId, at(1, 3), send, 'https://compass.example'), (e: unknown) => e instanceof WeeklyError && e.status === 403)
    const first = await sendHrReminders(HR_ACTOR, cycleId, at(1, 3), send, 'https://compass.example')
    assert.equal(first.sent, 2)
    assert.deepEqual(sent.sort(), [`${W.ana.id}@example.test`, `${W.ben.id}@example.test`])
    assert.equal((await sendHrReminders(HR_ACTOR, cycleId, at(1, 3, 15), send, 'https://compass.example')).sent, 0, 'once a day')
  } finally {
    delete process.env.WEEKLY_SEND_EMAILS
  }
})
