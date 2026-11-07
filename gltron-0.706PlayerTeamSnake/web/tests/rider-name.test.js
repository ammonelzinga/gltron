import test from 'node:test';
import assert from 'node:assert/strict';
import {randomRiderName,preferredRiderName} from '../src/rider-name.js';
import {leaderboard} from '../src/community.js';
test('Google identity supplies initial nickname but preserves later custom names',()=>{
  const user={uid:'google-1',google:true,name:'Ada Lovelace'};
  assert.equal(preferredRiderName(user,'Byte Rider','guest'),'Ada Lovelace');
  assert.equal(preferredRiderName(user,'My cycle','google-1'),'My cycle');
  assert.equal(preferredRiderName(user,'Grid rider','google-1'),'Ada Lovelace');
  assert.ok(randomRiderName(()=>0).length<=24);
});
test('leaderboard uses Google profile labels while nicknames never change account rank',()=>{
  const ratings={uidA:{name:'Custom game name',rating:1600,games:7},uidB:{name:'Impersonated nickname',rating:1500,games:3}};
  const profiles={uidA:{name:'Ada Lovelace'},uidB:{name:'Grace Hopper'}};
  const board=leaderboard(ratings,'uidA',10,profiles);
  assert.equal(board.own.name,'Ada Lovelace');assert.equal(board.own.rank,1);
  ratings.uidA.name='Another nickname';
  assert.deepEqual(leaderboard(ratings,'uidA',10,profiles),board);
  assert.equal(leaderboard(ratings,'uidA').own.name,'Grid rider');
});
