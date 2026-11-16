import type { FeatureMap, UserProfile } from '../shared/contracts.ts';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  HASH_SECRET: string;
  IP_HASH_SALT?: string;
}

export interface AppVariables {
  user: UserProfile | null;
  features: FeatureMap;
  sessionId: string | null;
}

export interface AppEnv {
  Bindings: Env;
  Variables: AppVariables;
}
