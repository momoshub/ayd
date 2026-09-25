import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { BrowserDriver, PageObserver, Selector } from '@ayd/core';
import { z } from 'zod';

/** Zod shape for a driver-agnostic selector, mirrored from core's Selector. */
export const selectorSchema = z.object({
  kind: z.enum(['role', 'text', 'testId', 'label', 'css']),
  role: z.string().optional(),
  name: z.string().optional(),
  exact: z.boolean().optional(),
  text: z.string().optional(),
  testId: z.string().optional(),
  label: z.string().optional(),
  css: z.string().optional(),
});

export type SelectorInput = z.infer<typeof selectorSchema>;

/** Convert a tool's selector input into a domain Selector, or null if a required field is missing. */
export const toDomainSelector = (s: SelectorInput): Selector | null => {
  switch (s.kind) {
    case 'role':
      return s.role !== undefined
        ? {
            kind: 'role',
            role: s.role,
            ...(s.name !== undefined ? { name: s.name } : {}),
            ...(s.exact !== undefined ? { exact: s.exact } : {}),
          }
        : null;
    case 'text':
      return s.text !== undefined ? { kind: 'text', text: s.text } : null;
    case 'testId':
      return s.testId !== undefined ? { kind: 'testId', testId: s.testId } : null;
    case 'label':
      return s.label !== undefined ? { kind: 'label', label: s.label } : null;
    case 'css':
      return s.css !== undefined ? { kind: 'css', css: s.css } : null;
  }
};

/** The tool names exposed to the agent (without the mcp__ayd__ prefix). */
export const BROWSER_TOOL_NAMES = [
  'navigate',
  'switchTo',
  'click',
  'type',
  'highlight',
  'waitFor',
  'expect',
  'caption',
  'observe',
] as const;

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const need = (name: string) => text(`error: selector for ${name} is missing its required field`);

/**
 * An in-process MCP server exposing the demo actions as tools the Claude Agent
 * SDK can call to drive the real browser during a live session. Handlers are
 * thin wrappers over the injected BrowserDriver.
 */
export const createBrowserMcpServer = (driver: BrowserDriver & PageObserver) =>
  createSdkMcpServer({
    name: 'ayd',
    version: '0.0.0',
    tools: [
      tool(
        'observe',
        'Read the current page for a persona (url, title, headings, links, controls) to understand the app or investigate it before acting',
        { personaId: z.string() },
        async (a) => {
          const obs = await driver.observe(a.personaId);
          return text(JSON.stringify(obs, null, 2));
        },
      ),
      tool(
        'navigate',
        'Bring a persona to front and open a path or URL',
        { personaId: z.string(), path: z.string() },
        async (a) => {
          await driver.bringToFront(a.personaId);
          await driver.navigate(a.personaId, a.path);
          return text(`navigated ${a.personaId} → ${a.path}`);
        },
      ),
      tool(
        'switchTo',
        "Switch the on-screen focus to a persona's window",
        { personaId: z.string() },
        async (a) => {
          await driver.bringToFront(a.personaId);
          return text(`switched to ${a.personaId}`);
        },
      ),
      tool(
        'click',
        'Click an element for a persona',
        { personaId: z.string(), target: selectorSchema },
        async (a) => {
          const sel = toDomainSelector(a.target);
          if (!sel) return need('click');
          await driver.click(a.personaId, sel);
          return text('clicked');
        },
      ),
      tool(
        'type',
        'Type text into an element',
        {
          personaId: z.string(),
          target: selectorSchema,
          textToType: z.string(),
          submit: z.boolean().optional(),
        },
        async (a) => {
          const sel = toDomainSelector(a.target);
          if (!sel) return need('type');
          await driver.type(a.personaId, sel, a.textToType, { submit: a.submit === true });
          return text('typed');
        },
      ),
      tool(
        'highlight',
        'Draw a success highlight on an element',
        { personaId: z.string(), target: selectorSchema, label: z.string().optional() },
        async (a) => {
          const sel = toDomainSelector(a.target);
          if (!sel) return need('highlight');
          await driver.highlight(a.personaId, sel, a.label);
          return text('highlighted');
        },
      ),
      tool(
        'waitFor',
        'Wait for an element to be visible or hidden',
        {
          personaId: z.string(),
          target: selectorSchema,
          state: z.enum(['visible', 'hidden']).optional(),
          timeoutMs: z.number().optional(),
        },
        async (a) => {
          const sel = toDomainSelector(a.target);
          if (!sel) return need('waitFor');
          const ok = await driver.waitFor(
            a.personaId,
            sel,
            a.state ?? 'visible',
            a.timeoutMs ?? 5000,
          );
          return text(ok ? 'appeared' : 'timed out');
        },
      ),
      tool(
        'expect',
        'Assert an element is visible or hidden',
        { personaId: z.string(), target: selectorSchema, toBe: z.enum(['visible', 'hidden']) },
        async (a) => {
          const sel = toDomainSelector(a.target);
          if (!sel) return need('expect');
          const visible = await driver.isVisible(a.personaId, sel);
          const satisfied = a.toBe === 'visible' ? visible : !visible;
          return text(`expect ${a.toBe}: ${satisfied ? 'PASS' : 'FAIL'}`);
        },
      ),
      tool(
        'caption',
        'Show an on-screen caption across all windows',
        { text: z.string(), sub: z.string().optional() },
        async (a) => {
          await driver.caption(a.text, a.sub);
          return text('captioned');
        },
      ),
    ],
  });
