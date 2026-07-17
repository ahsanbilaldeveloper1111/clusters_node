/**
 * Strategy pattern — interchangeable AI providers.
 */
import type { AiInsightRequest, AiInsightResponse } from '../services/ai.service.js';

export interface AiProvider {
  readonly name: string;
  generate(req: AiInsightRequest, snapshotJson: string): Promise<AiInsightResponse>;
}
