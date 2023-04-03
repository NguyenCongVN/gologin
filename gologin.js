require("dotenv").config();
const debug = require("debug")("gologin");
const _ = require("lodash");
const requests = require("requestretry").defaults({ timeout: 10 * 60 * 1000 });
const fs = require("fs");
const os = require("os");
const util = require("util");
const rimraf = util.promisify(require("rimraf"));
const { access, unlink, writeFile, readFile } = require("fs").promises;
const exec = util.promisify(require("child_process").exec);
const { spawn, execFile } = require("child_process");
const ProxyAgent = require("simple-proxy-agent");
const decompress = require("decompress");
const decompressUnzip = require("decompress-unzip");
const path = require("path");
const zipdir = require("zip-dir");
const https = require("https");
const kill = require("kill-port");
const { renameSync } = require("fs");

const BrowserChecker = require("./browser-checker");
const { BrowserUserDataManager } = require("./browser-user-data-manager");
const CookiesManager = require("./cookies-manager");
const fontsCollection = require("./fonts");
const ExtensionsManager = require("./extensions-manager");
const { default: axios } = require("axios");
const { existsSync } = require("fs");

const SEPARATOR = path.sep;
const API_URL = "https://api.gologin.com";
const OS_PLATFORM = process.platform;

// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));

class GoLogin {
  constructor(options = {}) {
    this.is_remote = options.remote || false;
    this.access_token = options.token;
    this.profile_id = options.profile_id;
    this.password = options.password;
    this.extra_params = options.extra_params;
    this.executablePath = options.executablePath;
    this.vnc_port = options.vncPort;
    this.fontsMasking = false;
    this.is_active = false;
    this.is_stopping = false;
    this.differentOs = false;
    this.profileOs = "lin";
    this.tmpdir = os.tmpdir();
    this.autoUpdateBrowser = !!options.autoUpdateBrowser;
    this.browserChecker = new BrowserChecker(options.skipOrbitaHashChecking);
    this.uploadCookiesToServer = options.uploadCookiesToServer || false;
    this.writeCookesFromServer = options.writeCookesFromServer;
    this.remote_debugging_port = options.remote_debugging_port || 0;
    this.timezone = options.timezone;
    this.extensionPathsToInstall = [];

    if (options.tmpdir) {
      this.tmpdir = options.tmpdir;
      if (!existsSync(this.tmpdir)) {
        debug("making tmpdir", this.tmpdir);
        fs.mkdirSync(this.tmpdir, { recursive: true });
      }
    }

    this.cookiesFilePath = path.join(
      this.tmpdir,
      `gologin_profile_${this.profile_id}`,
      "Default",
      "Network",
      "Cookies"
    );
    this.profile_zip_path = path.join(
      this.tmpdir,
      `gologin_${this.profile_id}.zip`
    );
    debug("INIT GOLOGIN", this.profile_id);
  }

  async checkBrowser() {
    return this.browserChecker.checkBrowser(this.autoUpdateBrowser);
  }

  /**

  Sets the profile ID for the GoLogin instance.
  This method is used to change the profile ID associated with the instance.
  It updates the internal state of the instance to use the new profile ID for all subsequent requests.
  @param {string} profileId - The new profile ID to set.
  @memberof GoLogin
  @returns {*} Nothing is returned from this method.
  @throws {TypeError} If the profileId parameter is not a string.
  @throws {Error} If the instance is already active.
  */
  async setProfileId(profile_id) {
    this.profile_id = profile_id;
    this.cookiesFilePath = path.join(
      this.tmpdir,
      `gologin_profile_${this.profile_id}`,
      "Default",
      "Network",
      "Cookies"
    );
    this.profile_zip_path = path.join(
      this.tmpdir,
      `gologin_${this.profile_id}.zip`
    );
  }

  /**

  Retrieves a token for authorization from the GoLogin API server.
  @return {Promise<string>} A Promise that resolves with the authorization token or rejects with an error.
  @memberof GoLogin
*/
  async getToken(username, password) {
    let data = await requests.post(`${API_URL}/user/login`, {
      json: {
        username: username,
        password: password,
      },
    });

    if (!Reflect.has(data, "body.access_token")) {
      throw new Error(
        `gologin auth failed with status code, ${
          data.statusCode
        } DATA  ${JSON.stringify(data)}`
      );
    }
  }

  /**

  Retrieves a new fingerprint from GoLogin API using the provided access token.
  This method requires that the GoLogin instance has a valid access token set.
  The fingerprint is used to mask browser details to make it more difficult to detect that automation is being used.
  @param {string} [profileId=null] - The ID of the profile to create the fingerprint for. If null, the fingerprint will be created for the default profile.
  @returns {Promise<string>} - A Promise that resolves with the new fingerprint or rejects with an error.
  @throws {Error} - Throws an error if the GoLogin instance does not have a valid access token set.
  @memberof GoLogin
*/
  async getNewFingerPrint(os) {
    debug("GETTING FINGERPRINT");

    const fpResponse = await requests.get(
      `${API_URL}/browser/fingerprint?os=${os}`,
      {
        json: true,
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          "User-Agent": "gologin-api",
        },
      }
    );

    return fpResponse?.body || {};
  }

  /**

  Returns an array of all profiles associated with the GoLogin account.
  @returns {Array} An array of profile objects.
  @memberof GoLogin
  */
  async profiles() {
    const profilesResponse = await requests.get(`${API_URL}/browser/v2`, {
      headers: {
        Authorization: `Bearer ${this.access_token}`,
        "User-Agent": "gologin-api",
      },
    });

    if (profilesResponse.statusCode !== 200) {
      throw new Error(`Gologin /browser response error`);
    }

    return JSON.parse(profilesResponse.body);
  }

  /**

  Fetches a GoLogin profile by profile ID.
  @async
  @method
  @param {string} [profileId] - The ID of the GoLogin profile to fetch.
  @return {Promise<Object>} - An object containing the profile information.
  @throws {Error} - If the access token is invalid or the request fails.
  @memberof GoLogin
  */
  async getProfile(profile_id) {
    const id = profile_id || this.profile_id;
    debug("getProfile", this.access_token, id);
    const profileResponse = await requests.get(`${API_URL}/browser/${id}`, {
      headers: {
        Authorization: `Bearer ${this.access_token}`,
      },
    });
    debug("profileResponse", profileResponse.statusCode, profileResponse.body);

    if (profileResponse.statusCode === 404) {
      throw new Error(JSON.parse(profileResponse.body).message);
    }

    if (profileResponse.statusCode === 403) {
      throw new Error(JSON.parse(profileResponse.body).message);
    }

    if (profileResponse.statusCode !== 200) {
      throw new Error(
        `Gologin /browser/${id} response error ${profileResponse.statusCode} INVALID TOKEN OR PROFILE NOT FOUND`
      );
    }

    if (profileResponse.statusCode === 401) {
      throw new Error("invalid token");
    }

    return JSON.parse(profileResponse.body);
  }

  async emptyProfile() {
    return readFile(path.resolve(__dirname, "gologin_zeroprofile.b64")).then(
      (res) => res.toString()
    );
  }

  /**

  Retrieves the profile information from the AWS S3 bucket
  associated with the current profile ID and access token.
  @returns {Promise<object>} A Promise that resolves with the profile data.
  The profile data includes browser user agent, browser platform, browser language,
  browser resolution, browser timezone and timezone offset.
  If the Promise is rejected, an error is thrown.
  @throws {Error} If there is an error accessing the AWS S3 bucket.
  @memberof GoLogin
  */
  async getProfileS3(s3path) {
    if (!s3path) {
      throw new Error("s3path not found");
    }

    const token = this.access_token;
    debug(
      "getProfileS3 token=",
      token,
      "profile=",
      this.profile_id,
      "s3path=",
      s3path
    );

    const s3url = `https://gprofiles.gologin.com/${s3path}`.replace(
      /\s+/gm,
      "+"
    );
    debug("loading profile from public s3 bucket, url=", s3url);
    const profileResponse = await requests.get(s3url, {
      encoding: null,
    });

    if (profileResponse.statusCode !== 200) {
      debug(
        `Gologin S3 BUCKET ${s3url} response error ${profileResponse.statusCode}  - use empty`
      );
      return "";
    }

    return Buffer.from(profileResponse.body);
  }

  /**

Posts a file to the S3 bucket associated with the current profile.
@param {string} fileName - The name of the file to be uploaded.
@param {Buffer} fileBuff - A buffer containing the file data to be uploaded.
@throws {Error} If the uploaded file size does not match the size of the input buffer.
@memberof GoLogin
@returns {Promise<void>} Promise that resolves when the file has been successfully uploaded to the S3 bucket.
*/
  async postFile(fileName, fileBuff) {
    debug("POSTING FILE", fileBuff.length);
    debug("Getting signed URL for S3");
    const apiUrl = `${API_URL}/browser/${this.profile_id}/storage-signature`;

    const signedUrl = await requests.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${this.access_token}`,
        "user-agent": "gologin-api",
      },
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 10 * 1000,
      fullResponse: false,
    });

    const [uploadedProfileUrl] = signedUrl.split("?");

    console.log("Uploading profile by signed URL to S3");
    const bodyBufferBiteLength = Buffer.byteLength(fileBuff);
    console.log("BUFFER SIZE", bodyBufferBiteLength);

    await requests.put(signedUrl, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": bodyBufferBiteLength,
      },
      body: fileBuff,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 30 * 1000,
      fullResponse: false,
    });

    const uploadedProfileMetadata = await requests.head(uploadedProfileUrl, {
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 10 * 1000,
      fullResponse: true,
    });

    const uploadedFileLength =
      +uploadedProfileMetadata.headers["content-length"];
    if (uploadedFileLength !== bodyBufferBiteLength) {
      console.log(
        "Uploaded file is incorrect. Retry with China File size:",
        uploadedFileLength
      );
      throw new Error(
        "Uploaded file is incorrect. Retry with China File size: " +
          uploadedFileLength
      );
    }

    console.log("Profile has been uploaded to S3 successfully");
  }

  /**
   * Returns a buffer containing an empty profile folder in the form of a zip file.
   *
   * @return {Promise<Buffer>} A Promise that resolves with a buffer containing an empty profile folder.
   * @memberof GoLogin
   */
  async emptyProfileFolder() {
    debug("get emptyProfileFolder");
    const profile = await readFile(path.resolve(__dirname, "zero_profile.zip"));
    debug("emptyProfileFolder LENGTH ::", profile.length);
    return profile;
  }

  /**

Converts the preferences object by mapping its properties to their expected format.
@param {Object} preferences - The preferences object to convert.
@returns {Object} - The converted preferences object.
@memberof GoLogin
*/
  convertPreferences(preferences) {
    if (_.get(preferences, "navigator.userAgent")) {
      preferences.userAgent = _.get(preferences, "navigator.userAgent");
    }

    if (_.get(preferences, "navigator.doNotTrack")) {
      preferences.doNotTrack = _.get(preferences, "navigator.doNotTrack");
    }

    if (_.get(preferences, "navigator.hardwareConcurrency")) {
      preferences.hardwareConcurrency = _.get(
        preferences,
        "navigator.hardwareConcurrency"
      );
    }

    if (_.get(preferences, "navigator.language")) {
      preferences.language = _.get(preferences, "navigator.language");
    }
    if (_.get(preferences, "navigator.maxTouchPoints")) {
      preferences.navigator.max_touch_points = _.get(
        preferences,
        "navigator.maxTouchPoints"
      );
    }

    if (_.get(preferences, "isM1")) {
      preferences.is_m1 = _.get(preferences, "isM1");
    }

    if (_.get(preferences, "os") == "android") {
      const devicePixelRatio = _.get(preferences, "devicePixelRatio");
      const deviceScaleFactorCeil = Math.ceil(devicePixelRatio || 3.5);
      let deviceScaleFactor = devicePixelRatio;
      if (deviceScaleFactorCeil === devicePixelRatio) {
        deviceScaleFactor += 0.00000001;
      }

      preferences.mobile = {
        enable: true,
        width: parseInt(this.resolution.width, 10),
        height: parseInt(this.resolution.height, 10),
        device_scale_factor: deviceScaleFactor,
      };
    }

    preferences.mediaDevices = {
      enable: preferences.mediaDevices.enableMasking,
      videoInputs: preferences.mediaDevices.videoInputs,
      audioInputs: preferences.mediaDevices.audioInputs,
      audioOutputs: preferences.mediaDevices.audioOutputs,
    };

    return preferences;
  }

  /**

Creates a browser extension for the Orbita browser.
@returns {Promise<string>} Returns a promise that resolves to the path of the created extension.
@memberof GoLogin
*/
  async createBrowserExtension() {
    const that = this;
    debug("start createBrowserExtension");
    await rimraf(this.orbitaExtensionPath());
    const extPath = this.orbitaExtensionPath();
    debug("extension folder sanitized");
    const extension_source = path.resolve(__dirname, `gologin-browser-ext.zip`);
    await decompress(extension_source, extPath, {
      plugins: [decompressUnzip()],
      filter: (file) => !file.path.endsWith("/"),
    })
      .then(() => {
        debug("extraction done");
        debug("create uid.json");
        return writeFile(
          path.join(extPath, "uid.json"),
          JSON.stringify({ uid: that.profile_id }, null, 2)
        ).then(() => extPath);
      })
      .catch(async (e) => {
        debug("orbita extension error", e);
      });

    debug("createBrowserExtension done");
  }

  /**
   * Extracts the contents of a ZIP file to the specified path.
   *
   * @param {string} path - The path to extract the contents of the ZIP file to.
   * @param {string} zipfile - The path of the ZIP file to extract.
   * @returns {Promise} A Promise that resolves when the extraction is complete.
   * @memberof GoLogin
   */

  extractProfile(path, zipfile) {
    debug(`extactProfile ${zipfile}, ${path}`);
    return decompress(zipfile, path, {
      plugins: [decompressUnzip()],
      filter: (file) => !file.path.endsWith("/"),
    });
  }

  /**
   * Creates a new browser profile for the instance and sets it up according to the profile
   * information retrieved from the server. The profile includes information such as screen
   * resolution, browser language, user agent, timezone, and proxy settings. If a local profile
   * is available and `local` is set to `true`, the method will use the local profile instead of
   * retrieving it from the server. The method returns an object containing the path to the
   * newly created profile and the profile object itself.
   *
   * @async
   * @param {boolean} [local=false] - A flag indicating whether to use a local profile if available.
   * @returns {Promise<{ profilePath: string, profile: Object }>} An object containing the path to the newly created profile and the profile object itself.
   * @throws {Error} If no fonts list is provided for font masking.
   */

  async createStartup(local = false) {
    const profilePath = path.join(
      this.tmpdir,
      `gologin_profile_${this.profile_id}`
    );

    // file path to the profile metric saved in local storage
    const profileMetric = path.join(
      this.tmpdir,
      `gologin_profile_metric_${this.profile_id}`
    );
    let profile;
    let profile_folder;
    await rimraf(profilePath);
    debug("-", profilePath, "dropped");

    // NOTICE: if local is true, we will use the local profile
    // check if profile file is existing
    // if profile existing -> use it
    // if not -> get from server

    if (existsSync(profileMetric)) {
      debug("profileMetric exists");
      profile = await readFile(profileMetric);
      debug("profileMetric LENGTH ::", profile.length);
      profile = JSON.parse(profile)["profile"];
    } else {
      // Get profile here
      profile = await this.getProfile();
      // save profile if get success
      await writeFile(
        profileMetric,
        JSON.stringify({ profile: profile }, null, 2)
      );
    }

    const { navigator = {}, fonts, os: profileOs } = profile;
    this.fontsMasking = fonts?.enableMasking;
    this.profileOs = profileOs;
    this.differentOs =
      profileOs !== "android" &&
      ((OS_PLATFORM === "win32" && profileOs !== "win") ||
        (OS_PLATFORM === "darwin" && profileOs !== "mac") ||
        (OS_PLATFORM === "linux" && profileOs !== "lin"));

    const { resolution = "1920x1080", language = "en-US,en;q=0.9" } = navigator;
    this.language = language;
    const [screenWidth, screenHeight] = resolution.split("x");
    this.resolution = {
      width: parseInt(screenWidth, 10),
      height: parseInt(screenHeight, 10),
    };

    const profileZipExists = await access(this.profile_zip_path)
      .then(() => true)
      .catch(() => false);
    if (!(local && profileZipExists)) {
      try {
        profile_folder = await this.getProfileS3(_.get(profile, "s3Path", ""));
      } catch (e) {
        debug("Cannot get profile - using empty", e);
      }

      debug("FILE READY", this.profile_zip_path);
      if (!profile_folder.length) {
        profile_folder = await this.emptyProfileFolder();
      }

      await writeFile(this.profile_zip_path, profile_folder);

      debug("PROFILE LENGTH", profile_folder.length);
    } else {
      debug("PROFILE LOCAL HAVING", this.profile_zip_path);
    }

    debug("Cleaning up..", profilePath);

    try {
      await this.extractProfile(profilePath, this.profile_zip_path);
      debug("extraction done");
    } catch (e) {
      console.trace(e);
      profile_folder = await this.emptyProfileFolder();
      await writeFile(this.profile_zip_path, profile_folder);
      await this.extractProfile(profilePath, this.profile_zip_path);
    }

    const singletonLockPath = path.join(profilePath, "SingletonLock");
    const singletonLockExists = await access(singletonLockPath)
      .then(() => true)
      .catch(() => false);
    if (singletonLockExists) {
      debug("removing SingletonLock");
      await unlink(singletonLockPath);
      debug("SingletonLock removed");
    }

    const pref_file_name = path.join(profilePath, "Default", "Preferences");
    debug("reading", pref_file_name);

    const prefFileExists = await access(pref_file_name)
      .then(() => true)
      .catch(() => false);
    if (!prefFileExists) {
      debug(
        "Preferences file not exists waiting",
        pref_file_name,
        ". Using empty profile"
      );
      profile_folder = await this.emptyProfileFolder();
      await writeFile(this.profile_zip_path, profile_folder);
      await this.extractProfile(profilePath, this.profile_zip_path);
    }

    const preferences_raw = await readFile(pref_file_name);
    let preferences = JSON.parse(preferences_raw.toString());
    let proxy = _.get(profile, "proxy");
    let name = _.get(profile, "name");
    const chromeExtensions = _.get(profile, "chromeExtensions");

    if (chromeExtensions && chromeExtensions.length) {
      const ExtensionsManagerInst = new ExtensionsManager();
      ExtensionsManagerInst.apiUrl = API_URL;
      await ExtensionsManagerInst.init()
        .then(() => ExtensionsManagerInst.updateExtensions())
        .catch(() => {});
      ExtensionsManagerInst.accessToken = this.access_token;

      await ExtensionsManagerInst.getExtensionsPolicies();
      let profileExtensionsCheckRes = [];

      if (ExtensionsManagerInst.useLocalExtStorage) {
        profileExtensionsCheckRes =
          await ExtensionsManagerInst.checkChromeExtensions(
            chromeExtensions
          ).catch((e) => {
            console.log("checkChromeExtensions error: ", e);
            return [];
          });
      }

      let extSettings;
      if (ExtensionsManagerInst.useLocalExtStorage) {
        extSettings = BrowserUserDataManager.setExtPathsAndRemoveDeleted(
          preferences,
          profileExtensionsCheckRes
        );
      } else {
        const originalExtensionsFolder = path.join(
          profilePath,
          "Default",
          "Extensions"
        );
        extSettings = await BrowserUserDataManager.setOriginalExtPaths(
          preferences,
          originalExtensionsFolder
        );
      }

      this.extensionPathsToInstall =
        ExtensionsManagerInst.getExtensionsToInstall(
          extSettings,
          profileExtensionsCheckRes
        );

      if (extSettings) {
        const currentExtSettings = preferences.extensions || {};
        currentExtSettings.settings = extSettings;
        preferences.extensions = currentExtSettings;
      }
    }

    if (proxy.mode === "gologin" || proxy.mode === "tor") {
      const autoProxyServer = _.get(profile, "autoProxyServer");
      const splittedAutoProxyServer = autoProxyServer.split("://");
      const splittedProxyAddress = splittedAutoProxyServer[1].split(":");
      const port = splittedProxyAddress[1];

      proxy = {
        mode: splittedAutoProxyServer[0],
        host: splittedProxyAddress[0],
        port,
        username: _.get(profile, "autoProxyUsername"),
        password: _.get(profile, "autoProxyPassword"),
      };

      profile.proxy.username = _.get(profile, "autoProxyUsername");
      profile.proxy.password = _.get(profile, "autoProxyPassword");
    }
    // console.log('proxy=', proxy);

    if (proxy.mode === "geolocation") {
      proxy.mode = "http";
    }

    if (proxy.mode === "none") {
      proxy = null;
    }
    this.proxy = proxy;

    await this.getTimeZone(proxy).catch((e) => {
      console.error("Proxy Error. Check it and try again.");
      throw e;
    });

    const [latitude, longitude] = this._tz.ll;
    const accuracy = this._tz.accuracy;

    const profileGeolocation = profile.geolocation;
    const tzGeoLocation = {
      latitude,
      longitude,
      accuracy,
    };
    profile.geoLocation = this.getGeolocationParams(
      profileGeolocation,
      tzGeoLocation
    );
    profile.name = name;

    profile.webRtc = {
      mode:
        _.get(profile, "webRTC.mode") === "alerted"
          ? "public"
          : _.get(profile, "webRTC.mode"),
      publicIP: _.get(profile, "webRTC.fillBasedOnIp")
        ? this._tz.ip
        : _.get(profile, "webRTC.publicIp"),
      localIps: _.get(profile, "webRTC.localIps", []),
    };

    debug("profile.webRtc=", profile.webRtc);
    debug("profile.timezone=", profile.timezone);
    debug("profile.mediaDevices=", profile.mediaDevices);

    const audioContext = profile.audioContext || {};
    const { mode: audioCtxMode = "off", noise: audioCtxNoise } = audioContext;
    if (profile.timezone.fillBasedOnIp == false) {
      profile.timezone = { id: profile.timezone.timezone };
    } else {
      profile.timezone = { id: this._tz.timezone };
    }
    profile.webgl_noise_value = profile.webGL.noise;
    profile.get_client_rects_noise = profile.webGL.getClientRectsNoise;
    profile.canvasMode = profile.canvas.mode;
    profile.canvasNoise = profile.canvas.noise;
    profile.audioContext = {
      enable: audioCtxMode !== "off",
      noiseValue: audioCtxNoise,
    };
    profile.webgl = {
      metadata: {
        vendor: _.get(profile, "webGLMetadata.vendor"),
        renderer: _.get(profile, "webGLMetadata.renderer"),
        mode: _.get(profile, "webGLMetadata.mode") === "mask",
      },
    };

    profile.custom_fonts = {
      enable: !!fonts?.enableMasking,
    };

    const gologin = this.convertPreferences(profile);

    debug(
      `Writing profile for screenWidth ${profilePath}`,
      JSON.stringify(gologin)
    );
    gologin.screenWidth = this.resolution.width;
    gologin.screenHeight = this.resolution.height;
    debug("writeCookesFromServer", this.writeCookesFromServer);
    if (this.writeCookesFromServer) {
      await this.writeCookiesToFile();
    }

    if (this.fontsMasking) {
      const families = fonts?.families || [];
      if (!families.length) {
        throw new Error("No fonts list provided");
      }

      try {
        await BrowserUserDataManager.composeFonts(
          families,
          profilePath,
          this.differentOs
        );
      } catch (e) {
        console.trace(e);
      }
    }

    const [languages] = this.language.split(";");

    if (preferences.gologin == null) {
      preferences.gologin = {};
    }

    preferences.gologin.langHeader = gologin.language;
    preferences.gologin.languages = languages;
    // debug("convertedPreferences=", preferences.gologin)
    await writeFile(
      path.join(profilePath, "Default", "Preferences"),
      JSON.stringify(
        _.merge(preferences, {
          gologin,
        })
      )
    );

    // console.log('gologin=', _.merge(preferences, {
    //   gologin
    // }));

    debug(
      "Profile ready. Path: ",
      profilePath,
      "PROXY",
      JSON.stringify(_.get(preferences, "gologin.proxy"))
    );
    return { profilePath, profile };
  }

  async commitProfile() {
    const dataBuff = await this.getProfileDataToUpdate();

    debug("begin updating", dataBuff.length);
    if (!dataBuff.length) {
      debug("WARN: profile zip data empty - SKIPPING PROFILE COMMIT");

      return;
    }

    try {
      debug("Patching profile");
      await this.postFile("profile", dataBuff);
    } catch (e) {
      debug("CANNOT COMMIT PROFILE", e);
    }

    debug("COMMIT COMPLETED");
  }

  profilePath() {
    return path.join(this.tmpdir, `gologin_profile_${this.profile_id}`);
  }

  orbitaExtensionPath() {
    return path.join(this.tmpdir, `orbita_extension_${this.profile_id}`);
  }

  getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async checkPortAvailable(port) {
    debug("CHECKING PORT AVAILABLE", port);

    try {
      const { stdout, stderr } = await exec(`netstat -ano | find ":${port}"`);
      if (stdout) {
        debug(`PORT ${port} IS BUSY`);
        return false;
      }
    } catch (e) {}
    debug(`PORT ${port} IS OPEN`);

    return true;
  }

  async getRandomPort() {
    let port = this.getRandomInt(20000, 40000);
    let port_available = this.checkPortAvailable(port);
    while (!port_available) {
      port = this.getRandomInt(20000, 40000);
      port_available = await this.checkPortAvailable(port);
    }
    return port;
  }

  async getTimeZone(proxy) {
    debug("getting timeZone proxy=", proxy);
    if (this.timezone) {
      debug("getTimeZone from options", this.timezone);
      this._tz = this.timezone;
      return this._tz.timezone;
    }

    let data = null;
    if (proxy !== null && proxy.mode !== "none") {
      if (proxy.mode.includes("socks")) {
        for (let i = 0; i < 5; i++) {
          try {
            debug("getting timeZone socks try", i + 1);
            return this.getTimezoneWithSocks(proxy);
          } catch (e) {
            console.log(e.message);
          }
        }
        throw new Error(`Socks proxy connection timed out`);
      }

      const proxyUrl = `${proxy.mode}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
      debug("getTimeZone start https://time.gologin.com/timezone", proxyUrl);
      data = await requests.get("https://time.gologin.com/timezone", {
        proxy: proxyUrl,
        timeout: 20 * 1000,
        maxAttempts: 5,
      });
    } else {
      data = await requests.get("https://time.gologin.com/timezone", {
        timeout: 20 * 1000,
        maxAttempts: 5,
      });
    }
    debug("getTimeZone finish", data.body);
    this._tz = JSON.parse(data.body);
    return this._tz.timezone;
  }

  async getTimezoneWithSocks(params) {
    const { mode = "http", host, port, username = "", password = "" } = params;
    let body;

    let proxy = mode + "://";
    if (username) {
      const resultPassword = password ? ":" + password + "@" : "@";
      proxy += username + resultPassword;
    }
    proxy += host + ":" + port;

    const agent = new ProxyAgent(proxy, { tunnel: true, timeout: 10000 });

    const checkData = await new Promise((resolve, reject) => {
      https
        .get("https://time.gologin.com/timezone", { agent }, (res) => {
          let resultResponse = "";
          res.on("data", (data) => (resultResponse += data));

          res.on("end", () => {
            let parsedData;
            try {
              parsedData = JSON.parse(resultResponse);
            } catch (e) {
              reject(e);
            }

            resolve({
              ...res,
              body: parsedData,
            });
          });
        })
        .on("error", (err) => reject(err));
    });

    // console.log('checkData:', checkData);
    body = checkData.body || {};
    if (!body.ip && checkData.statusCode.toString().startsWith("4")) {
      throw checkData;
    }
    debug("getTimeZone finish", body.body);
    this._tz = body;
    return this._tz.timezone;
  }

  /**

Generate arguments to spawn a new browser process with the specified profile and proxy configuration.
@returns {Promise<Array<string>>} An array of command line arguments to pass to puppeteer.launch().
@throws {Error} Throws an error if there is an issue getting the time zone or the proxy is invalid.
*/
  async spawnArguments() {
    const profile_path = this.profilePath();

    let proxy = this.proxy;
    proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;

    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });
    const tz = await this.getTimeZone(this.proxy).catch((e) => {
      console.error("Proxy Error. Check it and try again.");
      throw e;
    });
    env["TZ"] = tz;

    let params = [
      `--proxy-server=${proxy}`,
      `--user-data-dir=${profile_path}`,
      `--password-store=basic`,
      `--tz=${tz}`,
      `--lang=en`,
    ];
    if (Array.isArray(this.extra_params) && this.extra_params.length) {
      params = params.concat(this.extra_params);
    }

    if (this.remote_debugging_port) {
      params.push(`--remote-debugging-port=${remote_debugging_port}`);
    }

    return params;
  }

  /**

Spawns a new browser instance with the given configuration and returns the WebSocket Debugger URL.
@async
@function spawnBrowser
@memberof PuppeteerManager
@returns {Promise<string>} The WebSocket Debugger URL.
@throws {Error} If there is an error getting the time zone.
*/
  async spawnBrowser() {
    let remote_debugging_port = this.remote_debugging_port;
    if (!remote_debugging_port) {
      remote_debugging_port = await this.getRandomPort();
    }

    const profile_path = this.profilePath();

    let proxy = this.proxy;
    let proxy_host = "";
    if (proxy) {
      proxy_host = this.proxy.host;
      proxy = `${proxy.mode}://${proxy.host}:${proxy.port}`;
    }

    this.port = remote_debugging_port;

    const ORBITA_BROWSER =
      this.executablePath || this.browserChecker.getOrbitaPath;
    debug(`ORBITA_BROWSER=${ORBITA_BROWSER}`);
    const env = {};
    Object.keys(process.env).forEach((key) => {
      env[key] = process.env[key];
    });
    const tz = await this.getTimeZone(this.proxy).catch((e) => {
      console.error("Proxy Error. Check it and try again.");
      throw e;
    });
    env["TZ"] = tz;

    if (this.vnc_port) {
      const script_path = path.resolve(__dirname, "./run.sh");
      debug(
        "RUNNING",
        script_path,
        ORBITA_BROWSER,
        remote_debugging_port,
        proxy,
        profile_path,
        this.vnc_port
      );
      execFile(
        script_path,
        [
          ORBITA_BROWSER,
          remote_debugging_port,
          proxy,
          profile_path,
          this.vnc_port,
          tz,
        ],
        { env }
      );
    } else {
      const [splittedLangs] = this.language.split(";");
      let [browserLang] = splittedLangs.split(",");
      if (process.platform === "darwin") {
        browserLang = "en-US";
      }

      let params = [
        `--remote-debugging-port=${remote_debugging_port}`,
        `--user-data-dir=${profile_path}`,
        `--password-store=basic`,
        `--tz=${tz}`,
        `--lang=${browserLang}`,
      ];

      if (this.extensionPathsToInstall.length) {
        if (Array.isArray(this.extra_params) && this.extra_params.length) {
          this.extra_params.forEach((param, index) => {
            if (!param.includes("--load-extension=")) {
              return;
            }

            const [_, extPathsString] = param.split("=");
            const extPathsArray = extPathsString.split(",");
            this.extensionPathsToInstall = [
              ...this.extensionPathsToInstall,
              ...extPathsArray,
            ];
            this.extra_params.splice(index, 1);
          });
        }
        params.push(
          `--load-extension=${this.extensionPathsToInstall.join(",")}`
        );
      }

      if (this.fontsMasking) {
        let arg = "--font-masking-mode=2";
        if (this.differentOs) {
          arg = "--font-masking-mode=3";
        }
        if (this.profileOs === "android") {
          arg = "--font-masking-mode=1";
        }

        params.push(arg);
      }

      if (proxy) {
        const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host}"`;
        params.push(`--proxy-server=${proxy}`);
        params.push(`--host-resolver-rules=${hr_rules}`);
      }

      if (Array.isArray(this.extra_params) && this.extra_params.length) {
        params = params.concat(this.extra_params);
      }

      const child = execFile(ORBITA_BROWSER, params, { env });
      // const child = spawn(ORBITA_BROWSER, params, { env, shell: true });
      child.stdout.on("data", (data) => debug(data.toString()));
      debug("SPAWN CMD", ORBITA_BROWSER, params.join(" "));
    }

    debug("GETTING WS URL FROM BROWSER");

    let data = await requests.get(
      `http://127.0.0.1:${remote_debugging_port}/json/version`,
      { json: true }
    );

    debug("WS IS", _.get(data, "body.webSocketDebuggerUrl", ""));
    this.is_active = true;

    return _.get(data, "body.webSocketDebuggerUrl", "");
  }

  async createStartupAndSpawnBrowser() {
    await this.createStartup();
    return this.spawnBrowser();
  }

  /**

Deletes the temporary files associated with the current profile.
@async
@function
@returns {Promise<void>} A Promise that resolves when the files have been successfully deleted or rejects with an error if there was an issue deleting the files.
*/
  async clearProfileFiles() {
    try {
      await rimraf(
        path.join(this.tmpdir, `gologin_profile_${this.profile_id}`)
      );
      await rimraf(
        path.join(this.tmpdir, `gologin_${this.profile_id}_upload.zip`)
      );
    } catch (e) {
      debug("ERROR WHILE CLEARING PROFILE FILES", e);
    }
  }
  
/**

Stops the running browser and commits the profile.
@async
@param {Object} options - Options for the operation.
@param {boolean} [options.posting=false] - Whether to commit the profile to the server or not.
@param {boolean} [options.postings=false] - Backward compatibility for previous version.
@param {boolean} [local=false] - Whether the profile is local or not. Default is false.
@returns {boolean} - Returns false if the operation is successful.
*/
  async stopAndCommit(options, local = false) {
    try {
      if (this.is_stopping) {
        return true;
      }
      const is_posting =
        options.posting ||
        options.postings || // backward compability
        false;

      if (this.uploadCookiesToServer) {
        await this.uploadProfileCookiesToServer();
      }

      this.is_stopping = true;
      await this.sanitizeProfile();

      // NOTICE: if using local profile, need to create new zip file
      if (is_posting) {
        await this.commitProfile();
      } else {
        await this.getNewZipProfile();
      }

      this.is_stopping = false;
      this.is_active = false;
      await delay(3000);
      await this.clearProfileFiles();

      if (!local) {
        await rimraf(path.join(this.tmpdir, `gologin_${this.profile_id}.zip`));
      }
      debug(`PROFILE ${this.profile_id} STOPPED AND CLEAR`);
      return false;
    } catch (e) {
      debug(`ERROR WHILE STOPPING PROFILE ${e}`);
    }
  }

  async stopBrowser() {
    if (!this.port) {
      throw new Error("Empty GoLogin port");
    }
    kill(this.port, "tcp")
      .then(debug("browser killed"))
      .catch((e) => debug(`browser killed failed ${e}`));
  }

  async sanitizeProfile() {
    const remove_dirs = [
      `${SEPARATOR}Default${SEPARATOR}Cache`,
      `${SEPARATOR}Default${SEPARATOR}Service Worker${SEPARATOR}CacheStorage`,
      `${SEPARATOR}Default${SEPARATOR}Code Cache`,
      `${SEPARATOR}Default${SEPARATOR}GPUCache`,
      `${SEPARATOR}GrShaderCache`,
      `${SEPARATOR}ShaderCache`,
      `${SEPARATOR}biahpgbdmdkfgndcmfiipgcebobojjkp`,
      `${SEPARATOR}afalakplffnnnlkncjhbmahjfjhmlkal`,
      `${SEPARATOR}cffkpbalmllkdoenhmdmpbkajipdjfam`,
      `${SEPARATOR}Dictionaries`,
      `${SEPARATOR}enkheaiicpeffbfgjiklngbpkilnbkoi`,
      `${SEPARATOR}oofiananboodjbbmdelgdommihjbkfag`,
      `${SEPARATOR}SafetyTips`,
      `${SEPARATOR}fonts`,
    ];
    const that = this;

    await Promise.all(
      remove_dirs.map((d) => {
        const path_to_remove = `${that.profilePath()}${d}`;
        return new Promise((resolve) => {
          debug("DROPPING", path_to_remove);
          rimraf(path_to_remove, { maxBusyTries: 100 }, (e) => {
            // debug('DROPPING RESULT', e);
            resolve();
          });
        });
      })
    );
  }

  async getNewZipProfile() {
    const zipPath = this.profile_zip_path;
    const zipToCreate = `${this.profile_zip_path}_new`;

    await this.sanitizeProfile();
    debug("profile sanitized");

    const profilePath = this.profilePath();
    let fileBuff = undefined;
    try {
      fileBuff = await new Promise((resolve, reject) =>
        zipdir(
          profilePath,
          {
            saveTo: zipToCreate,
            filter: (path) => !/RunningChromeVersion/.test(path),
          },
          (err, buffer) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(buffer);
          }
        )
      );
    } catch (e) {
      debug(`ERROR WHILE CREATING ZIP ${e}`);
    }

    if (fileBuff) {
      // delete zipPath if exists
      await access(zipPath)
        .then(() => unlink(zipPath))
        .catch((e) => {
          debug(`ERROR WHILE DELETING ZIP ${e}`);
        });
      renameSync(zipToCreate, zipPath);
      debug("profile zip created");
    } else {
      debug("profile zip not created");
      // delete zipToCreate if exists
      await access(zipToCreate)
        .then(() => unlink(zipToCreate))
        .catch(() => {});
      throw new Error("profile zip not created");
    }
    debug("PROFILE ZIP CREATED", profilePath, zipPath);
  }

  async getProfileDataToUpdate() {
    const zipPath = path.join(
      this.tmpdir,
      `gologin_${this.profile_id}_upload.zip`
    );
    const zipExists = await access(zipPath)
      .then(() => true)
      .catch(() => false);
    if (zipExists) {
      await unlink(zipPath);
    }

    await this.sanitizeProfile();
    debug("profile sanitized");

    const profilePath = this.profilePath();
    const fileBuff = await new Promise((resolve, reject) =>
      zipdir(
        profilePath,
        {
          saveTo: zipPath,
          filter: (path) => !/RunningChromeVersion/.test(path),
        },
        (err, buffer) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(buffer);
        }
      )
    );

    debug("PROFILE ZIP CREATED", profilePath, zipPath);
    return fileBuff;
  }

  async profileExists() {
    const profileResponse = await requests.post(`${API_URL}/browser`, {
      headers: {
        Authorization: `Bearer ${this.access_token}`,
      },
      json: {},
    });

    if (profileResponse.statusCode !== 200) {
      return false;
    }
    debug("profile is", profileResponse.body);
    return true;
  }

  async getRandomFingerprint(options) {
    let os = "lin";

    if (options.os) {
      os = options.os;
    }

    let fingerprint = await requests.get(
      `${API_URL}/browser/fingerprint?os=${os}`,
      {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          "User-Agent": "gologin-api",
        },
      }
    );

    return JSON.parse(fingerprint.body);
  }

  /**

Create a new browser profile with the provided options.
@async
@param {Object} options - An object containing options for the browser profile.
@param {string} [options.maxResolution] - The maximum resolution for the browser profile in the format "widthxheight".
@param {number} [options.maxTryTime] - The maximum amount of time to try to generate a random fingerprint in seconds.
@param {Object} [options.navigator] - The navigator object to use for the browser profile.
@param {Object} [options.storage] - The storage object to use for the browser profile.
@param {boolean} [options.sound] - Whether to include sound in the browser profile.
@param {boolean} [options.notifications] - Whether to include notifications in the browser profile.
@param {boolean} [options.bluetooth] - Whether to include bluetooth in the browser profile.
@param {boolean} [options.languages] - Whether to include additional languages in the browser profile.
@param {string} [options.language] - The default language for the browser profile.
@param {string} [options.timezone] - The timezone to use for the browser profile.
@param {Object} [options.proxy] - The proxy to use for the browser profile.
@param {string} [options.proxy.mode] - The proxy mode to use, either "http" or "socks5".
@param {string} [options.proxy.host] - The proxy host to use.
@param {number} [options.proxy.port] - The proxy port to use.
@param {Object} [options.webRTC] - The WebRTC configuration to use for the browser profile.
@param {boolean} [options.webRTC.mode] - The WebRTC mode to use, either "mask", "alerted" or "off".
@returns {string} The ID of the newly created browser profile.
@throws {Error} Will throw an error if no valid random fingerprint is generated or if the access token is invalid.
*/
  async create(options) {
    debug("createProfile", options);

    let fingerprint = undefined;
    if (options.maxResolution) {
      const [maxWidth, maxHeight] = options.maxResolution.split("x");
      if (options.maxTryTime) {
        for (let i = 0; i < options.maxTryTime; i++) {
          fingerprint = await this.getRandomFingerprint(options);
          const [width, height] = fingerprint.navigator.resolution.split("x");
          if (width <= maxWidth && height <= maxHeight) {
            break;
          }
          await delay(1000);
        }
      } else {
        while (true) {
          fingerprint = await this.getRandomFingerprint(options);
          const [width, height] = fingerprint.navigator.resolution.split("x");
          if (width <= maxWidth && height <= maxHeight) {
            break;
          }
          await delay(1000);
        }
      }
    } else {
      fingerprint = await this.getRandomFingerprint(options);
    }

    debug("fingerprint=", fingerprint);

    if (fingerprint.statusCode === 500) {
      throw new Error("no valid random fingerprint check os param");
    }

    if (fingerprint.statusCode === 401) {
      throw new Error("invalid token");
    }

    const { navigator, fonts, webGLMetadata, webRTC } = fingerprint;
    let deviceMemory = navigator.deviceMemory || 2;
    if (deviceMemory < 1) {
      deviceMemory = 1;
    }
    // navigator.deviceMemory = deviceMemory*1024; //fix failed api
    navigator.deviceMemory = deviceMemory;
    webGLMetadata.mode = webGLMetadata.mode === "noise" ? "mask" : "off";

    const json = {
      ...fingerprint,
      navigator,
      webGLMetadata,
      browserType: "chrome",
      name: "default_name",
      notes: "auto generated",
      fonts: {
        families: fonts,
      },
      webRTC: {
        ...webRTC,
        mode: "alerted",
      },
    };
    let user_agent = options.navigator?.userAgent;
    let orig_user_agent = json.navigator.userAgent;
    Object.keys(options).map((e) => {
      if (e === "navigator") {
        json["navigator"] = { ...json["navigator"], ...options["navigator"] };
      } else if (e === "storage") {
        json["storage"] = { ...json["storage"], ...options["storage"] };
      } else {
        json[e] = options[e];
      }
    });
    if (user_agent === "random") {
      json.navigator.userAgent = orig_user_agent;
    }
    // console.log('profileOptions', json);

    const response = await requests.post(`${API_URL}/browser`, {
      headers: {
        Authorization: `Bearer ${this.access_token}`,
        "User-Agent": "gologin-api",
      },
      json,
    });

    if (response.body.statusCode === 400) {
      throw new Error(
        `gologin failed account creation with status code, ${
          response.statusCode
        } DATA  ${JSON.stringify(response.body.message)}`
      );
    }

    if (response.body.statusCode === 500) {
      throw new Error(
        `gologin failed account creation with status code, ${response.statusCode}`
      );
    }
    debug(JSON.stringify(response.body));
    return response.body.id;
  }

  /**

Deletes a browser profile from GoLogin API
@async
@function delete
@param {string} [pid=this.profile_id] - The profile ID to be deleted
@throws {Error} Throws an error if the API request fails or returns an error status code
@returns {void}
*/
  async delete(pid) {
    const profile_id = pid || this.profile_id;
    await requests.delete(`${API_URL}/browser/${profile_id}`, {
      headers: {
        Authorization: `Bearer ${this.access_token}`,
        "User-Agent": "gologin-api",
      },
    });
  }

  /**

Updates the profile with the given options.
@async
@function
@param {object} options - The options to update the profile with.
@param {string} options.id - The ID of the profile to update.
@param {object} options.navigator - The updated navigator settings for the profile.
@param {string} options.maxResolution - The updated maximum screen resolution for the profile.
@param {number} options.maxTryTime - The updated maximum time to try to generate a fingerprint within the maximum resolution.
@param {object} options.proxy - The updated proxy settings for the profile.
@param {string} options.language - The updated language settings for the profile.
@param {boolean} options.fontsMasking - Whether or not to enable font masking for the profile.
@param {boolean} options.differentOs - Whether or not to simulate a different operating system for the profile.
@param {array} options.extra_params - Any extra parameters to pass to the browser instance.
@returns {Promise<object>} A Promise that resolves to the updated profile.
*/
  async update(options) {
    this.profile_id = options.id;
    const profile = await this.getProfile();

    if (options.navigator) {
      Object.keys(options.navigator).map((e) => {
        profile.navigator[e] = options.navigator[e];
      });
    }

    Object.keys(options)
      .filter((e) => e !== "navigator")
      .map((e) => {
        profile[e] = options[e];
      });

    debug("update profile", profile);
    const response = await requests.put(
      `https://api.gologin.com/browser/${options.id}`,
      {
        json: profile,
        headers: {
          Authorization: `Bearer ${this.access_token}`,
        },
      }
    );
    debug("response", JSON.stringify(response.body));
    return response.body;
  }

  setActive(is_active) {
    this.is_active = is_active;
  }

  getGeolocationParams(profileGeolocationParams, tzGeolocationParams) {
    if (profileGeolocationParams.fillBasedOnIp) {
      return {
        mode: profileGeolocationParams.mode,
        latitude: Number(tzGeolocationParams.latitude),
        longitude: Number(tzGeolocationParams.longitude),
        accuracy: Number(tzGeolocationParams.accuracy),
      };
    }
    return {
      mode: profileGeolocationParams.mode,
      latitude: profileGeolocationParams.latitude,
      longitude: profileGeolocationParams.longitude,
      accuracy: profileGeolocationParams.accuracy,
    };
  }

  getViewPort() {
    return { ...this.resolution };
  }

  async postCookies(profileId, cookies) {
    const formattedCookies = cookies.map((cookie) => {
      if (
        !["no_restriction", "lax", "strict", "unspecified"].includes(
          cookie.sameSite
        )
      ) {
        cookie.sameSite = "unspecified";
      }

      return cookie;
    });

    const response = await BrowserUserDataManager.uploadCookies({
      profileId,
      cookies: formattedCookies,
      API_BASE_URL: API_URL,
      ACCESS_TOKEN: this.access_token,
    });

    if (response.statusCode === 200) {
      return response.body;
    }

    return {
      status: "failure",
      status_code: response.statusCode,
      body: response.body,
    };
  }

  async getCookies(profileId) {
    const response = await BrowserUserDataManager.downloadCookies({
      profileId,
      API_BASE_URL: API_URL,
      ACCESS_TOKEN: this.access_token,
    });

    return response.body;
  }

  /**

Writes cookies to a file and sends a request to the server to store them.
@async
@function writeCookiesToFile
@memberof CookiesManager
@throws {Error} If there are no cookies.
@returns {void}
*/
  async writeCookiesToFile() {
    const cookies = await this.getCookies(this.profile_id);
    if (!cookies.length) {
      return;
    }

    const resultCookies = cookies.map((el) => ({
      ...el,
      value: Buffer.from(el.value),
    }));
    const chunckInsertValues =
      CookiesManager.getChunckedInsertValues(resultCookies);
    await axios.post(`${process.env.SERVER_URL}/browser`, {
      cookiesFilePath: this.cookiesFilePath,
      chunkedInsertValues: chunckInsertValues,
    });
  }

  async uploadProfileCookiesToServer() {
    const cookies = await CookiesManager.loadCookiesFromFile(
      this.cookiesFilePath
    );
    if (!cookies.length) {
      return;
    }

    return this.postCookies(this.profile_id, cookies);
  }

  /**

Starts the browser session either locally or remotely.
@returns {Promise<{status: string, wsUrl: string, profile: {id: string, timezone: string, navigator: Object, fonts: Object, webGLMetadata: Object, webRTC: Object, storage: Object, name: string, notes: string, lastStarted: string, language: string, proxy: Object, fingerprint: Object}}>} Returns a promise that resolves with an object containing status, websocket URL, and profile information on success.
@throws {Error} Throws an error if the Orbita browser executable is not found on the specified path.
@async
*/
  async start() {
    if (this.is_remote) {
      return this.startRemote();
    }

    if (!this.executablePath) {
      await this.checkBrowser();
    }

    const ORBITA_BROWSER =
      this.executablePath || this.browserChecker.getOrbitaPath;

    const orbitaBrowserExists = await access(ORBITA_BROWSER)
      .then(() => true)
      .catch(() => false);
    if (!orbitaBrowserExists) {
      throw new Error(
        `Orbita browser is not exists on path ${ORBITA_BROWSER}, check executablePath param`
      );
    }

    const { profile } = await this.createStartup();
    // await this.createBrowserExtension();
    const wsUrl = await this.spawnBrowser();
    this.setActive(true);
    return { status: "success", wsUrl, profile };
  }

  /**

Starts a local instance of the Orbita browser.
@async
@function startLocal
@memberof Orbita
@throws {Error} If the Orbita browser executable is not found.
@returns {Promise<Object>} A promise that resolves to an object containing the status, WebSocket URL, and profile of the started instance.
*/
  async startLocal() {
    await this.checkBrowser();
    const { profile } = await this.createStartup(true);
    // await this.createBrowserExtension();
    const wsUrl = await this.spawnBrowser();

    this.setActive(true);
    return { status: "success", wsUrl, profile };
  }

  /**

Stops the browser instance and commits any changes made to the profile.
If the instance is remote, calls the stopRemote function instead.
@async
@function stop
@returns {Promise<void>}
*/
  async stop() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.is_remote) {
      return this.stopRemote();
    }

    await this.stopAndCommit({ posting: true }, false);
  }

  /**

Stops the local browser and commits changes to the profile.
@async
@param {Object} [options] - The options object.
@param {boolean} [options.posting=false] - Flag indicating if the stop is due to a posting.
@returns {Promise<void>} - A promise that resolves when the browser is stopped and changes are committed.
*/
  async stopLocal(options) {
    const opts = options || { posting: false };
    await this.stopAndCommit(opts, true);
  }

  /**

Wait for the debugging URL of the browser to become available.
@param {number} delay_ms - The delay time in milliseconds before checking the URL.
@param {number} try_count - The number of attempts to check the URL.
@returns {string|Object} - The WebSocket URL of the browser or an object with error information.
@throws {Error} - If the proxy settings are incorrect.
*/

  async waitDebuggingUrl(delay_ms, try_count = 0) {
    await delay(delay_ms);
    const url = `https://${this.profile_id}.orbita.gologin.com/json/version`;
    console.log("try_count=", try_count, "url=", url);
    const response = await requests.get(url);
    let wsUrl = "";
    console.log("response", response.body);

    if (!response.body) {
      return wsUrl;
    }

    try {
      const parsedBody = JSON.parse(response.body);
      wsUrl = parsedBody.webSocketDebuggerUrl;
    } catch (e) {
      if (try_count < 3) {
        return this.waitDebuggingUrl(delay_ms, try_count + 1);
      }
      return {
        status: "failure",
        wsUrl,
        message: "Check proxy settings",
        profile_id: this.profile_id,
      };
    }

    wsUrl = wsUrl
      .replace("ws://", `wss://`)
      .replace("127.0.0.1", `${this.profile_id}.orbita.gologin.com`);
    return wsUrl;
  }

  /**

Starts a remote browser instance and returns a WebSocket URL.
If the profile is not remote, it throws an error.
@param {number} delay_ms - Delay in milliseconds before getting WebSocket URL.
@returns {Promise<{ status: string, wsUrl: string }>} An object containing the status and WebSocket URL.
@throws {Error} If profileResponse.statusCode is 401.
@throws {Error} If the profile is not remote.
*/
  async startRemote(delay_ms = 10000) {
    debug(`startRemote ${this.profile_id}`);

    /*
    if (profileResponse.statusCode !== 202) {
      return {'status': 'failure', 'code':  profileResponse.statusCode};
    }
    */

    // if (profileResponse.body === 'ok') {

    // Get profile if remote
    const profile = await this.getProfile();

    const profileResponse = await requests.post(
      `https://api.gologin.com/browser/${this.profile_id}/web`,
      {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
        },
      }
    );

    debug("profileResponse", profileResponse.statusCode, profileResponse.body);

    if (profileResponse.statusCode === 401) {
      throw new Error("invalid token");
    }

    const { navigator = {}, fonts, os: profileOs } = profile;
    this.fontsMasking = fonts?.enableMasking;
    this.profileOs = profileOs;
    this.differentOs =
      profileOs !== "android" &&
      ((OS_PLATFORM === "win32" && profileOs !== "win") ||
        (OS_PLATFORM === "darwin" && profileOs !== "mac") ||
        (OS_PLATFORM === "linux" && profileOs !== "lin"));

    const { resolution = "1920x1080", language = "en-US,en;q=0.9" } = navigator;
    this.language = language;
    const [screenWidth, screenHeight] = resolution.split("x");
    this.resolution = {
      width: parseInt(screenWidth, 10),
      height: parseInt(screenHeight, 10),
    };

    let wsUrl = await this.waitDebuggingUrl(delay_ms);
    if (wsUrl != "") {
      return { status: "success", wsUrl };
    }

    return { status: "failure", message: profileResponse.body };
  }

  /**

Stop the remote browser session for the current profile.
@async
@returns {Promise<Object>} The response object from the API.
@throws {Error} If the request to stop the remote session fails.
*/
  async stopRemote() {
    debug(`stopRemote ${this.profile_id}`);
    const profileResponse = await requests.delete(
      `https://api.gologin.com/browser/${this.profile_id}/web`,
      {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
        },
      }
    );
    console.log(`stopRemote ${profileResponse.body}`);
    if (profileResponse.body) {
      return JSON.parse(profileResponse.body);
    }
  }

  getAvailableFonts() {
    return fontsCollection
      .filter((elem) => elem.fileNames)
      .map((elem) => elem.name);
  }
}

module.exports = { GoLogin, debug };
