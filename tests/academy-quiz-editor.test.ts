import test from 'node:test'
import assert from 'node:assert/strict'
import { MIN_QUIZ_QUESTIONS, questionInputSchema } from '../lib/academy/quiz'
import { slugFromTitle, templateItemInputSchema, uniqueKey } from '../lib/academy/checklist-template'
import { withAcademyNav } from '../components/layout/sidebar-nav'
import type { SidebarConfig } from '../components/layout/AppSidebar'

const valid = {
  questionText: 'What do we do first?',
  options: ['Ask', 'Guess', 'Wait'],
  correctAnswer: 'Ask',
  explanation: 'Asking early saves everyone time.',
}

test('questionInputSchema accepts a full question and trims text', () => {
  const parsed = questionInputSchema.parse({ ...valid, questionText: '  What do we do first?  ', valueKey: 'integrity', videoChapterKey: 'intro' })
  assert.equal(parsed.questionText, 'What do we do first?')
  assert.equal(parsed.valueKey, 'integrity')
})

test('questionInputSchema refuses a blank explanation', () => {
  assert.equal(questionInputSchema.safeParse({ ...valid, explanation: '   ' }).success, false)
  assert.equal(questionInputSchema.safeParse({ ...valid, explanation: undefined }).success, false)
})

test('questionInputSchema refuses duplicate options, including by case and spacing', () => {
  assert.equal(questionInputSchema.safeParse({ ...valid, options: ['Ask', 'Guess', 'Ask'] }).success, false)
  assert.equal(questionInputSchema.safeParse({ ...valid, options: ['Ask', ' ask '], correctAnswer: 'Ask' }).success, false)
})

test('questionInputSchema refuses a correct answer that is not an option', () => {
  assert.equal(questionInputSchema.safeParse({ ...valid, correctAnswer: 'Pray' }).success, false)
})

test('questionInputSchema needs 2 to 6 options and a known value', () => {
  assert.equal(questionInputSchema.safeParse({ ...valid, options: ['Ask'] }).success, false)
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  assert.equal(questionInputSchema.safeParse({ ...valid, options: seven, correctAnswer: 'a' }).success, false)
  assert.equal(questionInputSchema.safeParse({ ...valid, valueKey: 'nonsense' }).success, false)
  assert.equal(questionInputSchema.safeParse({ ...valid, options: ['Ask', 'Guess'] }).success, true)
})

test('the minimum stays at 10', () => assert.equal(MIN_QUIZ_QUESTIONS, 10))

test('slugFromTitle makes a stable lowercase key', () => {
  assert.equal(slugFromTitle("Completion of Manager's Checklist!"), 'completion-of-manager-s-checklist')
  assert.equal(slugFromTitle('  ***  '), 'item')
})

test('uniqueKey adds a counter when the key is taken', () => {
  assert.equal(uniqueKey('hr-call', new Set(['x'])), 'hr-call')
  assert.equal(uniqueKey('hr-call', new Set(['hr-call', 'hr-call-2'])), 'hr-call-3')
})

test('templateItemInputSchema allows negative offsets and refuses odd input', () => {
  const ok = { title: 'Book the room', ownerRole: 'HR', dueOffsetDays: -5, isActive: true, orderIndex: 3 }
  assert.equal(templateItemInputSchema.safeParse(ok).success, true)
  assert.equal(templateItemInputSchema.safeParse({ ...ok, ownerRole: 'CEO' }).success, false)
  assert.equal(templateItemInputSchema.safeParse({ ...ok, title: ' ' }).success, false)
  assert.equal(templateItemInputSchema.safeParse({ ...ok, dueOffsetDays: 1.5 }).success, false)
  assert.equal(templateItemInputSchema.safeParse({ ...ok, dueOffsetDays: 999 }).success, false)
  // key and autoTickEvent are not editable: unknown fields are refused.
  assert.equal(templateItemInputSchema.safeParse({ ...ok, key: 'x' }).success, false)
  assert.equal(templateItemInputSchema.safeParse({ ...ok, autoTickEvent: 'SETUP_READY' }).success, false)
})

test('withAcademyNav adds the quiz and checklist editors and replaces the old quiz link', () => {
  const icon = (() => null) as never
  const icons = { library: icon, contacts: icon, links: icon }
  const config: SidebarConfig = {
    items: [{ label: 'Dashboard', href: '/admin', icon }],
    groups: [{ label: 'Onboarding', items: [{ label: 'Quiz', href: '/admin/onboarding/quiz', icon }] }],
  }
  const hrefs = withAcademyNav(config, true, icons).groups[0].items.map((i) => i.href)
  assert.ok(hrefs.includes('/admin/onboarding/academy/quiz'))
  assert.ok(hrefs.includes('/admin/onboarding/academy/checklist'))
  assert.ok(!hrefs.includes('/admin/onboarding/quiz'))
  assert.equal(withAcademyNav(config, false, icons), config)
})
