import test from 'node:test'
import assert from 'node:assert/strict'
import { blockersCallLocal, endOfDayInZone, overlapWindowLocal, timeZoneFor } from '../lib/academy/time'

const DEC = new Date('2026-12-01T00:00:00Z')
const JULY = new Date('2026-07-01T00:00:00Z')

test('timeZoneFor maps offices and remote countries', () => {
  assert.equal(timeZoneFor({ officeLocation: 'KARACHI', remoteCountry: null }), 'Asia/Karachi')
  assert.equal(timeZoneFor({ officeLocation: 'DALLAS', remoteCountry: null }), 'America/Chicago')
  assert.equal(timeZoneFor({ officeLocation: 'REMOTE', remoteCountry: 'ID' }), 'Asia/Jakarta')
  assert.equal(timeZoneFor({ officeLocation: 'REMOTE', remoteCountry: 'EC' }), 'America/Guayaquil')
})

test('timeZoneFor gives null for unknown country or no location', () => {
  assert.equal(timeZoneFor({ officeLocation: 'REMOTE', remoteCountry: 'FR' }), null)
  assert.equal(timeZoneFor({ officeLocation: null, remoteCountry: null }), null)
})

test('endOfDayInZone is the last millisecond of the local day', () => {
  assert.equal(endOfDayInZone('2026-12-01', 'Asia/Karachi').toISOString(), '2026-12-01T18:59:59.999Z')
  assert.equal(endOfDayInZone('2026-12-01', 'America/Chicago').toISOString(), '2026-12-02T05:59:59.999Z')
})

test('endOfDayInZone uses UTC without a zone', () => {
  assert.equal(endOfDayInZone('2026-12-01', null).toISOString(), '2026-12-01T23:59:59.999Z')
})

test('blockersCallLocal converts Chicago time, honouring daylight saving', () => {
  assert.equal(blockersCallLocal('WED 07:00', 'Asia/Karachi', DEC), '6:00 PM')
  assert.equal(blockersCallLocal('WED 07:00', 'Asia/Karachi', JULY), '5:00 PM')
})

test('blockersCallLocal shows the source time when the zone is unknown', () => {
  assert.equal(blockersCallLocal('WED 07:00', null, DEC), '7:00 AM CT')
  assert.equal(blockersCallLocal('WED 13:30', null, DEC), '1:30 PM CT')
})

test('overlapWindowLocal converts the 5 PM to 8 PM PKT window', () => {
  assert.equal(overlapWindowLocal('America/Bogota', DEC), '7:00 AM to 10:00 AM')
  assert.equal(overlapWindowLocal('Asia/Karachi', DEC), '5:00 PM to 8:00 PM')
  assert.equal(overlapWindowLocal(null, DEC), '5 PM to 8 PM PKT')
})
