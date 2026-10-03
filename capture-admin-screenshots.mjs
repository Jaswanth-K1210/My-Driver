import puppeteer from 'puppeteer'
import { mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

const BASE_URL = 'http://localhost:5173'
const OUTPUT_DIR = 'C:\\Users\\srila\\OneDrive\\Desktop\\BTECH\\Internship\\MyDriver\\Shareables\\admin UI'

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

function getSuperAdminPassword() {
  try {
    const content = readFileSync('credentials.md', 'utf-8')
    const match = content.match(/\| SUPER_ADMIN \| `superadmin@mydriver.test` \| `([^`]+)` \|/)
    if (match && match[1]) {
      return match[1]
    }
  } catch (err) {
    console.error('Failed to read credentials.md:', err)
  }
  return 'zCO_SPBeqOcCtvIU'
}

async function capture() {
  const password = getSuperAdminPassword()
  console.log(`Using SUPER_ADMIN password: ${password}`)

  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  console.log('1. Capturing Admin Login screen...')
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2' })
  await new Promise(r => setTimeout(r, 1000))
  await page.screenshot({ path: join(OUTPUT_DIR, '01_Admin_Login_Page.png') })

  console.log('Signing in as Super Admin...')
  await page.focus('#admin-email')
  await page.keyboard.type('superadmin@mydriver.test', { delay: 30 })
  await page.focus('#admin-password')
  await page.keyboard.type(password, { delay: 30 })
  await new Promise(r => setTimeout(r, 500))

  await page.click('button[type="submit"]')
  await page.waitForFunction(() => !window.location.href.includes('/admin/login'), { timeout: 10000 })

  console.log('Signed in successfully!')

  const routes = [
    { name: '02_Safety_Desk_Live_Board.png', path: '/admin' },
    { name: '03_Live_Driver_Map.png', path: '/admin/map' },
    { name: '04_Post_Drop_Checkins.png', path: '/admin/checkins' },
    { name: '05_Driver_Onboarding_Queue.png', path: '/admin/drivers' },
    { name: '06_Night_Shield_Operations.png', path: '/admin/night-shield' },
    { name: '07_Assessment_Grading_Queue.png', path: '/admin/grading' },
    { name: '08_Finance_Payouts_Settlement.png', path: '/admin/payouts' },
    { name: '09_Immutable_Audit_Ledger.png', path: '/admin/audit' },
  ]

  for (const r of routes) {
    console.log(`Capturing ${r.name} at ${r.path}...`)
    await page.goto(`${BASE_URL}${r.path}`, { waitUntil: 'networkidle2' })
    await new Promise(res => setTimeout(res, 2000))
    await page.screenshot({ path: join(OUTPUT_DIR, r.name) })
  }

  // Driver Detail screen
  console.log('Capturing Driver Detail screen...')
  await page.goto(`${BASE_URL}/admin/drivers`, { waitUntil: 'networkidle2' })
  await new Promise(res => setTimeout(res, 1000))
  // Click 'All' tab button
  const allTabBtn = await page.$('button::-p-text(All)') || (await page.$$('button'))[0]
  if (allTabBtn) await allTabBtn.click()
  await new Promise(res => setTimeout(res, 1500))

  const firstDriverBtn = await page.$('ul button')
  if (firstDriverBtn) {
    console.log('Clicking first driver...')
    await firstDriverBtn.click()
    await new Promise(res => setTimeout(res, 2000))
    console.log(`Driver detail URL: ${page.url()}`)
    await page.screenshot({ path: join(OUTPUT_DIR, '10_Driver_Detail_Verification.png') })
  } else {
    console.log('Navigating directly to sample driver detail...')
    await page.goto(`${BASE_URL}/admin/drivers/drv_sample`, { waitUntil: 'networkidle2' })
    await new Promise(res => setTimeout(res, 2000))
    await page.screenshot({ path: join(OUTPUT_DIR, '10_Driver_Detail_Verification.png') })
  }

  // Incident Workbench screen
  console.log('Capturing Incident Workbench screen...')
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' })
  await new Promise(res => setTimeout(res, 1500))
  const firstIncidentBtn = await page.$('ul button') || await page.$('button[type="button"]')
  if (firstIncidentBtn) {
    console.log('Clicking incident item...')
    await firstIncidentBtn.click()
    await new Promise(res => setTimeout(res, 2000))
    console.log(`Incident workbench URL: ${page.url()}`)
    await page.screenshot({ path: join(OUTPUT_DIR, '11_Incident_Workbench.png') })
  } else {
    console.log('Navigating directly to sample incident workbench...')
    await page.goto(`${BASE_URL}/admin/incident/inc_sample`, { waitUntil: 'networkidle2' })
    await new Promise(res => setTimeout(res, 2000))
    await page.screenshot({ path: join(OUTPUT_DIR, '11_Incident_Workbench.png') })
  }

  await browser.close()
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!')
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err)
  process.exit(1)
})
