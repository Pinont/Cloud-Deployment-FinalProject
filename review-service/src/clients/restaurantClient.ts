export type RestaurantExistsFn = (restaurantId: string) => Promise<boolean>;

export type UpdateRestaurantRatingFn = (
  restaurantId: string,
  avgRating: number,
  reviewCount: number
) => Promise<void>;

export const createRestaurantClient = (
  baseUrl: string = process.env.RESTAURANT_SERVICE_URL || 'http://restaurant:3002'
) => {
  return {
    checkRestaurantExists: async (restaurantId: string): Promise<boolean> => {
      const response = await fetch(`${baseUrl}/restaurants/${encodeURIComponent(restaurantId)}`, {
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw new Error(`restaurant-service error: ${response.status}`);
    },
    updateRestaurantRating: async (
      restaurantId: string,
      avgRating: number,
      reviewCount: number
    ): Promise<void> => {
      const response = await fetch(`${baseUrl}/restaurants/${encodeURIComponent(restaurantId)}/rating`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avgRating, reviewCount }),
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) {
        throw new Error(`restaurant-service error: ${response.status}`);
      }
    }
  };
};
