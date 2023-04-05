/* eslint-disable max-len */
// This code imports the GoLogin class from ../src/gologin.js and creates an
// instance of it with an access token.
// Then, it uses the instance to create a new browser profile with specified
// options such as name, operating system, navigator settings, and proxy settings.
// After creating the profile, it updates the name of the profile and gets its
// current profile information.
// Finally, it comments out the line to delete the created profile.

import GoLogin from '../src/gologin.js';

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  const GL = new GoLogin({
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NDJhNDgwNDc0NWZkYzlhYTE3OGE0YjciLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2NDJhZDI5YTMzODcwMDRmNDNlOTUzYTcifQ.c9yK_stX3hfmqlktKw2bVEN1wp3Ry-i0OqpgB4IGt6M',
  });

  // next parameters are required for creating

  const profile_id = await GL.create({

  });

  console.log('profile id=', profile_id);

  const profile = await GL.getProfile(profile_id, false);

  console.log('new profile name=', profile.name);

  // await GL.delete(profile_id);
})();
