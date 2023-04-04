/**
* This module exports functions related to archiving and decompressing
profiles used by the Chrome browser.

decompressProfile(zipPath: string, profileFolder: string) =>
Promise<void>: decompresses an archive located at zipPath into the
specified profileFolder.

checkProfileArchiveIsValid(zipObject: AdmZip) => boolean: checks if an
archive created by the archiveProfile function is valid. It returns true
if the archive contains at least two files named "Preferences" and
"Cookies".

flatArray(array: Array<any>) => Array<any>: a helper function that
recursively flattens nested arrays.

The module imports the following external dependencies:

AdmZip: a library for working with zip archives.
promises from the built-in fs module: provides an API for working with
the file system that returns Promises.
path: a built-in module for working with file and directory paths.
getDirectoriesForArchiver from ./profile-directories-to-remove.js: a
function that returns a list of directories to remove from the profile
archive.
 **/

import AdmZip from 'adm-zip';
import { promises as _promises } from 'fs';
import path from 'path';

import { getDirectoriesForArchiver } from './profile-directories-to-remove.js';

const { access } = _promises;

/**
 * archiveProfile(profileFolder: string, tryAgain: boolean) =>
Promise<Buffer>: creates an archive of the Chrome profile located at
profileFolder. If the tryAgain parameter is set to true, the function
will attempt to create the archive again if the first attempt is not
valid. The function returns a Promise that resolves to a Buffer
containing the archive data.
 * @param {*} profileFolder
 * @param {*} tryAgain
 * @returns
 */
export const archiveProfile = async (profileFolder = '', tryAgain = true) => {
  const folderExists = await access(profileFolder).then(() => true, () => false);
  if (!folderExists) {
    throw new Error('Invalid profile folder path: ' + profileFolder);
  }

  const archive = new AdmZip();
  archive.addLocalFolder(path.join(profileFolder, 'Default'), 'Default');
  try {
    archive.addLocalFile(path.join(profileFolder, 'First Run'));
  } catch (e) {
    archive.addFile('First Run', Buffer.from(''));
  }

  const dirsToRemove = getDirectoriesForArchiver();
  dirsToRemove.forEach(entry => archive.deleteFile(entry));

  const archiveIsValid = checkProfileArchiveIsValid(archive);
  if (tryAgain && !archiveIsValid) {
    await new Promise(r => setTimeout(() => r(), 300));

    return archiveProfile(profileFolder, false);
  }

  return new Promise((resolve, reject) => archive.toBuffer(resolve, reject));
};

export const decompressProfile = async (zipPath = '', profileFolder = '') => {
  const zipExists = await access(zipPath).then(() => true, () => false);
  if (!zipExists) {
    throw new Error('Invalid zip path: ' + zipPath);
  }

  const archive = new AdmZip(zipPath);
  archive
    .getEntries()
    .forEach((elem) => {
      if (
        !elem.isDirectory &&
        (
          elem.entryName.includes('RunningChromeVersion') ||
          elem.entryName.includes('SingletonLock') ||
          elem.entryName.includes('SingletonSocket') ||
          elem.entryName.includes('SingletonCookie')
        )
      ) {
        archive.deleteFile(elem);
      }
    });

  archive.extractAllTo(profileFolder, true);
};

export const checkProfileArchiveIsValid = (zipObject) => {
  if (!zipObject) {
    throw new Error('No zip object provided');
  }

  return zipObject
    .getEntries()
    .map(elem => {
      if (elem.isDirectory) {
        return false;
      }

      return elem.entryName.includes('Preferences') || elem.entryName.includes('Cookies');
    })
    .filter(Boolean)
    .length >= 2;
};

const flatArray = (array = []) => array.map((elem) => {
  if (Array.isArray(elem)) {
    return flatArray(elem).flat();
  }

  return elem;
}).flat().filter(Boolean);
