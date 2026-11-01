// Tools the demo agent may call. Read tools run immediately against the simulated world.
// Write tools never run directly: the server turns them into an approval request, and only a
// human decision executes them. There is deliberately no tool that starts, stops, resets or
// changes settings on a machine.
import { SOPS } from './scenarios.js';
import { createIndex } from './search.js';

const searchSops = createIndex(SOPS);

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const machineId = { type: 'string', description: 'Machine id, e.g. CNC-01, EDGE-01, SAW-01, PACK-01' };

/** `name` is the wire name (providers only accept [a-zA-Z0-9_-]); `display` matches Phli's MCP naming. */
export const TOOLS = [
  {
    name: 'production_get_machine_status',
    display: 'production.get_machine_status',
    kind: 'read',
    description: 'Read the current state, running job and sensor readings of one machine, or all machines if machineId is omitted.',
    schema: obj({ machineId }),
  },
  {
    name: 'maintenance_get_open_work_orders',
    display: 'maintenance.get_open_work_orders',
    kind: 'read',
    description: 'List open maintenance work orders, optionally for one machine.',
    schema: obj({ machineId }),
  },
  {
    name: 'knowledge_search_sop',
    display: 'knowledge.search_sop',
    kind: 'read',
    description: 'Keyword search over the factory standard operating procedures. Returns the best matching SOP excerpts with ids to cite.',
    schema: obj({ query: { type: 'string', description: 'Search keywords in English' } }, ['query']),
  },
  {
    name: 'inventory_check_stock',
    display: 'inventory.check_stock',
    kind: 'read',
    description: 'List stock on hand and reorder points. Set lowStockOnly to only show items below their reorder point.',
    schema: obj({ lowStockOnly: { type: 'boolean' } }),
  },
  {
    name: 'quality_get_summary',
    display: 'quality.get_summary',
    kind: 'read',
    description: 'Quality inspection summary for the current shift: panels inspected, defects and top defect codes.',
    schema: obj({}),
  },
  {
    name: 'production_get_schedule',
    display: 'production.get_schedule',
    kind: 'read',
    description: 'Jobs scheduled for the next 5 working days with quantities, due dates and material demand.',
    schema: obj({}),
  },
  {
    name: 'maintenance_create_work_order',
    display: 'maintenance.create_work_order',
    kind: 'write',
    description: 'Propose a maintenance work order. It is NOT created until a human approves it. Cite the SOP id in the description.',
    schema: obj(
      {
        machineId,
        title: { type: 'string', maxLength: 120 },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
        description: { type: 'string', maxLength: 600 },
      },
      ['machineId', 'title', 'priority', 'description'],
    ),
  },
  {
    name: 'inventory_request_reorder',
    display: 'inventory.request_reorder',
    kind: 'write',
    description: 'Propose a purchase request for a stock item. It is NOT sent until a human approves it.',
    schema: obj(
      {
        itemId: { type: 'string' },
        quantity: { type: 'number', minimum: 1, maximum: 100000 },
        reason: { type: 'string', maxLength: 600 },
      },
      ['itemId', 'quantity', 'reason'],
    ),
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Minimal JSON-schema check for our flat schemas. Returns an error string or null. */
export function validateInput(tool, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
  const { properties, required } = tool.schema;
  for (const r of required) if (input[r] === undefined) return `missing field: ${r}`;
  for (const [k, v] of Object.entries(input)) {
    const p = properties[k];
    if (!p) return `unknown field: ${k}`;
    if (p.type === 'string' && typeof v !== 'string') return `${k} must be a string`;
    if (p.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) return `${k} must be a number`;
    if (p.type === 'boolean' && typeof v !== 'boolean') return `${k} must be a boolean`;
    if (p.enum && !p.enum.includes(v)) return `${k} must be one of ${p.enum.join(', ')}`;
    if (p.maxLength && v.length > p.maxLength) return `${k} is too long`;
    if (p.minimum !== undefined && v < p.minimum) return `${k} is too small`;
    if (p.maximum !== undefined && v > p.maximum) return `${k} is too large`;
  }
  return null;
}

/** Execute a read tool against the world. Returns a JSON-serialisable result. */
export function runReadTool(world, name, input) {
  switch (name) {
    case 'production_get_machine_status': {
      if (input.machineId) {
        const m = world.machines[input.machineId];
        return m ? { machine: m, simulated: true } : { error: `unknown machine ${input.machineId}`, known: Object.keys(world.machines) };
      }
      return { machines: Object.values(world.machines), simulated: true };
    }
    case 'maintenance_get_open_work_orders': {
      const list = world.workOrders.filter((w) => w.status === 'open' && (!input.machineId || w.machineId === input.machineId));
      return { workOrders: list, count: list.length };
    }
    case 'knowledge_search_sop':
      return { results: searchSops(input.query, 2), method: 'keyword (BM25)' };
    case 'inventory_check_stock': {
      const items = Object.values(world.stock).filter((s) => !input.lowStockOnly || s.onHand < s.reorderPoint);
      return { items };
    }
    case 'quality_get_summary': {
      const q = world.quality;
      return { ...q, defectRatePct: Number(((q.defects / q.inspected) * 100).toFixed(2)), shift: 'Day', simulated: true };
    }
    case 'production_get_schedule':
      return { jobs: world.schedule };
    default:
      return { error: `not a read tool: ${name}` };
  }
}

let seq = 1000;

/** Execute an approved write tool. Only called after a human approves. */
export function runApprovedWrite(world, name, input, approvedBy = 'demo-visitor') {
  if (name === 'maintenance_create_work_order') {
    const wo = { id: `WO-${++seq}`, status: 'open', ...input, approvedBy, simulated: true };
    world.workOrders.push(wo);
    return { created: wo };
  }
  if (name === 'inventory_request_reorder') {
    const pr = { id: `PR-${++seq}`, status: 'submitted', ...input, approvedBy, simulated: true };
    world.requests.push(pr);
    return { created: pr };
  }
  return { error: `not a write tool: ${name}` };
}
