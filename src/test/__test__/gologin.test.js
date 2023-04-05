/* eslint-disable max-len */

import { accessSync } from 'fs';
import * as puppeteer from 'puppeteer-core';

import GoLogin from '../../gologin';
import { API_URL } from '../../utils/common';

const requests = require('requestretry');
// set the default timeout for all tests
jest.setTimeout(300000);

describe('GoLogin', () => {
  describe('#start', () => {

    let gologin = null;

    afterAll(async () => {
      expect(gologin).not.toBeNull();
      // stop local
      await gologin.stopLocal();

      // epxect that the profile is still in temp dir
      expect(() => {
        try {
          // check that path exists
          accessSync(gologin.profileArgumentLocalPath());
          accessSync(gologin.getZipProfilePath());
        } catch (err) {
          throw new Error(err);
        }
      }).not.toThrow();
    });

    test('should start a new browser instance', async () => {
      // specify the token
      const token = 'test_token';

      // specify the profile id
      const profileId = '642c2da565cb315b8b51ebfe';

      gologin = new GoLogin({
        token,
        profile_id : profileId,
      });

      const result = await gologin.startLocal();

      // check that result is a valid profile id
      expect(result).not.toBeUndefined();

      // check that the browser is running after 2 seconds
      expect(result.wsUrl).not.toBeUndefined();

      console.log('wsUrl=', result.wsUrl);

      console.log('connecting to the browser...');

      const browser = await puppeteer.connect({
        browserWSEndpoint: result.wsUrl,
        ignoreHTTPSErrors : true,
      });

      // check that the browser is connected
      expect(browser).not.toBeUndefined();

      console.log('browser is connected');

      // stop browser
      await gologin.stopBrowser();

      console.log('browser is closed');
    });
  });
});

