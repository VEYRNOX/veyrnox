// describeOtaStatus turns the native OTA plugin's local status() into the two short
// lines Settings shows. It must fail honest: anything it cannot read as a real
// status shows nothing rather than a guess.
import { describe, expect, it } from 'vitest'
import { describeOtaStatus } from '../otaStatus'

const status = (over = {}) => ({
  enabled: true,
  channel: 'production',
  nativeApi: 1,
  runningVersion: 202610011706,
  newestKnownVersion: 202610011706,
  ...over,
})

describe('describeOtaStatus', () => {
  it('shows the running web bundle version', () => {
    expect(describeOtaStatus(status())).toEqual({ version: '202610011706', staged: false })
  })

  it('says an update is staged when a newer bundle is waiting for the next launch', () => {
    const d = describeOtaStatus(status({ runningVersion: 202609231000, newestKnownVersion: 202610011706 }))
    expect(d).toEqual({ version: '202609231000', staged: true })
  })

  it('does not call it staged when running equals the newest known', () => {
    expect(describeOtaStatus(status({ runningVersion: 5, newestKnownVersion: 5 })).staged).toBe(false)
  })

  it('shows nothing when OTA is disabled in this build', () => {
    expect(describeOtaStatus(status({ enabled: false }))).toBeNull()
  })

  it('shows nothing for a status it cannot read (fail honest, never a guessed version)', () => {
    expect(describeOtaStatus(undefined)).toBeNull()
    expect(describeOtaStatus(null)).toBeNull()
    expect(describeOtaStatus({})).toBeNull()
    expect(describeOtaStatus(status({ runningVersion: 0 }))).toBeNull()
    expect(describeOtaStatus(status({ runningVersion: -3 }))).toBeNull()
    expect(describeOtaStatus(status({ runningVersion: 1.5 }))).toBeNull()
    expect(describeOtaStatus(status({ runningVersion: '202610011706' }))).toBeNull()
  })

  it('never renders anything the native side could use to inject markup: digits only', () => {
    const d = describeOtaStatus(status({ runningVersion: 202610011706 }))
    expect(d.version).toMatch(/^[0-9]+$/)
  })
})
