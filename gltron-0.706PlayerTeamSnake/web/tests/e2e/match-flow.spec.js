import {test,expect} from '@playwright/test';
import {openHost} from './landing-helpers.js';
test('default target is 25; rounds restart automatically until the selected target',async({page})=>{
  await page.goto('/');await openHost(page);await expect(page.locator('#create-form [name=matchPoints]')).toHaveValue('25');await expect(page.locator('#create-form [name=pointsToWin]')).toHaveValue('25');
  // A lower selected target exercises real native scoring and automatic rounds quickly.
  await page.locator('#create-form [name=matchPoints]').fill('2');await page.locator('#create-form [name=gridSize]').selectOption('240');await page.locator('#create-form [name=speed]').selectOption('14');await page.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();await page.locator('#add-bot').click();await expect(page.locator('#player-list .player')).toHaveCount(2);await page.locator('#start-game').click();await expect(page.locator('#game')).toBeVisible({timeout:35000});await expect(page.locator('#game-loading')).toBeHidden({timeout:35000});
  const generation=await page.evaluate(()=>window.__gltrof.module.ccall('web_round_generation','number',[],[]));
  await expect.poll(()=>page.evaluate(()=>window.__gltrof.module.ccall('web_round_generation','number',[],[])),{timeout:45000}).toBeGreaterThan(generation);
  await expect(page.locator('#rematch-panel')).toBeVisible({timeout:45000});
  expect(await page.evaluate(()=>Math.max(...Object.values(window.__gltrof.room.scores)))).toBeGreaterThanOrEqual(2);
});
