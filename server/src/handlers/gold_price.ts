import { type GoldPrice } from '../schema';

// In-memory cache for gold prices
interface CachedGoldPrice {
  price: GoldPrice;
  expires_at: Date;
}

let goldPriceCache: CachedGoldPrice | null = null;

// Cache duration in milliseconds (1 hour)
const CACHE_DURATION_MS = 60 * 60 * 1000;

// Handler for fetching current gold price from external API
export async function fetchCurrentGoldPrice(): Promise<GoldPrice> {
  try {
    // Simulate API call to external gold price service
    // In real implementation, this would call metals-api.com, fixer.io, or similar
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate price fluctuation around $65-70 per gram
    const basePrice = 67.50;
    const fluctuation = (Math.random() - 0.5) * 5; // ±$2.50 variation
    const currentPrice = Math.max(50, basePrice + fluctuation); // Minimum $50/gram
    
    const goldPrice: GoldPrice = {
      price_per_gram_usd: Math.round(currentPrice * 100) / 100, // Round to 2 decimal places
      timestamp: new Date()
    };

    return goldPrice;
  } catch (error) {
    console.error('Failed to fetch gold price from external API:', error);
    throw new Error('Unable to fetch current gold price');
  }
}

// Handler for getting cached gold price (to avoid API rate limits)
export async function getCachedGoldPrice(): Promise<GoldPrice | null> {
  try {
    // Check if cache exists and is not expired
    if (!goldPriceCache) {
      return null;
    }

    const now = new Date();
    if (now > goldPriceCache.expires_at) {
      // Cache has expired, clear it
      goldPriceCache = null;
      return null;
    }

    // Return cached price
    return goldPriceCache.price;
  } catch (error) {
    console.error('Error retrieving cached gold price:', error);
    return null;
  }
}

// Handler for updating gold price cache
export async function updateGoldPriceCache(goldPrice: GoldPrice): Promise<boolean> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_DURATION_MS);

    goldPriceCache = {
      price: goldPrice,
      expires_at: expiresAt
    };

    return true;
  } catch (error) {
    console.error('Error updating gold price cache:', error);
    return false;
  }
}

// Handler for getting gold price with automatic refresh
export async function getGoldPriceWithRefresh(): Promise<GoldPrice> {
  try {
    // First try to get cached price
    const cachedPrice = await getCachedGoldPrice();
    if (cachedPrice) {
      return cachedPrice;
    }
    
    // Cache is stale or missing, fetch from external API
    const freshPrice = await fetchCurrentGoldPrice();
    
    // Update cache with new price
    await updateGoldPriceCache(freshPrice);
    
    return freshPrice;
  } catch (error) {
    console.error('Error getting gold price with refresh:', error);
    throw error;
  }
}

// Helper function to clear cache (useful for testing)
export function clearGoldPriceCache(): void {
  goldPriceCache = null;
}

// Helper function to check if cache is valid (useful for testing)
export function isCacheValid(): boolean {
  if (!goldPriceCache) {
    return false;
  }
  
  const now = new Date();
  return now <= goldPriceCache.expires_at;
}