import { test, expect } from '@playwright/test'

test('Login with newly created player', async ({ page, request }) => {
  const email = `pw.created.${Date.now()}@example.com`
  const tokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'EPHSRUAdmin' },
    headers: { 'Content-Type': 'application/json' },
  })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/players', {
    data: { name: 'PW', surname: 'Created', zoneId: 'Z1', schoolId: 'S1', email },
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })

  await page.goto('http://localhost:5173/')
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(email)
  await loginForm.getByLabel('Password').fill('secret123')
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
})