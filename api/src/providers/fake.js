// Deterministic provider for CI and for running the demo with no model at all.
// It replays the scenario script one tool call per turn, then writes a short summary.

const SAY = {
  th: {
    start: 'กำลังตรวจสอบเหตุการณ์นี้',
    next: 'ตรวจข้อมูลเพิ่ม',
    propose: 'ข้อมูลพอแล้ว เสนอการดำเนินการให้คนอนุมัติ',
    approved: 'คนอนุมัติแล้ว บันทึกไว้เรียบร้อย ผมจะเฝ้าดูค่าต่อไป',
    rejected: 'รับทราบว่าไม่อนุมัติ ไม่มีการสร้างอะไร ผมจะเฝ้าดูค่าต่อไป',
  },
  en: {
    start: 'Investigating this event.',
    next: 'Checking more data.',
    propose: 'I have enough to propose an action for a person to approve.',
    approved: 'Approved by a person and recorded. I will keep watching the readings.',
    rejected: 'Understood, not approved. Nothing was created. I will keep watching the readings.',
  },
};

export function createFakeProvider(cfg, { script, lang = 'en' } = {}) {
  const say = SAY[lang] ?? SAY.en;
  return {
    info: { name: 'fake', model: 'scripted' },
    createConversation() {
      let i = 0;
      let lastResult = null;
      return {
        async next() {
          if (cfg.fakeDelayMs) await new Promise((r) => setTimeout(r, cfg.fakeDelayMs));
          if (i < script.length) {
            const [name, input] = script[i];
            const text = i === 0 ? say.start : i === script.length - 1 ? say.propose : say.next;
            i++;
            return { text, toolCalls: [{ id: `fake_${i}`, name, input }], stop: 'tool_use', costUsd: 0, servedBy: 'scripted' };
          }
          const approved = lastResult && !lastResult.isError && !lastResult.output?.rejected;
          return { text: approved ? say.approved : say.rejected, toolCalls: [], stop: 'end', costUsd: 0, servedBy: 'scripted' };
        },
        addToolResults(results) {
          lastResult = results.at(-1);
        },
      };
    },
  };
}
