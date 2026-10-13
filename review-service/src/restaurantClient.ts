export type RestaurantExistsFn = (restaurantId: string) => Promise<boolean>;

export const createRestaurantClient = (
  baseUrl: string = process.env.RESTAURANT_SERVICE_URL || 'http://restaurant-service:3002'
): RestaurantExistsFn => {
  return async (restaurantId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${baseUrl}/restaurants/${encodeURIComponent(restaurantId)}`);
      return response.ok;
    } catch {
      // ponytail: if restaurant-service is unreachable during existence check, treat as not found for now
      return false;
    }
  };
};
