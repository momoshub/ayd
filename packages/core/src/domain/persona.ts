/**
 * A persona is one logged-in actor the demo switches between (e.g. an admin and
 * a scoped user). Each gets its own isolated browser session and an on-screen
 * colour frame so viewers always know who they're watching.
 */
export interface Persona {
  readonly id: string;
  readonly label: string;
  /** CSS colour for this persona's window frame + tag (e.g. '#ef4444'). */
  readonly color: string;
}
