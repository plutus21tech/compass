import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isOverdue, sortNeedsYou, SOURCE_ORDER, type NeedsYouItem } from '../lib/home/needs-you'
import {
  academyItems, ownPlanItems, lateFormItems, leaveApprovalItems, securityTaskItems, teamLeadFormItems,
  ticketItems, weeklyItems, wfhApprovalItems,
  type ApprovalLeaveRow, type OwnLeaveRow,
} from '../lib/home/needs-you-sources'
import { formatDateRange } from '../lib/format-date'
import { LEAVE_TYPE_LABEL, LEAVE_TYPE_ORDER } from '../lib/leave-type-style'
import type { EvaluationsCardView } from '../lib/weekly/service/dashboard-card'

const item = (key: string, source: NeedsYouItem['source'], dueDay: string | null): NeedsYouItem => ({
  key, source, eyebrow: 'e', title: key, detail: null, dueDay, href: '/x', action: 'Go', prefetch: true,
})

const card = (over: Partial<EvaluationsCardView>): EvaluationsCardView => ({
  state: 'THIS_WEEK', message: 'm', detail: null, href: '/evaluations/weekly', selfReview: null, notices: [],
  dueAt: '2026-11-13T12:00:00.000Z', counts: { done: 1, total: 2 }, ...over,
})

describe('needs you model', () => {
  it('sorted by due day, undated last, ties by source order', () => {
    const sorted = sortNeedsYou([
      item('tickets', 'tickets', null), item('leave', 'leave-approval', '2026-11-13'),
      item('academy', 'academy', '2026-11-12'), item('weekly', 'weekly', '2026-11-12'),
    ])
    assert.deepEqual(sorted.map((i) => i.key), ['weekly', 'academy', 'leave', 'tickets'])
  })

  it('does not mutate its input and breaks full ties by title', () => {
    const input = [item('b', 'weekly', null), item('a', 'weekly', null)]
    const sorted = sortNeedsYou(input)
    assert.deepEqual(sorted.map((i) => i.key), ['a', 'b'])
    assert.deepEqual(input.map((i) => i.key), ['b', 'a'])
    assert.equal(SOURCE_ORDER[0], 'weekly')
    assert.equal(SOURCE_ORDER[SOURCE_ORDER.length - 1], 'tickets')
  })

  it('overdue means a due day before today', () => {
    assert.equal(isOverdue(item('a', 'weekly', '2026-11-10'), '2026-11-11'), true)
    assert.equal(isOverdue(item('a', 'weekly', '2026-11-11'), '2026-11-11'), false)
    assert.equal(isOverdue(item('a', 'weekly', null), '2026-11-11'), false)
  })
})

describe('weekly source', () => {
  it('actions in, FYI out', () => {
    const items = weeklyItems(card({
      detail: '1 from last week',
      selfReview: 'Your self-evaluation for October is waiting',
      notices: [
        { text: 'Approved: your request about Dev', href: '/evaluations/weekly', kind: 'LIST_DECISION' },
        { text: 'HR changed your evaluation lists', href: '/evaluations/weekly', kind: 'HR_CHANGED_LISTS' },
        { text: 'Ana Torvik asked to remove you as a peer', href: '/evaluations/weekly', kind: 'PEER_CHANGE_ABOUT_YOU' },
        { text: 'Ben Okafor has submitted their self-evaluation for October', href: '/evaluations/weekly', kind: 'TEAM_SELF_REVIEW' },
      ],
    }))
    assert.deepEqual(items.map((i) => i.title), [
      'Answer this week’s questions', 'Your self-evaluation for October is waiting',
      'Ana Torvik asked to remove you as a peer', 'Ben Okafor has submitted their self-evaluation for October',
    ])
    assert.equal(items[0].detail, '1 of 2 done · 1 from last week')
    assert.equal(items[0].action, 'Answer')
    assert.equal(items[0].dueDay, '2026-11-13')
    assert.equal(items[1].source, 'self-review')
    assert.equal(items[1].action, 'Write')
    assert.equal(items[2].eyebrow, 'Evaluation lists')
    assert.equal(items[3].eyebrow, 'Self-evaluation from your team')
    assert.equal(items[3].action, 'Read')
    assert.equal(new Set(items.map((i) => i.key)).size, items.length)
  })

  it('check lists state asks to check', () => {
    const [first] = weeklyItems(card({ state: 'CHECK_LISTS', counts: null }))
    assert.equal(first.title, 'Check your evaluation lists')
    assert.equal(first.action, 'Check')
  })

  it('caught up and closed add nothing but notices', () => {
    assert.deepEqual(weeklyItems(card({ state: 'CAUGHT_UP', counts: null, dueAt: null })), [])
    const closed = weeklyItems(card({
      state: 'CLOSED', counts: null, dueAt: null,
      notices: [{ text: 'Your quarter-end forms are open', href: '/evaluations/weekly', kind: 'FORMS_OPEN' }],
    }))
    assert.equal(closed.length, 1)
    assert.equal(closed[0].eyebrow, 'Quarter-end forms')
    assert.equal(closed[0].action, 'Fill in')
    assert.deepEqual(weeklyItems(null), [])
  })

  it('late forms show what is left', () => {
    assert.deepEqual(lateFormItems(null), [])
    assert.deepEqual(lateFormItems({ quarter: null, total: 0, forms: [] }), [])
    assert.deepEqual(lateFormItems({ quarter: { periodId: 'p', name: 'Q3' }, total: 3, forms: [] }), [])
    const forms = [{}] as never
    const [i] = lateFormItems({ quarter: { periodId: 'p', name: 'Q3' }, total: 3, forms })
    assert.equal(i.title, 'Finish your Q3 evaluations')
    assert.equal(i.detail, '2 of 3 done')
    assert.equal(i.href, '/evaluations/weekly')
    assert.equal(i.action, 'Finish')
  })
})

describe('academy and team lead form', () => {
  it('academy modules are never prefetched', () => {
    const [a, b] = academyItems([
      { slug: 'data-handling', title: 'Data handling', estimatedMinutes: 8, reread: false },
      { slug: 'phishing', title: 'Phishing', estimatedMinutes: 0, reread: true },
    ])
    assert.equal(a.prefetch, false)
    assert.equal(a.href, '/onboarding/data-handling')
    assert.equal(a.detail, 'HR asked you to read this · About 8 min')
    assert.equal(b.detail, 'Please read this again')
    assert.equal(a.eyebrow, 'Assigned by HR')
    assert.equal(a.action, 'Read')
  })

  it('team lead form is due on the onboarding date', () => {
    const [i] = teamLeadFormItems([{ id: 't1', name: 'Mina Arlow', title: 'Designer', department: 'Design', onboardingDate: '2026-11-16T00:00:00.000Z' }])
    assert.equal(i.title, 'Fill in the onboarding form for Mina Arlow')
    assert.equal(i.detail, 'Designer · Design')
    assert.equal(i.dueDay, '2026-11-16')
    assert.equal(i.href, '/team-lead-form/t1')
    const [j] = teamLeadFormItems([{ id: 't2', name: 'Omar Vantly', title: 'Analyst', department: null, onboardingDate: '2026-11-16' }])
    assert.equal(j.detail, 'Analyst')
  })
})

const leaveRow = (over: Partial<ApprovalLeaveRow>): ApprovalLeaveRow => ({
  id: 'r1', leaveType: 'CASUAL', status: 'PENDING', startDate: '2026-11-20T00:00:00.000Z', endDate: '2026-11-21T00:00:00.000Z',
  transitionPlanSubmittedAt: null, transitionPlanLeadStatus: null, employee: { id: 'e1', name: 'Cara Lindqvist' }, ...over,
})

describe('leave approvals', () => {
  it('one item per request even with a plan to review', () => {
    const items = leaveApprovalItems([
      leaveRow({ id: 'a', transitionPlanSubmittedAt: '2026-11-10T00:00:00.000Z', transitionPlanLeadStatus: 'PENDING' }),
      leaveRow({ id: 'b', status: 'APPROVED', transitionPlanSubmittedAt: '2026-11-10T00:00:00.000Z', transitionPlanLeadStatus: 'PENDING' }),
      leaveRow({ id: 'c', status: 'LEAD_APPROVED' }),
      leaveRow({ id: 'd', status: 'HR_APPROVED', leaveType: 'SICK' }),
    ], { role: 'EMPLOYEE' })
    assert.equal(items.length, 3)
    assert.equal(items[0].title, 'Approve Cara Lindqvist’s casual leave')
    assert.ok(items[0].detail?.endsWith('Handover plan to review too'))
    assert.ok(items[0].detail?.startsWith(formatDateRange('2026-11-20', '2026-11-21')))
    assert.equal(items[0].href, '/leave?requestId=a')
    assert.equal(items[0].key, 'leave:a')
    assert.equal(items[1].title, 'Review Cara Lindqvist’s handover plan')
    assert.equal(items[1].eyebrow, 'Handover plan')
    assert.equal(items[1].detail, formatDateRange('2026-11-20', '2026-11-21'))
    assert.equal(items[2].title, 'Approve Cara Lindqvist’s sick leave')
    assert.equal(items[0].dueDay, '2026-11-20')
    assert.equal(items[0].action, 'Review')
  })

  it('HR gets one summary item, never per-request items', () => {
    const items = leaveApprovalItems([
      leaveRow({ id: '1', startDate: '2026-11-25T00:00:00.000Z', endDate: '2026-11-25T00:00:00.000Z' }),
      leaveRow({ id: '2', status: 'LEAD_APPROVED', startDate: '2026-11-18T00:00:00.000Z' }),
      leaveRow({ id: '3', startDate: '2026-11-30T00:00:00.000Z' }),
      leaveRow({ id: '4', status: 'HR_APPROVED' }),
    ], { role: 'HR' })
    assert.equal(items.length, 1)
    assert.equal(items[0].title, '3 leave requests waiting for HR')
    assert.equal(items[0].href, '/admin/leave')
    assert.equal(items[0].dueDay, '2026-11-18')
    assert.equal(items[0].eyebrow, 'Leave requests')
    const one = leaveApprovalItems([leaveRow({})], { role: 'HR' })
    assert.equal(one[0].title, '1 leave request waiting for HR')
    assert.deepEqual(leaveApprovalItems([leaveRow({ status: 'APPROVED' })], { role: 'HR' }), [])
  })

  it('WFH approvals: lead per row, HR one summary', () => {
    const rows = [
      { id: 'w1', status: 'PENDING', startDate: '2026-11-20T00:00:00.000Z', endDate: '2026-11-20T00:00:00.000Z', employee: { name: 'Pia Kestrel' } },
      { id: 'w2', status: 'APPROVED', startDate: '2026-11-20T00:00:00.000Z', endDate: '2026-11-20T00:00:00.000Z', employee: { name: 'Omar Vantly' } },
    ]
    const lead = wfhApprovalItems(rows, { role: 'EMPLOYEE' })
    assert.equal(lead.length, 1)
    assert.equal(lead[0].title, 'Approve Pia Kestrel’s work from home')
    assert.equal(lead[0].href, '/leave')
    const hr = wfhApprovalItems([...rows, { ...rows[0], id: 'w3', status: 'LEAD_APPROVED' }], { role: 'HR' })
    assert.equal(hr.length, 1)
    assert.equal(hr[0].title, '2 WFH requests waiting for HR')
    assert.equal(hr[0].href, '/admin/leave')
  })
})

const own = (over: Partial<OwnLeaveRow>): OwnLeaveRow => ({
  id: 'o1', leaveType: 'ANNUAL', status: 'APPROVED', isHalfDay: false, startDate: '2026-11-18T00:00:00.000Z',
  endDate: '2026-11-20T00:00:00.000Z', transitionPlanSubmittedAt: null, transitionPlanLeadStatus: null, ...over,
})

describe('own handover plans', () => {
  it('your leave needs a plan unless it is exempt', () => {
    const today = '2026-11-11'
    const design = { department: 'Design' }
    const items = ownPlanItems([
      own({ id: 'full' }),
      own({ id: 'half', isHalfDay: true, endDate: '2026-11-18T00:00:00.000Z' }),
      own({ id: 'sick1', leaveType: 'SICK', endDate: '2026-11-18T00:00:00.000Z' }),
      own({ id: 'past', startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-12T00:00:00.000Z' }),
      own({ id: 'dis', transitionPlanSubmittedAt: '2026-11-09T00:00:00.000Z', transitionPlanLeadStatus: 'DISAPPROVED' }),
      own({ id: 'done', transitionPlanSubmittedAt: '2026-11-09T00:00:00.000Z', transitionPlanLeadStatus: 'PENDING' }),
      own({ id: 'rej', status: 'REJECTED' }),
    ], design, today)
    assert.deepEqual(items.map((i) => i.key), ['plan:full', 'plan:dis'])
    assert.equal(items[0].title, 'Add a handover plan for your annual leave')
    assert.equal(items[0].action, 'Add plan')
    assert.equal(items[0].eyebrow, 'Your leave')
    assert.equal(items[0].dueDay, '2026-11-18')
    assert.equal(items[0].href, '/leave?requestId=full')
    assert.equal(items[1].title, 'Update your handover plan for your annual leave')
    assert.equal(items[1].action, 'Update plan')
    assert.deepEqual(ownPlanItems([own({})], { department: '3E' }, today), [])
    assert.equal(ownPlanItems([own({ startDate: '2026-11-11T00:00:00.000Z' })], design, today).length, 1)
  })
})

describe('security, tickets', () => {
  it('tickets only for HR and Security, linked to their console', () => {
    const rows = [
      { id: 't1', title: 'Screen cracked', status: 'OPEN', createdAt: '2026-11-09T10:00:00.000Z' },
      { id: 't2', title: 'Charger broken', status: 'UNDER_REVIEW', createdAt: '2026-11-10T10:00:00.000Z' },
      { id: 't3', title: 'Old', status: 'RESOLVED', createdAt: '2026-11-11T10:00:00.000Z' },
    ]
    assert.deepEqual(ticketItems(rows, 'EMPLOYEE'), [])
    const hr = ticketItems(rows, 'HR')
    assert.equal(hr.length, 1)
    assert.equal(hr[0].title, '2 open device tickets')
    assert.equal(hr[0].detail, 'Charger broken')
    assert.equal(hr[0].href, '/admin/device-tickets')
    assert.equal(hr[0].dueDay, null)
    assert.equal(hr[0].action, 'Manage')
    assert.equal(ticketItems(rows, 'SECURITY')[0].href, '/security/device-tickets')
    assert.equal(ticketItems(rows.slice(0, 1), 'HR')[0].title, '1 open device ticket')
    assert.deepEqual(ticketItems([], 'HR'), [])
  })

  it('security checks that need you, due on the resubmit date when there is one', () => {
    const base = { campaignName: 'Phishing check', statusLabel: 'Not started', deadline: '2026-11-20T10:00:00.000Z', resubmitDueAt: null }
    const items = securityTaskItems([
      { id: 's1', ...base, needsAction: true },
      { id: 's2', ...base, resubmitDueAt: '2026-11-15T10:00:00.000Z', needsAction: true },
      { id: 's3', ...base, needsAction: false },
    ])
    assert.equal(items.length, 2)
    assert.equal(items[0].dueDay, '2026-11-20')
    assert.equal(items[1].dueDay, '2026-11-15')
    assert.equal(items[0].href, '/security-checks/s1')
    assert.equal(items[0].eyebrow, 'Security check')
    assert.equal(items[0].detail, 'Not started')
    assert.equal(items[0].action, 'Open')
  })
})

describe('leave type style', () => {
  it('labels and order', () => {
    assert.deepEqual([...LEAVE_TYPE_ORDER], ['CASUAL', 'ANNUAL', 'SICK'])
    assert.deepEqual(LEAVE_TYPE_LABEL, { CASUAL: 'Casual', SICK: 'Sick', ANNUAL: 'Annual' })
  })
})

describe('client-safe imports', () => {
  it('home modules never value-import server modules', async () => {
    const { readFileSync } = await import('node:fs')
    const files = ['lib/home/needs-you-sources.ts', 'lib/home/needs-you.ts', 'lib/leave-type-style.ts']
    const banned = /^import\s+(?!type\b)[^\n]*from\s+'(?:@\/lib\/weekly\/service\/[^']*|@\/lib\/db|@prisma\/client)'/m
    for (const f of files) {
      assert.doesNotMatch(readFileSync(f, 'utf8'), banned, `${f} must not value-import server modules`)
    }
  })
})
