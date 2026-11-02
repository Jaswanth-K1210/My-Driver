import { bookAndPay, expect, newPhone, otpFor, test, until } from './helpers.js'

const tripOf = async (customer) => (await customer.api.get('/v1/trips?limit=1')).body.items[0]

test('1. a customer signs in with the OTP from the SMS', async ({ page }) => {
  const phone = newPhone()
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: /send|continue|code/i }).first().click()
  await page.getByLabel('Verification code').fill(await otpFor(phone))
  await page.getByRole('button', { name: /verify/i }).click()
  await expect(page).toHaveURL(/\/app$/)
})

test('1b. booking with no driver online waits up to 30 min and keeps the hold', async ({ page, customer }) => {
  await bookAndPay(page)
  await expect(page.getByRole('heading', { name: 'A driver will be assigned within 30 minutes' })).toBeVisible({ timeout: 30_000 })
  const trip = await tripOf(customer)
  expect(trip.status).toBe('REQUESTED')
  expect(trip.needs_driver_since).toBeTruthy()
  // The customer can still back out; that releases the hold.
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect.poll(async () => (await customer.api.get(`/v1/trips/${trip.id}/payment`)).body.payment.status).toBe('RELEASED')
})

test('2. the Track page follows the trip from matched to complete', async ({ page, customer, driver }) => {
  const d = await driver()
  await bookAndPay(page)
  const tripId = await d.accept()

  // The customer reads the pickup code off the screen and tells the driver.
  const otp = page.getByText(/Your OTP:/)
  await expect(otp).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel trip' })).toBeVisible()

  await d.arrive(tripId)
  await expect(page.getByRole('button', { name: 'Cancel or reject driver' })).toBeVisible()

  await expect(page.locator('main')).toContainText(/Your OTP:\s*\d{4}/)
  const code = (await page.locator('main').textContent()).match(/Your OTP:\s*(\d{4})/)[1]
  await d.start(tripId, code)
  await expect(page.getByText('On the way')).toBeVisible()
  await expect(otp).toBeHidden()

  await d.complete(tripId)
  await expect(page.getByRole('heading', { name: 'Trip complete' })).toBeVisible()
  expect((await customer.api.get(`/v1/trips/${tripId}`)).body.status).toBe('COMPLETED')
  await page.getByRole('button', { name: '5 stars' }).click()
  await page.getByRole('button', { name: 'Submit rating & finish' }).click()
  // A new driver's average is this one rating.
  await until(async () => (await d.api.get('/v1/driver/summary')).body.rating === 5, 'the rating')
})

test('3. a fare above the hold shows "Pay ₹X", which goes once paid', async ({ page, customer, driver, staff }) => {
  const admin = await staff('SUPER_ADMIN')
  const before = (await admin.api.get('/v1/admin/pricing/fees')).body
  const d = await driver()
  await bookAndPay(page)
  const tripId = await d.accept()
  await d.start(tripId, (await customer.api.post(`/v1/trips/${tripId}/handshake-otp`)).body.otp)

  // Fares are worked out at the end on current prices, so a fee rise mid-trip
  // runs the fare over the hold.
  try {
    await admin.api.patch('/v1/admin/pricing/fees', { platform_fee: before.platform_fee + 100, reason: 'e2e amount due' })
    await d.complete(tripId)
  } finally {
    await admin.api.patch('/v1/admin/pricing/fees', { platform_fee: before.platform_fee, reason: 'e2e restore' })
  }

  await expect(page.getByText(/still to pay/)).toBeVisible()
  const [checkout] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /^Pay ₹/ }).click()])
  await checkout.getByRole('button', { name: 'Approve test payment' }).click()
  await expect(checkout.getByText(/confirmed|paid/i)).toBeVisible()
  await expect(page.getByText(/still to pay/)).toBeHidden({ timeout: 15_000 })
})

test('4a. cancelling before the driver arrives is free', async ({ page, customer, driver }) => {
  const d = await driver()
  await bookAndPay(page)
  const tripId = await d.accept()
  await page.getByRole('button', { name: 'Cancel trip' }).click()
  await expect(page.getByText('Free until your driver arrives.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel trip' }).last().click()
  await expect(page.getByText('Trip cancelled', { exact: true })).toBeVisible()
  const payment = (await customer.api.get(`/v1/trips/${tripId}/payment`)).body.payment
  expect(payment.status).toBe('RELEASED')
})

test('4b. cancelling after the driver arrives charges the arrival fee', async ({ page, customer, driver }) => {
  const d = await driver()
  await bookAndPay(page)
  const tripId = await d.accept()
  await d.arrive(tripId)
  await page.getByRole('button', { name: 'Cancel or reject driver' }).click()
  await expect(page.getByText('Your driver is already at the pickup. Cancel anyway?')).toBeVisible()
  await page.getByRole('button', { name: /^Cancel and pay ₹/ }).click()
  await expect(page.getByText(/Trip cancelled\. A ₹[\d,.]+ cancellation fee was charged\./)).toBeVisible()
  const payment = (await customer.api.get(`/v1/trips/${tripId}/payment`)).body.payment
  expect(payment.status).toBe('CAPTURED')
  expect(Number(payment.amount_captured)).toBeGreaterThan(0)
})

test('5a. safety defaults chosen on the first booking are saved', async ({ page, customer }) => {
  await page.goto('/app/book')
  await page.getByRole('switch', { name: /Prefer a female driver/ }).click()
  await page.getByRole('button', { name: 'Book a driver' }).click()
  await page.waitForURL(/\/app\/track/)
  const me = (await customer.api.get('/v1/me')).body
  expect(me.safety).toMatchObject({ set: true, prefer_female_driver: true })
  await page.getByRole('button', { name: 'Cancel booking' }).click()
})

test('5b. a failed safety-defaults save still books the trip', async ({ page, customer }) => {
  await page.route('**/v1/me', (route) =>
    route.request().method() === 'PATCH' ? route.fulfill({ status: 500, body: '{}' }) : route.fallback(),
  )
  await page.goto('/app/book')
  await page.getByRole('button', { name: 'Book a driver' }).click()
  await expect(page.getByText('Booking anyway. Your safety defaults could not be saved this time.')).toBeVisible()
  await page.waitForURL(/\/app\/track/)
  expect(await tripOf(customer)).toBeTruthy()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
})

test('11. "Choose on map" loads the map on demand and sets the pickup', async ({ page, customer }) => {
  void customer
  await page.goto('/app/book')
  await page.locator('button[aria-haspopup="listbox"]').first().click()
  await page.getByRole('button', { name: 'Choose on map' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('.leaflet-container').click({ position: { x: 120, y: 120 } })
  await dialog.getByRole('button', { name: 'Use this point' }).click()
  await expect(dialog).toBeHidden()
})
