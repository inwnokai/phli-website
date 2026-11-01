import { createAnthropicProvider } from './anthropic.js';
import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { createFakeProvider } from './fake.js';

/** Pick the backend from LLM_PROVIDER. One interface for all of them. */
export function createProvider(cfg, ctx) {
  switch (cfg.provider) {
    case 'anthropic':
      return createAnthropicProvider(cfg);
    case 'openai':
    case 'ollama':
    case 'llamacpp':
    case 'vllm':
      return createOpenAICompatibleProvider(cfg);
    case 'fake':
      return createFakeProvider(cfg, ctx);
    default:
      throw new Error(`unknown LLM_PROVIDER: ${cfg.provider}`);
  }
}
