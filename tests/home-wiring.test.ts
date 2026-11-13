import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const DASHBOARD = 'app/(evaluator)/dashboard/page.tsx'
const dirFiles = (dir: string) => readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => join(dir, f))
const HOME_FILES = [...dirFiles('components/home'), ...dirFiles('lib/home')]

describe('home wiring', () => {
  it('the dashboard page is the new Home', () => {
    const source = read(DASHBOARD)
    assert.match(source, /import \{ HomePage \} from '@\/components\/home\/HomePage'/)
    assert.ok(source.split('\n').length < 40)
  })

  it('Home adopts the frame', () => {
    const source = read('components/home/HomePage.tsx')
    assert.match(source, /import \{ PageContainer \} from '@\/components\/layout\/page-container'/)
    assert.match(source, /import \{ PageHeader \} from '@\/components\/layout\/page-header'/)
    assert.ok(source.includes('<PageContainer'))
    assert.ok(source.includes('<PageHeader'))
    assert.ok(!source.includes('max-w-6xl mx-auto'))
  })

  it('what moved off Home stays off it', () => {
    const banned = [
      'StatsCard', 'Team Directory', 'My Equipment', '/api/assets/my', '/api/users/team',
      'Who you evaluate', 'Quarter progress', 'PulseSurvey', '/api/weekly/survey',
      'Device Support', 'DeviceSupport',
    ]
    for (const file of [...HOME_FILES, DASHBOARD]) {
      const source = read(file)
      for (const word of banned) assert.ok(!source.includes(word), `${file} mentions ${word}`)
    }
  })

  it('no browser dialogs and no slashes for counts', () => {
    for (const file of HOME_FILES) {
      const source = read(file)
      for (const call of ['alert(', 'confirm(', 'prompt(', 'toLocaleDateString(']) {
        assert.ok(!source.includes(call), `${file} uses ${call}`)
      }
    }
  })

  it('every home file is under 800 lines', () => {
    for (const file of [...HOME_FILES, DASHBOARD]) {
      assert.ok(read(file).split('\n').length < 800, `${file} is too long`)
    }
  })

  it('the old dashboard cards are gone', () => {
    assert.ok(!existsSync('components/weekly/WeeklyQuestionsCard.tsx'))
    assert.ok(!existsSync('components/academy/AssignedCard.tsx'))
  })
})
