/**
 * Scientific Calculator Engine — independently developed simulator
 * Functional simulation — no TI ROM or firmware used.
 */

export type AngleMode = 'DEG' | 'RAD' | 'GRAD';
export type DisplayMode = 'MATHPRINT' | 'CLASSIC';
export type NotationMode = 'NORM' | 'SCI' | 'ENG';
export type CalcMode = 'normal' | 'stat' | 'table';

export interface CalcState {
  expression: string;
  display: string[];          // 4-line display
  result: string;
  angleMode: AngleMode;
  displayMode: DisplayMode;
  notationMode: NotationMode;
  fixedDecimals: number;      // -1 = float, 0-9 = fixed
  memory: Record<string, number>;
  ans: number;
  history: HistoryEntry[];
  error: string | null;
  secondActive: boolean;
  cursorPos: number;
  // Modes
  calcMode: CalcMode;
  // Stats
  statData: StatRow[];
  statResults: Record<string, number> | null;
  // Table
  tableFunc: string;
  tableStart: number;
  tableStep: number;
  tableRows: TableRow[];
  // Memory store pending
  storingVar: boolean;
}

export interface HistoryEntry { expr: string; result: string }
export interface StatRow { value: number; freq: number }
export interface TableRow { x: number; y: string }

export function createInitialState(): CalcState {
  return {
    expression: '',
    display: ['', '', '', ''],
    result: '',
    angleMode: 'DEG',
    displayMode: 'MATHPRINT',
    notationMode: 'NORM',
    fixedDecimals: -1,
    memory: { x: 0, y: 0, z: 0, t: 0, a: 0, b: 0, c: 0 },
    ans: 0,
    history: [],
    error: null,
    secondActive: false,
    cursorPos: 0,
    calcMode: 'normal',
    statData: [{ value: 0, freq: 1 }],
    statResults: null,
    tableFunc: '',
    tableStart: 0,
    tableStep: 1,
    tableRows: [],
    storingVar: false,
  };
}

// ─── Angle helpers ───
function toRadians(value: number, mode: AngleMode): number {
  if (mode === 'DEG') return (value * Math.PI) / 180;
  if (mode === 'GRAD') return (value * Math.PI) / 200;
  return value;
}

function fromRadians(value: number, mode: AngleMode): number {
  if (mode === 'DEG') return (value * 180) / Math.PI;
  if (mode === 'GRAD') return (value * 200) / Math.PI;
  return value;
}

// ─── Tokenizer ───
type TokenType = 'NUMBER' | 'OP' | 'FUNC' | 'POSTFIX' | 'LPAREN' | 'RPAREN' | 'COMMA';
interface Token { type: TokenType; value: string }

const POSTFIX_OPS = ['²', '³', '⁻¹', '!'];
const PREFIX_FUNCS = [
  'sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'sinh⁻¹', 'cosh⁻¹', 'tanh⁻¹',
  'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh',
  'ln', 'log', '10^', 'e^', '√', '³√', 'abs',
];
const BINARY_FUNCS = ['nPr', 'nCr'];

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];
    if (ch === ' ') { i++; continue; }

    // Postfix operators: ², ³, ⁻¹, !
    if (ch === '²' || ch === '³' || ch === '!') {
      tokens.push({ type: 'POSTFIX', value: ch }); i++; continue;
    }
    if (expr.slice(i, i + 2) === '⁻¹') {
      tokens.push({ type: 'POSTFIX', value: '⁻¹' }); i += 2; continue;
    }

    // Numbers
    const isNegSign = ch === '−' && (
      tokens.length === 0 ||
      tokens[tokens.length - 1].type === 'OP' ||
      tokens[tokens.length - 1].type === 'LPAREN' ||
      tokens[tokens.length - 1].type === 'COMMA' ||
      tokens[tokens.length - 1].type === 'FUNC'
    );
    if (/[0-9.]/.test(ch) || isNegSign) {
      let num = '';
      if (isNegSign && ch === '−') { num = '-'; i++; }
      while (i < len && /[0-9.eE]/.test(expr[i])) { num += expr[i]; i++; }
      // ×10^ scientific notation
      if (i < len && expr.slice(i, i + 3) === '×10') {
        num += 'e'; i += 3;
        if (i < len && expr[i] === '^') i++;
        if (i < len && (expr[i] === '-' || expr[i] === '−')) { num += '-'; i++; }
        while (i < len && /[0-9]/.test(expr[i])) { num += expr[i]; i++; }
      }
      tokens.push({ type: 'NUMBER', value: num }); continue;
    }

    // Parentheses
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }

    // Operators
    if ('+-×÷^%'.includes(ch) || ch === '−') {
      tokens.push({ type: 'OP', value: ch }); i++; continue;
    }

    // Prefix functions (longest match first)
    let matched = false;
    for (const fn of PREFIX_FUNCS) {
      if (expr.slice(i, i + fn.length) === fn) {
        tokens.push({ type: 'FUNC', value: fn }); i += fn.length; matched = true; break;
      }
    }
    if (matched) continue;

    // Binary function operators (nPr, nCr)
    for (const fn of BINARY_FUNCS) {
      if (expr.slice(i, i + fn.length) === fn) {
        tokens.push({ type: 'OP', value: fn }); i += fn.length; matched = true; break;
      }
    }
    if (matched) continue;

    // Constants
    if (ch === 'π') { tokens.push({ type: 'NUMBER', value: String(Math.PI) }); i++; continue; }
    if (ch === 'e' && (i + 1 >= len || !/[0-9a-z]/i.test(expr[i + 1]))) {
      tokens.push({ type: 'NUMBER', value: String(Math.E) }); i++; continue;
    }
    if (expr.slice(i, i + 3) === 'Ans') {
      tokens.push({ type: 'NUMBER', value: 'Ans' }); i += 3; continue;
    }

    // Skip unknown
    i++;
  }
  return tokens;
}

// ─── Shunting-yard → RPN ───
function precedence(op: string): number {
  switch (op) {
    case '+': case '-': case '−': return 1;
    case '×': case '÷': return 2;
    case '%': return 2;
    case 'nPr': case 'nCr': return 3;
    case '^': return 4;
    default: return 0;
  }
}

function isRightAssoc(op: string): boolean { return op === '^'; }

function factorial(n: number): number {
  if (n < 0 || n !== Math.floor(n)) throw new Error('Error');
  if (n > 170) return Infinity;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

export function evaluate(expr: string, state: CalcState): number {
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new Error('Error');

  const output: (number | string)[] = [];
  const ops: Token[] = [];

  for (const tok of tokens) {
    if (tok.type === 'NUMBER') {
      output.push(tok.value === 'Ans' ? state.ans : parseFloat(tok.value));
    } else if (tok.type === 'POSTFIX') {
      // Apply immediately to the last value in output
      output.push(tok.value);
    } else if (tok.type === 'FUNC') {
      ops.push(tok);
    } else if (tok.type === 'OP') {
      while (
        ops.length > 0 &&
        ops[ops.length - 1].type !== 'LPAREN' &&
        (ops[ops.length - 1].type === 'FUNC' ||
          precedence(ops[ops.length - 1].value) > precedence(tok.value) ||
          (precedence(ops[ops.length - 1].value) === precedence(tok.value) && !isRightAssoc(tok.value)))
      ) {
        output.push(ops.pop()!.value);
      }
      ops.push(tok);
    } else if (tok.type === 'LPAREN') {
      // Implicit multiplication: 5( → 5×(
      if (output.length > 0 && typeof output[output.length - 1] === 'number') {
        // Push multiply
        while (ops.length > 0 && ops[ops.length - 1].type !== 'LPAREN' &&
          (ops[ops.length - 1].type === 'FUNC' || precedence(ops[ops.length - 1].value) >= precedence('×'))) {
          output.push(ops.pop()!.value);
        }
        ops.push({ type: 'OP', value: '×' });
      }
      ops.push(tok);
    } else if (tok.type === 'RPAREN') {
      while (ops.length > 0 && ops[ops.length - 1].type !== 'LPAREN') {
        output.push(ops.pop()!.value);
      }
      if (ops.length > 0) ops.pop();
      if (ops.length > 0 && ops[ops.length - 1].type === 'FUNC') {
        output.push(ops.pop()!.value);
      }
    } else if (tok.type === 'COMMA') {
      while (ops.length > 0 && ops[ops.length - 1].type !== 'LPAREN') {
        output.push(ops.pop()!.value);
      }
    }
  }
  while (ops.length > 0) output.push(ops.pop()!.value);

  // ─── Evaluate RPN ───
  const stack: number[] = [];

  for (const item of output) {
    if (typeof item === 'number') {
      stack.push(item); continue;
    }
    switch (item) {
      // Postfix
      case '²': { const a = stack.pop()!; stack.push(a * a); break; }
      case '³': { const a = stack.pop()!; stack.push(a * a * a); break; }
      case '⁻¹': { const a = stack.pop()!; if (a === 0) throw new Error('Divide by 0'); stack.push(1 / a); break; }
      case '!': { const a = stack.pop()!; stack.push(factorial(a)); break; }
      // Binary ops
      case '+': { const b = stack.pop()!, a = stack.pop() ?? 0; stack.push(a + b); break; }
      case '-': case '−': { const b = stack.pop()!, a = stack.pop() ?? 0; stack.push(a - b); break; }
      case '×': { const b = stack.pop()!, a = stack.pop()!; stack.push(a * b); break; }
      case '÷': { const b = stack.pop()!, a = stack.pop()!; if (b === 0) throw new Error('Divide by 0'); stack.push(a / b); break; }
      case '^': { const b = stack.pop()!, a = stack.pop()!; stack.push(Math.pow(a, b)); break; }
      case '%': { const b = stack.pop()!, a = stack.pop()!; stack.push(a * b / 100); break; }
      case 'nPr': { const r = stack.pop()!, n = stack.pop()!; stack.push(factorial(n) / factorial(n - r)); break; }
      case 'nCr': { const r = stack.pop()!, n = stack.pop()!; stack.push(factorial(n) / (factorial(r) * factorial(n - r))); break; }
      // Trig
      case 'sin': { const a = stack.pop()!; stack.push(Math.sin(toRadians(a, state.angleMode))); break; }
      case 'cos': { const a = stack.pop()!; stack.push(Math.cos(toRadians(a, state.angleMode))); break; }
      case 'tan': {
        const a = stack.pop()!; const r = toRadians(a, state.angleMode);
        if (Math.abs(Math.cos(r)) < 1e-15) throw new Error('Undefined');
        stack.push(Math.tan(r)); break;
      }
      case 'sin⁻¹': { const a = stack.pop()!; if (Math.abs(a) > 1) throw new Error('Domain'); stack.push(fromRadians(Math.asin(a), state.angleMode)); break; }
      case 'cos⁻¹': { const a = stack.pop()!; if (Math.abs(a) > 1) throw new Error('Domain'); stack.push(fromRadians(Math.acos(a), state.angleMode)); break; }
      case 'tan⁻¹': { const a = stack.pop()!; stack.push(fromRadians(Math.atan(a), state.angleMode)); break; }
      case 'sinh': { stack.push(Math.sinh(stack.pop()!)); break; }
      case 'cosh': { stack.push(Math.cosh(stack.pop()!)); break; }
      case 'tanh': { stack.push(Math.tanh(stack.pop()!)); break; }
      case 'sinh⁻¹': { stack.push(Math.asinh(stack.pop()!)); break; }
      case 'cosh⁻¹': { const a = stack.pop()!; if (a < 1) throw new Error('Domain'); stack.push(Math.acosh(a)); break; }
      case 'tanh⁻¹': { const a = stack.pop()!; if (Math.abs(a) >= 1) throw new Error('Domain'); stack.push(Math.atanh(a)); break; }
      // Log/exp
      case 'ln': { const a = stack.pop()!; if (a <= 0) throw new Error('Domain'); stack.push(Math.log(a)); break; }
      case 'log': { const a = stack.pop()!; if (a <= 0) throw new Error('Domain'); stack.push(Math.log10(a)); break; }
      case '10^': { stack.push(Math.pow(10, stack.pop()!)); break; }
      case 'e^': { stack.push(Math.exp(stack.pop()!)); break; }
      // Roots
      case '√': { const a = stack.pop()!; if (a < 0) throw new Error('Domain'); stack.push(Math.sqrt(a)); break; }
      case '³√': { stack.push(Math.cbrt(stack.pop()!)); break; }
      case 'abs': { stack.push(Math.abs(stack.pop()!)); break; }
      default: throw new Error('Syntax error');
    }
  }

  if (stack.length !== 1) throw new Error('Syntax error');
  const result = stack[0];
  if (!isFinite(result)) throw new Error('Overflow');
  return result;
}

// ─── Formatting ───
export function formatResult(value: number, state: CalcState): string {
  if (Number.isNaN(value)) return 'Error';
  if (!isFinite(value)) return 'Overflow';
  const v = Math.abs(value) < 1e-14 ? 0 : value;

  if (state.notationMode === 'SCI') {
    return state.fixedDecimals >= 0 ? v.toExponential(state.fixedDecimals) : v.toExponential();
  }
  if (state.notationMode === 'ENG') {
    if (v === 0) return '0';
    const exp = Math.floor(Math.log10(Math.abs(v)));
    const engExp = Math.floor(exp / 3) * 3;
    const mantissa = v / Math.pow(10, engExp);
    return state.fixedDecimals >= 0
      ? `${mantissa.toFixed(state.fixedDecimals)}×10^${engExp}`
      : `${mantissa}×10^${engExp}`;
  }
  if (state.fixedDecimals >= 0) return v.toFixed(state.fixedDecimals);
  const str = String(v);
  return str.length > 14 ? parseFloat(v.toPrecision(10)).toString() : str;
}

// ─── Fraction detection ───
export function toFraction(value: number, maxDenom: number = 10000): { num: number; den: number } | null {
  if (!isFinite(value) || Number.isNaN(value)) return null;
  if (Number.isInteger(value)) return { num: value, den: 1 };

  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  let bestNum = 0, bestDen = 1, bestErr = abs;

  for (let den = 2; den <= maxDenom; den++) {
    const num = Math.round(abs * den);
    const err = Math.abs(abs - num / den);
    if (err < bestErr) {
      bestErr = err;
      bestNum = num;
      bestDen = den;
      if (err < 1e-10) break;
    }
  }

  if (bestErr > 1e-9) return null;
  // Simplify
  const g = gcd(bestNum, bestDen);
  return { num: sign * bestNum / g, den: bestDen / g };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

// ─── Statistics ───
export function calcStats1Var(data: StatRow[]): Record<string, number> {
  const valid = data.filter(d => !isNaN(d.value) && d.freq > 0);
  const n = valid.reduce((s, d) => s + d.freq, 0);
  if (n === 0) return {};

  let sumX = 0, sumX2 = 0, minX = Infinity, maxX = -Infinity;
  for (const d of valid) {
    sumX += d.value * d.freq;
    sumX2 += d.value * d.value * d.freq;
    if (d.value < minX) minX = d.value;
    if (d.value > maxX) maxX = d.value;
  }

  const mean = sumX / n;
  const popVar = sumX2 / n - mean * mean;
  const smpVar = n > 1 ? (sumX2 - sumX * sumX / n) / (n - 1) : 0;

  // Median
  const expanded: number[] = [];
  for (const d of valid) for (let i = 0; i < d.freq; i++) expanded.push(d.value);
  expanded.sort((a, b) => a - b);
  const mid = Math.floor(expanded.length / 2);
  const median = expanded.length % 2 === 0
    ? (expanded[mid - 1] + expanded[mid]) / 2
    : expanded[mid];

  return {
    'x̄': mean,
    'Σx': sumX,
    'Σx²': sumX2,
    'n': n,
    'σx': Math.sqrt(popVar),
    'Sx': Math.sqrt(smpVar),
    'min': minX,
    'max': maxX,
    'Med': median,
  };
}

// 2-Var stats
export function calcStats2Var(
  xData: number[], yData: number[]
): Record<string, number> {
  const n = Math.min(xData.length, yData.length);
  if (n < 2) return {};

  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sx += xData[i]; sy += yData[i];
    sxy += xData[i] * yData[i];
    sx2 += xData[i] * xData[i];
    sy2 += yData[i] * yData[i];
  }
  const mx = sx / n, my = sy / n;
  const b = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  const a = my - b * mx;
  const r = (n * sxy - sx * sy) / Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));

  return { a, b, r, 'r²': r * r, n, 'Σx': sx, 'Σy': sy, 'Σxy': sxy };
}

// ─── Table ───
export function generateTable(funcExpr: string, start: number, step: number, count: number, state: CalcState): TableRow[] {
  const rows: TableRow[] = [];
  for (let i = 0; i < count; i++) {
    const x = start + i * step;
    try {
      const expr = funcExpr.replace(/x/gi, `(${x})`);
      const y = evaluate(expr, state);
      rows.push({ x, y: formatResult(y, state) });
    } catch {
      rows.push({ x, y: 'Error' });
    }
  }
  return rows;
}

// ─── MathPrint expression parser ───
// Converts flat expression string into structured tokens for rich rendering
export interface MathPrintToken {
  type: 'number' | 'op' | 'func' | 'frac' | 'sup' | 'sqrt' | 'paren' | 'text';
  value: string;
  children?: MathPrintToken[];
  numerator?: string;
  denominator?: string;
  base?: string;
  exponent?: string;
}

export function parseMathPrint(expr: string): MathPrintToken[] {
  const tokens: MathPrintToken[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Fraction: detect pattern like "num/den" where num and den are numbers
    // Look for number/number pattern
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      // Check if followed by /
      if (i < expr.length && expr[i] === '/') {
        i++; // skip /
        let den = '';
        while (i < expr.length && /[0-9.]/.test(expr[i])) { den += expr[i]; i++; }
        if (den) {
          tokens.push({ type: 'frac', value: `${num}/${den}`, numerator: num, denominator: den });
        } else {
          tokens.push({ type: 'number', value: num });
          tokens.push({ type: 'op', value: '/' });
        }
      } else {
        tokens.push({ type: 'number', value: num });
      }
      continue;
    }

    // Superscript: ², ³
    if (ch === '²' || ch === '³') {
      tokens.push({ type: 'sup', value: ch }); i++; continue;
    }
    if (expr.slice(i, i + 2) === '⁻¹') {
      tokens.push({ type: 'sup', value: '⁻¹' }); i += 2; continue;
    }

    // √
    if (ch === '√') {
      tokens.push({ type: 'sqrt', value: '√' }); i++; continue;
    }

    // Functions
    const funcNames = ['sin⁻¹','cos⁻¹','tan⁻¹','sin','cos','tan','log','ln','10^','e^','³√','abs'];
    let matched = false;
    for (const fn of funcNames) {
      if (expr.slice(i, i + fn.length) === fn) {
        tokens.push({ type: 'func', value: fn }); i += fn.length; matched = true; break;
      }
    }
    if (matched) continue;

    // Operators
    if ('+-×÷^%−'.includes(ch)) {
      tokens.push({ type: 'op', value: ch }); i++; continue;
    }

    // Parens
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch }); i++; continue;
    }

    // Special names
    if (expr.slice(i, i + 3) === 'Ans') {
      tokens.push({ type: 'text', value: 'Ans' }); i += 3; continue;
    }
    if (expr.slice(i, i + 3) === 'nPr') {
      tokens.push({ type: 'func', value: 'nPr' }); i += 3; continue;
    }
    if (expr.slice(i, i + 3) === 'nCr') {
      tokens.push({ type: 'func', value: 'nCr' }); i += 3; continue;
    }

    // π
    if (ch === 'π') {
      tokens.push({ type: 'text', value: 'π' }); i++; continue;
    }

    tokens.push({ type: 'text', value: ch }); i++;
  }

  return tokens;
}
