import { serial, text, pgTable, timestamp, numeric, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enum for transaction types
export const transactionTypeEnum = pgEnum('transaction_type', ['buy', 'sell']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  name: text('name').notNull(),
  google_id: text('google_id'), // Nullable for Google OAuth integration
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Gold transactions table
export const goldTransactionsTable = pgTable('gold_transactions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  type: transactionTypeEnum('type').notNull(),
  weight_grams: numeric('weight_grams', { precision: 10, scale: 3 }).notNull(), // Precise weight measurement
  price_per_gram: numeric('price_per_gram', { precision: 10, scale: 2 }).notNull(), // Price with 2 decimal precision
  total_price: numeric('total_price', { precision: 12, scale: 2 }).notNull(), // Total calculated price
  transaction_date: timestamp('transaction_date').notNull(),
  description: text('description'), // Nullable description
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Gold purchase goals table
export const goldGoalsTable = pgTable('gold_goals', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  target_weight_grams: numeric('target_weight_grams', { precision: 10, scale: 3 }).notNull(),
  deadline: timestamp('deadline').notNull(),
  title: text('title').notNull(),
  description: text('description'), // Nullable description
  is_completed: boolean('is_completed').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Zakat reminders table
export const zakatRemindersTable = pgTable('zakat_reminders', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  gold_weight_grams: numeric('gold_weight_grams', { precision: 10, scale: 3 }).notNull(),
  holding_start_date: timestamp('holding_start_date').notNull(),
  is_eligible: boolean('is_eligible').default(false).notNull(),
  next_reminder_date: timestamp('next_reminder_date'), // Nullable for flexible reminders
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  goldTransactions: many(goldTransactionsTable),
  goldGoals: many(goldGoalsTable),
  zakatReminders: many(zakatRemindersTable),
}));

export const goldTransactionsRelations = relations(goldTransactionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [goldTransactionsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const goldGoalsRelations = relations(goldGoalsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [goldGoalsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const zakatRemindersRelations = relations(zakatRemindersTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [zakatRemindersTable.user_id],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the tables
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type GoldTransaction = typeof goldTransactionsTable.$inferSelect;
export type NewGoldTransaction = typeof goldTransactionsTable.$inferInsert;

export type GoldGoal = typeof goldGoalsTable.$inferSelect;
export type NewGoldGoal = typeof goldGoalsTable.$inferInsert;

export type ZakatReminder = typeof zakatRemindersTable.$inferSelect;
export type NewZakatReminder = typeof zakatRemindersTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  goldTransactions: goldTransactionsTable,
  goldGoals: goldGoalsTable,
  zakatReminders: zakatRemindersTable,
};