#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { type Clock, type RunEvent, parseDemoScript, runScript } from '@ayd/core';
import { createPlaywrightDriver, launchDemoBrowser } from '@ayd/engine';
import { parseArgs } from './args.js';

const clock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const render = (e: RunEvent): void => {
  if (e.type === 'run-started') console.log(`▶ run started — ${String(e.totalSteps)} steps`);
  else if (e.type === 'step-started') console.log(`  · [${String(e.index)}] ${e.step.action}`);
  else if (e.type === 'step-succeeded') console.log(`  ✓ [${String(e.index)}] ${e.step.action}`);
  else if (e.type === 'step-failed')
    console.log(`  ✗ [${String(e.index)}] ${e.step.action} — ${e.reason}`);
  else
    console.log(
      `■ done — ${String(e.report.succeeded)}/${String(e.report.total)} ok, ${String(e.report.failed)} failed`,
    );
};

const main = async (): Promise<number> => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.error);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(args.value.scriptPath, 'utf8'));
  } catch (e) {
    console.error(`could not read ${args.value.scriptPath}: ${String(e)}`);
    return 2;
  }

  const script = parseDemoScript(raw);
  if (!script.ok) {
    console.error('invalid DemoScript:');
    for (const issue of script.error) console.error(`  - ${issue.path}: ${issue.message}`);
    return 2;
  }

  const { browser } = await launchDemoBrowser({
    headless: !args.value.headed,
    args: args.value.headed ? ['--start-maximized'] : [],
  });
  const driver = createPlaywrightDriver({
    browser,
    personas: script.value.personas,
    baseUrl: args.value.baseUrl ?? '',
  });
  try {
    const report = await runScript(script.value, {
      driver,
      presenter: { emit: render },
      clock,
      paceMs: args.value.paceMs,
    });
    return report.failed > 0 ? 1 : 0;
  } finally {
    await driver.close();
    await browser.close().catch(() => undefined);
  }
};

process.exitCode = await main();
