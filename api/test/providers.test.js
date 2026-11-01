import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAICompatibleProvider } from '../src/providers/openai-compatible.js';
import { createAnthropicProvider } from '../src/providers/anthropic.js';
import { TOOLS } from '../src/tools.js';
import { createIndex } from '../src/search.js';
import { SOPS } from '../src/scenarios.js';
import { loadConfig } from '../src/config.js';

const cfg = loadConfig({});

test('OpenAI-compatible: sends tools, parses tool calls, strips <think>, returns results as tool messages', async () => {
  const sent = [];
  const replies = [
    { choices: [{ finish_reason: 'tool_calls', message: { content: '<think>hmm</think>Checking.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'quality_get_summary', arguments: '{}' } }] } }] },
    { choices: [{ finish_reason: 'tool_calls', message: { content: '', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'knowledge_search_sop', arguments: '{bad json' } }] } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'Done.' } }] },
  ];
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => replies[sent.length - 1] };
  };
  const p = createOpenAICompatibleProvider({ ...cfg, openaiBaseUrl: 'http://ollama:11434/v1/', openaiModel: 'qwen3:8b' }, { fetchImpl });
  const conv = p.createConversation({ system: 'sys', tools: TOOLS, firstUser: 'go' });

  const r1 = await conv.next();
  assert.equal(sent[0].url, 'http://ollama:11434/v1/chat/completions');
  assert.equal(sent[0].body.model, 'qwen3:8b');
  assert.equal(sent[0].body.tools.length, TOOLS.length);
  assert.equal(sent[0].body.messages[0].role, 'system');
  assert.equal(r1.text, 'Checking.');
  assert.deepEqual(r1.toolCalls[0], { id: 'c1', name: 'quality_get_summary', input: {}, parseError: undefined });
  conv.addToolResults([{ id: 'c1', output: { ok: 1 } }]);

  const r2 = await conv.next();
  assert.equal(sent[1].body.messages.at(-1).role, 'tool');
  assert.equal(sent[1].body.messages.at(-1).tool_call_id, 'c1');
  assert.ok(r2.toolCalls[0].parseError);
  conv.addToolResults([{ id: 'c2', output: { error: 'x' }, isError: true }]);

  const r3 = await conv.next();
  assert.equal(r3.stop, 'end');
  assert.equal(r3.costUsd, 0);
});

test('OpenAI-compatible: HTTP errors throw', async () => {
  const p = createOpenAICompatibleProvider(cfg, { fetchImpl: async () => ({ ok: false, status: 502 }) });
  await assert.rejects(p.createConversation({ system: 's', tools: TOOLS, firstUser: 'u' }).next(), /502/);
});

test('Anthropic: request shape, append-only history, tool_result format, cost', async () => {
  const calls = [];
  const responses = [
    {
      model: 'claude-opus-5-5',
      stop_reason: 'tool_use',
      usage: { input_tokens: 1000, output_tokens: 200 },
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: 'Checking the machine.' },
        { type: 'tool_use', id: 'toolu_1', name: 'production_get_machine_status', input: { machineId: 'CNC-01' } },
      ],
    },
    { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: 'Done.' }] },
  ];
  const client = {
    beta: {
      messages: {
        create: async (params) => {
          calls.push(structuredClone(params));
          return responses[calls.length - 1];
        },
      },
    },
  };
  const p = createAnthropicProvider({ ...cfg, anthropicModel: 'claude-opus-5-5', anthropicEffort: 'medium' }, { client });
  const conv = p.createConversation({ system: 'sys', tools: TOOLS, firstUser: 'go' });

  const r1 = await conv.next();
  const req = calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.tool_choice, { type: 'auto' });
  assert.equal(req.output_config.effort, 'medium');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.thinking, undefined, 'thinking is left at the model default');
  assert.ok(req.tools.every((t) => /^[a-zA-Z0-9_-]{1,64}$/.test(t.name)));
  assert.equal(r1.stop, 'tool_use');
  assert.equal(r1.text, 'Checking the machine.');
  assert.equal(r1.toolCalls[0].id, 'toolu_1');
  assert.ok(Math.abs(r1.costUsd - (1000 * 4 + 200 * 20) / 1e6) < 1e-12);

  conv.addToolResults([{ id: 'toolu_1', output: { a: 1 } }, { id: 'toolu_2', output: { e: 1 }, isError: true }]);
  await conv.next();
  const msgs = calls[1].messages;
  assert.equal(msgs[1].role, 'assistant');
  assert.equal(msgs[1].content[0].type, 'thinking', 'thinking blocks are passed back unchanged');
  assert.equal(msgs[2].role, 'user');
  assert.equal(msgs[2].content.length, 2, 'all tool results go back in one user message');
  assert.deepEqual(msgs[2].content[0], { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"a":1}' });
  assert.equal(msgs[2].content[1].is_error, true);
});

test('Anthropic: models without server-side fallback do not send it', async () => {
  let params;
  const client = { beta: { messages: { create: async (p) => ((params = p), { stop_reason: 'end_turn', content: [], usage: {} }) } } };
  const p = createAnthropicProvider({ ...cfg, anthropicModel: 'claude-haiku-5-5' }, { client });
  await p.createConversation({ system: 's', tools: TOOLS, firstUser: 'u' }).next();
  assert.equal(params.fallbacks, undefined);
  assert.equal(params.betas, undefined);
});

test('SOP keyword search finds the right procedure', () => {
  const search = createIndex(SOPS);
  assert.equal(search('spindle vibration bearing')[0].id, 'SOP-MNT-014');
  assert.equal(search('glue temperature peeling')[0].id, 'SOP-MNT-021');
  assert.equal(search('edge tape reorder')[0].id, 'SOP-INV-003');
  assert.equal(search('chipping blade')[0].id, 'SOP-QA-007');
  assert.deepEqual(search('zzzz'), []);
});
