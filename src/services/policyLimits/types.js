import { z } from 'zod/v4';
import { lazySchema } from '../../utils/lazySchema.js';
/**
 * Schema for the policy limits API response
 * Only blocked policies are included. If a policy key is absent, it's allowed.
 */
export const PolicyLimitsResponseSchema = lazySchema(() => z.object({
    restrictions: z.record(z.string(), z.object({ allowed: z.boolean() })),
}));
