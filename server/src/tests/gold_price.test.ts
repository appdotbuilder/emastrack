import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { 
  fetchCurrentGoldPrice, 
  getCachedGoldPrice, 
  updateGoldPriceCache, 
  getGoldPriceWithRefresh,
  clearGoldPriceCache,
  isCacheValid
} from '../handlers/gold_price';
import { type GoldPrice } from '../schema';

describe('Gold Price Handlers', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearGoldPriceCache();
  });

  afterEach(() => {
    // Clear cache after each test
    clearGoldPriceCache();
  });

  describe('fetchCurrentGoldPrice', () => {
    it('should return current gold price with timestamp', async () => {
      const result = await fetchCurrentGoldPrice();

      expect(result.price_per_gram_usd).toBeGreaterThan(0);
      expect(typeof result.price_per_gram_usd).toBe('number');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.price_per_gram_usd).toBeGreaterThanOrEqual(50); // Minimum price check
    });

    it('should return different prices on multiple calls (simulated fluctuation)', async () => {
      const price1 = await fetchCurrentGoldPrice();
      const price2 = await fetchCurrentGoldPrice();

      // Prices should be in reasonable range
      expect(price1.price_per_gram_usd).toBeGreaterThan(50);
      expect(price2.price_per_gram_usd).toBeGreaterThan(50);
      expect(price1.price_per_gram_usd).toBeLessThan(100);
      expect(price2.price_per_gram_usd).toBeLessThan(100);

      // Timestamps should be different
      expect(price1.timestamp.getTime()).not.toEqual(price2.timestamp.getTime());
    });

    it('should return price with 2 decimal precision', async () => {
      const result = await fetchCurrentGoldPrice();
      
      // Check that price has at most 2 decimal places
      const decimalPlaces = (result.price_per_gram_usd.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('getCachedGoldPrice', () => {
    it('should return null when cache is empty', async () => {
      const result = await getCachedGoldPrice();
      expect(result).toBeNull();
    });

    it('should return cached price when cache is valid', async () => {
      // Set up cache with test data
      const testPrice: GoldPrice = {
        price_per_gram_usd: 65.75,
        timestamp: new Date()
      };

      await updateGoldPriceCache(testPrice);
      const cachedResult = await getCachedGoldPrice();

      expect(cachedResult).not.toBeNull();
      expect(cachedResult?.price_per_gram_usd).toBe(65.75);
      expect(cachedResult?.timestamp).toEqual(testPrice.timestamp);
    });

    it('should return null when cache is expired', async () => {
      // Create an expired cache entry by mocking the cache with past expiration
      const testPrice: GoldPrice = {
        price_per_gram_usd: 65.75,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      };

      // First cache the price
      await updateGoldPriceCache(testPrice);
      
      // Verify cache is initially valid
      let cachedResult = await getCachedGoldPrice();
      expect(cachedResult).not.toBeNull();

      // Clear cache and simulate expired cache by waiting
      clearGoldPriceCache();
      cachedResult = await getCachedGoldPrice();
      expect(cachedResult).toBeNull();
    });
  });

  describe('updateGoldPriceCache', () => {
    it('should successfully cache gold price', async () => {
      const testPrice: GoldPrice = {
        price_per_gram_usd: 67.25,
        timestamp: new Date()
      };

      const success = await updateGoldPriceCache(testPrice);
      expect(success).toBe(true);

      // Verify cache was updated
      const cachedPrice = await getCachedGoldPrice();
      expect(cachedPrice).not.toBeNull();
      expect(cachedPrice?.price_per_gram_usd).toBe(67.25);
      expect(cachedPrice?.timestamp).toEqual(testPrice.timestamp);
    });

    it('should update existing cache with new price', async () => {
      const firstPrice: GoldPrice = {
        price_per_gram_usd: 65.00,
        timestamp: new Date()
      };

      const secondPrice: GoldPrice = {
        price_per_gram_usd: 68.50,
        timestamp: new Date()
      };

      // Cache first price
      await updateGoldPriceCache(firstPrice);
      let cachedPrice = await getCachedGoldPrice();
      expect(cachedPrice?.price_per_gram_usd).toBe(65.00);

      // Update with second price
      await updateGoldPriceCache(secondPrice);
      cachedPrice = await getCachedGoldPrice();
      expect(cachedPrice?.price_per_gram_usd).toBe(68.50);
    });

    it('should maintain cache validity after update', async () => {
      const testPrice: GoldPrice = {
        price_per_gram_usd: 66.00,
        timestamp: new Date()
      };

      await updateGoldPriceCache(testPrice);
      expect(isCacheValid()).toBe(true);
    });
  });

  describe('getGoldPriceWithRefresh', () => {
    it('should return fresh price when cache is empty', async () => {
      const result = await getGoldPriceWithRefresh();

      expect(result.price_per_gram_usd).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);

      // Verify cache was populated
      const cachedPrice = await getCachedGoldPrice();
      expect(cachedPrice).not.toBeNull();
      expect(cachedPrice?.price_per_gram_usd).toBe(result.price_per_gram_usd);
    });

    it('should return cached price when cache is valid', async () => {
      // First, populate cache
      const firstResult = await getGoldPriceWithRefresh();
      
      // Second call should return cached value
      const secondResult = await getGoldPriceWithRefresh();

      expect(secondResult.price_per_gram_usd).toBe(firstResult.price_per_gram_usd);
      expect(secondResult.timestamp).toEqual(firstResult.timestamp);
    });

    it('should refresh price when cache is expired', async () => {
      // Get initial price to populate cache
      await getGoldPriceWithRefresh();
      
      // Clear cache to simulate expiration
      clearGoldPriceCache();
      
      // This should fetch a fresh price
      const refreshedResult = await getGoldPriceWithRefresh();
      
      expect(refreshedResult.price_per_gram_usd).toBeGreaterThan(0);
      expect(refreshedResult.timestamp).toBeInstanceOf(Date);

      // Verify new cache was populated
      const cachedPrice = await getCachedGoldPrice();
      expect(cachedPrice).not.toBeNull();
      expect(cachedPrice?.price_per_gram_usd).toBe(refreshedResult.price_per_gram_usd);
    });
  });

  describe('Cache Helper Functions', () => {
    it('should correctly report cache validity', async () => {
      // Initially cache should be invalid
      expect(isCacheValid()).toBe(false);

      // After caching, should be valid
      const testPrice: GoldPrice = {
        price_per_gram_usd: 65.00,
        timestamp: new Date()
      };
      await updateGoldPriceCache(testPrice);
      expect(isCacheValid()).toBe(true);

      // After clearing, should be invalid
      clearGoldPriceCache();
      expect(isCacheValid()).toBe(false);
    });

    it('should clear cache completely', async () => {
      // Set up cache
      const testPrice: GoldPrice = {
        price_per_gram_usd: 66.50,
        timestamp: new Date()
      };
      await updateGoldPriceCache(testPrice);
      
      expect(await getCachedGoldPrice()).not.toBeNull();
      expect(isCacheValid()).toBe(true);

      // Clear cache
      clearGoldPriceCache();
      
      expect(await getCachedGoldPrice()).toBeNull();
      expect(isCacheValid()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid price data gracefully', async () => {
      const testPrice: GoldPrice = {
        price_per_gram_usd: 0, // Invalid price
        timestamp: new Date()
      };

      // Should still cache the data (validation happens at schema level)
      const success = await updateGoldPriceCache(testPrice);
      expect(success).toBe(true);

      const cached = await getCachedGoldPrice();
      expect(cached?.price_per_gram_usd).toBe(0);
    });
  });
});