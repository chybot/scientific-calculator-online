import { useState, useCallback, useEffect } from 'react';
import {
  createInitialState, evaluate, formatResult, toFraction,
  calcStats1Var, generateTable, parseMathPrint,
  type CalcState, type AngleMode, type CalcMode, type StatRow, type MathPrintToken,
} from './engine';

// ─── MathPrint Display Renderer ───
function MathPrintExpr({ tokens }: { tokens: MathPrintToken[] }) {
  return (
    <span className="inline-flex items-center flex-wrap gap-0">
      {tokens.map((tok, i) => {
        switch (tok.type) {
          case 'frac':
            return (
              <span key={i} className="inline-flex flex-col items-center mx-0.5 text-[10px] leading-tight">
                <span className="border-b border-current px-0.5">{tok.numerator}</span>
                <span className="px-0.5">{tok.denominator}</span>
              </span>
            );
          case 'sup':
            return <sup key={i} className="text-[9px] -mt-1">{tok.value}</sup>;
          case 'sqrt':
            return <span key={i}>√</span>;
          case 'func':
            return <span key={i} className="text-[11px] opacity-80">{tok.value}</span>;
          case 'op':
            return <span key={i} className="mx-0.5 opacity-70">{tok.value}</span>;
          case 'paren':
            return <span key={i} className="opacity-60">{tok.value}</span>;
          default:
            return <span key={i}>{tok.value}</span>;
        }
      })}
    </span>
  );
}

function ResultDisplay({ value, state }: { value: string; state: CalcState }) {
  if (!value || state.displayMode !== 'MATHPRINT') return <span>{value}</span>;

  // Try to show fraction form
  const numVal = parseFloat(value);
  if (!isNaN(numVal) && !Number.isInteger(numVal)) {
    const frac = toFraction(numVal);
    if (frac && frac.den !== 1) {
      return (
        <span className="inline-flex items-center gap-1">
          <span>{value}</span>
          <span className="text-xs opacity-50 ml-2">
            <span className="inline-flex flex-col items-center text-[10px] leading-tight">
              <span className="border-b border-current px-0.5">{Math.abs(frac.num)}</span>
              <span className="px-0.5">{frac.den}</span>
            </span>
            {frac.num < 0 && <span className="mr-0.5">−</span>}
          </span>
        </span>
      );
    }
  }
  return <span>{value}</span>;
}

// ─── Key Definitions ───
interface KeyDef {
  label: string;
  secondLabel?: string;
  action: string;
  style: 'num' | 'op' | 'func' | 'func2' | 'enter' | 'special' | 'nav';
}

const KEYS: KeyDef[][] = [
  [
    { label: '2nd', action: '2nd', style: 'func2' },
    { label: 'MODE', action: 'mode', style: 'func', secondLabel: 'QUIT' },
    { label: 'DEL', action: 'del', style: 'func', secondLabel: 'INS' },
    { label: '←', action: 'left', style: 'nav' },
    { label: '→', action: 'right', style: 'nav' },
  ],
  [
    { label: 'x⁻¹', action: 'x⁻¹', style: 'func', secondLabel: 'nCr' },
    { label: 'x²', action: 'x²', style: 'func', secondLabel: 'x³' },
    { label: '^', action: '^', style: 'func', secondLabel: 'ⁿ√' },
    { label: '√', action: '√', style: 'func', secondLabel: '³√' },
    { label: 'n/d', action: 'frac', style: 'func', secondLabel: 'Un/d' },
  ],
  [
    { label: 'sin', action: 'sin', style: 'func', secondLabel: 'sin⁻¹' },
    { label: 'cos', action: 'cos', style: 'func', secondLabel: 'cos⁻¹' },
    { label: 'tan', action: 'tan', style: 'func', secondLabel: 'tan⁻¹' },
    { label: 'log', action: 'log', style: 'func', secondLabel: '10^' },
    { label: 'ln', action: 'ln', style: 'func', secondLabel: 'e^' },
  ],
  [
    { label: 'STO→', action: 'sto', style: 'func', secondLabel: 'RCL' },
    { label: '(', action: '(', style: 'func' },
    { label: ')', action: ')', style: 'func' },
    { label: 'DATA', action: 'data', style: 'func', secondLabel: 'STAT' },
    { label: 'CLEAR', action: 'clear', style: 'special' },
  ],
  [
    { label: '7', action: '7', style: 'num' },
    { label: '8', action: '8', style: 'num' },
    { label: '9', action: '9', style: 'num' },
    { label: '÷', action: '÷', style: 'op' },
    { label: '!', action: '!', style: 'op' },
  ],
  [
    { label: '4', action: '4', style: 'num' },
    { label: '5', action: '5', style: 'num' },
    { label: '6', action: '6', style: 'num' },
    { label: '×', action: '×', style: 'op' },
    { label: 'π', action: 'π', style: 'func', secondLabel: 'e' },
  ],
  [
    { label: '1', action: '1', style: 'num' },
    { label: '2', action: '2', style: 'num' },
    { label: '3', action: '3', style: 'num' },
    { label: '−', action: '−', style: 'op' },
    { label: '(−)', action: 'neg', style: 'func' },
  ],
  [
    { label: '0', action: '0', style: 'num' },
    { label: '.', action: '.', style: 'num' },
    { label: 'Ans', action: 'ans', style: 'func' },
    { label: '+', action: '+', style: 'op' },
    { label: 'ENTER', action: 'enter', style: 'enter' },
  ],
];

const KEY_COLORS: Record<string, string> = {
  num: 'bg-[#3d4a6b] hover:bg-[#4d5a7b] active:bg-[#2d3a5b] text-white',
  op: 'bg-[#c0792a] hover:bg-[#d0893a] active:bg-[#a0691a] text-white font-bold',
  func: 'bg-[#2a6a9e] hover:bg-[#3a7aae] active:bg-[#1a5a8e] text-white text-[11px]',
  func2: 'bg-[#1a8a6a] hover:bg-[#2a9a7a] active:bg-[#0a7a5a] text-white text-[11px] font-bold',
  enter: 'bg-[#2a8a4a] hover:bg-[#3a9a5a] active:bg-[#1a7a3a] text-white font-bold',
  special: 'bg-[#c04040] hover:bg-[#d05050] active:bg-[#a03030] text-white text-[11px] font-bold',
  nav: 'bg-[#4a4a6a] hover:bg-[#5a5a7a] active:bg-[#3a3a5a] text-white',
};

// ─── Statistics Panel ───
function StatPanel({ state, onUpdate }: {
  state: CalcState;
  onUpdate: (s: Partial<CalcState>) => void;
}) {
  const addRow = () => {
    onUpdate({ statData: [...state.statData, { value: 0, freq: 1 }] });
  };
  const removeRow = (idx: number) => {
    const d = state.statData.filter((_, i) => i !== idx);
    onUpdate({ statData: d.length ? d : [{ value: 0, freq: 1 }] });
  };
  const updateRow = (idx: number, field: keyof StatRow, val: string) => {
    const d = [...state.statData];
    d[idx] = { ...d[idx], [field]: parseFloat(val) || 0 };
    onUpdate({ statData: d });
  };
  const calculate = () => {
    const results = calcStats1Var(state.statData);
    onUpdate({ statResults: results });
  };

  return (
    <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 w-full">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm">1-Var Statistics</h3>
        <button onClick={() => onUpdate({ calcMode: 'normal' })}
          className="text-xs text-gray-400 hover:text-white">✕ Close</button>
      </div>

      {/* Data entry */}
      <div className="space-y-1 mb-3">
        <div className="grid grid-cols-[2fr_1fr_auto] gap-2 text-[10px] text-gray-400 px-1">
          <span>Value</span><span>Freq</span><span></span>
        </div>
        {state.statData.map((row, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_auto] gap-2">
            <input type="number" value={row.value || ''} onChange={e => updateRow(i, 'value', e.target.value)}
              className="bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-sm text-white w-full"
              placeholder="0" />
            <input type="number" value={row.freq || ''} onChange={e => updateRow(i, 'freq', e.target.value)}
              className="bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-sm text-white w-full"
              placeholder="1" min="1" />
            <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <button onClick={addRow}
          className="text-xs bg-[#2a6a9e] hover:bg-[#3a7aae] text-white px-3 py-1 rounded">+ Add Row</button>
        <button onClick={calculate}
          className="text-xs bg-[#2a8a4a] hover:bg-[#3a9a5a] text-white px-3 py-1 rounded">Calculate</button>
      </div>

      {/* Results */}
      {state.statResults && Object.keys(state.statResults).length > 0 && (
        <div className="border-t border-[#334155] pt-3">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
            {Object.entries(state.statResults).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-400">{key}:</span>
                <span className="font-mono">{typeof val === 'number' ? parseFloat(val.toPrecision(8)).toString() : val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Table Panel ───
function TablePanel({ state, onUpdate }: {
  state: CalcState;
  onUpdate: (s: Partial<CalcState>) => void;
}) {
  const generate = () => {
    if (!state.tableFunc.trim()) return;
    const rows = generateTable(state.tableFunc, state.tableStart, state.tableStep, 10, state);
    onUpdate({ tableRows: rows });
  };

  return (
    <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 w-full">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm">Table Mode</h3>
        <button onClick={() => onUpdate({ calcMode: 'normal' })}
          className="text-xs text-gray-400 hover:text-white">✕ Close</button>
      </div>

      <div className="space-y-2 mb-3">
        <div>
          <label className="text-[10px] text-gray-400 block mb-1">f(x) =</label>
          <input type="text" value={state.tableFunc}
            onChange={e => onUpdate({ tableFunc: e.target.value })}
            className="bg-[#0f172a] border border-[#334155] rounded px-2 py-1.5 text-sm text-white w-full font-mono"
            placeholder="x²+2x+1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Start</label>
            <input type="number" value={state.tableStart}
              onChange={e => onUpdate({ tableStart: parseFloat(e.target.value) || 0 })}
              className="bg-[#0f172a] border border-[#334155] rounded px-2 py-1.5 text-sm text-white w-full" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Step</label>
            <input type="number" value={state.tableStep}
              onChange={e => onUpdate({ tableStep: parseFloat(e.target.value) || 1 })}
              className="bg-[#0f172a] border border-[#334155] rounded px-2 py-1.5 text-sm text-white w-full" />
          </div>
        </div>
        <button onClick={generate}
          className="text-xs bg-[#2a8a4a] hover:bg-[#3a9a5a] text-white px-3 py-1 rounded w-full">
          Generate Table
        </button>
      </div>

      {state.tableRows.length > 0 && (
        <div className="border-t border-[#334155] pt-3">
          <div className="grid grid-cols-2 gap-x-4 text-sm">
            <div className="text-gray-400 font-semibold text-xs border-b border-[#334155] pb-1">x</div>
            <div className="text-gray-400 font-semibold text-xs border-b border-[#334155] pb-1 text-right">f(x)</div>
            {state.tableRows.map((row, i) => (
              <div key={i} className="contents">
                <div className="py-0.5 font-mono text-xs">{row.x}</div>
                <div className="py-0.5 font-mono text-xs text-right">{row.y}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Calculator ───
export default function Calculator() {
  const [state, setState] = useState<CalcState>(createInitialState);
  const [showHistory, setShowHistory] = useState(false);

  const updateState = useCallback((partial: Partial<CalcState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const handleKey = useCallback((action: string) => {
    setState(prev => {
      const s = { ...prev };

      if (action === '2nd') return { ...s, secondActive: !s.secondActive };

      // 2nd remap
      let act = action;
      if (s.secondActive) {
        const map: Record<string, string> = {
          'sin': 'sin⁻¹', 'cos': 'cos⁻¹', 'tan': 'tan⁻¹',
          'log': '10^', 'ln': 'e^',
          'x²': 'x³', '√': '³√', 'x⁻¹': 'nCr',
          'π': 'e_const', 'ans': 'rcl',
          'data': 'stat', 'mode': 'quit', 'sto': 'rcl_menu',
        };
        act = map[action] || action;
        s.secondActive = false;
      }

      // Variable store
      if (s.storingVar) {
        const vars = ['x', 'y', 'z', 't', 'a', 'b', 'c'];
        const varMap: Record<string, string> = { '1': 'x', '2': 'y', '3': 'z', '4': 't', '5': 'a', '6': 'b', '7': 'c' };
        const v = varMap[act];
        if (v && vars.includes(v)) {
          s.memory = { ...s.memory, [v]: s.ans };
          s.storingVar = false;
          s.display = [...s.display.slice(0, 3), `→${v}: ${s.ans}`];
        } else {
          s.storingVar = false;
        }
        return s;
      }

      if (s.error && act !== 'clear') {
        s.error = null;
        s.expression = '';
      }

      switch (act) {
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
        case '.':
          s.expression += act; break;

        case '+': case '−': case '×': case '÷': case '^': case '%':
          s.expression += act; break;

        case '(': case ')': s.expression += act; break;

        case 'neg': s.expression += '(−'; break;
        case 'π': s.expression += 'π'; break;
        case 'e_const': s.expression += 'e'; break;

        // Prefix functions
        case 'sin': case 'cos': case 'tan':
        case 'sin⁻¹': case 'cos⁻¹': case 'tan⁻¹':
        case 'log': case 'ln': case '10^': case 'e^':
        case '√': case '³√':
          s.expression += act + '('; break;

        // Postfix operators (append after current expression)
        case 'x²': s.expression += '²'; break;
        case 'x³': s.expression += '³'; break;
        case 'x⁻¹': s.expression += '⁻¹'; break;
        case '!': s.expression += '!'; break;

        // nCr (binary op between two numbers)
        case 'nCr': s.expression += 'nCr'; break;
        case 'nPr': s.expression += 'nPr'; break;

        case 'frac': s.expression += '/'; break;
        case 'ans': s.expression += 'Ans'; break;

        case 'del':
          // Smart delete: remove multi-char tokens
          if (s.expression.endsWith('⁻¹')) s.expression = s.expression.slice(0, -2);
          else if (s.expression.endsWith('sin(') || s.expression.endsWith('cos(') || s.expression.endsWith('tan(') || s.expression.endsWith('log(') || s.expression.endsWith('abs('))
            s.expression = s.expression.slice(0, -4);
          else if (s.expression.endsWith('Ans')) s.expression = s.expression.slice(0, -3);
          else s.expression = s.expression.slice(0, -1);
          break;

        case 'clear':
          if (s.expression) {
            return { ...s, expression: '', result: '', error: null };
          }
          return { ...createInitialState(), history: s.history, memory: s.memory };

        case 'mode': {
          const modes: AngleMode[] = ['DEG', 'RAD', 'GRAD'];
          s.angleMode = modes[(modes.indexOf(s.angleMode) + 1) % 3];
          break;
        }
        case 'quit': s.calcMode = 'normal'; break;

        case 'sto': s.storingVar = true; break;

        case 'rcl_menu':
        case 'rcl': {
          // Show memory values
          const memStr = Object.entries(s.memory)
            .filter(([, v]) => v !== 0)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') || 'All empty';
          s.display = [...s.display.slice(0, 3), memStr];
          break;
        }

        case 'data': s.calcMode = 'stat'; break;
        case 'stat': s.calcMode = 'stat'; break;
        case 'table': s.calcMode = 'table'; break;

        case 'enter': {
          if (!s.expression.trim()) break;
          try {
            let expr = s.expression;
            const opens = (expr.match(/\(/g) || []).length;
            const closes = (expr.match(/\)/g) || []).length;
            for (let i = 0; i < opens - closes; i++) expr += ')';

            const result = evaluate(expr, s);
            const formatted = formatResult(result, s);
            s.ans = result;
            s.result = formatted;
            s.history = [{ expr: s.expression, result: formatted }, ...s.history].slice(0, 50);
            s.display = [s.display[2] || '', s.display[3] || '', s.expression, formatted];
            s.expression = '';
          } catch (e: any) {
            s.error = e.message || 'Error';
          }
          break;
        }

        case 'left': s.cursorPos = Math.max(0, s.cursorPos - 1); break;
        case 'right': s.cursorPos = Math.min(s.expression.length, s.cursorPos + 1); break;
      }

      return s;
    });
  }, []);

  // Keyboard
  useEffect(() => {
    const map: Record<string, string> = {
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
      '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
      '.': '.', '+': '+', '-': '−', '*': '×', '/': '÷',
      '^': '^', '%': '%', '(': '(', ')': ')', '!': '!',
      'Enter': 'enter', 'Backspace': 'del', 'Escape': 'clear',
      'Delete': 'clear', 'ArrowLeft': 'left', 'ArrowRight': 'right',
      's': 'sin', 'c': 'cos', 't': 'tan', 'l': 'log', 'n': 'ln',
      'q': '√', 'p': 'π',
    };
    const handler = (e: KeyboardEvent) => {
      // Don't capture if in input fields
      if (e.target instanceof HTMLInputElement) return;
      const a = map[e.key];
      if (a) { e.preventDefault(); handleKey(a); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  const mathTokens = parseMathPrint(state.expression);

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      {/* Calculator Body */}
      <div className="w-full rounded-2xl shadow-2xl overflow-hidden border border-[#2a2a4e]"
        style={{ background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)' }}>

        {/* Display */}
        <div className="p-3 pb-1">
          {/* Mode bar */}
          <div className="flex justify-between items-center text-[9px] px-2 mb-1">
            <span className={`transition-colors ${state.secondActive ? 'text-emerald-400 font-bold' : 'text-gray-500'}`}>2nd</span>
            <span className="text-gray-300 font-bold">{state.angleMode}</span>
            <span className="text-gray-500">
              {state.calcMode === 'stat' ? 'STAT' : state.calcMode === 'table' ? 'TABLE' : ''}
            </span>
            {state.storingVar && <span className="text-yellow-400 font-bold animate-pulse">STO→ ?</span>}
          </div>

          {/* 4-line LCD */}
          <div className="rounded-lg p-3 font-mono min-h-[130px] flex flex-col justify-end relative"
            style={{ background: 'linear-gradient(180deg, #b8c8a0 0%, #c8d8b0 30%, #c0d0a8 100%)', color: '#1a2a1a' }}>

            {/* Scanline overlay for LCD effect */}
            <div className="absolute inset-0 rounded-lg pointer-events-none opacity-10"
              style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} />

            {/* History lines */}
            {state.display.slice(0, 2).map((line, i) => (
              <div key={i} className="text-[11px] opacity-40 truncate h-4 leading-4">{line}</div>
            ))}

            {/* Current expression with MathPrint */}
            <div className="text-sm min-h-7 flex items-center relative">
              {state.expression ? (
                <MathPrintExpr tokens={mathTokens} />
              ) : (
                <span className="opacity-30">0</span>
              )}
              <span className="animate-pulse ml-0.5 w-0.5 h-4 bg-current inline-block opacity-60" />
            </div>

            {/* Result line */}
            <div className="text-right text-lg font-bold min-h-7 leading-7">
              {state.error ? (
                <span className="text-red-800">{state.error}</span>
              ) : (
                <ResultDisplay value={state.result || state.display[3] || ''} state={state} />
              )}
            </div>
          </div>
        </div>

        {/* Mode tabs (below display) */}
        <div className="flex gap-1 px-3 pb-1">
          {(['normal', 'stat', 'table'] as CalcMode[]).map(mode => (
            <button key={mode} onClick={() => updateState({ calcMode: mode })}
              className={`text-[9px] px-2 py-0.5 rounded-t transition-colors ${
                state.calcMode === mode
                  ? 'bg-[#2a6a9e] text-white'
                  : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {mode === 'normal' ? 'CALC' : mode.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Keypad */}
        <div className="p-2.5 pt-1">
          {KEYS.map((row, ri) => (
            <div key={ri} className="grid grid-cols-5 gap-[5px] mb-[5px]">
              {row.map((key, ki) => (
                <button key={ki} onClick={() => handleKey(key.action)}
                  className={`relative rounded-lg py-2 px-0.5 text-[13px] select-none
                    transition-all duration-75 shadow-sm active:shadow-none active:translate-y-px
                    focus:outline-none focus:ring-1 focus:ring-blue-400/50
                    ${KEY_COLORS[key.style]}`}
                  aria-label={key.secondLabel ? `${key.label}, second: ${key.secondLabel}` : key.label}>
                  {key.secondLabel && (
                    <span className={`absolute -top-[3px] left-1/2 -translate-x-1/2 text-[7px] leading-none
                      ${state.secondActive ? 'text-emerald-300 font-bold' : 'text-emerald-500/50'}`}>
                      {key.secondLabel}
                    </span>
                  )}
                  <span className={key.secondLabel ? 'mt-0.5 block' : ''}>{key.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Stat/Table Panel (below calculator) */}
      {state.calcMode === 'stat' && <StatPanel state={state} onUpdate={updateState} />}
      {state.calcMode === 'table' && <TablePanel state={state} onUpdate={updateState} />}

      {/* History */}
      <div className="w-full">
        <button onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {showHistory ? '▾ Hide' : '▸ History'} ({state.history.length})
        </button>
        {showHistory && state.history.length > 0 && (
          <div className="mt-2 rounded-lg bg-[#1e293b] border border-[#334155] p-3 max-h-48 overflow-y-auto">
            {state.history.map((h, i) => (
              <button key={i} onClick={() => updateState({ expression: h.expr })}
                className="w-full text-left text-sm py-1.5 border-b border-[#334155]/50 last:border-0 hover:bg-[#334155]/30 rounded px-1 transition-colors">
                <div className="text-gray-400 text-xs font-mono">
                  <MathPrintExpr tokens={parseMathPrint(h.expr)} />
                </div>
                <div className="text-white font-mono text-right">{h.result}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
