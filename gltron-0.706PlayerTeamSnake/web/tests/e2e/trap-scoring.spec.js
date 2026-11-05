import {test,expect} from '@playwright/test';
import {openHost} from './landing-helpers.js';
test('native trap bonus remains fractional through snapshots/rounds, clears for a rematch',async({page})=>{
  await page.goto('/');await page.locator('#local-players').selectOption('2');await openHost(page);await page.locator('#create-form [name=matchPoints]').fill('99');await page.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();await expect(page.locator('#match-rules')).toContainText('tiered traps');await page.locator('#start-game').click();await expect(page.locator('#game')).toBeVisible({timeout:35000});await expect(page.locator('#game-loading')).toBeHidden({timeout:35000});
  const result=await page.evaluate(()=>{
    const s=window.__gltrof,m=s.module;s.network.clock.terminate();m.webClock.terminate();
    m.ccall('web_snapshot_save','number',[],[]);const bytes=m.webSnapshot.slice(),view=new DataView(bytes.buffer);
    // Version-2 wire header is 56 bytes; Data begins with dir, survival, traps.
    if(view.getUint32(0,true)!==0x47545246||view.getUint32(4,true)!==2)throw Error('Unexpected engine snapshot protocol');
    view.setInt32(60,24,true);view.setInt32(64,3,true);view.setInt32(112,6,true);m.webSnapshot=bytes;if(!m.ccall('web_snapshot_load','number',[],[]))throw Error('Snapshot rejected');
    const read=()=>['web_player_score','web_player_survival','web_player_traps'].map(name=>m.ccall(name,'number',['number'],[0]));
    const restored=read();m.ccall('web_restart_round',null,[],[]);const nextRound=read();return {restored,nextRound};
  });
  expect(result.restored).toEqual([25.5,24,3]);expect(result.nextRound).toEqual([25.5,24,3]);
  await expect(page.locator('#scoreboard')).toContainText('25.5');await expect(page.locator('#scoreboard')).toContainText('24 survival · 3 traps');
  const reset=await page.evaluate(()=>{const m=window.__gltrof.module;m.ccall('web_new_match',null,[],[]);return ['web_player_score','web_player_survival','web_player_traps'].map(name=>m.ccall(name,'number',['number'],[0]));});expect(reset).toEqual([0,0,0]);
});

test('tournament auto-capture preserves native half-point totals and trap standings',async({page})=>{
  await page.goto('/');await page.locator('#local-players').selectOption('2');await openHost(page);await page.locator('#session-kind').selectOption('tournament');await page.locator('#create-form [name=pointsToWin]').fill('1');await page.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();await page.locator('#start-game').click();await page.getByRole('button',{name:'Launch arena'}).first().click();await expect.poll(()=>page.evaluate(()=>window.__gltrof.arenas.size)).toBe(1);
  await page.evaluate(()=>{
    const s=window.__gltrof,m=[...s.arenas.values()][0].module;m.webClock.terminate();m.ccall('web_snapshot_save','number',[],[]);const bytes=m.webSnapshot.slice(),view=new DataView(bytes.buffer);
    view.setInt32(24,2,true);view.setInt32(28,0,true);view.setInt32(60,1,true);view.setInt32(64,1,true);view.setInt32(112,2,true);m.webSnapshot=bytes;if(!m.ccall('web_snapshot_load','number',[],[]))throw Error('Snapshot rejected');
  });
  await expect.poll(()=>page.evaluate(()=>window.__gltrof.room.tournament.status)).toBe('complete');
  const match=await page.evaluate(()=>window.__gltrof.room.tournament.rounds[0].matches[0]);expect(match.scores[match.playerIds[0]]).toBe(1.5);expect(match.traps[match.playerIds[0]]).toBe(1);expect(match.winners).toEqual([match.playerIds[0]]);
});
