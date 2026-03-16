/**
 * TI-30XS MultiView Compatible Calculator Engine
 * Functional simulation — no TI ROM or firmware used.
 */

export type AngleMode = 'DEG' | 'RAD' | 'GRAD';
export type DisplayMode = 'MATHPRINT' | 'CLASSIC';
export type NotationMode = 'NORM' | 'SCI' | 'ENG';

export interface CalcState {
  expression: string;       // Current input expression
  display: string[];        // 4-line display content
  result: string;           // Last computed result
  angleMode: AngleMode;
  displayMode: DisplayMode;
  notationMode: NotationMode;
  fixedDecimals: number;    // -1 = float, 0-9 = fixed
  memory: Record<string, number>; // x, y, z, t, a, b, c
  ans: number;              // Last answer
  history: { expr: string; result: string }[];
  error: string | null;
  secondActive: boolean;    // 2nd key pressed
  cursorPos: number;
  // Stats mode
  statData: number[];
  statFreq: number[];
  // Table mode
  tableFunc: string;
  tableStart: number;
  tableStep: number;
}

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
    statData: [],
    statFreq: [],
    tableFunc: '',
    tableStart: 0,
    tableStep: 1,
  };
}

// Angle conversion helpers
function toRadians(value: number, mode: AngleMode): number {
  switch (mode) {
    case 'DEG': return (value * Math.PI) / 180;
    case 'RAD': return value;
    case 'GRAD': return (value * Math.PI) / 200;
  }
}

function fromRadians(value: number, mode: AngleMode): number {
  switch (mode) {
    case 'DEG': return (value * 180) / Math.PI;
    case 'RAD': return value;
    case 'GRAD': return (value * 200) / Math.PI;
  }
}

// Tokenizer
type TokenType = 'NUMBER' | 'OP' | 'FUNC' | 'LPAREN' | 'RPAREN' | 'COMMA';
interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Whitespace
    if (ch === ' ') { i++; continue; }

    // Numbers (including decimals and scientific notation)
    if (/[0-9.]/.test(ch) || (ch === '−' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'OP' || tokens[tokens.length - 1].type === 'LPAREN' || tokens[tokens.length - 1].type === 'COMMA'))) {
      let num = '';
      if (ch === '−') { num = '-'; i++; }
      while (i < expr.length && /[0-9.eE]/.test(expr[i])) {
        num += expr[i]; i++;
      }
      // Handle ×10^ notation
      if (i < expr.length && expr.slice(i, i + 3) === '×10') {
        num += 'e';
        i += 3;
        if (i < expr.length && expr[i] === '^') i++;
        if (i < expr.length && (expr[i] === '-' || expr[i] === '−')) {
          num += '-'; i++;
        }
        while (i < expr.length && /[0-9]/.test(expr[i])) {
          num += expr[i]; i++;
        }
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Parentheses
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }

    // Comma
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }

    // Operators
    if ('+-×÷^%'.includes(ch) || ch === '−') {
      tokens.push({ type: 'OP', value: ch }); i++; continue;
    }

    // Functions (multi-char)
    const funcNames = [
      'sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'sinh⁻¹', 'cosh⁻¹', 'tanh⁻¹',
      'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh',
      'ln', 'log', '10^', 'e^',
      '√', '³√', 'x²', 'x³', 'x⁻¹',
      'abs', 'nPr', 'nCr', 'Ans', 'π',
      'rand', 'randint',
    ];

    let matched = false;
    for (const fn of funcNames) {
      if (expr.slice(i, i + fn.length) === fn) {
        if (fn === 'π') {
          tokens.push({ type: 'NUMBER', value: String(Math.PI) });
        } else if (fn === 'Ans') {
          tokens.push({ type: 'NUMBER', value: 'Ans' });
        } else {
          tokens.push({ type: 'FUNC', value: fn });
        }
        i += fn.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Unknown character, skip
    i++;
  }

  return tokens;
}

// Shunting-yard parser → RPN evaluation
function precedence(op: string): number {
  switch (op) {
    case '+': case '-': case '−': return 1;
    case '×': case '÷': case '%': return 2;
    case '^': return 3;
    case 'nPr': case 'nCr': return 4;
    default: return 0;
  }
}

function isRightAssoc(op: string): boolean {
  return op === '^';
}

function factorial(n: number): number {
  if (n < 0 || n !== Math.floor(n)) throw new Error('Invalid factorial');
  if (n > 170) return Infinity;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function nPr(n: number, r: number): number {
  return factorial(n) / factorial(n - r);
}

function nCr(n: number, r: number): number {
  return factorial(n) / (factorial(r) * factorial(n - r));
}

export function evaluate(expr: string, state: CalcState): number {
  const tokens = tokenize(expr);
  const output: (number | string)[] = [];
  const ops: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === 'NUMBER') {
      if (tok.value === 'Ans') {
        output.push(state.ans);
      } else {
        output.push(parseFloat(tok.value));
      }
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
      ops.push(tok);
    } else if (tok.type === 'RPAREN') {
      while (ops.length > 0 && ops[ops.length - 1].type !== 'LPAREN') {
        output.push(ops.pop()!.value);
      }
      if (ops.length > 0) ops.pop(); // Remove LPAREN
      if (ops.length > 0 && ops[ops.length - 1].type === 'FUNC') {
        output.push(ops.pop()!.value);
      }
    } else if (tok.type === 'COMMA') {
      while (ops.length > 0 && ops[ops.length - 1].type !== 'LPAREN') {
        output.push(ops.pop()!.value);
      }
    }
  }

  while (ops.length > 0) {
    output.push(ops.pop()!.value);
  }

  // Evaluate RPN
  const stack: number[] = [];

  for (const item of output) {
    if (typeof item === 'number') {
      stack.push(item);
    } else {
      // Operator or function
      switch (item) {
        case '+': { const b = stack.pop()!, a = stack.pop()!; stack.push(a + b); break; }
        case '-': case '−': { const b = stack.pop()!, a = stack.pop()!; stack.push(a - b); break; }
        case '×': { const b = stack.pop()!, a = stack.pop()!; stack.push(a * b); break; }
        case '÷': {
          const b = stack.pop()!, a = stack.pop()!;
          if (b === 0) throw new Error('Division by zero');
          stack.push(a / b);
          break;
        }
        case '^': { const b = stack.pop()!, a = stack.pop()!; stack.push(Math.pow(a, b)); break; }
        case '%': { const b = stack.pop()!, a = stack.pop()!; stack.push(a * b / 100); break; }
        case 'sin': { const a = stack.pop()!; stack.push(Math.sin(toRadians(a, state.angleMode))); break; }
        case 'cos': { const a = stack.pop()!; stack.push(Math.cos(toRadians(a, state.angleMode))); break; }
        case 'tan': {
          const a = stack.pop()!;
          const rad = toRadians(a, state.angleMode);
          if (Math.abs(Math.cos(rad)) < 1e-15) throw new Error('Undefined');
          stack.push(Math.tan(rad));
          break;
        }
        case 'sin⁻¹': { const a = stack.pop()!; if (a < -1 || a > 1) throw new Error('Domain error'); stack.push(fromRadians(Math.asin(a), state.angleMode)); break; }
        case 'cos⁻¹': { const a = stack.pop()!; if (a < -1 || a > 1) throw new Error('Domain error'); stack.push(fromRadians(Math.acos(a), state.angleMode)); break; }
        case 'tan⁻¹': { const a = stack.pop()!; stack.push(fromRadians(Math.atan(a), state.angleMode)); break; }
        case 'sinh': { const a = stack.pop()!; stack.push(Math.sinh(a)); break; }
        case 'cosh': { const a = stack.pop()!; stack.push(Math.cosh(a)); break; }
        case 'tanh': { const a = stack.pop()!; stack.push(Math.tanh(a)); break; }
        case 'sinh⁻¹': { const a = stack.pop()!; stack.push(Math.asinh(a)); break; }
        case 'cosh⁻¹': { const a = stack.pop()!; if (a < 1) throw new Error('Domain error'); stack.push(Math.acosh(a)); break; }
        case 'tanh⁻¹': { const a = stack.pop()!; if (a <= -1 || a >= 1) throw new Error('Domain error'); stack.push(Math.atanh(a)); break; }
        case 'ln': { const a = stack.pop()!; if (a <= 0) throw new Error('Domain error'); stack.push(Math.log(a)); break; }
        case 'log': { const a = stack.pop()!; if (a <= 0) throw new Error('Domain error'); stack.push(Math.log10(a)); break; }
        case '10^': { const a = stack.pop()!; stack.push(Math.pow(10, a)); break; }
        case 'e^': { const a = stack.pop()!; stack.push(Math.exp(a)); break; }
        case '√': { const a = stack.pop()!; if (a < 0) throw new Error('Domain error'); stack.push(Math.sqrt(a)); break; }
        case '³√': { const a = stack.pop()!; stack.push(Math.cbrt(a)); break; }
        case 'x²': { const a = stack.pop()!; stack.push(a * a); break; }
        case 'x³': { const a = stack.pop()!; stack.push(a * a * a); break; }
        case 'x⁻¹': { const a = stack.pop()!; if (a === 0) throw new Error('Division by zero'); stack.push(1 / a); break; }
        case 'abs': { const a = stack.pop()!; stack.push(Math.abs(a)); break; }
        case 'nPr': { const r = stack.pop()!, n = stack.pop()!; stack.push(nPr(n, r)); break; }
        case 'nCr': { const r = stack.pop()!, n = stack.pop()!; stack.push(nCr(n, r)); break; }
        case 'rand': { stack.push(Math.random()); break; }
        default:
          throw new Error(`Unknown operator: ${item}`);
      }
    }
  }

  if (stack.length !== 1) throw new Error('Syntax error');
  const result = stack[0];
  if (!isFinite(result)) throw new Error('Overflow');
  return result;
}

// Format result according to display settings
export function formatResult(value: number, state: CalcState): string {
  if (Number.isNaN(value)) return 'Error';
  if (!isFinite(value)) return value > 0 ? 'Overflow' : '-Overflow';

  // Round to avoid floating point artifacts
  const rounded = Math.abs(value) < 1e-14 ? 0 : value;

  if (state.notationMode === 'SCI') {
    return state.fixedDecimals >= 0
      ? rounded.toExponential(state.fixedDecimals)
      : rounded.toExponential();
  }

  if (state.notationMode === 'ENG') {
    const exp = Math.floor(Math.log10(Math.abs(rounded)));
    const engExp = Math.floor(exp / 3) * 3;
    const mantissa = rounded / Math.pow(10, engExp);
    return state.fixedDecimals >= 0
      ? `${mantissa.toFixed(state.fixedDecimals)}×10^${engExp}`
      : `${mantissa}×10^${engExp}`;
  }

  // Normal mode
  if (state.fixedDecimals >= 0) {
    return rounded.toFixed(state.fixedDecimals);
  }

  // Smart formatting: avoid long decimals
  const str = String(rounded);
  if (str.length > 14) {
    return parseFloat(rounded.toPrecision(10)).toString();
  }
  return str;
}

// 1-Variable Statistics
export function calcStats1Var(data: number[], freq: number[]): Record<string, number> {
  const n = freq.reduce((a, b) => a + b, 0);
  if (n === 0) return {};

  let sumX = 0, sumX2 = 0;
  for (let i = 0; i < data.length; i++) {
    sumX += data[i] * freq[i];
    sumX2 += data[i] * data[i] * freq[i];
  }

  const mean = sumX / n;
  const variance = sumX2 / n - mean * mean;
  const sampleVariance = n > 1 ? (sumX2 - sumX * sumX / n) / (n - 1) : 0;

  return {
    'x̄': mean,
    'Σx': sumX,
    'Σx²': sumX2,
    'n': n,
    'σx': Math.sqrt(variance),
    'Sx': Math.sqrt(sampleVariance),
  };
}

// Table generation
export function generateTable(
  funcExpr: string,
  start: number,
  step: number,
  count: number,
  state: CalcState
): { x: number; y: number | string }[] {
  const results: { x: number; y: number | string }[] = [];
  for (let i = 0; i < count; i++) {
    const x = start + i * step;
    try {
      const expr = funcExpr.replace(/x/g, `(${x})`);
      const y = evaluate(expr, state);
      results.push({ x, y: formatResult(y, state) });
    } catch {
      results.push({ x, y: 'Error' });
    }
  }
  return results;
}
