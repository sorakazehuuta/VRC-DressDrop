import { useCallback, useReducer } from "react";

const MAX_HISTORY = 100;

type State<T> = { past: T[]; present: T; future: T[]; editing: boolean };

type Action<T> =
  | { type: "change"; update: (prev: T) => T; commit: boolean }
  | { type: "commit" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "change": {
      const next = action.update(state.present);
      if (next === state.present) return state;
      // スライダーのドラッグ中など、確定前の連続した変更は履歴1件にまとめる
      const past = state.editing ? state.past : [...state.past, state.present].slice(-MAX_HISTORY);
      return { past, present: next, future: [], editing: !action.commit };
    }
    case "commit":
      return state.editing ? { ...state, editing: false } : state;
    case "undo": {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
        editing: false,
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), editing: false };
    }
    case "reset":
      return { past: [], present: action.value, future: [], editing: false };
  }
}

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [], editing: false });

  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    // commit=false は「操作中」。onPointerUp などで commit() を呼ぶと履歴が確定する
    change: useCallback((update: (prev: T) => T, commit = true) => dispatch({ type: "change", update, commit }), []),
    commit: useCallback(() => dispatch({ type: "commit" }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
    reset: useCallback((value: T) => dispatch({ type: "reset", value }), []),
  };
}
