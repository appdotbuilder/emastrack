import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  signUpInputSchema,
  signInInputSchema,
  googleAuthInputSchema,
  createTransactionInputSchema,
  updateTransactionInputSchema,
  createGoalInputSchema,
  updateGoalInputSchema
} from './schema';

// Import handlers
import { signUp, signIn, googleAuth } from './handlers/auth';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getUserTransactions,
  getTransactionById
} from './handlers/transactions';
import {
  createGoal,
  updateGoal,
  deleteGoal,
  getUserGoals,
  getGoalById,
  markGoalCompleted
} from './handlers/goals';
import {
  updateZakatStatus,
  getZakatStatus,
  calculateZakatAmount,
  getUsersForZakatReminder
} from './handlers/zakat';
import {
  getDashboardData,
  calculateTotalGoldHoldings,
  calculateGoalsProgress
} from './handlers/dashboard';
import {
  fetchCurrentGoldPrice,
  getCachedGoldPrice,
  getGoldPriceWithRefresh
} from './handlers/gold_price';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    signUp: publicProcedure
      .input(signUpInputSchema)
      .mutation(({ input }) => signUp(input)),
    
    signIn: publicProcedure
      .input(signInInputSchema)
      .mutation(({ input }) => signIn(input)),
    
    googleAuth: publicProcedure
      .input(googleAuthInputSchema)
      .mutation(({ input }) => googleAuth(input))
  }),

  // Transaction routes
  transactions: router({
    create: publicProcedure
      .input(createTransactionInputSchema)
      .mutation(({ input }) => createTransaction(input)),
    
    update: publicProcedure
      .input(updateTransactionInputSchema)
      .mutation(({ input }) => updateTransaction(input)),
    
    delete: publicProcedure
      .input(z.object({ transactionId: z.number(), userId: z.number() }))
      .mutation(({ input }) => deleteTransaction(input.transactionId, input.userId)),
    
    getByUser: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserTransactions(input.userId)),
    
    getById: publicProcedure
      .input(z.object({ transactionId: z.number(), userId: z.number() }))
      .query(({ input }) => getTransactionById(input.transactionId, input.userId))
  }),

  // Goals routes
  goals: router({
    create: publicProcedure
      .input(createGoalInputSchema)
      .mutation(({ input }) => createGoal(input)),
    
    update: publicProcedure
      .input(updateGoalInputSchema)
      .mutation(({ input }) => updateGoal(input)),
    
    delete: publicProcedure
      .input(z.object({ goalId: z.number(), userId: z.number() }))
      .mutation(({ input }) => deleteGoal(input.goalId, input.userId)),
    
    getByUser: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserGoals(input.userId)),
    
    getById: publicProcedure
      .input(z.object({ goalId: z.number(), userId: z.number() }))
      .query(({ input }) => getGoalById(input.goalId, input.userId)),
    
    markCompleted: publicProcedure
      .input(z.object({ goalId: z.number(), userId: z.number() }))
      .mutation(({ input }) => markGoalCompleted(input.goalId, input.userId))
  }),

  // Zakat routes
  zakat: router({
    updateStatus: publicProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ input }) => updateZakatStatus(input.userId)),
    
    getStatus: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getZakatStatus(input.userId)),
    
    calculateAmount: publicProcedure
      .input(z.object({ userId: z.number(), goldPricePerGram: z.number() }))
      .query(({ input }) => calculateZakatAmount(input.userId, input.goldPricePerGram)),
    
    getPendingReminders: publicProcedure
      .query(() => getUsersForZakatReminder())
  }),

  // Dashboard routes
  dashboard: router({
    getData: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getDashboardData(input.userId)),
    
    getTotalHoldings: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => calculateTotalGoldHoldings(input.userId)),
    
    getGoalsProgress: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => calculateGoalsProgress(input.userId))
  }),

  // Gold price routes
  goldPrice: router({
    getCurrent: publicProcedure
      .query(() => getGoldPriceWithRefresh()),
    
    getCached: publicProcedure
      .query(() => getCachedGoldPrice()),
    
    fetchFresh: publicProcedure
      .query(() => fetchCurrentGoldPrice())
  })
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`EmasTrack TRPC server listening at port: ${port}`);
}

start();