import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const braces = require('braces')
const metadata = require('braces/package.json')

assert.equal(metadata.version, '3.0.4-veyrnox.1')
assert.deepEqual(braces('a/{b,c}/d'), ['a/(b|c)/d'])
assert.deepEqual(braces.expand('a/{b,c}/d'), ['a/b/d', 'a/c/d'])

const nestedBraces = `${'{'.repeat(101)}a${'}'.repeat(101)}`
const nestedParens = `${'('.repeat(101)}a${')'.repeat(101)}`

for (const operation of [
  () => braces(nestedBraces),
  () => braces.expand(nestedBraces),
  () => braces(nestedParens),
]) {
  assert.throws(operation, error => {
    assert(error instanceof SyntaxError)
    assert.match(error.message, /nesting depth exceeds maximum of 100/)
    assert.doesNotMatch(error.message, /call stack/i)
    return true
  })
}

// Callers may tighten the bound, but cannot raise the hard security ceiling.
assert.throws(
  () => braces('{{a}}', { maxDepth: 1 }),
  /nesting depth exceeds maximum of 1/,
)
assert.throws(
  () => braces(nestedBraces, { maxDepth: 10_000 }),
  /nesting depth exceeds maximum of 100/,
)

console.log('braces depth guard: compatibility and GHSA-vfj7-8cjw-p6xm regression checks passed')
