/** A live snapshot of one persona's browser window, for the GUI's progress view. */
export interface TabInfo {
  readonly personaId: string;
  readonly label: string;
  readonly url: string;
  readonly title: string;
}

/** Reports the state of the open persona windows so the UI can show per-tab progress. */
export interface TabReporter {
  listTabs(): Promise<readonly TabInfo[]>;
}
