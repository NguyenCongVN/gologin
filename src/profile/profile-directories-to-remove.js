/* eslint-disable max-len */
/** 
 * This is a module that exports two functions and an array of objects.

The array DEFAULT_FOLDER_USELESS_FILE contains a list of objects, where each object describes a folder or file that should be removed when deleting or archiving a browser profile.

The first function getDirectoriesToDeleteForNode(routerSlash) takes a string routerSlash as an optional argument, which represents the router slash used in the folder paths. The function maps over the DEFAULT_FOLDER_USELESS_FILE array, and for each object it adds the corresponding folder/file path to an array. The function returns the array of folders/files to be deleted when cleaning up a browser profile.

The second function getDirectoriesForArchiver() does the same mapping over the DEFAULT_FOLDER_USELESS_FILE array, but instead of returning an array of folder/file paths to be deleted, it returns an array of folder/file paths to be included in the archive of a browser profile.

Both functions return an array of string paths.
 */

const DEFAULT_FOLDER_USELESS_FILE = [
  {
    name: 'Cache',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'fonts_config',
    subs: [],
    isDirectory: false,
  },
  {
    name: 'Service Worker',
    subs: ['CacheStorage'],
    isDirectory: true,
  },
  {
    name: 'Code Cache',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'GPUCache',
    subs: [],
    isDirectory: true,
  },
];

export const getDirectoriesToDeleteForNode = (routerSlash = '/') =>
  DEFAULT_FOLDER_USELESS_FILE.reduce((res, el) => {
    const basePath = routerSlash + 'Default' + routerSlash + el.name;
    if (el.subs.length) {
      el.subs.forEach(sub => res.push(basePath + routerSlash + sub));
    } else {
      res.push(basePath);
    }

    return res;
  }, []);

export const getDirectoriesForArchiver = () => DEFAULT_FOLDER_USELESS_FILE.reduce((res, el) => {
  const { name, subs, isDirectory } = el;
  const basePath = 'Default/' + name;

  if (subs.length) {
    subs.forEach((sub) => {
      const resPath = basePath + '/' + (isDirectory ? sub + '/' : sub);
      res.push(resPath);
    });
  } else {
    res.push(basePath + (isDirectory ? '/' : ''));
  }

  return res;
}, []);
