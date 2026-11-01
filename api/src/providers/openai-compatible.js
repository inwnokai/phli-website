// Any server that speaks the OpenAI chat-completions format with tool calling:
// Ollama (/v1), llama.cpp server, vLLM, LM Studio. Used for local models such as Qwen and Gemma.

const stripThink = (s) => (s ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

export function createOpenAICompatibleProvider(cfg, { fetchImpl = fetch } = {}) {
  const base = cfg.openaiBaseUrl.replace(/\/$/, '');
  const model = cfg.openaiModel;

  return {
    info: { name: 'openai-compatible', model, baseUrl: base },
    createConversation({ system, tools, firstUser }) {
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: firstUser },
      ];
      const toolDefs = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.schema },
      }));

      return {
        async next() {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), cfg.modelTimeoutMs);
          let data;
          try {
            const res = await fetchImpl(`${base}/chat/completions`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                ...(cfg.openaiApiKey ? { authorization: `Bearer ${cfg.openaiApiKey}` } : {}),
              },
              body: JSON.stringify({ model, messages, tools: toolDefs, tool_choice: 'auto', max_tokens: 2048 }),
              signal: ctrl.signal,
            });
            if (!res.ok) throw new Error(`model server returned ${res.status}`);
            data = await res.json();
          } finally {
            clearTimeout(timer);
          }

          const choice = data.choices?.[0];
          const msg = choice?.message ?? {};
          messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });

          const toolCalls = (msg.tool_calls ?? []).map((tc, i) => {
            const raw = tc.function?.arguments;
            let input;
            let parseError;
            try {
              input = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : {}) : raw ?? {};
            } catch {
              parseError = 'arguments were not valid JSON';
            }
            return { id: tc.id ?? `call_${i}`, name: tc.function?.name, input, parseError };
          });

          let stop = 'end';
          if (toolCalls.length) stop = 'tool_use';
          else if (choice?.finish_reason === 'length') stop = 'max_tokens';
          return { text: stripThink(msg.content), toolCalls, stop, costUsd: 0, servedBy: model };
        },
        addToolResults(results) {
          for (const r of results) {
            messages.push({ role: 'tool', tool_call_id: r.id, content: JSON.stringify(r.output) });
          }
        },
      };
    },
  };
}
