import {defineConfig} from '@playwright/test';
process.env.GLTROF_AUTH_EMULATOR='1';
export default defineConfig({
  testDir:'./tests/e2e',testMatch:'firebase-queue.spec.js',workers:1,timeout:100000,outputDir:'test-results-ranked',
  reporter:[['list']],use:{baseURL:'http://127.0.0.1:4182',headless:true,screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[{name:'Chrome + Edge',use:{browserName:'chromium',channel:'chrome'}}],
  webServer:{command:'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4182',url:'http://127.0.0.1:4182',reuseExistingServer:true,env:{
    VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_AUTH_DOMAIN:'demo-gltrof.firebaseapp.com',VITE_FIREBASE_DATABASE_URL:'https://demo-gltrof-default-rtdb.firebaseio.com',VITE_FIREBASE_PROJECT_ID:'demo-gltrof',VITE_FIREBASE_APP_ID:'demo-app',VITE_AUTH_EMULATOR_URL:'http://127.0.0.1:9099',VITE_DATABASE_EMULATOR_HOST:'127.0.0.1:9000'
  }}
});
