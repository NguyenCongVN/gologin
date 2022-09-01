const { GoLogin } = require("./gologin");

(async () => {
  console.log(
    (
      await new GoLogin({
        token:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzA4MjgxNWJmZTJmMzRiYzU3YTg1NGIiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MzA4MjgyNDBkODYwYjY5YmRkN2U5ZTYifQ.6tSC1Lw2wrJ7aTPitLzae-i_s_aWrSHHRVDz_ZFFku8",
      }).getProfile("6309c23759c613bc46629e29")
    ).navigator.resolution
  );
})();

// (async () => {
//     console.log(
//       await new GoLogin({
//         token:
//           "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzA4MjI3ZWYxZjI2ODY3NjIzNTBmZDMiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MzA4MjJjN2ZlMWZmNThmYmQzYzZiYjQifQ.EIU7qdcCj9fFxoDgqL5EfVofMSzVoBgDboRBkyLmZso",
//       }).getProfile("63083d273c6228580fbbaaa0")
//     );
//   })();

// failed
// 2560x1440
// 2560x1600

// good
// 1366x768
// 1536x864
// 1920x1200
// 1360x768
// 1920x1080
// 1680x1050
// 1536x864
