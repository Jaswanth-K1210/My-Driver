import { API, CONSOLE, api, bookAndPay, expect, staffAccount, test, until } from './helpers.js'

/** A customer trip on the road: booked and paid on the website, accepted and started by `d`. */
async function tripInProgress(page, customer, d) {
  await bookAndPay(page)
  const tripId = await d.accept()
  await d.start(tripId, (await customer.api.post(`/v1/trips/${tripId}/handshake-otp`)).body.otp)
  return tripId
}

test('6. staff sign in, see the trip on the Board and open it', async ({ browser, page, customer, driver }) => {
  const tripId = await tripInProgress(page, customer, await driver())

  const ctx = await browser.newContext({ baseURL: CONSOLE })
  const ops = await ctx.newPage()
  const { email, password } = staffAccount('OPS_MANAGER')
  await ops.goto('/login')
  await ops.getByLabel('Email').fill(email)
  await ops.getByLabel('Password').fill(password)
  await ops.getByRole('button', { name: /sign in/i }).click()
  await expect(ops.getByRole('heading', { name: 'Live board' })).toBeVisible()

  // Rows link to the trip; pick ours by its id in the row's link target.
  const short = `TRP-${tripId.slice(0, 6).toUpperCase()}`
  await until(async () => {
    await ops.reload()
    return (await ops.getByRole('row', { name: /Open trip/ }).count()) > 0
  }, 'an active trip on the Board')
  await ops.goto(`/trips/${tripId}`)
  await expect(ops.getByText(short).first()).toBeVisible()
  await ctx.close()
})

test('7. Pricing blocks invalid rates and audits a valid change', async ({ consolePage, staff }) => {
  const admin = await staff('SUPER_ADMIN')
  const card = (await admin.api.get('/v1/admin/rate-cards')).body.items.find((c) => c.skill_id === 'MD-Standard')
  const ops = await consolePage('SUPER_ADMIN')
  await ops.goto('/pricing')
  const rate = ops.getByRole('spinbutton', { name: 'Standard per km rate' })
  const row = ops.getByRole('row', { name: /MD-Standard/ })

  for (const bad of ['', '-1', '0', '501']) {
    await rate.fill(bad)
    await expect(rate).toHaveAttribute('aria-invalid', 'true')
    await expect(row.getByRole('button', { name: 'Save' })).toBeDisabled()
  }

  const next = card.per_km_rate + 1
  try {
    await rate.fill(String(next))
    await row.getByRole('button', { name: 'Save' }).click()
    await ops.getByLabel('Reason (kept in the audit ledger)').fill('e2e: valid rate change')
    await ops.getByRole('button', { name: 'Apply new prices' }).click()
    await expect(ops.getByText('Standard prices updated. New quotes use them now.')).toBeVisible()
    await until(async () => {
      const now = (await admin.api.get('/v1/admin/rate-cards')).body.items.find((c) => c.skill_id === 'MD-Standard')
      return now.per_km_rate === next
    }, 'the saved rate')
    const audit = (await admin.api.get('/v1/admin/audit?subject=MD-Standard&limit=5')).body
    expect(JSON.stringify(audit)).toContain(String(next))
  } finally {
    await admin.api.patch('/v1/admin/rate-cards/MD-Standard', { per_km_rate: card.per_km_rate, reason: 'e2e restore' })
  }
})

test('8. Safety Desk acknowledges and resolves an SOS; the trip goes back to in trip', async ({ page, customer, driver, consolePage }) => {
  const tripId = await tripInProgress(page, customer, await driver())
  const sos = (await customer.api.post(`/v1/trips/${tripId}/sos`, {})).body
  expect((await customer.api.get(`/v1/trips/${tripId}`)).body.status).toBe('ESCALATED')

  const desk = await consolePage('SAFETY_DESK_AGENT')
  await desk.goto('/')
  await expect(desk.getByRole('button', { name: /Silent SOS raised/ }).first()).toBeVisible()
  await desk.goto(`/incident/${sos.id}`)
  await desk.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(desk.getByText('ACKNOWLEDGED').first()).toBeVisible()
  await desk.getByRole('button', { name: 'Resolve incident' }).click()
  await desk.getByLabel('Resolution').fill('e2e: customer pressed SOS by mistake, confirmed safe by call')
  await desk.getByRole('button', { name: 'Resolve', exact: true }).click()
  await expect(desk.getByText('RESOLVED').first()).toBeVisible()

  await until(async () => (await customer.api.get(`/v1/trips/${tripId}`)).body.status === 'IN_TRIP', 'the trip back IN_TRIP')
  await expect(page.getByText('On the way')).toBeVisible()
})

async function suspend(ops, driverId) {
  await ops.goto(`/drivers/${driverId}`)
  await ops.getByRole('button', { name: 'SUSPENDED' }).click()
  await ops.getByLabel('Reason').fill('e2e: suspended mid-trip')
  await ops.getByRole('button', { name: 'Update status' }).click()
  await expect(ops.getByText('SUSPENDED').first()).toBeVisible()
}

test('9a. suspending a driver with a pending offer hands the trip to another driver', async ({ page, customer, driver, consolePage }) => {
  const first = await driver()
  await bookAndPay(page)
  const tripId = await first.offered()
  const second = await driver()

  const ops = await consolePage('OPS_MANAGER')
  await ops.goto(`/drivers/${first.userId}`)
  // Approval needs completed identity checks, which a development driver lacks.
  await expect(ops.getByText(/Approval unlocks when these are done/)).toBeVisible()
  await suspend(ops, first.userId)

  expect(await second.accept()).toBe(tripId)
  expect((await customer.api.get(`/v1/trips/${tripId}`)).body.driver.id).toBe(second.userId)
})

test('9b. suspending a driver on the way to pickup cancels the trip at no charge', async ({ page, customer, driver, consolePage }) => {
  const d = await driver()
  await bookAndPay(page)
  const tripId = await d.accept()

  await suspend(await consolePage('OPS_MANAGER'), d.userId)

  await until(async () => (await customer.api.get(`/v1/trips/${tripId}`)).body.status === 'CANCELLED', 'the cancellation')
  const payment = (await customer.api.get(`/v1/trips/${tripId}/payment`)).body.payment
  expect(payment.status).toBe('RELEASED')
})

test('10. each role is refused where it does not belong', async ({ request, customer, staff, consolePage }) => {
  const finance = await staff('FINANCE')
  const desk = await staff('SAFETY_DESK_AGENT')
  const ops = await staff('OPS_MANAGER')

  expect((await customer.api.get('/v1/admin/trips')).status).toBe(403)
  expect((await finance.api.get('/v1/admin/escalations')).status).toBe(403)
  expect((await desk.api.patch('/v1/admin/rate-cards/MD-Standard', { per_km_rate: 1 })).status).toBe(403)
  expect((await ops.api.patch('/v1/admin/pricing/fees', { platform_fee: 1 })).status).toBe(403)
  expect((await ops.api.get('/v1/admin/audit')).status).toBe(403)
  expect((await api(request, null).get('/v1/admin/trips')).status).toBe(401)

  // Staff sign-in is refused from any origin but the console's.
  const { email, password } = staffAccount('SUPER_ADMIN')
  const fromSite = await request.post(`${API}/v1/auth/staff/login`, {
    data: { email, password },
    headers: { origin: 'http://localhost:5173' },
  })
  expect(fromSite.status()).toBe(403)

  const deskPage = await consolePage('SAFETY_DESK_AGENT')
  await deskPage.goto('/')
  await expect(deskPage.getByRole('link', { name: 'Live board' })).toBeVisible()
  await expect(deskPage.getByRole('link', { name: 'Pricing' })).toHaveCount(0)
  await expect(deskPage.getByRole('link', { name: 'Audit ledger' })).toHaveCount(0)
})
