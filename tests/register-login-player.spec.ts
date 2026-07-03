import { test, expect } from '@playwright/test'
import { validSaId } from './helpers/said'
import { uiLogin, startCreateUser } from './helpers/delegation'

// Delegation model: the coach creates the player's account; the player then
// signs in with the credentials chosen at creation time.
test('Coach registers a player who can then sign in to their dashboard', async ({ page, request }) => {
  const ts = Date.now()
  const email = `test.player.${ts}@example.com`
  const coachEmail = `reg.coach.${ts}@example.com`

  // Seed the coach (created by a school admin, per the hierarchy)
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId: '1', schoolId: 'S1' }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/coaches', { data: { name: 'Reg', surname: 'Coach', zoneId: '1', schoolId: 'S1', email: coachEmail }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })

  await uiLogin(page, coachEmail)
  await startCreateUser(page, { email, type: 'player' })

  await page.getByTestId('zone-select').waitFor()
  await page.getByTestId('zone-select').selectOption({ index: 1 })
  await page.getByTestId('school-select').waitFor()
  await page.getByTestId('school-select').selectOption({ index: 1 })

  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test')
  await page.getByRole('textbox', { name: 'Surname', exact: true }).fill('Player')
  await page.getByLabel('ID/Passport').fill(validSaId(Date.now(), '2010-01-01', 'Male'))
  await page.getByLabel('Date of Birth').fill('2010-01-01')
  await page.getByLabel('Gender').selectOption({ label: 'Male' })
  await expect(page.getByLabel('Email Address', { exact: true })).toHaveValue(email)

  await page.getByLabel('POPIA consent').check()
  await page.getByRole('button', { name: 'Submit Player Registration' }).click()
  await expect(page.getByText(/Congratulations! Your player registration has been submitted/i)).toBeVisible()

  // The player signs in with the credentials the coach set up
  await uiLogin(page, email)
})
