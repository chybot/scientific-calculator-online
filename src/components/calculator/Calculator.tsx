import { useState, useCallback, useEffect } from 'react';
import { createInitialState, evaluate, formatResult, type CalcState, type AngleMode } from './engine';

// Key definition
interface KeyDef {
  label: string;
  secondLabel?: string;
  action: string;
  span?: number;
  style: 'num' | 'op' | 'func' | 'func2' | 'enter' | 'special' | 'nav';
}

const KEYS: KeyDef[][] = [
  // Row 1: Mode/Control
  [
    { label: '2nd', action: '2nd', style: 'func2' },
    { label: 'MODE', action: 'mode', style: 'func', secondLabel: 'QUIT' },
    { label: 'DEL', action: 'del', style: 'func', secondLabel: 'INS' },
    { label: '←', action: 'left', style: 'nav' },
    { label: '→', action: 'right', style: 'nav' },
  ],
  // Row 2: Scientific functions
  [
    { label: 'x⁻¹', action: 'x⁻¹', style: 'func', secondLabel: 'nCr' },
    { label: 'x²', action: 'x²', style: 'func', secondLabel: 'x³' },
    { label: '^', action: '^', style: 'func', secondLabel: 'ⁿ√' },
    { label: '√', action: '√', style: 'func', secondLabel: '³√' },
    { label: 'n/d', action: 'frac', style: 'func', secondLabel: 'Un/d' },
  ],
  // Row 3: Trig
  [
    { label: 'sin', action: 'sin', style: 'func', secondLabel: 'sin⁻¹' },
    { label: 'cos', action: 'cos', style: 'func', secondLabel: 'cos⁻¹' },
    { label: 'tan', action: 'tan', style: 'func', secondLabel: 'tan⁻¹' },
    { label: 'log', action: 'log', style: 'func', secondLabel: '10^' },
    { label: 'ln', action: 'ln', style: 'func', secondLabel: 'e^' },
  ],
  // Row 4: Memory + top numbers
  [
    { label: 'STO→', action: 'sto', style: 'func' },
    { label: '(', action: '(', style: 'func' },
    { label: ')', action: ')', style: 'func' },
    { label: 'DATA', action: 'data', style: 'func', secondLabel: 'STAT' },
    { label: 'CLEAR', action: 'clear', style: 'special' },
  ],
  // Row 5: Numbers 7-9, ÷
  [
    { label: '7', action: '7', style: 'num' },
    { label: '8', action: '8', style: 'num' },
    { label: '9', action: '9', style: 'num' },
    { label: '÷', action: '÷', style: 'op' },
    { label: '%', action: '%', style: 'op' },
  ],
  // Row 6: Numbers 4-6, ×
  [
    { label: '4', action: '4', style: 'num' },
    { label: '5', action: '5', style: 'num' },
    { label: '6', action: '6', style: 'num' },
    { label: '×', action: '×', style: 'op' },
    { label: 'π', action: 'π', style: 'func', secondLabel: 'e' },
  ],
  // Row 7: Numbers 1-3, -
  [
    { label: '1', action: '1', style: 'num' },
    { label: '2', action: '2', style: 'num' },
    { label: '3', action: '3', style: 'num' },
    { label: '−', action: '−', style: 'op' },
    { label: '(−)', action: 'neg', style: 'func' },
  ],
  // Row 8: 0, ., enter, +
  [
    { label: '0', action: '0', style: 'num' },
    { label: '.', action: '.', style: 'num' },
    { label: 'Ans', action: 'ans', style: 'func', secondLabel: 'RCL' },
    { label: '+', action: '+', style: 'op' },
    { label: 'ENTER', action: 'enter', style: 'enter' },
  ],
];

const KEY_STYLES: Record<string, string> = {
  num: 'bg-calc-key-num hover:brightness-120 active:brightness-80 text-white font-medium',
  op: 'bg-calc-key-op hover:brightness-120 active:brightness-80 text-white font-bold',
  func: 'bg-calc-key-func hover:brightness-120 active:brightness-80 text-white text-xs',
  func2: 'bg-calc-key-2nd hover:brightness-120 active:brightness-80 text-white text-xs font-bold',
  enter: 'bg-calc-key-enter hover:brightness-120 active:brightness-80 text-white font-bold',
  special: 'bg-red-700 hover:brightness-120 active:brightness-80 text-white text-xs font-bold',
  nav: 'bg-calc-key hover:brightness-120 active:brightness-80 text-white',
};

export default function Calculator() {
  const [state, setState] = useState<CalcState>(createInitialState);
  const [showHistory, setShowHistory] = useState(false);

  const handleKey = useCallback((action: string) => {
    setState(prev => {
      const s = { ...prev };

      // Handle 2nd key toggle
      if (action === '2nd') {
        return { ...s, secondActive: !s.secondActive };
      }

      // If 2nd is active, remap actions
      let finalAction = action;
      if (s.secondActive) {
        const secondMap: Record<string, string> = {
          'sin': 'sin⁻¹', 'cos': 'cos⁻¹', 'tan': 'tan⁻¹',
          'log': '10^', 'ln': 'e^',
          'x²': 'x³', '√': '³√', 'x⁻¹': 'nCr',
          'π': 'e_const', 'ans': 'rcl',
        };
        finalAction = secondMap[action] || action;
        s.secondActive = false;
      }

      // Clear error on any key
      if (s.error && finalAction !== 'clear') {
        s.error = null;
        s.expression = '';
      }

      switch (finalAction) {
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
        case '.':
          s.expression += finalAction;
          break;

        case '+': case '−': case '×': case '÷': case '^': case '%':
          s.expression += finalAction;
          break;

        case '(': case ')':
          s.expression += finalAction;
          break;

        case 'neg':
          s.expression += '(−';
          break;

        case 'π':
          s.expression += 'π';
          break;

        case 'e_const':
          s.expression += String(Math.E);
          break;

        case 'sin': case 'cos': case 'tan':
        case 'sin⁻¹': case 'cos⁻¹': case 'tan⁻¹':
        case 'log': case 'ln':
        case '10^': case 'e^':
        case '√': case '³√':
          s.expression += finalAction + '(';
          break;

        case 'x²':
          s.expression += 'x²';
          break;

        case 'x³':
          s.expression += 'x³';
          break;

        case 'x⁻¹':
          s.expression += 'x⁻¹';
          break;

        case 'nCr':
          s.expression += 'nCr';
          break;

        case 'ans':
          s.expression += 'Ans';
          break;

        case 'frac':
          s.expression += '/';
          break;

        case 'del':
          s.expression = s.expression.slice(0, -1);
          break;

        case 'clear':
          return createInitialState();

        case 'mode': {
          // Cycle angle mode
          const modes: AngleMode[] = ['DEG', 'RAD', 'GRAD'];
          const idx = modes.indexOf(s.angleMode);
          s.angleMode = modes[(idx + 1) % 3];
          break;
        }

        case 'enter': {
          if (!s.expression.trim()) break;
          try {
            // Auto-close unclosed parens
            let expr = s.expression;
            const openCount = (expr.match(/\(/g) || []).length;
            const closeCount = (expr.match(/\)/g) || []).length;
            for (let i = 0; i < openCount - closeCount; i++) {
              expr += ')';
            }

            const result = evaluate(expr, s);
            const formatted = formatResult(result, s);
            s.ans = result;
            s.result = formatted;
            s.history = [{ expr: s.expression, result: formatted }, ...s.history].slice(0, 50);

            // Update display
            s.display = [
              s.display[2] || '',
              s.display[3] || '',
              s.expression,
              formatted,
            ];
            s.expression = '';
          } catch (e: any) {
            s.error = e.message || 'Error';
            s.display[3] = 'Error';
          }
          break;
        }

        case 'left':
          s.cursorPos = Math.max(0, s.cursorPos - 1);
          break;
        case 'right':
          s.cursorPos = Math.min(s.expression.length, s.cursorPos + 1);
          break;
      }

      return s;
    });
  }, []);

  // Keyboard support
  useEffect(() => {
    const keyMap: Record<string, string> = {
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
      '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
      '.': '.', '+': '+', '-': '−', '*': '×', '/': '÷',
      '^': '^', '%': '%', '(': '(', ')': ')',
      'Enter': 'enter', 'Backspace': 'del', 'Escape': 'clear',
      'Delete': 'clear', 'ArrowLeft': 'left', 'ArrowRight': 'right',
    };

    const handler = (e: KeyboardEvent) => {
      const action = keyMap[e.key];
      if (action) {
        e.preventDefault();
        handleKey(action);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
      {/* Calculator Body */}
      <div
        className="w-full rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-calc-body)' }}
      >
        {/* Display */}
        <div className="p-3">
          {/* Mode indicators */}
          <div className="flex justify-between text-[10px] px-2 mb-1" style={{ color: 'var(--color-calc-display-text)' }}>
            <span className={state.secondActive ? 'font-bold text-emerald-400' : 'opacity-50'}>2nd</span>
            <span className="font-bold">{state.angleMode}</span>
            <span className="opacity-50">{state.displayMode === 'MATHPRINT' ? 'MP' : 'CL'}</span>
          </div>

          {/* 4-line display */}
          <div
            className="rounded-lg p-3 font-mono min-h-[120px] flex flex-col justify-end"
            style={{
              backgroundColor: 'var(--color-calc-display)',
              color: 'var(--color-calc-display-text)',
            }}
          >
            {/* History lines */}
            {state.display.slice(0, 2).map((line, i) => (
              <div key={i} className="text-xs opacity-50 truncate h-5">{line}</div>
            ))}
            {/* Current expression */}
            <div className="text-sm min-h-6 flex items-center">
              <span>{state.expression}</span>
              <span className="animate-pulse ml-0.5 w-0.5 h-4 bg-current inline-block" />
            </div>
            {/* Result */}
            <div className="text-right text-lg font-bold min-h-7">
              {state.error ? (
                <span className="text-red-600">{state.error}</span>
              ) : (
                state.result || state.display[3]
              )}
            </div>
          </div>
        </div>

        {/* Keypad */}
        <div className="p-3 pt-0">
          {KEYS.map((row, ri) => (
            <div key={ri} className="grid grid-cols-5 gap-1.5 mb-1.5">
              {row.map((key, ki) => (
                <button
                  key={ki}
                  onClick={() => handleKey(key.action)}
                  className={`
                    relative rounded-lg py-2.5 px-1 text-sm
                    transition-all duration-75 select-none
                    focus:outline-none focus:ring-2 focus:ring-primary/50
                    ${KEY_STYLES[key.style]}
                    ${key.span ? `col-span-${key.span}` : ''}
                  `}
                  aria-label={key.secondLabel ? `${key.label}, second function: ${key.secondLabel}` : key.label}
                  title={key.secondLabel ? `2nd: ${key.secondLabel}` : key.label}
                >
                  {/* Second function label */}
                  {key.secondLabel && (
                    <span className={`absolute -top-0.5 left-1/2 -translate-x-1/2 text-[8px] transition-opacity ${
                      state.secondActive ? 'text-emerald-300 opacity-100 font-bold' : 'text-emerald-400/60 opacity-70'
                    }`}>
                      {key.secondLabel}
                    </span>
                  )}
                  <span className={key.secondLabel ? 'mt-1 block' : ''}>
                    {key.label}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* History Panel */}
      <div className="w-full">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          {showHistory ? '▼ Hide History' : '▶ Show History'} ({state.history.length})
        </button>
        {showHistory && state.history.length > 0 && (
          <div className="mt-2 rounded-lg bg-bg-card border border-border p-3 max-h-48 overflow-y-auto">
            {state.history.map((h, i) => (
              <div key={i} className="text-sm py-1 border-b border-border/50 last:border-0">
                <div className="text-text-muted text-xs">{h.expr}</div>
                <div className="text-text font-mono text-right">{h.result}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
