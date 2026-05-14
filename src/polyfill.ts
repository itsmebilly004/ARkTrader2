// src/polyfill.ts
import WebSocket from "ws";

if (typeof window === "undefined" && !globalThis.WebSocket) {
  Object.defineProperty(globalThis, "WebSocket", {
    value: WebSocket,
    configurable: true,
  });
}
export {};
