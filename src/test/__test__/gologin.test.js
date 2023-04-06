/* eslint-disable max-len */

import { accessSync } from 'fs';
import * as puppeteer from 'puppeteer-core';
import requests from 'requestretry';

import GoLogin from '../../gologin';

// set the default timeout for all tests
jest.setTimeout(25000);

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

  describe('#create', () => {
    test('should failed when creating a new profile', async () => {
      const gologin = new GoLogin({
        token: 'test_token',
      });

      // mock failed response from getRandomFingerprint
      const getRandomFingerprint = jest.spyOn(gologin, 'getRandomFingerprint');
      getRandomFingerprint.mockImplementation(() => {
        throw new Error('failed to get random fingerprint');
      });

      // expect that the create method will throw an error
      await expect(gologin.create()).rejects.toThrow('failed to get random fingerprint');
    });

    test('should failed when creating a new profile', async () => {
      const gologin = new GoLogin({
        token: 'test_token',
      });

      // mock failed response from requests.post
      const post = jest.spyOn(requests, 'post');
      // mock return value with status code 400
      post.mockImplementation(() => ({
        statusCode: 400,
        body: {
          message: 'failed to create profile',
        },
      }));

      // expect that the create method will throw an error
      await expect(gologin.create()).rejects.toThrow();
    });

    test('should create a new profile', async () => {
      const gologin = new GoLogin({
        token: 'test_token',
      });

      // mock successful response from getRandomFingerprint
      const getRandomFingerprint = jest.spyOn(gologin, 'getRandomFingerprint');
      getRandomFingerprint.mockImplementation(() => ({
        statusCode : 200,
        navigator  : {
          userAgent: 'test_user_agent',
        },
        fonts     : [
          {
            family: 'test_font_family',
          },
        ],
        webGlMetadata: {
          renderer: 'test_renderer',
        },
        webGLMetadata : {
          mode : 'noise',
        },
        webRTC      : {
          ip: 'test_ip',
        },
        deviceMemory: 2,
      }));

      // mock successful response from requests.post
      const post = jest.spyOn(requests, 'post');
      // mock return value with status code 200
      post.mockImplementation(() => ({
        statusCode: 200,
        body: {
          id: 'test_profile_id',
        },
      }));

      const result = await gologin.create();

      // expect that the result is a valid profile id
      expect(result).toEqual('test_profile_id');
    });
  });

  describe('#getLocal', () => {
    test('should failed when getting a profile', async () => {
      const gologin = new GoLogin({
        token: 'test_token',
        // specify an invalid profile id that will not be found in local
        profile_id: '642c2da565cb315b8b51ebf____',
      });

      // expect that the get method will throw an error
      await expect(gologin.getProfile()).rejects.toThrow();
    });

    test('should get a profile', async () => {
      const gologin = new GoLogin({
        token: 'test_token',
        // specify a valid profile id that will be found in local
        profile_id: '642c2da565cb315b8b51ebfe',
      });

      const result = await gologin.getProfile(null, true);

      // expect that the result is a valid profile id
      expect(result.id).toEqual('642c2da565cb315b8b51ebfe');
    });
  });

  xdescribe('#update', () => {
    test('should change proxy for a profile', async () => {
      const gologin = new GoLogin({
        token: 'test_token',
        // specify a valid profile id that will be found in local
        profile_id: '642c2da565cb315b8b51ebfe',
      });

      const result = await gologin.update({
        proxy: {
          mode : 'http',
          host: 'test_host',
          port: 8080,
          username: 'test_username',
          password: 'test_password',
        } });
    });
  });
});
