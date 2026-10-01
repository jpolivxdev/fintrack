import { vi } from 'vitest';

type ModelMock = Record<string, ReturnType<typeof vi.fn>>;

const MODEL_METHODS = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;

function modelMock(): ModelMock {
  return Object.fromEntries(MODEL_METHODS.map((m) => [m, vi.fn()]));
}

/** A hand-rolled PrismaService double: every model method is a `vi.fn()`. */
export function createPrismaMock() {
  const mock = {
    user: modelMock(),
    refreshToken: modelMock(),
    category: modelMock(),
    transaction: modelMock(),
    budget: modelMock(),
    account: modelMock(),
    transfer: modelMock(),
    household: modelMock(),
    householdMember: modelMock(),
    householdInvite: modelMock(),
    recurringRule: modelMock(),
    goal: modelMock(),
    goalContribution: modelMock(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  // Support both the array form and the interactive (callback) form.
  mock.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? arg(mock) : Promise.all(arg as unknown[]),
  );
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
