import { PiecesFilterType } from '@activepieces/shared';

export * from './project-stripe';

export type FlowPlanLimits = {
  nickname: string;
  tasks: number;
  minimumPollingInterval: number;
  connections: number;
  teamMembers: number;
  pieces: string[];
  aiTokens: number;
  piecesFilterType: PiecesFilterType;
};

export const MAXIMUM_ALLOWED_TASKS = 1000000;

export const DEFAULT_FREE_PLAN_LIMIT = {
  nickname: 'free-pay-as-you-go',
  tasks: 1000,
  teamMembers: 100,
  connections: 1000,
  pieces: [],
  aiTokens: 200,
  piecesFilterType: PiecesFilterType.NONE,
  minimumPollingInterval: 5,
};

export const DEFAULT_PLATFORM_LIMIT = {
  nickname: 'platform',
  connections: 200,
  tasks: 50000,
  teamMembers: 5,
  pieces: [],
  aiTokens: 0,
  piecesFilterType: PiecesFilterType.NONE,
  minimumPollingInterval: 1,
};

export function getTasksPriceId(stripeKey: string | undefined) {
  const testMode = stripeKey?.startsWith('sk_test');
  return testMode
    ? 'price_1OnWqKKZ0dZRqLEKkcYBso8K'
    : 'price_1Qf7RiKZ0dZRqLEKAgP38l7w';
}

export const PRICE_PER_1000_TASKS = 1;
