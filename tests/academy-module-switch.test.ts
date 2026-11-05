import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OnboardingModule } from '@prisma/client'
import { COURSE_MODULE_COUNT } from '../lib/academy/service/course'
import { blocksModuleSwitch, isCourseModule } from '../lib/academy/service/progress'

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

test('a course module cannot be switched off', () => {
  assert.equal(blocksModuleSwitch(courseModule, false), true)
})

test('an inactive course module cannot be switched back on', () => {
  assert.equal(blocksModuleSwitch({ ...courseModule, isActive: false }, true), true)
})

test('saving a title or content sends the current value, or none, and is allowed', () => {
  assert.equal(blocksModuleSwitch(courseModule, true), false)
  assert.equal(blocksModuleSwitch(courseModule, undefined), false)
})

test('a legacy module can still be switched', () => {
  assert.equal(blocksModuleSwitch(legacyModule, false), false)
})

test('the legacy PUT refuses before it writes', () => {
  const source = readFileSync(join(__dirname, '..', 'app/api/onboarding/modules/[id]/route.ts'), 'utf8')
  const check = source.indexOf('blocksModuleSwitch(module, isActive)')
  assert.ok(check > 0)
  assert.ok(check < source.indexOf('prisma.onboardingModule.update('))
  assert.match(source, /Course modules can't be switched off\./)
})
