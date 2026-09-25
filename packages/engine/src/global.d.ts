export {};

interface AydChatMessage {
  kind: string;
  text?: string;
  tool?: string;
  detail?: string;
}

declare global {
  interface Window {
    __ayd?: {
      moveCursor(x: number, y: number): void;
      ripple(x: number, y: number): void;
      frame(color: string, label: string): void;
      caption(text: string, sub: string, anchor: 'top' | 'bottom'): void;
      highlight(box: { x: number; y: number; width: number; height: number }, label: string): void;
      chat: {
        mount(): void;
        push(message: AydChatMessage): void;
        show(): void;
        hide(): void;
        setVisible(visible: boolean): void;
        setBusy(busy: boolean): void;
      };
    };
    /** Exposed by the driver via Playwright bindings; the in-page box calls it to send. */
    __aydChatSend?: (text: string) => void;
  }
}
