import test from 'node:test'
import assert from 'node:assert/strict'
import { isInternalLink, securityNoticeHref } from '../lib/notifications/service'

test('only in-app paths are accepted as bell links', () => {
  for (const ok of ['/leave', '/leave?requestId=abc', '/evaluations/weekly']) assert.equal(isInternalLink(ok), true, ok)
  for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil', '', 'leave']) assert.equal(isInternalLink(bad), false, bad)
})

test('security notices link to the task, or the console for reviewer digests', () => {
  assert.equal(securityNoticeHref('NEW_TASK', 'task-1'), '/security-checks/task-1')
  assert.equal(securityNoticeHref('EXTENDED', null), '/security-checks')
  assert.equal(securityNoticeHref('OVERDUE_DIGEST', null), '/security-checks/console')
})
