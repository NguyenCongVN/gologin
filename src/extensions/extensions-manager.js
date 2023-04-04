/* eslint-disable max-len */
/**
 * This is a Node.js module that manages extensions in Google Chrome. It provides methods for downloading and extracting extensions, checking for the existence of extensions, updating extensions, and inserting extensions into a database.

The class ExtensionsManager extends UserExtensionsManager, which is not shown in this code snippet.

The module uses the Node.js fs module to interact with the file system, request for making HTTP requests, and decompress for extracting zip files. It also uses some utility functions defined in another file, ../utils/common.js.

The class ExtensionsManager has the following properties:

#existedChromeExtensions: an array of existing Chrome extensions in the Chrome extensions folder.
#inited: a boolean indicating whether the init method has been called.
#useLocalExtStorage: a boolean indicating whether to use local extension storage.
#deleteProfileExtFolders: a boolean indicating whether to delete profile extension folders.
#useCookiesExt: a boolean indicating whether to use cookies for extensions.
The class ExtensionsManager has the following methods:

init(): initializes the ExtensionsManager by creating the Chrome extensions and user extensions folders if they don't exist, and deleting any zip files in those folders. Returns a Promise that resolves when initialization is complete.
checkChromeExtensions(profileExtensions): checks if the Chrome extensions specified in the profileExtensions array are installed, and downloads and extracts any missing extensions. Returns a Promise that resolves with an array of extension IDs to include as Orbita parameters.
downloadChromeExtensions(idsToDownload): downloads Chrome extensions with the specified IDs. Returns a Promise that resolves with an array of paths to the downloaded extension archives.
getExtensionsPolicies(): retrieves extension policies from the server and sets the corresponding properties in the ExtensionsManager instance.
updateExtensions(): updates any out-of-date extensions in the Chrome extensions folder by downloading and extracting the latest versions. Returns a Promise that resolves when all updates are complete.
checkLocalExtensions(): inserts any installed extensions into a database.
insertExtensionsToDb(extensionsIds, pathToExtensions): inserts the specified extensions into a database.
getExtensionsToInstall(extensionsFromPref, extensionsFromDB): returns an array of extensions that need to be installed based on the preferences and the database.
#getExtensionsToDownload(profileExtensions): returns an array of extension IDs that need to be downloaded based on the specified profile extensions and the extensions that already exist in the Chrome extensions and user extensions folders.
#existedChromeExtensionsList: returns an array of existing Chrome extensions in the Chrome extensions folder.
 */

import { createWriteStream, promises as _promises } from 'fs';
import { join, sep } from 'path';
import request from 'requestretry';

import { CHROME_EXTENSIONS_PATH, composeExtractionPromises, USER_EXTENSIONS_PATH } from '../utils/common.js';
import UserExtensionsManager from './user-extensions-manager.js';

const { mkdir, readdir, rmdir, unlink } = _promises;

const EXTENSION_URL =
  'https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D{ext_id}%26uc&prodversion=97.0.4692.71';

export class ExtensionsManager extends UserExtensionsManager {
  #existedChromeExtensions = [];
  #inited = false;
  #useLocalExtStorage = false;
  #useCookiesExt = false;
  #deleteProfileExtFolders = false;
  #extensionsUpdating = true;

  constructor() {
    super();
    if (!ExtensionsManager.instance) {
      ExtensionsManager.instance = this;
    }

    return ExtensionsManager.instance;
  }

  async init() {
    if (this.#inited) {
      return Promise.resolve();
    }

    const promises = [
      mkdir(CHROME_EXTENSIONS_PATH, { recursive: true })
        .then(() => readdir(CHROME_EXTENSIONS_PATH))
        .then(filesList => {
          this.#existedChromeExtensions = filesList.filter(extPath => !extPath.includes('.zip'));

          return filesList.map(fileName => fileName.includes('.zip') ?
            unlink(join(CHROME_EXTENSIONS_PATH, fileName)) :
            Promise.resolve());
        })
        .then(promisesToDelete => Promise.all(promisesToDelete))
        .catch((e) => console.log('ExtensionsManager init error:', e)),
      mkdir(USER_EXTENSIONS_PATH, { recursive: true })
        .then(() => readdir(USER_EXTENSIONS_PATH))
        .then(filesList => {
          this.existedUserExtensions = filesList.filter(extPath => !extPath.includes('.zip'));

          return filesList.map(fileName => fileName.includes('.zip') ?
            unlink(join(USER_EXTENSIONS_PATH, fileName)) :
            Promise.resolve());
        })
        .then((promisesToDelete) => Promise.all(promisesToDelete))
        .catch((e) => console.log('error creating user extensions folder:', e)),
    ];

    return Promise.all(promises).then(() => this.#inited = true);
  }

  get isInited() {
    return this.#inited;
  }
  get useLocalExtStorage() {
    return this.#useLocalExtStorage;
  }
  get deleteProfileExtFolders() {
    return this.#deleteProfileExtFolders;
  }
  get useCookiesExt() {
    return this.#useCookiesExt;
  }

  get existedChromeExtensionsList() {
    return this.#existedChromeExtensions;
  }

  async checkChromeExtensions(profileExtensions = []) {
    if (!(Array.isArray(profileExtensions) && profileExtensions.length)) {
      return [];
    }

    const extensionsToDownload = this.#getExtensionsToDownload(profileExtensions);

    const downloadedArchives = await this.downloadChromeExtensions(extensionsToDownload);
    const filteredArchives = downloadedArchives.filter(Boolean);

    if (filteredArchives.length) {
      const [downloadedFolders] = filteredArchives.map(archivePath => archivePath.split(sep).reverse());
      this.#existedChromeExtensions = [...this.#existedChromeExtensions, ...downloadedFolders];

      const promises = composeExtractionPromises(filteredArchives);

      await Promise.all(promises);
    }

    return this.getExtensionsStrToIncludeAsOrbitaParam(profileExtensions);
  }

  #getExtensionsToDownload(profileExtensions) {
    const existedExtensionsFolders = [...this.#existedChromeExtensions, ...this.existedUserExtensions];
    const existedOriginalIds = existedExtensionsFolders.map((val) => {
      const [originalId] = val.split('@');

      return originalId;
    });

    return profileExtensions.reduce((res, val) => {
      const [originalId] = val.split('@');
      const extensionExists = existedOriginalIds.includes(originalId);
      if (!extensionExists) {
        res.push(val);
      }

      return res;
    }, []);
  }

  async downloadChromeExtensions(idsToDownload = []) {
    if (!(Array.isArray(idsToDownload) && idsToDownload.length)) {
      return [];
    }

    const promises = idsToDownload.map(async (id) => {
      const [originalId] = id.split('@');
      const extUrl = EXTENSION_URL.replace('{ext_id}', originalId);

      const uploadedProfileMetadata = await getExtMetadata(extUrl);

      const reqPath = uploadedProfileMetadata.req.path;
      const extVer = getExtVersion(reqPath);

      const buffer = await new Promise((res) => {
        const chunks = [];
        request.get(extUrl, {
          maxAttempts: 3,
          retryDelay: 1000,
          timeout: 8 * 1000,
          fullResponse: false,
        })
          .on('data', (data) => chunks.push(data))
          .on('end', () => res(Buffer.concat(chunks)));
      });

      let zipExt;
      try {
        zipExt = crxToZip(buffer);
      } catch (e) {
        console.log(e);

        return '';
      }

      const archiveZipPath = join(CHROME_EXTENSIONS_PATH, originalId + '@' + extVer + '.zip');

      const archiveZip = createWriteStream(archiveZipPath);
      archiveZip.write(zipExt);
      archiveZip.close();

      return new Promise(r => archiveZip.on('close', () => r(archiveZipPath)));
    });

    return Promise.all(promises);
  }

  async getExtensionsPolicies() {
    const globalExtConfig = await request.get(`${this.apiBaseUrl}/gologin-settings/chrome_ext_policies`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'user-agent': this.userAgent,
        'x-two-factor-token': this.twoFaKey || '',
      },
      json: true,
      maxAttempts: 2,
      retryDelay: 1000,
      timeout: 10 * 1000,
      fullResponse: false,
    });

    const chromeExtPolicies = globalExtConfig?.chromeExtPolicies || {};
    const {
      useLocalExtStorage = false,
      deleteProfileExtFolders = false,
      useCookiesExt = true,
    } = chromeExtPolicies;

    this.#useLocalExtStorage = useLocalExtStorage;
    this.#deleteProfileExtFolders = deleteProfileExtFolders;
    this.#useCookiesExt = useCookiesExt;
  }

  async updateExtensions() {
    const fileList = await readdir(CHROME_EXTENSIONS_PATH).catch(() => []);
    if (!fileList.length) {
      return;
    }

    const oldFolders = [];

    const versionCheckPromises = fileList.map(async (extension) => {
      if (!extension.includes('@') || extension.includes('.zip')) {
        return '';
      }

      const [originalId, currentVersion] = extension.split('@');
      const extUrl = EXTENSION_URL.replace('{ext_id}', originalId);
      const uploadedProfileMetadata = await getExtMetadata(extUrl);
      const reqPath = uploadedProfileMetadata.req.path;
      const availableVersion = getExtVersion(reqPath);

      if (currentVersion === availableVersion) {
        return '';
      }

      oldFolders.push(join(CHROME_EXTENSIONS_PATH, extension));

      return originalId;
    });

    const extensionsNames = (await Promise.all(versionCheckPromises)).filter(Boolean);
    const archivesPaths = (await this.downloadChromeExtensions(extensionsNames)).filter(Boolean);
    const extractionPromises = composeExtractionPromises(archivesPaths);
    await Promise.all(extractionPromises);

    const removeFoldersPromises = oldFolders.map(folder => (
      rmdir(folder, { recursive: true, maxRetries: 3 }).catch(() => {})
    ));

    await Promise.all(removeFoldersPromises).then(() => this.#extensionsUpdating = false);
  }

  async checkLocalExtensions() {
    if (this.#extensionsUpdating || !this.accessToken) {
      return;
    }

    const fileList = await readdir(CHROME_EXTENSIONS_PATH).catch(() => []);
    if (!fileList.length) {
      return;
    }

    const extensionsIds = fileList.filter(folderName => folderName.includes('@') && !folderName.includes('.zip'))
      .map(folderName => {
        const [name] = folderName.split('@');

        return name;
      });

    if (!extensionsIds.length) {
      return;
    }

    this.insertExtensionsToDb(extensionsIds);
  }

  async insertExtensionsToDb(extensionsIds, pathToExtensions = CHROME_EXTENSIONS_PATH) {
    if (!extensionsIds?.length) {
      return;
    }

    const checkResponse = await request(`${this.apiBaseUrl}/extensions/check`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'user-agent': this.userAgent,
        'x-two-factor-token': this.twoFaKey || '',
      },
      body: {
        extensionsIds,
      },
      json: true,
    });

    const { extensionsToAdd = [] } = checkResponse.body;

    if (!extensionsToAdd.length) {
      return;
    }

    const extensionsToUpdate = await this.getExtensionsNameAndImage(extensionsToAdd, pathToExtensions);

    request(`${this.apiBaseUrl}/extensions/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'user-agent': this.userAgent,
        'x-two-factor-token': this.twoFaKey || '',
      },
      body: {
        extensionsInfo: extensionsToUpdate,
      },
      json: true,
    });
  }

  getExtensionsToInstall(extensionsFromPref, extensionsFromDB) {
    if (!extensionsFromPref) {
      return [];
    }

    const objectEntries = Object.entries(extensionsFromPref);
    const extensionsInPref = objectEntries?.map(([_, settings]) => {
      const [extFolderName] = settings.path.split(sep).reverse();
      const [originalId] = extFolderName.split('@');

      return originalId;
    }) || [];

    return extensionsFromDB.reduce((acc, extension) => {
      const [extFolderName] = extension.split(sep).reverse();
      const [originalId] = extFolderName.split('@');
      if (!extensionsInPref.includes(originalId)) {
        acc.push(extension);
      }

      return acc;
    }, []);
  }
}

const crxToZip = (buf) => {
  if (buf[0] === 80 && buf[1] === 75 && buf[2] === 3 && buf[3] === 4) {
    return buf;
  }

  if (!(buf[0] === 67 || buf[1] === 114 || buf[2] === 50 || buf[3] === 52)) {
    throw new Error('Invalid header: Does not start with Cr24');
  }

  const isV3 = buf[4] === 3;
  const isV2 = buf[4] === 2;

  if (!(isV2 || isV3) || buf[5] || buf[6] || buf[7]) {
    throw new Error('Unexpected crx format version number.');
  }

  if (isV2) {
    const publicKeyLength = calcLength(buf[8], buf[9], buf[10], buf[11]);
    const signatureLength = calcLength(buf[12], buf[13], buf[14], buf[15]);

    const zipStartOffset = 16 + publicKeyLength + signatureLength;

    return buf.slice(zipStartOffset, buf.length);
  }

  const headerSize = calcLength(buf[8], buf[9], buf[10], buf[11]);
  const zipStartOffset = 12 + headerSize;

  return buf.slice(zipStartOffset, buf.length);
};

const calcLength = (a, b, c, d) => {
  let length = 0;

  length += a << 0;
  length += b << 8;
  length += c << 16;
  length += d << 24 >>> 0;

  return length;
};

const getExtMetadata = (extUrl) => (
  request.head(extUrl, {
    maxAttempts: 3,
    retryDelay: 2000,
    timeout: 2 * 1000,
    fullResponse: true,
  })
);

const getExtVersion = (metadata) => {
  const [extFullName = ''] = metadata.split('/').reverse();
  const [extName = ''] = extFullName.split('.');
  const splitExtName = extName.split('_');
  splitExtName.shift();

  return splitExtName.join('_');
};

export default ExtensionsManager;

