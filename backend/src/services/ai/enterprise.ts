import { getIndustryPlaybook } from './industries.js';
import type {
  BusinessSnapshot,
  EnterpriseActionItem,
  EnterpriseBriefingResponse,
  EnterpriseIndustry,
  EnterpriseKpi,
  EnterpriseRiskItem,
  RiskSeverity,
} from './types.js';

function statusCount(snapshot: BusinessSnapshot, status: string): number {
  return snapshot.ordersByStatus?.find((s) => s.status === status)?.count ?? 0;
}

function topCategoryShare(snapshot: BusinessSnapshot): number {
  const top = snapshot.topCategories[0];
  const revenue = Number(snapshot.totalRevenue);
  if (!top || !revenue) return 0;
  return (Number(top.revenue) / revenue) * 100;
}

function severityRank(s: RiskSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s];
}

/** Deterministic risk register from live snapshot — used by demo and as OpenAI fallback. */
export function buildEnterpriseRisks(
  industry: EnterpriseIndustry,
  snapshot: BusinessSnapshot,
  limit = 8
): EnterpriseRiskItem[] {
  const playbook = getIndustryPlaybook(industry);
  const risks: EnterpriseRiskItem[] = [];
  const cancelled = statusCount(snapshot, 'cancelled');
  const processing = statusCount(snapshot, 'processing');
  const pending = statusCount(snapshot, 'pending');
  const share = topCategoryShare(snapshot);
  const low = snapshot.lowStockProducts ?? [];

  if (snapshot.lowStockCount > 0) {
    const examples = low
      .slice(0, 3)
      .map((p) => `${p.name} (${p.stock})`)
      .join(', ');
    risks.push({
      id: 'inv-low-stock',
      title:
        industry === 'supply_chain'
          ? 'Safety-stock breaches across SKUs'
          : 'Inventory stockout exposure',
      severity: snapshot.lowStockCount >= 5 ? 'critical' : snapshot.lowStockCount >= 2 ? 'high' : 'medium',
      category: playbook.focusAreas[1] ?? 'inventory',
      evidence: `${snapshot.lowStockCount} SKU(s) below threshold${examples ? `: ${examples}` : ''}`,
      recommendation:
        industry === 'retail'
          ? 'Trigger replenishment / transfer for high-velocity low-stock SKUs before promo windows.'
          : 'Raise PO / safety stock for breached SKUs and review lead-time buffers.',
    });
  }

  if (share >= 40 && snapshot.topCategories[0]) {
    risks.push({
      id: 'rev-concentration',
      title: 'Revenue concentration risk',
      severity: share >= 60 ? 'high' : 'medium',
      category: playbook.focusAreas.includes('category mix') ? 'category mix' : 'concentration',
      evidence: `"${snapshot.topCategories[0].category}" is ~${share.toFixed(0)}% of revenue ($${snapshot.topCategories[0].revenue} of $${snapshot.totalRevenue})`,
      recommendation:
        industry === 'finance'
          ? 'Document concentration in forecast risk notes; diversify category / channel mix.'
          : 'Balance assortment and campaigns away from single-category dependency.',
    });
  }

  if (cancelled > 0 && snapshot.totalOrders > 0) {
    const rate = (cancelled / Math.max(snapshot.totalOrders + cancelled, 1)) * 100;
    risks.push({
      id: 'order-cancel',
      title: industry === 'finance' ? 'Cancellation leakage' : 'Order cancellation pressure',
      severity: rate >= 15 ? 'high' : 'medium',
      category: 'order quality',
      evidence: `${cancelled} cancelled order(s) observed in status mix`,
      recommendation: 'Review cancel reasons, payment failures, and stock-driven cancellations.',
    });
  }

  if (processing + pending >= 3) {
    risks.push({
      id: 'fulfillment-backlog',
      title: industry === 'operations' ? 'Pipeline / exception queue load' : 'Fulfillment backlog',
      severity: processing + pending >= 8 ? 'high' : 'medium',
      category: 'fulfillment',
      evidence: `${processing} processing + ${pending} pending in-flight orders`,
      recommendation: 'Clear aging orders, check capacity, and escalate SLA breaches.',
    });
  }

  if (snapshot.totalOrders === 0) {
    risks.push({
      id: 'data-thin',
      title: 'Insufficient transactional history',
      severity: 'low',
      category: 'data quality',
      evidence: 'No non-cancelled orders in snapshot grounding',
      recommendation: 'Seed or sync orders to unlock reliable enterprise scoring.',
    });
  }

  if (Number(snapshot.totalRevenue) > 0 && Number(snapshot.averageOrderValue ?? 0) < 20) {
    risks.push({
      id: 'aov-soft',
      title: 'Soft average order value',
      severity: 'low',
      category: industry === 'finance' ? 'AOV' : 'revenue quality',
      evidence: `AOV ≈ $${snapshot.averageOrderValue ?? '0'}`,
      recommendation: 'Test bundles, shipping thresholds, or attach-rate plays to lift AOV.',
    });
  }

  if (risks.length === 0) {
    risks.push({
      id: 'healthy',
      title: 'No material risks detected in snapshot',
      severity: 'low',
      category: 'health',
      evidence: `Orders=${snapshot.totalOrders}, revenue=$${snapshot.totalRevenue}, low-stock=${snapshot.lowStockCount}`,
      recommendation: 'Continue monitoring KPIs; expand snapshot depth for finer enterprise signals.',
    });
  }

  return risks.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, limit);
}

export function buildEnterpriseActions(
  industry: EnterpriseIndustry,
  snapshot: BusinessSnapshot,
  limit = 5,
  focus?: string
): EnterpriseActionItem[] {
  const playbook = getIndustryPlaybook(industry);
  const risks = buildEnterpriseRisks(industry, snapshot, 6);
  const actions: EnterpriseActionItem[] = risks.slice(0, limit).map((r, i) => ({
    id: `act-${r.id}`,
    priority: i + 1,
    owner:
      r.id.includes('inv') || r.id.includes('stock')
        ? playbook.owners.inventory
        : r.id.includes('rev') || r.id.includes('aov')
          ? playbook.owners.revenue
          : r.id.includes('fulfill') || r.id.includes('backlog')
            ? playbook.owners.ops
            : playbook.owners.risk,
    title: r.recommendation,
    rationale: `${r.title} — ${r.evidence}${focus ? ` (focus: ${focus})` : ''}`,
    timeframe: r.severity === 'critical' || r.severity === 'high' ? '0–48 hours' : 'This week',
  }));

  if (actions.length < limit && snapshot.topCategories[0]) {
    actions.push({
      id: 'act-grow-top-cat',
      priority: actions.length + 1,
      owner: playbook.owners.revenue,
      title: `Protect and grow "${snapshot.topCategories[0].category}" while diversifying secondary categories`,
      rationale: `Top category revenue $${snapshot.topCategories[0].revenue}`,
      timeframe: 'This sprint',
    });
  }

  return actions.slice(0, limit);
}

export function buildEnterpriseKpis(
  industry: EnterpriseIndustry,
  snapshot: BusinessSnapshot
): EnterpriseKpi[] {
  const playbook = getIndustryPlaybook(industry);
  const share = topCategoryShare(snapshot);
  const inFlight = statusCount(snapshot, 'processing') + statusCount(snapshot, 'pending');

  return [
    {
      label: playbook.kpiLabels.revenue,
      value: snapshot.totalRevenue,
      unit: 'USD',
      trendHint: snapshot.totalOrders > 0 ? 'From live non-cancelled orders' : 'No revenue yet',
    },
    {
      label: playbook.kpiLabels.orders,
      value: String(snapshot.totalOrders),
      trendHint: inFlight ? `${inFlight} in-flight` : 'Pipeline clear',
    },
    {
      label: playbook.kpiLabels.inventory,
      value: String(snapshot.lowStockCount),
      trendHint: snapshot.lowStockCount > 0 ? 'Below stock threshold (<10)' : 'Within threshold',
    },
    {
      label: playbook.kpiLabels.concentration,
      value: share ? `${share.toFixed(0)}%` : 'n/a',
      trendHint: snapshot.topCategories[0]?.category
        ? `Top: ${snapshot.topCategories[0].category}`
        : undefined,
    },
    {
      label: 'Average order value',
      value: snapshot.averageOrderValue ?? '0',
      unit: 'USD',
    },
  ];
}

export function buildEnterpriseBriefing(
  industry: EnterpriseIndustry,
  snapshot: BusinessSnapshot,
  focus?: string
): Omit<EnterpriseBriefingResponse, 'mode' | 'model' | 'sources' | 'generatedAt'> {
  const playbook = getIndustryPlaybook(industry);
  const risks = buildEnterpriseRisks(industry, snapshot, 5);
  const actions = buildEnterpriseActions(industry, snapshot, 5, focus);
  const kpis = buildEnterpriseKpis(industry, snapshot);
  const topRisk = risks[0];

  const headline =
    topRisk && topRisk.severity !== 'low'
      ? `${playbook.label}: ${topRisk.title} (${topRisk.severity})`
      : `${playbook.label}: operations within observed risk tolerance`;

  const summary = [
    `Audience: ${playbook.persona}.`,
    `Grounded snapshot — orders ${snapshot.totalOrders}, revenue $${snapshot.totalRevenue}, low-stock ${snapshot.lowStockCount}.`,
    focus ? `Requested focus: ${focus}.` : null,
    topRisk ? `Primary signal: ${topRisk.title} — ${topRisk.evidence}.` : null,
    `Recommended next owner: ${actions[0]?.owner ?? playbook.owners.ops}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return { industry, headline, summary, kpis, risks, actions };
}
