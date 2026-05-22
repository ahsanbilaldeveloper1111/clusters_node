import { useCallback, useEffect, useReducer } from 'react';
import type { AsyncState } from '../types/advanced.js';

type Action<T> =
  | { type: 'load' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: string }
  | { type: 'reset' };

function reducer<T>(state: AsyncState<T>, action: Action<T>): AsyncState<T> {
  switch (action.type) {
    case 'load':
      return { status: 'loading' };
    case 'success':
      return { status: 'success', data: action.data };
    case 'error':
      return { status: 'error', error: action.error };
    case 'reset':
      return { status: 'idle' };
    default:
      return state;
  }
}

export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, dispatch] = useReducer(reducer<T>, { status: 'idle' });

  const execute = useCallback(async () => {
    dispatch({ type: 'load' });
    try {
      const data = await fetcher();
      dispatch({ type: 'success', data });
    } catch (e) {
      dispatch({ type: 'error', error: e instanceof Error ? e.message : 'Unknown error' });
    }
  }, deps);

  useEffect(() => {
    void execute();
  }, [execute]);

  return { state, refetch: execute };
}
