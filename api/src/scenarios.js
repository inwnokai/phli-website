// Fictional furniture factory scenarios. Every machine, reading and document here is made up.
// Nothing in this file comes from a real customer.

/** Shared SOP corpus for the knowledge search tool. */
export const SOPS = [
  {
    id: 'SOP-MNT-014',
    title: 'CNC router spindle vibration',
    text:
      'If spindle vibration exceeds 4.5 mm/s RMS, finish the current panel, then inspect spindle bearings and the tool holder taper at the next changeover. Above 7.1 mm/s, a supervisor decides whether to stop the machine. Log readings before and after the inspection.',
  },
  {
    id: 'SOP-MNT-021',
    title: 'Edgebander glue pot temperature',
    text:
      'EVA hot-melt glue must be between 190 and 210 °C. Below 185 °C edges may peel. Check the glue pot heater, thermostat and warm-up time (minimum 15 minutes after start of shift). Quarantine panels edged while the temperature was low and inspect a sample.',
  },
  {
    id: 'SOP-QA-007',
    title: 'Panel saw chipping and blade change',
    text:
      'Chipping on melamine faces above 2% of cut panels indicates a dull main or scoring blade. Change the scoring blade every 8 operating hours and the main blade every 40 hours, or sooner if chipping persists after re-alignment of the scoring blade.',
  },
  {
    id: 'SOP-INV-003',
    title: 'Edge tape reorder rule',
    text:
      'Reorder edge tape when stock on hand falls below scheduled demand for the next 5 working days plus a safety stock of 500 m. Supplier lead time is 3 working days. Purchase requests need approval from the production manager.',
  },
  {
    id: 'SOP-SAF-001',
    title: 'Machine stops and lockout',
    text:
      'Only trained staff may stop, lock out or restart a machine. Software assistants may recommend a stop but never perform it. Follow lockout-tagout before any maintenance inside the guarding.',
  },
];

const baseMachines = () => ({
  'SAW-01': { id: 'SAW-01', name: 'Panel saw 01', state: 'running', job: 'JOB-2211 wardrobe sides', sensors: { blade_hours: 31 } },
  'CNC-01': { id: 'CNC-01', name: 'CNC router 01', state: 'running', job: 'JOB-2211 18 mm panels', sensors: { spindle_vibration_mm_s: 2.1, spindle_temp_c: 41 } },
  'EDGE-01': { id: 'EDGE-01', name: 'Edgebander 01', state: 'running', job: 'JOB-2209 cabinet doors', sensors: { glue_temp_c: 198, feed_m_min: 18 } },
  'PACK-01': { id: 'PACK-01', name: 'Packing', state: 'running', job: 'JOB-2205 shelves', sensors: {} },
});

const baseStock = () => ({
  'TAPE-W2': { id: 'TAPE-W2', name: 'Edge tape 2 mm white', unit: 'm', onHand: 4200, reorderPoint: 1500 },
  'PANEL-18': { id: 'PANEL-18', name: 'Melamine panel 18 mm', unit: 'sheet', onHand: 340, reorderPoint: 120 },
  'GLUE-EVA': { id: 'GLUE-EVA', name: 'EVA hot-melt glue', unit: 'kg', onHand: 85, reorderPoint: 40 },
});

const baseSchedule = () => [
  { job: 'JOB-2209', product: 'Cabinet doors', qty: 600, due: 'D+2', materials: { 'TAPE-W2': 1500 } },
  { job: 'JOB-2211', product: 'Wardrobe sides', qty: 400, due: 'D+3', materials: { 'PANEL-18': 200, 'TAPE-W2': 900 } },
  { job: 'JOB-2214', product: 'Bookshelves', qty: 300, due: 'D+5', materials: { 'TAPE-W2': 700 } },
];

const baseQuality = () => ({ inspected: 1200, defects: 14, topDefects: [{ code: 'SCRATCH', count: 9 }, { code: 'EDGE_GAP', count: 5 }] });

/**
 * Each scenario returns a fresh world. `script` drives the fake provider (CI and offline demo):
 * the list of tool calls a reasonable agent would make, in order.
 */
export const SCENARIOS = {
  'cnc-spindle-vibration': {
    title: { th: 'แรงสั่นสปินเดิล CNC สูง', en: 'High CNC spindle vibration' },
    event: { th: 'เซนเซอร์ CNC-01 รายงานแรงสั่นสปินเดิล 5.2 mm/s (ระดับเตือน 4.5)', en: 'CNC-01 sensor reports spindle vibration 5.2 mm/s (warning level 4.5).' },
    world() {
      const machines = baseMachines();
      machines['CNC-01'].state = 'warning';
      machines['CNC-01'].sensors.spindle_vibration_mm_s = 5.2;
      return { machines, stock: baseStock(), schedule: baseSchedule(), quality: baseQuality(), workOrders: [], requests: [] };
    },
    script: [
      ['production_get_machine_status', { machineId: 'CNC-01' }],
      ['maintenance_get_open_work_orders', { machineId: 'CNC-01' }],
      ['knowledge_search_sop', { query: 'spindle vibration bearing' }],
      ['maintenance_create_work_order', { machineId: 'CNC-01', priority: 'high', title: 'Inspect spindle bearings and tool holder', description: 'Vibration 5.2 mm/s above 4.5 warning (SOP-MNT-014). Inspect at next changeover.' }],
    ],
  },
  'edgebander-glue-temp': {
    title: { th: 'อุณหภูมิกาวเครื่องปิดขอบต่ำ', en: 'Low edgebander glue temperature' },
    event: { th: 'อุณหภูมิหม้อกาว EDGE-01 ลดลงเหลือ 181 °C และมีรายงานขอบหลุด', en: 'EDGE-01 glue pot dropped to 181 °C and edge peeling has been reported.' },
    world() {
      const machines = baseMachines();
      machines['EDGE-01'].state = 'warning';
      machines['EDGE-01'].sensors.glue_temp_c = 181;
      const quality = baseQuality();
      quality.defects = 31;
      quality.topDefects = [{ code: 'EDGE_PEEL', count: 17 }, { code: 'SCRATCH', count: 9 }, { code: 'EDGE_GAP', count: 5 }];
      return { machines, stock: baseStock(), schedule: baseSchedule(), quality, workOrders: [], requests: [] };
    },
    script: [
      ['production_get_machine_status', { machineId: 'EDGE-01' }],
      ['quality_get_summary', {}],
      ['knowledge_search_sop', { query: 'glue temperature edge peeling' }],
      ['maintenance_create_work_order', { machineId: 'EDGE-01', priority: 'high', title: 'Check glue pot heater and thermostat', description: 'Glue at 181 °C, below 185 °C (SOP-MNT-021). Quarantine and sample panels from JOB-2209.' }],
    ],
  },
  'edge-tape-low-stock': {
    title: { th: 'เทปปิดขอบไม่พอกับแผนผลิต', en: 'Edge tape short for the schedule' },
    event: { th: 'ตรวจวัสดุประจำวัน: เทียบสต็อกเทปปิดขอบกับแผนผลิต 5 วัน', en: 'Daily material check: compare edge tape stock with the 5-day schedule.' },
    world() {
      const stock = baseStock();
      stock['TAPE-W2'].onHand = 2300;
      return { machines: baseMachines(), stock, schedule: baseSchedule(), quality: baseQuality(), workOrders: [], requests: [] };
    },
    script: [
      ['inventory_check_stock', { lowStockOnly: false }],
      ['production_get_schedule', {}],
      ['knowledge_search_sop', { query: 'edge tape reorder' }],
      ['inventory_request_reorder', { itemId: 'TAPE-W2', quantity: 1500, reason: 'Demand 3,100 m over 5 days vs 2,300 m on hand; safety stock 500 m (SOP-INV-003).' }],
    ],
  },
  'saw-chipping': {
    title: { th: 'ขอบแผ่นบิ่นที่เลื่อยตัดแผ่น', en: 'Chipping at the panel saw' },
    event: { th: 'QC รายงานผิวเมลามีนบิ่นเพิ่มขึ้นที่ SAW-01', en: 'QC reports rising melamine chipping at SAW-01.' },
    world() {
      const machines = baseMachines();
      machines['SAW-01'].state = 'warning';
      machines['SAW-01'].sensors.blade_hours = 46;
      const quality = baseQuality();
      quality.defects = 38;
      quality.topDefects = [{ code: 'CHIPPING', count: 29 }, { code: 'SCRATCH', count: 9 }];
      return { machines, stock: baseStock(), schedule: baseSchedule(), quality, workOrders: [], requests: [] };
    },
    script: [
      ['quality_get_summary', {}],
      ['production_get_machine_status', { machineId: 'SAW-01' }],
      ['knowledge_search_sop', { query: 'chipping blade change' }],
      ['maintenance_create_work_order', { machineId: 'SAW-01', priority: 'normal', title: 'Change main and scoring blades', description: 'Blade at 46 h (limit 40 h) and chipping 2.4% (SOP-QA-007).' }],
    ],
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS);
