import test from 'node:test'
import assert from 'node:assert/strict'
import type { OnboardingModule } from '@prisma/client'
import { COURSE_MODULE_COUNT } from '../lib/academy/service/course'
import { isCourseModule } from '../lib/academy/service/progress'

const courseModule = {
  isActive: true, phase: 'DAY_1', completionRule: 'SCROLL_END', currentVersionId: 'v1',
} as OnboardingModule
const legacyModule = { isActive: true, phase: null, completionRule: null, currentVersionId: null } as OnboardingModule

test('the course is 14 modules', () => {
  assert.equal(COURSE_MODULE_COUNT, 14)
})

test('a module with a phase, rule and version is a course module', () => {
  assert.equal(isCourseModule(courseModule), true)
  assert.equal(isCourseModule(legacyModule), false)
})
