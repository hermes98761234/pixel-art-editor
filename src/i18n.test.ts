import { describe, expect, it } from 'vitest'
import { tr } from './i18n'

describe('tr', () => {
  it('returns English source unchanged and interpolates', () => {
    expect(tr('en', 'Hello {0} and {1}', 'a', 2)).toBe('Hello a and 2')
  })
  it('translates known strings and falls back to the source', () => {
    expect(tr('uk', 'Source on GitHub')).toBe('Код на GitHub')
    expect(tr('uk', 'Unknown string {0}', 5)).toBe('Unknown string 5')
  })
})
