import puppeteer from 'puppeteer-core';

import GoLogin from './src/gologin.js';

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NDJhNDgwNDc0NWZkYzlhYTE3OGE0YjciLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2NDJhZDI5YTMzODcwMDRmNDNlOTUzYTcifQ.c9yK_stX3hfmqlktKw2bVEN1wp3Ry-i0OqpgB4IGt6M';

const profile_id = '642a4804745fdc921f78a4f6';

(async () => {
  const GL = new GoLogin({
    token,
    profile_id,
  });

  const { status, wsUrl } = await GL.start().catch((e) => {
    console.trace(e);

    return { status: 'failure' };
  });

  if (status !== 'success') {
    console.log('Invalid status');

    return;
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.toString(),
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.goto('https://myip.link/mini');
  console.log(await page.content());
  await browser.close();
  await GL.stop();
})();
