export interface KeyDef {
  label: string;
  secondLabel?: string;
  action: string;
  style: 'num' | 'op' | 'func' | 'func2' | 'enter' | 'special' | 'nav';
}

export interface CalculatorModel {
  id: string;
  name: string;
  slug: string;
  description: string;
  keyLayout: KeyDef[][];
  features: {
    graphing: boolean;
    matrix: boolean;
    programming: boolean;
    complexNumbers: boolean;
    solver: boolean;
  };
  seoKeywords: string[];
  displayName: string;       // e.g. "TI-30XS MultiView"
  shortName: string;         // e.g. "TI-30XS"
  bodyGradient?: string;     // CSS gradient for calculator body
}
