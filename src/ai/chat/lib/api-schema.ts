import { z } from 'zod';

export const chatRequestSchema = z.object({
  messages: z.array(z.any()).min(1, 'At least one message is required'),
  model: z.string().min(1, 'Model is required'),
  webSearch: z.boolean().optional().default(false),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
