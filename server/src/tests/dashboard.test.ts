import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goldTransactionsTable, goldGoalsTable } from '../db/schema';
import { getDashboardData, calculateTotalGoldHoldings, calculateGoalsProgress } from '../handlers/dashboard';

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test user
  const createTestUser = async () => {
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        password_hash: 'hash123',
        name: 'Test User'
      })
      .returning()
      .execute();
    return users[0];
  };

  describe('calculateTotalGoldHoldings', () => {
    it('should return 0 for user with no transactions', async () => {
      const user = await createTestUser();
      const holdings = await calculateTotalGoldHoldings(user.id);
      expect(holdings).toBe(0);
    });

    it('should calculate total holdings from buy transactions only', async () => {
      const user = await createTestUser();

      // Add buy transactions
      await db.insert(goldTransactionsTable)
        .values([
          {
            user_id: user.id,
            type: 'buy',
            weight_grams: '10.500',
            price_per_gram: '65.00',
            total_price: '682.50',
            transaction_date: new Date('2024-01-01')
          },
          {
            user_id: user.id,
            type: 'buy',
            weight_grams: '5.250',
            price_per_gram: '66.00',
            total_price: '346.50',
            transaction_date: new Date('2024-01-15')
          }
        ])
        .execute();

      const holdings = await calculateTotalGoldHoldings(user.id);
      expect(holdings).toBe(15.75); // 10.5 + 5.25
    });

    it('should calculate net holdings after buy and sell transactions', async () => {
      const user = await createTestUser();

      // Add mixed transactions
      await db.insert(goldTransactionsTable)
        .values([
          {
            user_id: user.id,
            type: 'buy',
            weight_grams: '20.000',
            price_per_gram: '65.00',
            total_price: '1300.00',
            transaction_date: new Date('2024-01-01')
          },
          {
            user_id: user.id,
            type: 'sell',
            weight_grams: '7.500',
            price_per_gram: '67.00',
            total_price: '502.50',
            transaction_date: new Date('2024-01-15')
          },
          {
            user_id: user.id,
            type: 'buy',
            weight_grams: '3.250',
            price_per_gram: '68.00',
            total_price: '221.00',
            transaction_date: new Date('2024-02-01')
          }
        ])
        .execute();

      const holdings = await calculateTotalGoldHoldings(user.id);
      expect(holdings).toBe(15.75); // (20 + 3.25) - 7.5 = 15.75
    });

    it('should return 0 when total sells exceed total buys', async () => {
      const user = await createTestUser();

      await db.insert(goldTransactionsTable)
        .values([
          {
            user_id: user.id,
            type: 'buy',
            weight_grams: '10.000',
            price_per_gram: '65.00',
            total_price: '650.00',
            transaction_date: new Date('2024-01-01')
          },
          {
            user_id: user.id,
            type: 'sell',
            weight_grams: '15.000',
            price_per_gram: '67.00',
            total_price: '1005.00',
            transaction_date: new Date('2024-01-15')
          }
        ])
        .execute();

      const holdings = await calculateTotalGoldHoldings(user.id);
      expect(holdings).toBe(0); // Cannot have negative holdings
    });

    it('should only calculate holdings for specific user', async () => {
      const user1 = await createTestUser();
      const user2 = await db.insert(usersTable)
        .values({
          email: 'user2@example.com',
          password_hash: 'hash456',
          name: 'User Two'
        })
        .returning()
        .execute();

      // Add transactions for both users
      await db.insert(goldTransactionsTable)
        .values([
          {
            user_id: user1.id,
            type: 'buy',
            weight_grams: '10.000',
            price_per_gram: '65.00',
            total_price: '650.00',
            transaction_date: new Date('2024-01-01')
          },
          {
            user_id: user2[0].id,
            type: 'buy',
            weight_grams: '20.000',
            price_per_gram: '65.00',
            total_price: '1300.00',
            transaction_date: new Date('2024-01-01')
          }
        ])
        .execute();

      const user1Holdings = await calculateTotalGoldHoldings(user1.id);
      const user2Holdings = await calculateTotalGoldHoldings(user2[0].id);

      expect(user1Holdings).toBe(10);
      expect(user2Holdings).toBe(20);
    });
  });

  describe('calculateGoalsProgress', () => {
    it('should return empty array for user with no goals', async () => {
      const user = await createTestUser();
      const progress = await calculateGoalsProgress(user.id);
      expect(progress).toEqual([]);
    });

    it('should calculate progress percentage correctly', async () => {
      const user = await createTestUser();

      // Add some gold holdings (50 grams total)
      await db.insert(goldTransactionsTable)
        .values({
          user_id: user.id,
          type: 'buy',
          weight_grams: '50.000',
          price_per_gram: '65.00',
          total_price: '3250.00',
          transaction_date: new Date('2024-01-01')
        })
        .execute();

      // Add goals
      await db.insert(goldGoalsTable)
        .values([
          {
            user_id: user.id,
            target_weight_grams: '100.000', // 50% progress
            deadline: new Date('2024-12-31'),
            title: 'First Goal',
            description: 'My first gold goal',
            is_completed: false
          },
          {
            user_id: user.id,
            target_weight_grams: '25.000', // 200% progress (capped at 100%)
            deadline: new Date('2024-06-30'),
            title: 'Second Goal',
            description: null,
            is_completed: true
          }
        ])
        .execute();

      const progress = await calculateGoalsProgress(user.id);

      expect(progress).toHaveLength(2);
      
      const firstGoal = progress.find(g => g.title === 'First Goal');
      expect(firstGoal).toBeDefined();
      expect(firstGoal!.target_weight_grams).toBe(100);
      expect(firstGoal!.current_progress_percentage).toBe(50);
      expect(firstGoal!.is_completed).toBe(false);

      const secondGoal = progress.find(g => g.title === 'Second Goal');
      expect(secondGoal).toBeDefined();
      expect(secondGoal!.target_weight_grams).toBe(25);
      expect(secondGoal!.current_progress_percentage).toBe(100); // Capped at 100%
      expect(secondGoal!.is_completed).toBe(true);
    });

    it('should handle zero target weight gracefully', async () => {
      const user = await createTestUser();

      await db.insert(goldGoalsTable)
        .values({
          user_id: user.id,
          target_weight_grams: '0.000',
          deadline: new Date('2024-12-31'),
          title: 'Zero Target Goal',
          description: null,
          is_completed: false
        })
        .execute();

      const progress = await calculateGoalsProgress(user.id);

      expect(progress).toHaveLength(1);
      expect(progress[0].current_progress_percentage).toBe(0);
    });
  });

  describe('getDashboardData', () => {
    it('should return comprehensive dashboard data for user with no activity', async () => {
      const user = await createTestUser();
      const dashboardData = await getDashboardData(user.id);

      expect(dashboardData.total_gold_grams).toBe(0);
      expect(dashboardData.estimated_total_value).toBe(0);
      expect(dashboardData.current_gold_price).toBe(65.5); // Fixed price in handler
      expect(dashboardData.goals_progress).toEqual([]);
      expect(dashboardData.zakat_status.is_eligible).toBe(false);
      expect(dashboardData.zakat_status.current_weight_grams).toBe(0);
      expect(dashboardData.zakat_status.threshold_grams).toBe(85);
      expect(dashboardData.zakat_status.days_held).toBe(null);
      expect(dashboardData.zakat_status.required_days).toBe(354);
    });

    it('should return complete dashboard data for active user', async () => {
      const user = await createTestUser();

      // Add gold holdings
      await db.insert(goldTransactionsTable)
        .values({
          user_id: user.id,
          type: 'buy',
          weight_grams: '100.000',
          price_per_gram: '65.00',
          total_price: '6500.00',
          transaction_date: new Date('2023-01-01') // Over a year ago for zakat eligibility
        })
        .execute();

      // Add a goal
      await db.insert(goldGoalsTable)
        .values({
          user_id: user.id,
          target_weight_grams: '150.000',
          deadline: new Date('2024-12-31'),
          title: 'Investment Goal',
          description: 'Reach 150g of gold',
          is_completed: false
        })
        .execute();

      const dashboardData = await getDashboardData(user.id);

      expect(dashboardData.total_gold_grams).toBe(100);
      expect(dashboardData.estimated_total_value).toBe(6550); // 100 * 65.5
      expect(dashboardData.current_gold_price).toBe(65.5);
      expect(dashboardData.goals_progress).toHaveLength(1);
      expect(dashboardData.goals_progress[0].current_progress_percentage).toBe(66.67); // 100/150 * 100, rounded
      expect(dashboardData.zakat_status.is_eligible).toBe(true); // Above threshold and held long enough
      expect(dashboardData.zakat_status.current_weight_grams).toBe(100);
      expect(dashboardData.zakat_status.days_held).toBeGreaterThan(354);
    });

    it('should calculate zakat eligibility correctly for recent purchases', async () => {
      const user = await createTestUser();

      // Add recent gold holdings above nisab threshold
      await db.insert(goldTransactionsTable)
        .values({
          user_id: user.id,
          type: 'buy',
          weight_grams: '100.000',
          price_per_gram: '65.00',
          total_price: '6500.00',
          transaction_date: new Date() // Today
        })
        .execute();

      const dashboardData = await getDashboardData(user.id);

      expect(dashboardData.zakat_status.is_eligible).toBe(false); // Not held long enough
      expect(dashboardData.zakat_status.current_weight_grams).toBe(100);
      expect(dashboardData.zakat_status.days_held).toBe(0);
    });

    it('should handle user below zakat threshold', async () => {
      const user = await createTestUser();

      // Add gold holdings below nisab threshold
      await db.insert(goldTransactionsTable)
        .values({
          user_id: user.id,
          type: 'buy',
          weight_grams: '50.000', // Below 85g threshold
          price_per_gram: '65.00',
          total_price: '3250.00',
          transaction_date: new Date('2023-01-01')
        })
        .execute();

      const dashboardData = await getDashboardData(user.id);

      expect(dashboardData.zakat_status.is_eligible).toBe(false);
      expect(dashboardData.zakat_status.current_weight_grams).toBe(50);
      expect(dashboardData.zakat_status.days_held).toBe(null); // No days calculation needed
    });
  });
});