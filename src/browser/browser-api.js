/* eslint-disable max-len */
/**
 * These are three functions that update various properties of a browser profile via the GoLogin API.

updateProfileResolution updates the resolution of a browser window associated with a given profile.

updateProfileUserAgent updates the User-Agent header sent by the browser associated with a given profile.

updateProfileProxy updates the proxy settings of the browser associated with a given profile. It takes an object with the following properties:

mode: one of 'http', 'socks4', 'socks5', or 'none'.
host (optional): the hostname or IP address of the proxy server.
port (optional): the port number of the proxy server.
username (optional): the username to authenticate with the proxy server.
password (optional): the password to authenticate with the proxy server.
All of these functions make a PATCH request to the GoLogin API with the appropriate endpoint and parameters. They all use requestretry to automatically retry the request up to three times with a delay of 2 seconds between retries, and a timeout of 10 seconds. If the request fails after all retries, they return an object with an empty body property.
 */
import requestretry from 'requestretry';

import { API_URL } from '../utils/common.js';

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} resolution
*/
export const updateProfileResolution = (profileId, ACCESS_TOKEN, resolution) =>
  requestretry.patch(`${API_URL}/browser/${profileId}/resolution`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: { resolution },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {string} userAgent
*/
export const updateProfileUserAgent = (profileId, ACCESS_TOKEN, userAgent) =>
  requestretry.patch(`${API_URL}/browser/${profileId}/ua`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: { userAgent },
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });

/**
  * @param {string} profileId
  * @param {string} ACCESS_TOKEN
  * @param {Object} browserProxyData
  * @param {'http' | 'socks4' | 'socks5' | 'none'} browserProxyData.mode
  * @param {string} [browserProxyData.host]
  * @param {string} [browserProxyData.port]
  * @param {string} [browserProxyData.username]
  * @param {string} [browserProxyData.password]
*/
export const updateProfileProxy = (profileId, ACCESS_TOKEN, browserProxyData) =>
  requestretry.patch(`${API_URL}/browser/${profileId}/proxy`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'user-agent': 'gologin-api',
    },
    json: browserProxyData,
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 10 * 1000,
  }).catch((e) => {
    console.log(e);

    return { body: [] };
  });
