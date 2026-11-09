import { test, expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db'
import { P } from '../tests/helpers/academy-test-db'
import { HIRE_ID, cleanCourse, createReleasedHire, progressRow } from '../tests/helpers/academy-course-fixtures'
import { academyE2eSkipReason } from './academy-env'

// Fictional password for fictional people on the local test database only.
const PASSWORD = 'E2e-Fictional-Pass-1'
const API = 'https://www.youtube.com/iframe_api'
const DURATION = 40

test.skip(academyE2eSkipReason() !== null, academyE2eSkipReason() ?? '')

/**
 * A stand-in for YouTube's player, so the run needs no network and is the same every time. It plays
 * at three times real speed: the server still counts real time, so the end waits on "Saving".
 */
const FAKE_YOUTUBE = `
(() => {
  const RATE = 3
  class Player {
    constructor(el, opts) {
      this.opts = opts; this.state = -1; this.t = opts.playerVars.start || 0; this.timer = null
      const frame = document.createElement('iframe'); frame.src = 'about:blank'; el.replaceWith(frame)
      window.__fakeYT = this
      setTimeout(() => {
        opts.events.onReady && opts.events.onReady({ target: this, data: 0 })
        setTimeout(() => opts.events.onApiChange && opts.events.onApiChange({ target: this, data: 0 }), 50)
      }, 50)
    }
    emit(state) { this.state = state; this.opts.events.onStateChange && this.opts.events.onStateChange({ target: this, data: state }) }
    playVideo() {
      if (this.state === 0) this.t = 0
      clearInterval(this.timer)
      let last = performance.now()
      this.timer = setInterval(() => {
        const now = performance.now(); this.t += ((now - last) / 1000) * RATE; last = now
        if (this.t >= ${DURATION}) { this.t = ${DURATION}; clearInterval(this.timer); this.emit(0) }
      }, 100)
      this.emit(1)
    }
    pauseVideo() { clearInterval(this.timer); this.emit(2) }
    seekTo(s) { this.t = s }
    getCurrentTime() { return this.t }
    getDuration() { return ${DURATION} }
    getPlayerState() { return this.state }
    loadModule() {}
    unloadModule() {}
    getOption(m, o) { return o === 'tracklist' ? [{ languageCode: 'en', displayName: 'English' }, { languageCode: 'fr', displayName: 'French' }] : null }
    setOption(m, o, v) { window.__captionTrack = v && v.languageCode }
    destroy() { clearInterval(this.timer) }
  }
  window.YT = { Player }
  window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady()
})()
`

async function setVideo(): Promise<void> {
  const video = {
    youtubeId: 'AAAAAAAAAAA',
    durationSeconds: DURATION,
    chapters: [
      { key: 'start', label: 'A fictional start', start: 0 },
      { key: 'middle', label: 'A fictional middle', start: 20 },
    ],
    transcripts: { en: 'A fictional transcript for the test run.' },
  }
  await prisma.onboardingConfig.update({ where: { id: 'singleton' }, data: { videos: { VIDEO_1: video } } })
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(P.hire.email)
  await page.locator('#password').fill(PASSWORD)
  const submit = page.locator('button[type="submit"]')
  await expect(submit).toBeEnabled()
  await submit.click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

test.beforeEach(async () => {
  if (academyE2eSkipReason() !== null) return
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'login:%' OR "key" LIKE 'academy%'`
  await createReleasedHire()
  await setVideo()
  await prisma.user.update({ where: { id: HIRE_ID }, data: { passwordHash: await bcrypt.hash(PASSWORD, 4) } })
})

test.afterAll(async () => {
  if (academyE2eSkipReason() !== null) return
  await cleanCourse()
  await prisma.$disconnect()
})

test('a hire watches Module 1 to the end and moves on from the end screen', async ({ page }) => {
  // The server counts real time, so reaching 95% of a 40-second video takes about 25 seconds.
  test.setTimeout(120_000)
  await page.route(API, (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_YOUTUBE }))
  await signIn(page)
  await page.goto('/onboarding/welcome')

  // Nothing below the video: no complete button.
  await expect(page.getByRole('button', { name: 'Play video' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark complete and continue' })).toHaveCount(0)
  // The footer still has a way back.
  await expect(page.getByRole('link', { name: 'Back', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Captions' })).toHaveAttribute('aria-pressed', 'true')

  // A forward seek on the first viewing snaps back.
  const slider = page.getByRole('slider', { name: 'Video position' })
  await page.getByRole('button', { name: 'Play video' }).click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await slider.focus()
  await page.keyboard.press('End')
  await expect(page.getByText('You can skip ahead once you have watched the whole video.')).toBeVisible()
  expect(Number(await slider.getAttribute('aria-valuenow'))).toBeLessThan(10)

  // Play to the end; the end screen waits for the server to count 95%.
  await page.getByRole('button', { name: 'Play' }).click()
  // The fake plays at three times real speed, so the video ends before the server has counted 95%.
  await expect(page.getByText('Saving your progress…')).toBeVisible({ timeout: 30_000 })
  const next = page.getByRole('link', { name: 'Next: Module 2' })
  await expect(next).toBeVisible({ timeout: 60_000 })
  await expect(next).toBeFocused()
  expect((await progressRow('welcome')).status).toBe('COMPLETED')

  // After completion, seeking is free.
  await slider.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('End')
  await expect(slider).toHaveAttribute('aria-valuenow', String(DURATION))

  await next.click()
  await page.waitForURL('**/onboarding/culture-values')
})

test('a ?chapter= link never starts a first viewing past what has been watched', async ({ page }) => {
  await page.route(API, (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_YOUTUBE }))
  await signIn(page)
  await page.goto('/onboarding/welcome?chapter=middle')
  await expect(page.getByRole('button', { name: 'Play video' })).toBeVisible()
  await page.getByRole('button', { name: 'Play video' }).click()
  await page.getByRole('button', { name: 'Pause' }).click()
  // The middle chapter starts at 20s; nothing has been watched, so playback starts at the top.
  expect(Number(await page.getByRole('slider', { name: 'Video position' }).getAttribute('aria-valuenow'))).toBeLessThan(10)
})

test('with the YouTube script blocked, the page says so and shows the transcript', async ({ page }) => {
  await page.route(API, (route) => route.abort())
  await signIn(page)
  await page.goto('/onboarding/welcome')
  await expect(page.getByText("The video couldn't load.")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Please try again later, or ask HR.')).toBeVisible()
  await expect(page.getByText('A fictional transcript for the test run.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark complete and continue' })).toHaveCount(0)
  expect((await progressRow('welcome')).status).not.toBe('COMPLETED')
})
