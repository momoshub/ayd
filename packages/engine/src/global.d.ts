export {};

declare global {
  interface Window {
    __ayd?: {
      frame(color: string, label: string): void;
      caption(text: string, sub: string, anchor: 'top' | 'bottom'): void;
      highlight(box: { x: number; y: number; width: number; height: number }, label: string): void;
    };
  }
}
