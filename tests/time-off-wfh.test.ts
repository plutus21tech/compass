import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WfhSection } from '@/components/leave/time-off/WfhSection'
import { WfhRequestForm } from '@/components/leave/time-off/WfhRequestDialog'
import type { WfhRequest } from '@/lib/time-off/types'

const day = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const wfh = (o: Partial<WfhRequest> = {}): WfhRequest => ({
  id: 'w1',
  startDate: day(5),
  endDate: day(6),
  reason: 'Plumber visit',
  status: 'PENDING',
  createdAt: day(-1),
  ...o,
})

const noop = () => {}
const section = (o: { isThreeE: boolean; requests?: WfhRequest[]; approvals?: WfhRequest[] }) =>
  renderToStaticMarkup(
    createElement(WfhSection, {
      isThreeE: o.isThreeE,
      requests: o.requests ?? [],
      approvals: o.approvals ?? [],
      onRequest: noop,
      onChanged: async () => {},
    })
  )

test('non-3E with nothing renders nothing', () => {
  assert.equal(section({ isThreeE: false }), '')
})

test('non-3E with an approval shows only the approvals card', () => {
  const html = section({
    isThreeE: false,
    approvals: [wfh({ employee: { id: 'e1', name: 'Sara Khan', department: '3E', position: null } })],
  })
  assert.match(html, /WFH approvals/)
  assert.match(html, /Requests waiting for your review/)
  assert.match(html, /Sara Khan/)
  assert.match(html, />Approve</)
  assert.match(html, /Reject/)
  assert.doesNotMatch(html, /My WFH requests/)
  assert.doesNotMatch(html, /Request WFH/)
})

test('3E sees the card, the button and the empty state', () => {
  const html = section({ isThreeE: true })
  assert.match(html, /My WFH requests/)
  assert.match(html, /Separate from leave balances\. Available for 3E team members only\./)
  assert.match(html, /Request WFH/)
  assert.match(html, /No WFH requests yet/)
})

test('a running WFH offers Cancel request; an ended one does not', () => {
  const open = section({ isThreeE: true, requests: [wfh()] })
  assert.match(open, /Cancel request/)
  assert.match(open, /Plumber visit/)
  const ended = section({ isThreeE: true, requests: [wfh({ status: 'APPROVED', startDate: day(-5), endDate: day(-3) })] })
  assert.doesNotMatch(ended, /Cancel request/)
})

test('durations read as days and the work plan shows', () => {
  const html = section({ isThreeE: true, requests: [wfh({ workPlan: 'On call all day' })] })
  assert.match(html, /2 days/)
  assert.match(html, /Work plan: On call all day/)
})

test('the request dialog has the form fields', () => {
  const html = renderToStaticMarkup(
    createElement(WfhRequestForm, { onClose: noop, onSubmitted: async () => {} })
  )
  assert.match(html, /WFH requests are separate from leave\. They do not consume your leave balance\./)
  assert.match(html, /Start Date/)
  assert.match(html, /End Date/)
  assert.match(html, /Work Plan/)
  assert.match(html, /Submit WFH Request/)
})

test('a non-3E user with past requests sees the card without a button', () => {
  const html = section({ isThreeE: false, requests: [wfh()] })
  assert.match(html, /My WFH requests/)
  assert.doesNotMatch(html, /Request WFH/)
})
