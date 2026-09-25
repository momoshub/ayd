import type { AydBridge } from '../preload.mjs';

export {};

declare global {
  interface Window {
    ayd: AydBridge;
  }
}
