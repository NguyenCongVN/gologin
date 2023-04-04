/* eslint-disable max-len */
/** 
 * This is a module that exports two functions related to extracting and deleting compressed files of browser extensions.

The extractExtension function takes in two parameters, source and dest, which are the file paths of the source compressed file and the destination directory, respectively.
 It returns a promise that resolves to the result of the decompress function from the decompress library, which extracts the compressed file to the destination directory. 
 It also takes advantage of the decompressUnzip plugin to handle unzip of the file. 
 Before extraction, it checks if the source file and destination directory exist by using the access function from the fs.promises module.

The deleteExtensionArchive function takes in a single parameter, dest, which is the file path of the compressed file to delete.
 It returns a promise that resolves to the result of the unlink function from the fs.promises module, which deletes the file.
  Before deleting, it checks if the file exists by using the access function from the fs.promises module.

Finally, the module also exports a withRetry function that takes in an options object with a fn property, which is a function that returns a promise.
 The withRetry function returns a promise that resolves to the result of the fn function.
  If the fn function rejects with an error, the withRetry function will console log the error and retry up to 5 times, with a delay of 0.001 seconds between each retry.
   If the fn function still fails after the retries, the withRetry function will reject with the original error.
 */

import decompress from 'decompress';
import decompressUnzip from 'decompress-unzip';
import { promises } from 'fs';

const { access, unlink } = promises;

export const extractExtension = (source, dest) => {
  if (!(source && dest)) {
    throw new Error('Missing parameter');
  }

  return access(source)
    .then(() =>
      withRetry({
        fn() {
          return decompress(source, dest, {
            plugins: [decompressUnzip()],
            filter: file => !file.path.endsWith('/'),
          });
        },
      }),
    );
}

export const deleteExtensionArchive = (dest) => {
  if (!dest) {
    throw new Error('Missing parameter');
  }

  return access(dest)
    .then(
      () => unlink(dest),
      () => Promise.resolve(),
    );
}

const withRetry = optionsOrUndefined => {
  const opts = optionsOrUndefined || {};
  const callCounter = opts.callCounter || 1;
  const fnToProducePromise = opts.fn;
  const callLimit = opts.limit || 5;
  delete opts.callCounter;

  return fnToProducePromise(opts).catch(err => {
    console.error(err);
    if (callCounter >= callLimit) {
      return Promise.reject(err);
    }

    opts.callCounter = callCounter + 1;

    return new Promise(resolve => process.nextTick(resolve)).then(() =>
      withRetry(opts),
    );
  });
};
