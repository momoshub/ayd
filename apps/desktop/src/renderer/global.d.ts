import type { AydBridge } from '../preload.js';

export {};

declare global {
  interface Window {
    ayd: AydBridge;
  }
}
