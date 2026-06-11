import { test, expect } from '@playwright/test'

test('Admin registration via UI and login to dashboard', async ({ page }) => {
  const ts = Date.now()
  const email = `admin.user.${ts}@example.com`
  const password = 'secret123'

  await page.goto('http://localhost:5173/')

  const registerSection = page.locator('section:has(h1:has-text("Register"))')
  await registerSection.getByLabel('Email').fill(email)
  await registerSection.getByLabel('Create Password').fill(password)
  await registerSection.getByLabel('Verify Password').fill(password)
  await registerSection.getByLabel('Select registration form').selectOption('admin')
  await registerSection.getByRole('button', { name: 'Continue' }).click()

  await page.getByTestId('zone-select').waitFor()
  await page.getByTestId('zone-select').selectOption({ index: 1 })
  await page.getByTestId('school-select').waitFor()
  await page.getByTestId('school-select').selectOption({ index: 1 })
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Admin')
  await page.getByRole('textbox', { name: 'Surname', exact: true }).fill('User')
  await page.getByRole('textbox', { name: 'ID Number', exact: true }).fill('8001015009087')
  await page.getByRole('textbox', { name: 'Mobile Number', exact: true }).fill('0821234567')
  await page.getByRole('textbox', { name: 'Email Address', exact: true }).first().fill(email)

  await page.getByRole('button', { name: 'Submit Admin Registration' }).click()
  await expect(page.getByTestId('toast-success')).toContainText(/Admin registration submitted/i)

  await page.goto('http://localhost:5173/')
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(email)
  await loginForm.getByLabel('Password').fill(password)
  await loginForm.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-dashboard.png', fullPage: true })
})