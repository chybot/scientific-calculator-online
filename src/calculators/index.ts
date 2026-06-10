export { ti30xs } from './ti-30xs';
export { ti85 } from './ti-85';
export { ti84 } from './ti-84';
export { ti30xa } from './ti-30xa';
export { ti30xiis } from './ti-30xiis';
export { tiNspire } from './ti-nspire';
export type { CalculatorModel, KeyDef } from './types';

import { ti30xs } from './ti-30xs';
import { ti85 } from './ti-85';
import { ti84 } from './ti-84';
import { ti30xa } from './ti-30xa';
import { ti30xiis } from './ti-30xiis';
import { tiNspire } from './ti-nspire';
import type { CalculatorModel } from './types';

export const allModels: CalculatorModel[] = [ti30xs, ti85, ti84, tiNspire, ti30xa, ti30xiis];

export function getModelBySlug(slug: string): CalculatorModel | undefined {
  return allModels.find(m => m.slug === slug);
}
