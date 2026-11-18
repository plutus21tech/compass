import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MyResultsTab } from '@/components/weekly/page/MyResultsTab'
import {
  isReleased, lowestGroup, quarterResult, readGroups, scalePercent, scoreChange, type MyResultQuarter,
} from '@/lib/weekly/my-results'

const SECRET = 'private written feedback'

/** A stored report as lib/scoring.ts writes it, with fields the tab must never show. */
const STORED = {
  employeeName: 'Ana Example',
  overallScore: 78.25, // 3.13 of 4
  qualitativeFeedback: { TEAM_LEAD: [SECRET] },
  breakdown: [
    { relationshipType: 'C_LEVEL', weight: 0.35, normalizedScore: 3, evaluatorCount: 1, rawScore: 15, maxScore: 20, weightedContribution: 1.05 },
    { relationshipType: 'DEPT', weight: 0.35, normalizedScore: 3, evaluatorCount: 1 },
    { relationshipType: 'DIRECT_REPORT', weight: 0.2, normalizedScore: 3.5, evaluatorCount: 2 },
    { relationshipType: 'HR', weight: 0.1, normalizedScore: 3.254, evaluatorCount: 1 },
    { relationshipType: 'PEER', weight: 0, normalizedScore: 0, evaluatorCount: 0 },
  ],
}

const quarter = (o: Partial<MyResultQuarter> = {}): MyResultQuarter => ({
  ...quarterResult({ periodId: 'p3', periodName: 'Q3 2026', overallScore: 78.25, breakdownJson: STORED, emailedAt: new Date('2026-10-27T06:00:00Z') }),
  ...o,
})

test('a stored report becomes a score out of 4, its band and its weighted groups', () => {
  const q = quarter()
  assert.equal(q.score, 3.13)
  assert.equal(q.band, 'Exceeds Expectations')
  assert.deepEqual(q.groups.map((g) => [g.key, g.label, g.weightPercent, g.score]), [
    ['DEPT', 'Department', 35, 3],
    ['C_LEVEL', 'Leadership', 35, 3],
    ['DIRECT_REPORT', 'Your team', 20, 3.5],
    ['HR', 'HR', 10, 3.25],
  ])
  assert.equal(q.emailedAt, '2026-10-27T06:00:00.000Z')
})

test('nothing but scores leaves the stored report: no names, no written feedback, no evaluator counts', () => {
  const json = JSON.stringify(quarter())
  assert.ok(!json.includes(SECRET))
  assert.ok(!json.includes('Ana Example'))
  assert.ok(!json.includes('evaluator'))
})

test('unreadable or empty breakdowns give no groups rather than an error', () => {
  for (const bad of [null, undefined, 'x', {}, { breakdown: 'x' }, { breakdown: [null, { relationshipType: 5 }, { relationshipType: 'PEER', weight: '1' }] }]) {
    assert.deepEqual(readGroups(bad), [])
  }
})

test('a quarter is released once the round is published or the report email was sent', () => {
  assert.equal(isReleased({ emailSent: false, resultsPublishedAt: null }), false)
  assert.equal(isReleased({ emailSent: true, resultsPublishedAt: null }), true)
  assert.equal(isReleased({ emailSent: false, resultsPublishedAt: new Date() }), true)
})

test('change since the quarter before, the scale position and the group to focus on', () => {
  const quarters = [quarter(), quarter({ periodId: 'p2', periodName: 'Q2 2026', score: 3 })]
  assert.equal(scoreChange(quarters, 0), 0.13)
  assert.equal(scoreChange(quarters, 1), null)
  assert.equal(scalePercent(3.13), 71)
  assert.equal(scalePercent(0.5), 0)
  assert.equal(scalePercent(4), 100)
  assert.equal(lowestGroup(quarter().groups)?.key, 'DEPT')
  assert.equal(lowestGroup(quarter().groups.slice(0, 1)), null)
})

test('the tab shows the score, band, change, groups and the weighted total', () => {
  const html = renderToStaticMarkup(
    createElement(MyResultsTab, {
      results: { quarters: [quarter(), quarter({ periodId: 'p2', periodName: 'Q2 2026', score: 3 })], preparing: 'Q4 2026' },
    })
  )
  assert.match(html, /Q3 2026 overall/)
  assert.match(html, />3\.13</)
  assert.match(html, /Exceeds Expectations/)
  assert.match(html, /▲ 0\.13 since Q2 2026/)
  assert.match(html, /Also sent to your email on Tue 27 Oct/)
  assert.match(html, /35% of total/)
  assert.match(html, /Weighted total/)
  assert.match(html, /Q4 2026 results are being prepared/)
  assert.match(html, /aria-pressed="true"[^>]*>Q3 2026</)
  assert.match(html, /Focus for next quarter/)
})

test('with nothing released the tab says so, or that results are being prepared', () => {
  const none = renderToStaticMarkup(createElement(MyResultsTab, { results: { quarters: [], preparing: null } }))
  assert.match(none, /No results yet/)
  const preparing = renderToStaticMarkup(createElement(MyResultsTab, { results: { quarters: [], preparing: 'Q4 2026' } }))
  assert.match(preparing, /Q4 2026 results are being prepared/)
  assert.match(renderToStaticMarkup(createElement(MyResultsTab, { results: null })), /No results yet/)
})

test('the endpoint serves only the signed-in person, and the service never selects feedback or evaluators', () => {
  const route = readFileSync('app/api/weekly/results/route.ts', 'utf8')
  assert.match(route, /requireWeeklySession\(\)/)
  assert.match(route, /myResults\(user\.id\)/)
  assert.doesNotMatch(route, /searchParams|employeeId/)
  const service = readFileSync('lib/weekly/service/my-results.ts', 'utf8')
  assert.match(service, /where: \{ employeeId: userId \}/)
  assert.doesNotMatch(service, /qualitativeFeedback|evaluatorName|detailedSections|\.create\(|\.update\(|\.delete\(/)
})
