const puppeteer = require('puppeteer-core');
const {GoLogin} = require('../gologin');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () =>{
    const GL = new GoLogin({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmY2NjVlNjViZTdjY2UzMDU4OWIwZmMiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MmY2NjVmOTRlYjUwOTIxYjk1ZTllOTMifQ.sKtX2xgSCd_Waa-Ljju_Ox5d6bO542lyLdMOfnUQ7pE',
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
