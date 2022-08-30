const puppeteer = require('puppeteer-core');
const {GoLogin} = require('../gologin');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () =>{
    const GL = new GoLogin({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzA4MjgxNWJmZTJmMzRiYzU3YTg1NGIiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MzA4MjgyNDBkODYwYjY5YmRkN2U5ZTYifQ.6tSC1Lw2wrJ7aTPitLzae-i_s_aWrSHHRVDz_ZFFku8',
    });
    
    // next parameters are required for creating

    const profile_id = await GL.create({
        name: 'profile_mac',
        os: 'mac',
        navigator: {
            language: 'enUS',
            userAgent: 'random', // get random user agent for selected os
            resolution: '1024x768',
            platform: 'mac',
        },
        proxy : {
            mode: 'socks5',
            host: '104.144.233.12',
            port: 9047,
            username: 'rgxaxuix',
            password: 'm2a4ayrplpxd',
        } 
    });

    console.log('profile id=', profile_id);

    await GL.update({
        id: profile_id,
        name: 'profile_mac2',
    });

    const profile = await GL.getProfile(profile_id);

    console.log('new profile name=', profile.name);
    
    //await GL.delete(profile_id);
})();
