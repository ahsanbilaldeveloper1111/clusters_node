import type { EnterpriseIndustry } from './types.js';

export interface IndustryPlaybook {
  id: EnterpriseIndustry;
  label: string;
  persona: string;
  focusAreas: string[];
  kpiLabels: { revenue: string; orders: string; inventory: string; concentration: string };
  owners: { risk: string; inventory: string; revenue: string; ops: string };
  systemPromptExtra: string;
}

export const INDUSTRY_PLAYBOOKS: Record<EnterpriseIndustry, IndustryPlaybook> = {
  retail: {
    id: 'retail',
    label: 'Retail & Commerce',
    persona: 'VP of Merchandising / Retail Ops',
    focusAreas: ['assortment', 'sell-through', 'promotions', 'stockouts', 'category mix'],
    kpiLabels: {
      revenue: 'GMV / Net sales',
      orders: 'Order volume',
      inventory: 'SKU stockout risk',
      concentration: 'Category concentration',
    },
    owners: {
      risk: 'Merchandising',
      inventory: 'Inventory Planning',
      revenue: 'Category Management',
      ops: 'Store / Fulfillment Ops',
    },
    systemPromptExtra:
      'Frame insights for retail leadership: sell-through, stockouts, category mix, and promo readiness. Prefer actionable merchandising language.',
  },
  supply_chain: {
    id: 'supply_chain',
    label: 'Supply Chain & Logistics',
    persona: 'Supply Chain Director',
    focusAreas: ['replenishment', 'lead time buffers', 'SKU coverage', 'fulfillment backlog', 'safety stock'],
    kpiLabels: {
      revenue: 'Fulfilled demand value',
      orders: 'Open / in-flight orders',
      inventory: 'Safety-stock breaches',
      concentration: 'Supplier / category dependency',
    },
    owners: {
      risk: 'Supply Planning',
      inventory: 'Replenishment',
      revenue: 'Demand Planning',
      ops: 'Warehouse / Logistics',
    },
    systemPromptExtra:
      'Frame insights for supply chain: replenishment urgency, backlog risk, safety stock, and fulfillment health. Prefer operational next steps with owners.',
  },
  finance: {
    id: 'finance',
    label: 'Finance & Controllership',
    persona: 'FP&A / Controllership lead',
    focusAreas: ['revenue quality', 'AOV', 'order mix', 'cancellation leakage', 'concentration risk'],
    kpiLabels: {
      revenue: 'Recognized / booked revenue',
      orders: 'Billable order count',
      inventory: 'Working-capital inventory risk',
      concentration: 'Revenue concentration',
    },
    owners: {
      risk: 'FP&A',
      inventory: 'Working Capital',
      revenue: 'Revenue Operations',
      ops: 'Order-to-Cash',
    },
    systemPromptExtra:
      'Frame insights for finance: revenue quality, AOV, concentration, cancellation leakage, and working-capital inventory exposure. Be precise with numbers from JSON only.',
  },
  operations: {
    id: 'operations',
    label: 'Enterprise Operations',
    persona: 'COO / Ops excellence lead',
    focusAreas: ['SLA health', 'order pipeline', 'exception queues', 'capacity', 'cross-functional actions'],
    kpiLabels: {
      revenue: 'Throughput value',
      orders: 'Pipeline volume',
      inventory: 'Exception inventory',
      concentration: 'Bottleneck concentration',
    },
    owners: {
      risk: 'Ops Excellence',
      inventory: 'Inventory Ops',
      revenue: 'Commercial Ops',
      ops: 'Order Management',
    },
    systemPromptExtra:
      'Frame insights for enterprise operations: pipeline health, exception queues, cross-team actions, and SLA risk. Emphasize prioritized owners and timeframes.',
  },
};

export function getIndustryPlaybook(industry: EnterpriseIndustry): IndustryPlaybook {
  return INDUSTRY_PLAYBOOKS[industry];
}

export const ENTERPRISE_INDUSTRIES = Object.keys(INDUSTRY_PLAYBOOKS) as EnterpriseIndustry[];
