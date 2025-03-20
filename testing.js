const { chromium } = require('playwright')
const axios = require('axios')
require('dotenv').config()

const API_KEY = process.env.API_KEY
const PAGE_URL = 'https://recaptcha-demo.appspot.com/recaptcha-v2-checkbox.php'

async function solveRecaptcha(page) {
  console.log('Extracting sitekey...')

  // Extract reCAPTCHA sitekey from the page
  const siteKey = await page.evaluate(() => {
    return document.querySelector('.g-recaptcha').getAttribute('data-sitekey')
  })

  if (!siteKey) {
    console.error('Failed to find reCAPTCHA sitekey.')
    return
  }

  console.log('Sitekey found:', siteKey)

  // Step 1: Create CapMonster Task
  console.log('Requesting CapMonster to solve reCAPTCHA...')
  const { data: taskResponse } = await axios.post(
    'https://api.capmonster.cloud/createTask',
    {
      clientKey: API_KEY,
      task: {
        type: 'NoCaptchaTaskProxyless',
        websiteURL: PAGE_URL,
        websiteKey: siteKey,
      },
    }
  )

  if (!taskResponse.taskId) {
    console.error('Error creating task:', taskResponse)
    return
  }

  const taskId = taskResponse.taskId
  console.log('Task created. ID:', taskId)

  // Step 2: Wait for CapMonster to Solve CAPTCHA
  let solution
  while (!solution) {
    await new Promise((resolve) => setTimeout(resolve, 5000)) // Wait 5 seconds

    const { data: solutionResponse } = await axios.post(
      'https://api.capmonster.cloud/getTaskResult',
      {
        clientKey: API_KEY,
        taskId: taskId,
      }
    )

    if (solutionResponse.status === 'ready') {
      solution = solutionResponse.solution.gRecaptchaResponse
    }
  }

  console.log('CAPTCHA Solved:', solution)

  // Step 3: Inject CAPTCHA response into the hidden textarea
  await page.evaluate((captchaResponse) => {
    document.querySelector('#g-recaptcha-response').value = captchaResponse
  }, solution)

  console.log('Injected CAPTCHA token.')
}

;(async () => {
  const browser = await chromium.launch({ headless: false }) // Set to 'true' for headless mode
  const page = await browser.newPage()

  console.log('Opening page:', PAGE_URL)
  await page.goto(PAGE_URL)

  // Fill form fields
  await page.fill('input[name="ex-a"]', 'My Example A')
  await page.fill('input[name="ex-b"]', 'My Example B')
  console.log('Filled form fields.')

  // Solve CAPTCHA
  await solveRecaptcha(page)

  // Step 4: Click reCAPTCHA Checkbox (if needed)
  try {
    const iframeElement = await page.frameLocator('iframe[title="reCAPTCHA"]')
    await iframeElement.locator('div.recaptcha-checkbox-border').click()
    console.log('Clicked reCAPTCHA checkbox.')
  } catch (error) {
    console.log('Skipping checkbox click (probably auto-filled).')
  }

  // Step 5: Submit the form
  await page.click('button[type="submit"]')
  console.log('Form submitted successfully!')

  console.log('Waiting for 5 seconds before closing...')
  await page.waitForTimeout(5000)

  await browser.close()
})()
