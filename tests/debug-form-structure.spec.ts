import { test } from '@playwright/test';

test('debug form structure', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  
  // Navigate to player registration with current UI
  const registerSection = page.locator('section:has(h1:has-text("Register"))')
  await registerSection.getByLabel('Email').fill(`debug.${Date.now()}@example.com`)
  await registerSection.getByLabel('Create Password').fill('secret123')
  await registerSection.getByLabel('Verify Password').fill('secret123')
  await registerSection.getByLabel('Select registration form').selectOption('player')
  await registerSection.getByRole('button', { name: 'Continue' }).click()
  
  // Take a screenshot to see what's on the page
  await page.screenshot({ path: 'debug-form.png', fullPage: true });
  
  // Log all form elements
  const formElements = await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) return 'No form found';
    
    const elements = Array.from(form.querySelectorAll('input, select, button'));
    return elements.map((el, index) => ({
      index,
      tagName: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
      textContent: el.textContent?.trim()
    }));
  });
  
  console.log('Form elements:', JSON.stringify(formElements, null, 2));
  
  // Try to find the first text input
  const firstTextInput = await page.locator('input[type="text"]').first();
  const count = await firstTextInput.count();
  console.log('Found', count, 'text inputs');
  
  if (count > 0) {
    const name = await firstTextInput.getAttribute('name');
    console.log('First text input name:', name);
  }
});