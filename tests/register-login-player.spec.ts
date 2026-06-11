import { test, expect } from '@playwright/test'

test('Register player then login to access dashboard', async ({ page }) => {
  const ts = Date.now()
  const email = `test.player.${ts}@example.com`

  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
  const registerSection = page.locator('section:has(h1:has-text("Register"))')
  await registerSection.getByLabel('Email').fill(email)
  await registerSection.getByLabel('Create Password').fill('secret123')
  await registerSection.getByLabel('Verify Password').fill('secret123')
  await registerSection.getByLabel('Select registration form').selectOption('player')
  await registerSection.getByRole('button', { name: 'Continue' }).click()

  await page.getByTestId('zone-select').waitFor()
  await page.getByTestId('zone-select').selectOption({ index: 1 })
  await page.getByTestId('school-select').waitFor()
  await page.getByTestId('school-select').selectOption({ index: 1 })

  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test')
  await page.getByRole('textbox', { name: 'Surname', exact: true }).fill('Player')
  await page.getByLabel('ID/Passport').fill(`1001${Date.now().toString().slice(-9)}`)
  await page.getByLabel('Date of Birth').fill('2010-01-01')
  await page.getByLabel('Gender').selectOption({ label: 'Male' })
  await page.getByLabel('Email Address').first().fill(email)

  await page.getByRole('button', { name: 'Submit Player Registration' }).click()
  await expect(page.getByText(/Congratulations! Your player registration has been submitted/i)).toBeVisible()

  await page.goto('http://localhost:5173/')
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(email)
  await loginForm.getByLabel('Password').fill('secret123')
  await loginForm.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
})
