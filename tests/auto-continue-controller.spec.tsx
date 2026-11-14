// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutoContinueChip } from '../src/client/AutoContinueController.js'
import type { AutoContinueRunner, AutoContinueStatus } from '../src/client/injection/auto-continue-run.js'

let root: Root | undefined
const host = document.createElement('div')
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => { act(() => root?.unmount()); root = undefined; host.replaceChildren(); host.remove(); vi.useRealTimers() })
const t = (key: string, params?: Record<string, unknown>): string => `${key}${params ? JSON.stringify(params) : ''}`
function render(status: Partial<AutoContinueStatus>) {
  const snapshot: AutoContinueStatus = { sessionId: 's', phase: 'waiting', consecutive: 1, maxRetries: 5, nextSendAt: Date.now() + 5_000, waitMs: 5_000, detail: 'TRANSPORT', muted: false, ...status }
  const runner: AutoContinueRunner = { dispose: vi.fn(), subscribe: () => () => {}, status: () => snapshot, stop: vi.fn(), reset: vi.fn(), resumeNow: vi.fn() }
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(createElement(AutoContinueChip, { runner, t, onSettings: vi.fn() })))
  return runner
}
describe('auto-continue status feedback', () => {
  it('shows provider retry without an auto-continue action or fake exhaustion', () => {
    render({ phase: 'provider-retrying', providerRetry: 3, requestCount: 4, exhaustedReason: 'requests' })
    expect(host.textContent).toContain('autoContinueControllerProviderRetry')
    expect(host.textContent).not.toContain('autoContinueControllerExhausted')
    act(() => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.textContent).toContain('autoContinueControllerProviderRetryDesc')
    expect(host.textContent).toContain('autoContinueControllerRequestCount')
    expect(host.textContent).toContain('autoContinueControllerExhaustedRequests')
    expect(host.textContent).not.toContain('autoContinueControllerResume')
    expect(host.textContent).not.toContain('autoContinueControllerStop')
  })
  it('does not claim five automatic sends when request budget exhausted at one', () => {
    render({ phase: 'exhausted', exhaustedReason: 'requests' })
    expect(host.textContent).toContain('autoContinueControllerExhaustedRequests')
    expect(host.textContent).toContain('"n":1,"max":5')
    expect(host.textContent).not.toContain('"n":5,"max":5')
  })
  it('exposes the provider phase to screen readers and closes with Escape', () => {
    render({ phase: 'provider-retrying', providerRetry: 2 })
    const toggle = host.querySelector('button')!
    expect(toggle.getAttribute('aria-label')).toContain('autoContinueControllerProviderRetry')
    expect(toggle.getAttribute('aria-label')).toContain('autoContinueControllerSeconds')
    act(() => toggle.click())
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.activeElement).toBe(host.querySelector('.bre-ac-link'))
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })
  it('describes sent state without promising a future send', () => {
    render({ phase: 'sent' })
    act(() => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.textContent).toContain('autoContinueControllerSentDesc')
    expect(host.textContent).not.toContain('autoContinueControllerPopDesc')
  })
  it('labels the duration budget distinctly', () => {
    render({ phase: 'exhausted', exhaustedReason: 'duration' })
    expect(host.textContent).toContain('autoContinueControllerExhaustedDuration')
  })
  it('keeps auto-continue manual controls and explains the two retry layers', () => {
    render({ requestCount: 7 })
    act(() => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.textContent).toContain('autoContinueControllerResume')
    expect(host.textContent).toContain('autoContinueControllerStop')
    expect(host.textContent).toContain('autoContinueControllerOfficialRetryHint')
  })
})
