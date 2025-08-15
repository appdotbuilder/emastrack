import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  name: z.string(),
  google_id: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Auth schemas
export const signUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1)
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type SignInInput = z.infer<typeof signInInputSchema>;

export const googleAuthInputSchema = z.object({
  google_id: z.string(),
  email: z.string().email(),
  name: z.string()
});

export type GoogleAuthInput = z.infer<typeof googleAuthInputSchema>;

// Gold transaction schema
export const goldTransactionSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  type: z.enum(['buy', 'sell']),
  weight_grams: z.number().positive(),
  price_per_gram: z.number().positive(),
  total_price: z.number().positive(),
  transaction_date: z.coerce.date(),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type GoldTransaction = z.infer<typeof goldTransactionSchema>;

export const createTransactionInputSchema = z.object({
  user_id: z.number(),
  type: z.enum(['buy', 'sell']),
  weight_grams: z.number().positive(),
  price_per_gram: z.number().positive(),
  transaction_date: z.coerce.date(),
  description: z.string().nullable().optional()
});

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

export const updateTransactionInputSchema = z.object({
  id: z.number(),
  type: z.enum(['buy', 'sell']).optional(),
  weight_grams: z.number().positive().optional(),
  price_per_gram: z.number().positive().optional(),
  transaction_date: z.coerce.date().optional(),
  description: z.string().nullable().optional()
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;

// Gold purchase goal schema
export const goldGoalSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  target_weight_grams: z.number().positive(),
  deadline: z.coerce.date(),
  title: z.string(),
  description: z.string().nullable(),
  is_completed: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type GoldGoal = z.infer<typeof goldGoalSchema>;

export const createGoalInputSchema = z.object({
  user_id: z.number(),
  target_weight_grams: z.number().positive(),
  deadline: z.coerce.date(),
  title: z.string().min(1),
  description: z.string().nullable().optional()
});

export type CreateGoalInput = z.infer<typeof createGoalInputSchema>;

export const updateGoalInputSchema = z.object({
  id: z.number(),
  target_weight_grams: z.number().positive().optional(),
  deadline: z.coerce.date().optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_completed: z.boolean().optional()
});

export type UpdateGoalInput = z.infer<typeof updateGoalInputSchema>;

// Zakat reminder schema
export const zakatReminderSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  gold_weight_grams: z.number(),
  holding_start_date: z.coerce.date(),
  is_eligible: z.boolean(),
  next_reminder_date: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ZakatReminder = z.infer<typeof zakatReminderSchema>;

// Dashboard data schema
export const dashboardDataSchema = z.object({
  total_gold_grams: z.number(),
  estimated_total_value: z.number(),
  current_gold_price: z.number(),
  goals_progress: z.array(z.object({
    id: z.number(),
    title: z.string(),
    target_weight_grams: z.number(),
    current_progress_percentage: z.number(),
    deadline: z.coerce.date(),
    is_completed: z.boolean()
  })),
  zakat_status: z.object({
    is_eligible: z.boolean(),
    current_weight_grams: z.number(),
    threshold_grams: z.number(),
    days_held: z.number().nullable(),
    required_days: z.number()
  })
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;

// Gold price schema
export const goldPriceSchema = z.object({
  price_per_gram_usd: z.number().positive(),
  timestamp: z.coerce.date()
});

export type GoldPrice = z.infer<typeof goldPriceSchema>;