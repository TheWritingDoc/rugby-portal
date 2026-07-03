import { expect, Page } from '@playwright/test'

// Sign in through the UI. Dev servers accept any password for accounts that
// have no stored password hash.
export async function uiLogin(page: Page, email: string, password = 'secret123') {
  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.reload()
  const form = page.locator('form:has(button:has-text("Sign In"))')
  await form.getByLabel('Email').fill(email)
  await form.getByLabel('Password').fill(password)
  await form.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 15000 })
}

// Drive the hierarchical "Create User" flow: pick the account credentials and
// user type, which routes to the matching registration form.
export async function startCreateUser(page: Page, opts: { email: string; password?: string; type: 'player' | 'coach' | 'referee' | 'school' | 'admin' | 'zone' | 'ephsru' }) {
  const password = opts.password || 'secret123'
  await page.getByTestId('btn-create-user').click()
  await page.getByLabel('Email', { exact: true }).fill(opts.email)
  await page.getByLabel('Create Password').fill(password)
  await page.getByLabel('Verify Password').fill(password)
  await page.getByLabel('Select user type to create').selectOption(opts.type)
  await page.getByTestId(`btn-${opts.type}`).click()
}
