import { useState, StateUpdater } from 'preact/hooks';

export function useToggle(initialState: boolean): [ boolean, VoidFunction, StateUpdater<boolean> ] {
  const [ state, updateState ] = useState(initialState);
  function toggle(): void {
    updateState(!state);
  }
  return [ state, toggle, updateState ];
}
