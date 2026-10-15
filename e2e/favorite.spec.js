const { test, expect } = require('@playwright/test');

test('E2E-01: register, log in, review and save a searched restaurant', async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = {
    name: `E2E User ${suffix}`,
    email: `e2e-${suffix}@example.com`,
    password: 'E2E-password-123',
  };

  await page.goto('/');
  await page.locator('#register-form input[name="name"]').fill(user.name);
  await page.locator('#register-form input[name="email"]').fill(user.email);
  await page.locator('#register-form input[name="password"]').fill(user.password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.locator('#register-ok')).toHaveText('Account created. You can log in now.');

  await page.locator('#login-form input[name="email"]').fill(user.email);
  await page.locator('#login-form input[name="password"]').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('#member')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
  const restaurantName = `E2E Restaurant ${suffix}`;
  const createRestaurant = await request.post('/api/restaurants', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: restaurantName, category: 'e2e-category', priceRange: 2, address: 'E2E address' },
  });
  expect(createRestaurant.ok()).toBeTruthy();

  await page.goto('/restaurants.html');
  await page.locator('input[name="category"]').fill('e2e-category');
  await page.getByRole('button', { name: 'Search' }).click();
  const restaurantLink = page.getByRole('link', { name: restaurantName });
  await expect(restaurantLink).toBeVisible();
  await restaurantLink.click();

  await expect(page.getByRole('heading', { name: restaurantName })).toBeVisible();
  await page.locator('#review-form select[name="rating"]').selectOption('5');
  await page.locator('#review-form textarea[name="comment"]').fill('Excellent end-to-end review');
  await page.getByRole('button', { name: 'Post review' }).click();
  await expect(page.locator('#reviews')).toContainText('Excellent end-to-end review');
  await expect(page.locator('#rating')).toContainText('5.0');

  await page.getByRole('button', { name: 'Save to favourites' }).click();
  await expect(page.locator('#favorite-status')).toHaveText('Saved to your favourites.');

  await page.getByRole('link', { name: 'Favourites' }).click();
  await expect(page).toHaveURL(/favorites\.html$/);
  await expect(page.getByRole('link', { name: restaurantName })).toBeVisible();
});
