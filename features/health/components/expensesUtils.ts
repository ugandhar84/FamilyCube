import { format } from 'date-fns';
import type { ExpenseCategory } from '@/lib/db/expenses';

export interface ScannedItem {
  id: string;
  description: string;
  amount: string;
  category: ExpenseCategory;
  petId: string;
  keep: boolean;
  confidence: 'high' | 'low';
}

export type FormState = {
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  title: string;
  notes: string;
  id?: string;
};

export interface TrendMonth {
  label: string;
  total: number;
  isCurrent: boolean;
}

export const BLANK: FormState = {
  category: 'food' as ExpenseCategory,
  amount: '',
  expense_date: format(new Date(), 'yyyy-MM-dd'),
  title: '',
  notes: '',
};

export const BAR_H = 96;
