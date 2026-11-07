import{defineConfig}from'@playwright/test';
import base from'./playwright.config.js';
export default defineConfig({...base,testMatch:['mobile-game.spec.js','snake-art.spec.js'],projects:[{name:'WebKit phone',use:{browserName:'webkit'}}]});
