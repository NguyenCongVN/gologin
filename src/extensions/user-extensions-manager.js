/* eslint-disable max-len */
/**
 * This is a module written in JavaScript that exports a class called UserExtensionsManager. The class has several methods and properties:

#existedUserExtensions: a private property that holds a list of existing user extensions.
#API_BASE_URL, #ACCESS_TOKEN, #USER_AGENT, and #TWO_FA_KEY: private properties that hold the API base URL, access token, user agent, and two-factor authentication key respectively.
set and get methods for each of the above private properties.
checkLocalUserChromeExtensions: an asynchronous method that takes a list of user chrome extensions and a profile ID and checks if the extensions already exist on the local system. If any of the extensions are not found, they are downloaded and saved to the local system.
getExtensionsStrToIncludeAsOrbitaParam: an asynchronous method that takes a list of extension IDs and a folder path and returns an array of paths to the extension folders that match the given IDs.
getExtensionsNameAndImage: an asynchronous method that takes a list of extension IDs and a path to the extensions folder and returns an array of objects that contain the name, extension ID, and icon binary for each extension.
generateExtensionId: a synchronous method that generates a random extension ID.
checkFileSizeSync: an asynchronous method that takes a file path and returns the file size in bytes. If the file is a directory, it recursively calculates the size of all files in the directory.
copyFolder: an asynchronous method that takes a source folder path and a destination folder path and copies all files and folders from the source folder to the destination folder.
The module imports several modules from the Node.js standard library (fs, path, requestretry) and a module called common from a file called common.js in the same directory. It exports the UserExtensionsManager class as the default export of the module.
 */
import { createWriteStream, promises as _promises } from 'fs';
import { join, sep } from 'path';
import request from 'requestretry';

import { CHROME_EXTENSIONS_PATH, composeExtractionPromises, USER_EXTENSIONS_PATH } from '../utils/common.js';

const { readdir, readFile, stat, mkdir, copyFile } = _promises;

export class UserExtensionsManager {
  #existedUserExtensions = [];
  #API_BASE_URL = '';
  #ACCESS_TOKEN = '';
  #USER_AGENT = '';
  #TWO_FA_KEY = '';

  set userAgent(userAgent) {
    if (!userAgent) {
      return;
    }

    this.#USER_AGENT = userAgent;
  }

  set accessToken(accessToken) {
    if (!accessToken) {
      return;
    }

    this.#ACCESS_TOKEN = accessToken;
  }

  set twoFaKey(twoFaKey) {
    if (!twoFaKey) {
      return;
    }

    this.#TWO_FA_KEY = twoFaKey;
  }

  set apiUrl(apiUrl) {
    if (!apiUrl) {
      return;
    }

    this.#API_BASE_URL = apiUrl;
  }

  get apiBaseUrl() {
    return this.#API_BASE_URL;
  }

  get existedUserExtensions() {
    return this.#existedUserExtensions;
  }

  get accessToken() {
    return this.#ACCESS_TOKEN;
  }

  get twoFaKey() {
    return this.#TWO_FA_KEY;
  }

  get userAgent() {
    return this.#USER_AGENT;
  }

  set existedUserExtensions(fileList) {
    if (!fileList) {
      return;
    }

    this.#existedUserExtensions = fileList;
  }

  checkLocalUserChromeExtensions = async (userChromeExtensions, profileId) => {
    if (!userChromeExtensions.length) {
      return;
    }

    const extensionsToDownloadPaths = await request.post(`${this.#API_BASE_URL}/extensions/user_chrome_extensions_paths`, {
      json: true,
      fullResponse: false,
      headers: {
        Authorization: `Bearer ${this.#ACCESS_TOKEN}`,
        'user-agent': this.#USER_AGENT,
        'x-two-factor-token': this.#TWO_FA_KEY || '',
      },
      body: {
        existedUserChromeExtensions: this.#existedUserExtensions,
        profileId,
        userChromeExtensions,
      },
    }) || [];

    const extensionsToDownloadPathsFiltered =
      extensionsToDownloadPaths.filter(extPath => userChromeExtensions.some(extId => extPath.includes(extId)));

    if (!extensionsToDownloadPathsFiltered.length) {
      return this.getExtensionsStrToIncludeAsOrbitaParam(userChromeExtensions, USER_EXTENSIONS_PATH);
    }

    const promises = extensionsToDownloadPathsFiltered.map(async awsPath => {
      const [basePath] = awsPath.split('?');
      const [extId] = basePath.split('/').reverse();
      const zipPath = `${join(USER_EXTENSIONS_PATH, extId)}.zip`;
      const archiveZip = createWriteStream(zipPath);

      await request(awsPath, {
        retryDelay: 2 * 1000,
        maxAttempts: 3,
      }).pipe(archiveZip);

      await new Promise(r => archiveZip.on('close', () => r()));

      return zipPath;
    });

    const zipPaths = await Promise.all(promises).catch(() => []);

    if (!zipPaths) {
      return this.getExtensionsStrToIncludeAsOrbitaParam(userChromeExtensions, USER_EXTENSIONS_PATH);
    }

    const extractionPromises = composeExtractionPromises(zipPaths, USER_EXTENSIONS_PATH);
    const isExtensionsExtracted = await Promise.all(extractionPromises).catch(() => 'error');

    if (isExtensionsExtracted !== 'error') {
      const [downloadedFolders] = zipPaths.map(archivePath => archivePath.split(sep).reverse());
      this.#existedUserExtensions = [...this.#existedUserExtensions, ...downloadedFolders];
    }

    return this.getExtensionsStrToIncludeAsOrbitaParam(userChromeExtensions, USER_EXTENSIONS_PATH);
  };

  async getExtensionsStrToIncludeAsOrbitaParam(profileExtensions = [], folderPath = CHROME_EXTENSIONS_PATH) {
    if (!(Array.isArray(profileExtensions) && profileExtensions.length)) {
      return [];
    }

    const folders = await readdir(folderPath).then(folderNames => folderNames.map(folderName => join(folderPath, folderName)));

    if (!folders.length) {
      return [];
    }

    const formattedIdsList = folders.map((el) => {
      const [folderName] = el.split(sep).reverse();
      const [originalId] = folderName.split('@');

      return {
        originalId,
        path: el,
      };
    });

    return profileExtensions.map((el) => {
      const extExisted = formattedIdsList.find(chromeExtPathElem => chromeExtPathElem.originalId === el);

      if (!extExisted) {
        return '';
      }

      return extExisted.path;
    }).filter(Boolean);
  }

  async getExtensionsNameAndImage(extensionsIds, pathToExtensions) {
    const isCheckLocalFiles = [CHROME_EXTENSIONS_PATH, USER_EXTENSIONS_PATH].includes(pathToExtensions);
    const extensionFolderNames = await readdir(pathToExtensions).catch(() => {});
    const filteredExtensionFolderNames = extensionFolderNames.filter(extensionFolder => extensionsIds.some(extensionId => !extensionFolder.includes('.zip') && extensionFolder.includes(extensionId)));

    if (!filteredExtensionFolderNames.length) {
      return;
    }

    const namesPromise = extensionsIds.map(async (extensionsId) => {
      const folderName = filteredExtensionFolderNames.find(folderName => folderName.includes(extensionsId));

      if (!folderName) {
        return;
      }

      let pathToExtensionsFolder = [pathToExtensions, folderName];
      if (!isCheckLocalFiles) {
        const [extensionVersion] = await readdir(join(pathToExtensions, folderName));
        pathToExtensionsFolder = [pathToExtensions, folderName, extensionVersion];
      }

      const manifestPath = join(...pathToExtensionsFolder, 'manifest.json');
      const manifestString = await readFile(manifestPath, 'utf8').catch(() => '');
      if (!manifestString) {
        return;
      }

      const manifestObject = JSON.parse(manifestString);
      let name;
      if (manifestObject.name.includes('__MSG')) {
        const manifestName = manifestObject.name || '';
        const fieldNameInLocale = manifestName.replace(/__/g, '').split('MSG_')[1];
        const localePath = join(...pathToExtensionsFolder, '_locales', manifestObject.default_locale, 'messages.json');
        const localeString = await readFile(localePath, 'utf8').catch(() => {});

        try {
          const parsedLocale = JSON.parse(localeString.trim());
          name = parsedLocale[fieldNameInLocale].message;
        } catch (e) {
          console.log(e);
        }
      } else {
        name = manifestObject.name;
      }

      if (!name) {
        return;
      }

      const iconObject = manifestObject.icons;
      let iconPath = manifestObject.browser_action?.default_icon;
      if (iconObject) {
        iconPath = iconObject['128'];
      }

      let iconBSON = '';
      if (iconPath) {
        const iconPathFull = join(...pathToExtensionsFolder, iconPath);
        iconBSON = await readFile(iconPathFull, 'base64').catch(() => {});
      }

      return {
        name,
        extId: extensionsId,
        iconBinary: iconBSON,
      };
    });

    const extensionsArray = await Promise.all(namesPromise);

    return extensionsArray.filter(Boolean);
  }

  generateExtensionId() {
    let result = '';
    let extensionIdLength = 32;
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    const charactersLength = characters.length;
    while (extensionIdLength--) {
      result += characters.charAt(Math.floor(Math.random() *
        charactersLength));
    }

    return result;
  }
}

const checkFileSizeSync = async (pathToFile) => {
  try {
    const [fileName] = pathToFile.split(sep).reverse();
    if (fileName === '.DS_Store') {
      return 0;
    }

    const fileStats = await stat(pathToFile);
    if (!fileStats.isDirectory()) {
      return fileStats.size;
    }

    const files = await readdir(pathToFile);
    const promises = files.map(async file => checkFileSizeSync(join(pathToFile, file)));

    return (await Promise.all(promises)).reduce((result, value) => result + value, 0);
  } catch {
    return -1;
  }
};

const copyFolder = async (fromPath, destPath) => {
  const stats = await stat(fromPath);

  if (!stats.isDirectory()) {
    return copyFile(fromPath, destPath);
  }

  await mkdir(destPath, { recursive: true }).catch(() => null);
  const files = await readdir(fromPath);
  const promises = files.map(async file => {
    await mkdir(destPath, { recursive: true }).catch(() => null);

    return copyFolder(join(fromPath, file), join(destPath, file));
  });

  return Promise.all(promises);
};

export default UserExtensionsManager;
