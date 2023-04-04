import * as puppeteer from 'puppeteer-core';

import GoLogin from '../src/gologin.js';

(async () => {
  const GL = new GoLogin({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NDJhNDgwNDc0NWZkYzlhYTE3OGE0YjciLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2NDJhZDI5YTMzODcwMDRmNDNlOTUzYTcifQ.c9yK_stX3hfmqlktKw2bVEN1wp3Ry-i0OqpgB4IGt6M',
    profile_id: '642c2da565cb315b8b51ebfe',
    // executablePath: '/usr/bin/orbita-browser/chrome',
    // tmpdir: '/my/tmp/dir',
  });

  const wsUrl = await GL.startLocal();
  // const browser = await puppeteer.connect({
  //   browserWSEndpoint: wsUrl.toString(),
  //   ignoreHTTPSErrors: true,
  // });

  // const page = await browser.newPage();
  // await page.goto('https://myip.link');
  // console.log(await page.content());
  // await browser.close();
  // delay 5000
  await GL.stopLocal({ posting: false });
})();
