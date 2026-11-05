export async function openHost(page){if(!await page.locator('#host-dialog').isVisible())await page.locator('[data-open-host]').first().click();}
export async function openPreferences(page){if(!await page.locator('#quick-form [name=mode]').isVisible())await page.locator('#quick-preferences summary').click();}
export async function openAdvanced(page){if(!await page.locator('#create-form [name=password]').isVisible())await page.locator('#host-advanced summary').click();}
export async function openJoinPassword(page){if(!await page.locator('#join-form [name=password]').isVisible())await page.locator('#join-password summary').click();}
