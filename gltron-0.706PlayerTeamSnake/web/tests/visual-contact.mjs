import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';

const directory=resolve('visual-review');
const files=(await readdir(directory)).filter(name=>/^perspective-.*\.png$/.test(name)).sort();
if(!files.length)throw new Error('Run perspective screenshot tests first.');
const cards=await Promise.all(files.map(async name=>`<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${(await readFile(resolve(directory,name))).toString('base64')}" /></figure>`));
const browser=await chromium.launch({channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  await page.setContent(`<style>body{margin:0;background:#181a20;color:white;font:13px monospace;display:grid;grid-template-columns:repeat(4,1fr)}figure{margin:0;padding:6px;border:1px solid #444}img{width:100%;display:block}figcaption{padding:4px}</style>${cards.join('')}`);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await page.screenshot({path:resolve(directory,'contact-sheet.png'),fullPage:true});
  console.log(`Contact sheet: ${files.length} screenshots`);
}finally{await browser.close();}
