/**
 * Balance parsing and formatting.
 *
 * Balance APIs are not standardised, so the parser is the feature's only
 * tolerant part: it must pick a real balance out of the common shapes without
 * ever turning an unrelated number (or an HTML error page) into money. The
 * formatter is what the provider row actually prints, so grouping and the
 * currency symbol are pinned here too.
 */

import { describe, expect, it } from 'vitest'
import { formatBalance, parseBalancePayload } from '../src/balance.js'

describe('parseBalancePayload', () => {
  it('reads the DeepSeek balance_infos shape', () => {
    const body = JSON.stringify({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' },
      ],
    })
    expect(parseBalancePayload(body)).toEqual({ amount: 110, currency: 'CNY' })
  })

  it('reads an OpenAI-style credit grant', () => {
    const body = JSON.stringify({ total_granted: 100, total_used: 20, total_available: 80 })
    expect(parseBalancePayload(body)).toEqual({ amount: 80 })
  })

  it('derives a remaining balance from an OpenRouter-style credit pair', () => {
    const body = JSON.stringify({ data: { total_credits: 100, total_usage: 20 } })
    expect(parseBalancePayload(body)).toEqual({ amount: 80 })
    // Half a pair is not a balance.
    expect(parseBalancePayload(JSON.stringify({ data: { total_credits: 100 } }))).toBeUndefined()
    // An explicit balance field still outranks the derived pair.
    expect(parseBalancePayload(JSON.stringify({ balance: 5, total_credits: 100, total_usage: 20 })))
      .toEqual({ amount: 5 })
  })

  it('reads a nested available_balance and the currency beside it', () => {
    const body = JSON.stringify({ code: 0, data: { available_balance: 12.5, currency: 'usd' } })
    expect(parseBalancePayload(body)).toEqual({ amount: 12.5, currency: 'USD' })
  })

  it('prefers the strongest field name over a weaker sibling', () => {
    expect(parseBalancePayload(JSON.stringify({ remaining: 7, balance: 5 }))).toEqual({ amount: 5 })
  })

  it('accepts a bare numeric body and a quoted number', () => {
    expect(parseBalancePayload('42')).toEqual({ amount: 42 })
    expect(parseBalancePayload('"12.34"')).toEqual({ amount: 12.34 })
    expect(parseBalancePayload(' ¥1,234.50 ')).toEqual({ amount: 1234.5 })
  })

  it('refuses text that is not a balance', () => {
    expect(parseBalancePayload('')).toBeUndefined()
    expect(parseBalancePayload('<html>insufficient balance</html>')).toBeUndefined()
    expect(parseBalancePayload('{"object":"list","data":[]}')).toBeUndefined()
    expect(parseBalancePayload('{"created":1700000000}')).toBeUndefined()
  })
})

describe('formatBalance', () => {
  it('prints known currencies with their symbol and groups thousands', () => {
    expect(formatBalance({ amount: 1234.5, currency: 'USD' })).toBe('$1,234.5')
    expect(formatBalance({ amount: 12, currency: 'CNY' })).toBe('¥12')
    expect(formatBalance({ amount: 0.5, currency: 'EUR' })).toBe('€0.5')
  })

  it('keeps an unknown currency code after the number', () => {
    expect(formatBalance({ amount: 12.34, currency: 'TOKENS' })).toBe('12.34 TOKENS')
  })

  it('prints a bare number when the endpoint named no currency', () => {
    expect(formatBalance({ amount: 12.34 })).toBe('12.34')
    expect(formatBalance({ amount: 1000000 })).toBe('1,000,000')
    expect(formatBalance({ amount: -3.5 })).toBe('-3.5')
  })

  it('never prints more than two decimals', () => {
    expect(formatBalance({ amount: 12.3449 })).toBe('12.34')
    expect(formatBalance({ amount: 12.345 })).toBe('12.35')
  })
})
