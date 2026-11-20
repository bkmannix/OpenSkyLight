// E2E: touch taps between focused text fields keep the on-screen keyboard mounted.
import { launchApp, newUserData, cleanupUserData } from './e2e-lib.mjs'

const userData = newUserData('osl-osk-')
const { app, page } = await launchApp({ userData })

try {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Calendars', exact: true }).click()

  const clientId = page.getByPlaceholder('OAuth client ID')
  const clientSecret = page.getByPlaceholder('OAuth client secret')
  await page.waitForSelector('input[data-osk-input][placeholder="OAuth client ID"]')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })

  await page.evaluate(() => {
    window.__oskTrayRemovals = 0
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node instanceof Element && (node.matches('.osl-osk-tray') || node.querySelector('.osl-osk-tray'))) {
            window.__oskTrayRemovals++
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  })

  const tap = async (input, placeholder) => {
    const box = await input.boundingBox()
    if (!box) throw new Error(`Input "${placeholder}" has no visible hit target`)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForFunction(
      (expected) =>
        Boolean(document.querySelector('.osl-osk-tray')) &&
        document.activeElement?.getAttribute('placeholder') === expected,
      placeholder,
      { timeout: 3000 }
    )
  }

  await tap(clientId, 'OAuth client ID')
  for (let i = 0; i < 10; i++) {
    await tap(clientSecret, 'OAuth client secret')
    await tap(clientId, 'OAuth client ID')
  }

  const removals = await page.evaluate(() => window.__oskTrayRemovals)
  if (removals !== 0) throw new Error(`Keyboard tray unmounted ${removals} times while switching fields`)
  console.log('OSK E2E PASS: 20 touch handoffs kept the keyboard mounted')
} finally {
  await app.close()
  cleanupUserData(userData)
}
