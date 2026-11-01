// The agent loop. The model only proposes; the server decides what runs.
import { TOOLS, TOOL_BY_NAME, validateInput, runReadTool, runApprovedWrite } from './tools.js';

const LANG_NAME = { th: 'Thai', en: 'English' };

export function systemPrompt(lang) {
  return [
    'You are the Phli factory assistant in a public website demo. The factory, machines, readings and documents are simulated and fictional.',
    'Your job: investigate the event you are given with the read tools, find the relevant standard operating procedure, and then propose at most one action using a write tool (create a maintenance work order or request a reorder) when the evidence supports it. If no action is needed, say so.',
    'Write tools do not execute. Each one becomes a request that a human approves or rejects. If a request is rejected, accept the decision, do not retry it, and finish.',
    'You cannot start, stop, reset or change settings on machines, and you must not claim to. Stopping a machine is always a human decision; you may recommend it only when the SOP says so.',
    'Cite SOP ids in your proposal. Use only facts returned by tools; never invent readings.',
    `Write every message to the user in ${LANG_NAME[lang] ?? 'English'}. Keep each message to one or two short sentences. Tool arguments may be in English.`,
    'After the approval decision, write one short closing sentence and stop calling tools.',
  ].join('\n');
}

export function factorySnapshot(world) {
  return {
    machines: Object.values(world.machines).map((m) => ({
      id: m.id,
      name: m.name,
      state: m.state,
      workOrders: world.workOrders.filter((w) => w.machineId === m.id).map((w) => w.id),
    })),
    requests: world.requests.map((r) => ({ id: r.id, itemId: r.itemId, quantity: r.quantity })),
  };
}

/**
 * Run one session to completion.
 * session: { id, lang, scenario, world, emit(type, data), waitForDecision(approval) => Promise<'approve'|'reject'|'expired'>, closed }
 * limits: { addCost(usd) }
 */
export async function runAgent(session, provider, cfg, limits) {
  const { lang, scenario, world } = session;
  session.emit('session.started', {
    scenario: session.scenarioId,
    title: scenario.title[lang],
    provider: provider.info.name,
    model: provider.info.model,
    simulated: true,
  });
  session.emit('factory.state', factorySnapshot(world));
  session.emit('factory.event', { text: scenario.event[lang] });

  const conv = provider.createConversation({
    system: systemPrompt(lang),
    tools: TOOLS,
    firstUser: `Event: ${scenario.event.en}\nInvestigate and propose the right action.`,
  });

  let turns = 0;
  let writes = 0;
  let toolCalls = 0;

  const end = (reason, extra = {}) => session.emit('session.ended', { reason, toolCalls, turns, ...extra });

  while (!session.closed) {
    if (turns >= cfg.maxModelTurns) return end('turn_limit');
    turns++;

    let r;
    try {
      r = await conv.next();
    } catch (err) {
      session.emit('agent.error', { message: 'The model backend did not respond. Try again later.' });
      session.log?.(err);
      return end('error');
    }
    if (session.closed) return;
    limits.addCost(r.costUsd ?? 0);
    session.costUsd = (session.costUsd ?? 0) + (r.costUsd ?? 0);

    if (r.text) session.emit('agent.message', { text: r.text });
    if (r.stop === 'refusal') return end('refusal');
    if (r.stop !== 'tool_use') return end(r.stop === 'max_tokens' ? 'max_tokens' : 'done');

    const results = [];
    let hitLimit = false;
    for (const call of r.toolCalls) {
      const tool = TOOL_BY_NAME.get(call.name);
      const display = tool?.display ?? String(call.name);

      if (toolCalls >= cfg.maxToolCalls) {
        hitLimit = true;
        results.push({ id: call.id, name: call.name, isError: true, output: { error: 'Tool call limit reached for this demo session.' } });
        continue;
      }
      toolCalls++;

      const problem = !tool ? `Unknown tool ${call.name}. Use only the listed tools.` : call.parseError ?? validateInput(tool, call.input);
      session.emit('tool.call', { id: call.id, tool: display, kind: tool?.kind ?? 'unknown', input: call.input ?? null });
      if (problem) {
        const output = { error: problem };
        session.emit('tool.result', { id: call.id, tool: display, ok: false, output });
        results.push({ id: call.id, name: call.name, isError: true, output });
        continue;
      }

      if (tool.kind === 'read') {
        const output = runReadTool(world, tool.name, call.input);
        session.emit('tool.result', { id: call.id, tool: display, ok: !output.error, output });
        results.push({ id: call.id, name: call.name, isError: Boolean(output.error), output });
        continue;
      }

      // Write tool: one action per session, and always a human decision. The server sets this
      // policy; nothing the model sends (such as priority) can skip the approval.
      if (writes >= 1) {
        const output = { error: 'Only one action can be proposed per demo session.' };
        session.emit('tool.result', { id: call.id, tool: display, ok: false, output });
        results.push({ id: call.id, name: call.name, isError: true, output });
        continue;
      }
      writes++;
      const approval = { id: `apr_${String(call.id).replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 48), tool: display, input: call.input };
      session.emit('approval.required', approval);
      const decision = await session.waitForDecision(approval);
      if (session.closed) return;
      session.emit('approval.resolved', { id: approval.id, decision });

      let output;
      if (decision === 'approve') {
        output = runApprovedWrite(world, tool.name, call.input);
        session.emit('factory.state', factorySnapshot(world));
      } else {
        output = {
          rejected: true,
          message: decision === 'expired' ? 'No decision was made in time. Nothing was created.' : 'A person rejected this request. Nothing was created. Do not retry.',
        };
      }
      session.emit('tool.result', { id: call.id, tool: display, ok: decision === 'approve', output });
      results.push({ id: call.id, name: call.name, output });
    }

    conv.addToolResults(results);
    if (hitLimit) return end('tool_limit');
  }
}
