// Claude backend through the official Anthropic SDK.
import Anthropic from '@anthropic-ai/sdk';

// USD per million tokens (input, output). Unknown models are priced as Opus so budgets stay conservative.
const PRICES = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
const priceOf = (model) => PRICES[model] ?? PRICES['claude-opus-5-5'];

// Models that accept the server-side refusal fallback in its "default" form.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export function createAnthropicProvider(cfg, { client } = {}) {
  const anthropic = client ?? new Anthropic({ timeout: cfg.modelTimeoutMs, maxRetries: 1 });
  const model = cfg.anthropicModel;

  return {
    info: { name: 'anthropic', model },
    createConversation({ system, tools, firstUser }) {
      const messages = [{ role: 'user', content: firstUser }];
      const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));

      return {
        async next() {
          const params = {
            model,
            max_tokens: 8000,
            system,
            tools: toolDefs,
            tool_choice: { type: 'auto' },
            output_config: { effort: cfg.anthropicEffort },
            messages,
          };
          if (FALLBACK_MODELS.has(model)) {
            params.betas = ['server-side-fallback-2026-07-01'];
            params.fallbacks = 'default';
          }
          const res = await anthropic.beta.messages.create(params);
          // Append the full content (including thinking blocks) so the history stays append-only.
          messages.push({ role: 'assistant', content: res.content });

          const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
          const toolCalls = res.content
            .filter((b) => b.type === 'tool_use')
            .map((b) => ({ id: b.id, name: b.name, input: b.input }));
          const [pin, pout] = priceOf(res.model ?? model);
          const u = res.usage ?? {};
          const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
          const costUsd = (inputTokens * pin + (u.output_tokens ?? 0) * pout) / 1e6;

          let stop = 'end';
          if (res.stop_reason === 'tool_use' && toolCalls.length) stop = 'tool_use';
          else if (res.stop_reason === 'refusal') stop = 'refusal';
          else if (res.stop_reason === 'max_tokens') stop = 'max_tokens';
          return { text, toolCalls, stop, costUsd, servedBy: res.model ?? model };
        },
        addToolResults(results) {
          // All results for one assistant turn go back in a single user message.
          messages.push({
            role: 'user',
            content: results.map((r) => ({
              type: 'tool_result',
              tool_use_id: r.id,
              content: JSON.stringify(r.output),
              ...(r.isError ? { is_error: true } : {}),
            })),
          });
        },
      };
    },
  };
}
