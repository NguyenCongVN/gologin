const { access, unlink } = require('fs').promises;
const decompress = require('decompress');
const decompressUnzip = require('decompress-unzip');

class ExtensionsExtractor {
  /**
 * Extracts a compressed archive file and writes the decompressed contents to a specified destination path.
 * 
 * @param {string} source - The path to the compressed archive file
 * @param {string} dest - The path to write the decompressed contents
 * @returns {Promise<void>} A promise that resolves when the decompression and write is complete
 * @throws {Error} When source or dest is not specified
 */

  static extractExtension(source, dest) {
    if (!(source && dest)) {
      throw new Error('Missing parameter');
    }

    return access(source)
      .then(() =>
        withRetry({
          fn() {
            return decompress(source, dest, {
              plugins: [decompressUnzip()],
              filter: file => !file.path.endsWith('/')
            })
          }
        })
      );
  }

  /**
 * Removes the specified file at the destination path. If the file does not exist, resolves immediately.
 * 
 * @param {string} dest - The path to the file to delete
 * @returns {Promise<void>} A promise that resolves when the file is deleted or when it is determined that the file does not exist
 * @throws {Error} When dest is not specified
 */

  static deleteExtensionArchive(dest) {
    if (!dest) {
      throw new Error('Missing parameter');
    }

    return access(dest)
      .then(
        () => unlink(dest),
        () => Promise.resolve()
      )
  }
}

/**

Retry a function with a certain limit in case of failure.
@param {object} [optionsOrUndefined] - Options object that contains the following optional parameters:
@param {function} fnToProducePromise - Function to produce a promise
@param {number} [callCounter=1] - Count of function calls that is used to limit the number of attempts.
@param {number} [limit=5] - Maximum number of attempts.
@returns {Promise<any>} Promise that resolves when the function is executed successfully.
*/
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
      withRetry(opts)
    );
  });
};

module.exports = ExtensionsExtractor;
