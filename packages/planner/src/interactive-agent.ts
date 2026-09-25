import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentMessage,
  AgentSession,
  BrowserDriver,
  InteractiveAgent,
  PageObserver,
  PageShooter,
  StartAgentRequest,
} from '@ayd/core';
import { summarizeMemory } from '@ayd/core';
import { createBrowserMcpServer } from './browser-tools.js';
import { createMemoryMcpServer, type AgentMemory } from './memory-tools.js';
import { DISALLOWED_TOOLS } from './claude-planner.js';

/** The slice of an SDK message we read; `query` satisfies this structurally. */
interface AgentSdkMessage {
  readonly type: string;
  readonly subtype?: string;
  readonly result?: string;
  // `unknown` because some SDK message variants carry `message: string`; we narrow below.
  readonly message?: unknown;
}

type ContentBlock = { type: string; text?: string; name?: string; input?: unknown };

const contentOf = (message: unknown): readonly ContentBlock[] => {
  if (typeof message === 'object' && message !== null && 'content' in message) {
    const content = (message as { content?: unknown }).content;
    if (Array.isArray(content)) return content as ContentBlock[];
  }
  return [];
};

interface ControllableQuery extends AsyncIterable<AgentSdkMessage> {
  interrupt(): Promise<unknown>;
}

export type InteractiveQueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => ControllableQuery;

export interface InteractiveAgentOptions {
  readonly driver: BrowserDriver & PageObserver & PageShooter;
  /** When provided, the agent recalls/records the app's feature-map + interactions. */
  readonly memory?: AgentMemory;
  readonly model?: string;
  /** Injected for tests; defaults to the real Claude Agent SDK `query`. */
  readonly runQuery?: InteractiveQueryFn;
}

const userMsg = (content: string): SDKUserMessage => ({
  type: 'user',
  message: { role: 'user', content },
  parent_tool_use_id: null,
  session_id: '',
});

const END = Symbol('end');

/** A pull-based stream the operator feeds messages into over the session's life. */
const createInputStream = (first: string) => {
  const buffer: Array<SDKUserMessage | typeof END> = [userMsg(first)];
  let awaiting: ((v: SDKUserMessage | typeof END) => void) | null = null;
  const offer = (v: SDKUserMessage | typeof END): void => {
    if (awaiting) {
      awaiting(v);
      awaiting = null;
    } else buffer.push(v);
  };
  const iterable: AsyncIterable<SDKUserMessage> = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        const next =
          buffer.length > 0
            ? buffer.shift()!
            : await new Promise<SDKUserMessage | typeof END>((r) => (awaiting = r));
        if (next === END) return;
        yield next;
      }
    },
  };
  return { iterable, push: (text: string) => offer(userMsg(text)), close: () => offer(END) };
};

const summarize = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined;
  const rec = input as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof rec['personaId'] === 'string') parts.push(rec['personaId']);
  if (typeof rec['path'] === 'string') parts.push(rec['path']);
  if (typeof rec['text'] === 'string') parts.push(`"${rec['text']}"`);
  return parts.length > 0 ? parts.join(' ') : undefined;
};

const emitFrom = (m: AgentSdkMessage, emit: (msg: AgentMessage) => void): void => {
  if (m.type === 'assistant') {
    for (const block of contentOf(m.message)) {
      if (block.type === 'text' && block.text !== undefined && block.text.trim() !== '') {
        emit({ kind: 'assistant', text: block.text });
      } else if (block.type === 'tool_use' && block.name !== undefined) {
        const tool = block.name.replace(/^mcp__[a-z]+__/, '');
        const detail = summarize(block.input);
        emit(detail !== undefined ? { kind: 'action', tool, detail } : { kind: 'action', tool });
      }
    }
  } else if (m.type === 'result') {
    const text = m.subtype === 'success' ? m.result : `turn ended: ${m.subtype ?? 'unknown'}`;
    emit(text !== undefined ? { kind: 'done', text } : { kind: 'done' });
  }
};

/**
 * A live agent that drives the browser through in-process MCP tools while the
 * operator chats, interrupts, and continues — the "chat on the open browser"
 * flow. Built on the Claude Agent SDK's streaming input + interrupt.
 */
export const createInteractiveAgent = (opts: InteractiveAgentOptions): InteractiveAgent => {
  const runQuery: InteractiveQueryFn = opts.runQuery ?? query;
  return {
    start(request: StartAgentRequest): AgentSession {
      const memory = opts.memory;
      const personaList = request.personas.map((p) => `${p.id} ("${p.label}")`).join(', ');
      const options: Options = {
        systemPrompt: [
          'You drive a LIVE product demo through the ayd browser tools (mcp__ayd__*).',
          `Personas (isolated browser windows): ${personaList}.`,
          `${request.baseUrl !== undefined ? `App base URL: ${request.baseUrl}. ` : ''}`,
          'EXPLORE the app like a person would, do NOT guess URLs. Use navigate only for the',
          'base URL (or a path the operator explicitly gives you). To reach any other page,',
          'call observe to read the current page, then click the real links, menus, tabs, and',
          'buttons it reports. Never invent or guess deeper URL paths.',
          'After every navigate or click, call observe again before deciding the next action,',
          'and build selectors (role/text/label) from what observe actually returns, not from assumptions.',
          'Loading is not failure: navigate reports readyState/loading, and observe returns them too.',
          'If a page is still loading (e.g. a slow login), waitFor a real element or observe again and',
          'give it time. Only treat it as failed after it has finished loading and the expected thing is absent.',
          'To read a page fast, or to see anything the DOM can not describe (a canvas, a chart, a',
          'CROSS-ORIGIN iframe), use screenshot and look at the image instead of only observe.',
          'iframes: observe lists them. To act on an element inside one, set the selector "frame" to the',
          'chain of iframe CSS selectors (outermost first), e.g. frame: ["iframe#editor"]. frameLocator',
          'works across origins for clicking/typing even when observe can not read the frame DOM.',
          'Narrate briefly, caption before a big move, and switchTo when you change persona.',
          ...(memory
            ? [
                'You have a persistent memory of this app (mcp__mem__*). Call recallMemory when unsure,',
                'recordFeature when you discover a page/workflow/control, and recordInteraction to log notable outcomes.',
                'If asked to investigate, explore by observing and clicking real navigation (not URL guessing) and build the feature map as you go.',
                `\nWhat you already know about this app:\n${summarizeMemory(memory.current())}`,
              ]
            : []),
          'The operator may interject or interrupt; adapt to their latest message.',
        ].join('\n'),
        mcpServers: {
          ayd: createBrowserMcpServer(opts.driver),
          ...(memory ? { mem: createMemoryMcpServer(memory) } : {}),
        },
        allowedTools: memory ? ['mcp__ayd', 'mcp__mem'] : ['mcp__ayd'],
        disallowedTools: [...DISALLOWED_TOOLS],
        settingSources: [],
        strictMcpConfig: true,
        permissionMode: 'default',
        ...(opts.model !== undefined ? { model: opts.model } : {}),
      };

      const input = createInputStream(request.firstMessage);
      const q = runQuery({ prompt: input.iterable, options });

      // Reliably log the operator's opening ask so the interaction history survives
      // even if the agent never calls recordInteraction itself.
      if (memory) void memory.note(`operator: ${request.firstMessage}`).catch(() => undefined);
      request.onMessage({ kind: 'status', text: 'session started' });
      void (async () => {
        try {
          for await (const m of q) emitFrom(m, request.onMessage);
        } catch (e) {
          request.onMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
        }
      })();

      return {
        send: (text) => {
          request.onMessage({ kind: 'status', text: `you: ${text}` });
          input.push(text);
        },
        interrupt: async () => {
          await q.interrupt().catch(() => undefined);
          request.onMessage({ kind: 'status', text: 'stopped — press Continue or send a message' });
        },
        // Code-driven continue: feed a fixed continuation instruction, not an operator
        // prompt, so there is no "you:" echo and the model just carries on.
        resume: () => {
          request.onMessage({ kind: 'status', text: 'resuming' });
          input.push('Continue with the current task.');
        },
        end: async () => {
          input.close();
          await q.interrupt().catch(() => undefined);
          request.onMessage({ kind: 'status', text: 'session ended' });
        },
      };
    },
  };
};
