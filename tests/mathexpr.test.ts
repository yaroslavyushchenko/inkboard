// Function formula parser (engine/mathexpr.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseExpr, power } from '../src/renderer/src/engine/mathexpr.ts'

/** Value of formula `src` at x. */
function at(src: string, x: number): number {
  const r = parseExpr(src)
  if (!r.ok) assert.fail(`"${src}" failed to parse: ${r.code} at ${r.pos}`)
  return r.fn(x)
}

const close = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('numbers, x and basic arithmetic with precedence', () => {
  assert.equal(at('2 + 3 * 4', 0), 14)
  assert.equal(at('(2 + 3) * 4', 0), 20)
  assert.equal(at('10 - 4 - 3', 0), 3)
  assert.equal(at('12 / 3 / 2', 0), 2)
  assert.equal(at('x', 7), 7)
  assert.equal(at('3.5x', 2), 7)
  assert.equal(at('.5x', 4), 2)
})

test('powers: ^ and **, right-associative, binds tighter than unary minus', () => {
  assert.equal(at('x^2', 3), 9)
  assert.equal(at('x**2', 3), 9)
  assert.equal(at('2^3^2', 0), 512)
  assert.equal(at('-x^2', 3), -9)
  assert.equal(at('(-x)^2', 3), 9)
  assert.equal(at('2^-1', 0), 0.5)
  assert.equal(at('x^(1/2)', 9), 3)
})

test('odd roots of negative numbers', () => {
  close(at('x^(1/3)', -8), -2)
  close(power(-32, 1 / 5), -2)
  assert.ok(Number.isNaN(at('x^(1/2)', -4)))
})

test('implicit multiplication', () => {
  assert.equal(at('2x + 1', 3), 7)
  assert.equal(at('2(x + 1)', 3), 8)
  assert.equal(at('(x + 1)(x - 1)', 3), 8)
  assert.equal(at('x(x + 1)', 2), 6)
  assert.equal(at('3|x|', -2), 6)
  close(at('2pi', 0), 2 * Math.PI)
  close(at('x sin(x)', 1), Math.sin(1))
  close(at('3sqrt(x)', 4), 6)
  assert.equal(at('2x^2', 3), 18)
  assert.equal(at('xx', 3), 9)
})

test('functions and constants, including school notation', () => {
  close(at('sin(x)', 1), Math.sin(1))
  close(at('cos(x)', 1), Math.cos(1))
  close(at('tan(x)', 1), Math.tan(1))
  close(at('tg(x)', 1), Math.tan(1))
  close(at('ctg(x)', 1), 1 / Math.tan(1))
  close(at('sqrt(x)', 2), Math.SQRT2)
  close(at('abs(x)', -3), 3)
  close(at('|x - 5|', 2), 3)
  close(at('log(x)', 1000), 3)
  close(at('lg(x)', 100), 2)
  close(at('ln(x)', Math.E), 1)
  close(at('exp(x)', 1), Math.E)
  close(at('arcsin(x)', 1), Math.PI / 2)
  close(at('pi', 0), Math.PI)
  close(at('π', 0), Math.PI)
  close(at('e^x', 2), Math.E ** 2)
  close(at('sin(x)^2', 1), Math.sin(1) ** 2)
})

test('functions without brackets take the following plain product', () => {
  close(at('sin x', 1), Math.sin(1))
  close(at('sin 2x', 1), Math.sin(2))
  close(at('sin x^2', 2), Math.sin(4))
  close(at('sin x cos x', 1), Math.sin(1) * Math.cos(1))
  close(at('2sinx', 1), 2 * Math.sin(1))
})

test('prefixes, Unicode signs and decimal comma', () => {
  assert.equal(at('y = 2x', 3), 6)
  assert.equal(at('f(x) = x + 1', 3), 4)
  assert.equal(at('Y=x', 3), 3)
  assert.equal(at('0,5x', 4), 2)
  assert.equal(at('x − 1', 3), 2)
  assert.equal(at('2·x', 3), 6)
  assert.equal(at('2×x', 3), 6)
  assert.equal(at('6÷x', 3), 2)
  assert.equal(at('[x + 1] * 2', 1), 4)
})

test('undefined points give NaN or Infinity, never throw', () => {
  assert.ok(Number.isNaN(at('sqrt(x)', -1)))
  assert.equal(at('1/x', 0), Infinity)
  assert.ok(Number.isNaN(at('ln(x)', -1)))
})

test('errors are reported with a code and position', () => {
  const bad = (src: string, code: string): void => {
    const r = parseExpr(src)
    assert.equal(r.ok, false, `"${src}" should not parse`)
    if (!r.ok) assert.equal(r.code, code, `"${src}"`)
  }
  bad('', 'empty')
  bad('y =', 'empty')
  bad('2 +', 'missingArg')
  bad('(x + 1', 'missingParen')
  bad('x + 1)', 'unexpected')
  bad('|x', 'missingBar')
  bad('sin', 'missingArg')
  bad('2 * * 3', 'unexpected')
  bad('x $ 2', 'unexpected')
  bad('a + 1', 'unknownName')
  bad('alert(1)', 'unknownName')
  bad('x'.repeat(201), 'unexpected')
  const r = parseExpr('x + q')
  assert.ok(!r.ok && r.pos === 4 && r.detail === 'q')
})

test('factorial, per cent and degrees are written after the number', () => {
  const at = (src: string, x = 0): number => {
    const r = parseExpr(src)
    if (!r.ok) assert.fail(`"${src}" failed to parse: ${r.code}`)
    return r.fn(x)
  }
  assert.equal(at('5!'), 120)
  assert.equal(at('0!'), 1)
  assert.ok(Number.isNaN(at('2.5!')))
  assert.equal(at('50%'), 0.5)
  assert.ok(Math.abs(at('sin 30°') - 0.5) < 1e-12)
  assert.ok(Math.abs(at('sin(x°)', 90) - 1) < 1e-12)
  assert.equal(at('3!^2'), 36)
  assert.equal(at('2*3!'), 12)
})

test('a relation is not a formula of x', () => {
  const r = parseExpr('x^2 = 4')
  assert.ok(!r.ok && r.code === 'unexpected' && r.detail === '=')
})

test('more functions: hyperbolic, secant, arc cotangent', () => {
  const r = parseExpr('sinh x + sec x + arcctg x')
  assert.ok(r.ok)
  if (r.ok) assert.ok(Math.abs(r.fn(1) - (Math.sinh(1) + 1 / Math.cos(1) + (Math.PI / 2 - Math.atan(1)))) < 1e-12)
})
