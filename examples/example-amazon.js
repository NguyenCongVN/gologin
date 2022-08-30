const puppeteer = require('puppeteer-core');
const {GoLogin} = require('../gologin');

(async () =>{
    const GL = new GoLogin({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzA4MjgxNWJmZTJmMzRiYzU3YTg1NGIiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MzA4MjgyNDBkODYwYjY5YmRkN2U5ZTYifQ.6tSC1Lw2wrJ7aTPitLzae-i_s_aWrSHHRVDz_ZFFku8',
        profile_id: '63082c4fbfe2f36e417a8710',
    });
    const {status, wsUrl} = await GL.start(); 
    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl.toString(), 
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    const viewPort = GL.getViewPort();
    await page.setViewport({ width: Math.round(viewPort.width * 0.994), height: Math.round(viewPort.height * 0.92) });
    const session = await page.target().createCDPSession();
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', { windowId, bounds: viewPort });
    await session.detach();
    
    await page.goto('https://www.amazon.com/-/dp/B0771V1JZX');   

    const content = await page.content();
    const matchData = content.match(/'initial': (.*)}/);
    if(matchData == null || matchData.length==0){
        console.log('no images found');
    } else {
        const data = JSON.parse(matchData[1]);
        const images = data.map( e => e.hiRes);
        console.log('images=', images);
    }
    await browser.close();
    await GL.stop();
})();
