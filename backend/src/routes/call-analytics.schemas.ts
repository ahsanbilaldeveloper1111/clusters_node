import { z } from 'zod';

const remotePartyNumber = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[0-9+]+$/, 'Must contain only digits and optional leading +');

export const lastCalledAtBodySchema = z.object({
  remote_party_numbers: z
    .array(remotePartyNumber)
    .min(1, 'At least one remote_party_number is required')
    .max(50_000, 'Maximum 50,000 numbers per request'),
});

export const callCountBodySchema = z.object({
  remote_party_numbers: z
    .array(remotePartyNumber)
    .min(1, 'At least one remote_party_number is required')
    .max(5_000_000, 'Maximum 5,000,000 numbers per request'),
});
