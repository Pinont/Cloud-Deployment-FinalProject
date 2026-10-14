export type RestaurantExistsFn = (restaurantId: string) => Promise<boolean>;

export const createRestaurantClient = (
  baseUrl: string = process.env.RESTAURANT_SERVICE_URL || 'http://restaurant:3002'
): RestaurantExistsFn => {
  return async (restaurantId: string): Promise<boolean> => {
    const response = await fetch(`${baseUrl}/restaurants/${encodeURIComponent(restaurantId)}`, {
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) return true;
    if (response.status === 404) return false;
    throw new Error(`restaurant-service error: ${response.status}`);
  };
};
