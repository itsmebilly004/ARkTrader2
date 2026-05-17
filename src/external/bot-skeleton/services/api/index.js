// Visual-only port: the full barrel re-exports api_base (websocket trade
// engine), ActiveSymbols, ContractsFor, etc. We only need ApiHelpers (which
// is already a stub). `api_base` is exposed as a no-op shape so any straggler
// imports can keep optional-chaining without runtime errors.

export { default as ApiHelpers } from "./api-helpers";

export const api_base = {
  api: null,
  is_stopping: false,
  account_info: {},
  setIsRunning() {},
  createNewInstance() {},
  terminate() {},
  send: async () => ({}),
};
