import { TransactionType } from '../generated/prisma/client.js';

/** Every new household starts with one account so entries have somewhere to go. */
export const DEFAULT_ACCOUNT = {
  name: 'Conta principal',
  type: 'CHECKING',
  color: '#8b5cf6',
  icon: 'landmark',
} as const;

/** Categories every new household starts with, so the app is usable right away. */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}> = [
  { name: 'Salário', type: 'INCOME', color: '#22c55e', icon: 'briefcase' },
  { name: 'Freelance', type: 'INCOME', color: '#14b8a6', icon: 'laptop' },
  { name: 'Investimentos', type: 'INCOME', color: '#3b82f6', icon: 'trending-up' },
  { name: 'Moradia', type: 'EXPENSE', color: '#f97316', icon: 'home' },
  { name: 'Alimentação', type: 'EXPENSE', color: '#ef4444', icon: 'utensils' },
  { name: 'Transporte', type: 'EXPENSE', color: '#eab308', icon: 'car' },
  { name: 'Saúde', type: 'EXPENSE', color: '#ec4899', icon: 'heart-pulse' },
  { name: 'Lazer', type: 'EXPENSE', color: '#8b5cf6', icon: 'gamepad-2' },
  { name: 'Educação', type: 'EXPENSE', color: '#06b6d4', icon: 'graduation-cap' },
  { name: 'Assinaturas', type: 'EXPENSE', color: '#64748b', icon: 'repeat' },
];
