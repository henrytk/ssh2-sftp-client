/**
 * ssh2 sftp client for node
 */

'use strict';

const Client = require('ssh2').Client;
const fs = require('fs');
const concat = require('concat-stream');
const retry = require('retry');
const {join, posix} = require('path');

let SftpClient = function() {
  this.client = new Client();
};

/**
 * Generate a new Error object with a reformatted error message which
 * is a little more informative and useful to users.
 *
 * @param {Error|string} err - The Error object the new error will be based on
 * @param {number} retryCount - For those functions which use retry. Number of
 *                              attempts to complete before giving up
 * @returns {Error} New error with custom error message
 */
function formatError(err, name = 'ssh2-sftp-client', retryCount) {
  let msg = '';

  if (typeof err === 'string') {
    msg = `${name}: ${err}`;
  } else {
    switch (err.code) {
      case 'ENOTFOUND':
        msg =
          `${name}: ${err.level} error. Address lookup failed for host ` +
          `${err.hostname}`;
        break;
      case 'ECONNREFUSED':
        msg =
          `${name}: ${err.level} error. Remote host at ` +
          `${err.address} refused connection`;
        break;
      case 'ENOENT':
        msg = `${name}: ${err.message}`;
        break;
      default:
        msg = `${name}: ${err.message}`;
    }
  }

  if (retryCount) {
    msg += ` after ${retryCount} attempts`;
  }
  return new Error(msg);
}

/**
 * Remove all ready, error and end listeners.
 *
 * @param {Emitter} emitter - The emitter object to remove listeners from
 */
function removeListeners(emitter) {
  let listeners = emitter.eventNames();
  listeners.map(name => emitter.removeAllListeners(name));
}

/**
 * Simple default error listener. Will reformat the error message and
 * throw a new error.
 *
 * @param {Error} err - source for defining new error
 * @throws {Error} Throws new error
 */
function errorListener(err, source) {
  let newErr = formatError(err, source);
  throw newErr;
}

/**
 * Retrieves a directory listing. The pattern argument may be a regular expression
 * or simple 'glob' style *.
 *
 * @param {String} path, a string containing the path to a directory
 * @param {regex} pattern - An optional pattern used to filter the list
 * @return {Promise} data, list info
 */
SftpClient.prototype.list = function(path, pattern = /.*/) {
  const reg = /-/gi;

  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.list'));
      }
      sftp.readdir(path, (err, list) => {
        if (err) {
          reject(formatError(err, 'sftp.list'));
        } else {
          let newList = [];
          // reset file info
          if (list) {
            newList = list.map(item => {
              return {
                type: item.longname.substr(0, 1),
                name: item.filename,
                size: item.attrs.size,
                modifyTime: item.attrs.mtime * 1000,
                accessTime: item.attrs.atime * 1000,
                rights: {
                  user: item.longname.substr(1, 3).replace(reg, ''),
                  group: item.longname.substr(4, 3).replace(reg, ''),
                  other: item.longname.substr(7, 3).replace(reg, '')
                },
                owner: item.attrs.uid,
                group: item.attrs.gid
              };
            });
          }
          // provide some compatibility for auxList
          let regex;
          if (pattern instanceof RegExp) {
            regex = pattern;
          } else {
            let newPattern = pattern.replace(/\*([^*])*?/gi, '.*');
            regex = new RegExp(newPattern);
          }
          resolve(newList.filter(item => regex.test(item.name)));
        }
      });
    } catch (err) {
      reject(formatError(err, 'sftp.list'));
    }
  });
};

/**
 * Retrieves a directory listing with a filter
 *
 * @param {String} path, a string containing the path to a directory
 * @param {String} pattern, a string containing the path
 * @return {Promise} data, list info
 *
 * @deprecated Please use list() instead.
 */
SftpClient.prototype.auxList = function(path, pattern = '*') {
  console.log(
    'auxList is deprecated and will be removed. Please use lis() instead'
  );
  return this.list(path, pattern);
};

/**
 * @async

 * Tests to see if an object exists. If it does, return the type of that object
 * (in the format returned by list). If it does not exist, return false.
 *
 * @param {string} path - path to the object on the sftp server.
 *
 * @return {boolean} returns false if object does not exist. Returns type of
 *                   object if it does
 */
SftpClient.prototype.exists = function(path) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.exists'));
      }
      let {dir, base} = posix.parse(path);
      if (base === '.') {
        // the '.' directory exists by definition
        resolve('d');
      }
      sftp.readdir(dir, (err, list) => {
        if (err) {
          if (err.code === 2) {
            resolve(false);
          } else {
            reject(formatError(err, 'sftp.exists'));
          }
        } else {
          let [type] = list
            .filter(item => item.filename === base)
            .map(item => item.longname.substr(0, 1));
          if (type) {
            resolve(type);
          } else {
            resolve(false);
          }
        }
      });
    } catch (err) {
      reject(formatError(err, 'sftp.exists'));
    }
  });
};

/**
 * Retrieves attributes for path
 *
 * @param {String} path, a string containing the path to a file
 * @return {Promise} stats, attributes info
 */
SftpClient.prototype.stat = function(remotePath) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.stat'));
      }
      sftp.stat(remotePath, function(err, stats) {
        if (err) {
          reject(formatError(err, 'sftp.stat'));
        } else {
          resolve({
            mode: stats.mode,
            uid: stats.uid,
            gid: stats.gid,
            size: stats.size,
            accessTime: stats.atime * 1000,
            modifyTime: stats.mtime * 1000,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            isBlockDevice: stats.isBlockDevice(),
            isCharacterDevice: stats.isCharacterDevice(),
            isSymbolicLink: stats.isSymbolicLink(),
            isFIFO: stats.isFIFO(),
            isSocket: stats.isSocket()
          });
        }
      });
    } catch (err) {
      reject(formatError(err, 'sftp.stat'));
    }
  });
};

/**
 * get file
 *
 * If a dst argument is provided, it must be either a string, representing the
 * local path to where the data will be put, a stream, in which case data is
 * piped into the stream or undefined, in which case the data is returned as
 * a Buffer object.
 *
 * @param {String} path, remote file path
 * @param {string|stream|undefined} dst, data destination
 * @param {Object} userOptions, options passed to get
 *
 * @return {Promise}
 */
SftpClient.prototype.get = function(path, dst, options) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.get'));
      }
      let rdr = sftp.createReadStream(path, options);

      rdr.on('error', err => {
        removeListeners(rdr);
        reject(formatError(err, 'sftp.get'));
      });

      if (dst === undefined) {
        // no dst specified, return buffer of data
        let concatStream = concat(buff => {
          rdr.removeAllListeners('error');
          resolve(buff);
        });
        rdr.pipe(concatStream);
      } else {
        let wtr;
        if (typeof dst === 'string') {
          // dst local file path
          wtr = fs.createWriteStream(dst);
        } else {
          // assume dst is a writeable
          wtr = dst;
        }
        wtr.on('error', err => {
          removeListeners(rdr);
          reject(formatError(err, 'sftp.get'));
        });
        wtr.on('finish', () => {
          removeListeners(rdr);
          resolve(wtr);
        });
        rdr.pipe(wtr);
      }
    } catch (err) {
      reject(formatError(err, 'sftp.get'));
    }
  });
};

/**
 * Use SSH2 fastGet for downloading the file.
 * Downloads a file at remotePath to localPath using parallel reads
 * for faster throughput.
 *
 * See 'fastGet' at https://github.com/mscdex/ssh2-streams/blob/master/SFTPStream.md
 *
 * @param {String} remotePath
 * @param {String} localPath
 * @param {Object} options
 * @return {Promise} the result of downloading the file
 */
SftpClient.prototype.fastGet = function(remotePath, localPath, options) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.fastGet'));
      }
      sftp.fastGet(remotePath, localPath, options, function(err) {
        if (err) {
          reject(formatError(err, 'sftp.fastGet'));
        }
        resolve(`${remotePath} was successfully download to ${localPath}!`);
      });
    } catch (err) {
      reject(formatError(err, 'sftp.fastGet'));
    }
  });
};

/**
 * Use SSH2 fastPut for uploading the file.
 * Uploads a file from localPath to remotePath using parallel reads
 * for faster throughput.
 *
 * See 'fastPut' at
 * https://github.com/mscdex/ssh2-streams/blob/master/SFTPStream.md
 *
 * @param {String} localPath
 * @param {String} remotePath
 * @param {Object} options
 * @return {Promise} the result of downloading the file
 */
SftpClient.prototype.fastPut = function(localPath, remotePath, options) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.fastPut'));
      }
      sftp.fastPut(localPath, remotePath, options, function(err) {
        if (err) {
          reject(formatError(err, 'sftp.fastPut'));
        }
        resolve(`${localPath} was successfully uploaded to ${remotePath}!`);
      });
    } catch (err) {
      reject(formatError(err, 'sftp.fastPut'));
    }
  });
};

/**
 * Create file a file on the remote server. The 'src' argument
 * can be a buffer, string or read stream. If 'src' is a string, it
 * should be the path to a local file.
 *
 * @param  {String|Buffer|stream} src - source data to use
 * @param  {String} remotePath - path to remote file
 * @param  {Object} options - options used for write stream configuration
 *                            value supported by node streams.
 * @return {Promise}
 */
SftpClient.prototype.put = function(src, remotePath, options) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(new Error('sftp.put: No SFTP connections available'));
      }

      let stream = sftp.createWriteStream(remotePath, options);

      stream.on('error', err => {
        reject(formatError(err, 'sftp.put'));
      });

      stream.on('finish', () => {
        removeListeners(stream);
        resolve(`Uploaded data stream to ${remotePath}`);
      });

      if (src instanceof Buffer) {
        stream.end(src);
      } else {
        let rdr;
        if (typeof src === 'string') {
          rdr = fs.createReadStream(src);
        } else {
          rdr = src;
        }
        rdr.on('error', err => {
          removeListeners(stream);
          reject(formatError(err, 'sftp.put'));
        });
        rdr.pipe(stream);
      }
    } catch (err) {
      reject(formatError(err, 'sftp.put'));
    }
  });
};

/**
 * Append to an existing remote file
 *
 * @param  {Buffer|stream} input
 * @param  {String} remotePath,
 * @param  {Object} options
 * @return {Promise}
 */
SftpClient.prototype.append = function(input, remotePath, options) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.append'));
      }
      if (typeof input === 'string') {
        reject(formatError('Cannot append one file to another', 'sftp.append'));
      }

      let stream = sftp.createWriteStream(remotePath, options);

      stream.on('error', err => {
        removeListeners(stream);
        reject(formatError(err, 'sftp.append'));
      });

      stream.on('finish', () => {
        removeListeners(stream);
        resolve(`sftp.append: Uploaded data stream to ${remotePath}`);
      });

      if (input instanceof Buffer) {
        stream.end(input);
      } else {
        input.pipe(stream);
      }
    } catch (err) {
      reject(formatError(err, 'sftp.append'));
    }
  });
};

/**
 * @async
 *
 * Make a directory on remote server
 *
 * @param {string} path, remote directory path.
 * @param {boolean} recursive, if true, recursively create directories
 * @return {Promise}.
 */
SftpClient.prototype.mkdir = async function(path, recursive = false) {
  let sftp = this.sftp;

  function doMkdir(p) {
    return new Promise((resolve, reject) => {
      sftp.mkdir(p, err => {
        if (err) {
          reject(formatError('Failed to create directory', 'sftp.mkdir'));
        }
        resolve(`${p} directory created`);
      });
    });
  }

  try {
    if (!sftp) {
      return Promise.reject(
        formatError('No SFTP connection available', 'sftp.mkdir')
      );
    }
    let realPath = path;
    let {dir} = posix.parse(path);
    if (dir === '') {
      dir = '.';
      realPath = './' + path;
    }
    if (!recursive) {
      return doMkdir(path);
    }
    let parent = await this.exists(dir);
    if (!parent) {
      await this.mkdir(dir, true);
    } else if (parent !== 'd') {
      return Promise.reject(formatError('Bad directory path', 'sftp.mkdir'));
    }
    return doMkdir(realPath);
  } catch (err) {
    return Promise.reject(formatError(err, 'sftp.mkdir'));
  }
};

/**
 * @async
 *
 * Remove directory on remote server
 *
 * @param {string} path, path to directory to be removed
 * @param {boolean} recursive, if true, remove directories/files in target
 *                             directory
 * @return {Promise}..
 */
SftpClient.prototype.rmdir = async function(path, recursive = false) {
  let sftp = this.sftp;

  function doRmdir(p) {
    return new Promise((resolve, reject) => {
      try {
        sftp.rmdir(p, err => {
          if (err) {
            reject(formatError(err, 'sftp.rmdir'));
          }
          resolve('Successfully removed directory');
        });
      } catch (err) {
        reject(formatError(err, 'sftp.rmdir'));
      }
    });
  }

  try {
    if (!sftp) {
      return Promise.reject(
        formatError('No SFTP connection available', 'sftp.rmdir')
      );
    }
    if (!recursive) {
      return doRmdir(path);
    }
    let list = await this.list(path);
    if (list.length) {
      let files = list.filter(item => item.type !== 'd');
      let dirs = list.filter(item => item.type === 'd');
      for (let f of files) {
        try {
          await this.delete(join(path, f.name));
        } catch (err) {
          return Promise.reject(formatError(err, 'sftp.rmdir'));
        }
      }
      for (let d of dirs) {
        try {
          await this.rmdir(join(path, d.name), true);
        } catch (err) {
          return Promise.reject(formatError(err, 'sftp.rmdir'));
        }
      }
    }
    return doRmdir(path);
  } catch (err) {
    return Promise.reject(formatError(err, 'sftp.rmdir'));
  }
};

/**
 * @async
 *
 * Delete a file on the remote SFTP server
 *
 * @param {string} path - path to the file to delete
 * @return {Promise} with string 'Successfully deleeted file' once resolved
 *
 */
SftpClient.prototype.delete = function(path) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.delete'));
      }
      sftp.unlink(path, err => {
        if (err) {
          reject(formatError(err, 'sftp.delete'));
        }
        resolve('Successfully deleted file');
      });
    } catch (err) {
      reject(formatError(err, 'sftp.delete'));
    }
  });
};

/**
 * @async
 *
 * Rename a file on the remote SFTP repository
 *
 * @param {string} fromPath - path to the file to be renamced.
 * @param {string} toPath - path to the new name.
 *
 * @return {Promise}
 *
 */
SftpClient.prototype.rename = function(fromPath, toPath) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.rename'));
      }
      sftp.rename(fromPath, toPath, err => {
        if (err) {
          reject(formatError(err, 'sftp.rename'));
        }
        resolve(`Successfully renamed ${fromPath} to ${toPath}`);
      });
    } catch (err) {
      reject(formatError(err, 'sftp.rename'));
    }
  });
};

/**
 * @async
 *
 * Change the mode of a remote file on the SFTP repository
 *
 * @param {string} remotePath - path to the remote target object.
 * @param {Octal} mode - the new mode to set
 *
 * @return {Promise}.
 */
SftpClient.prototype.chmod = function(remotePath, mode) {
  return new Promise((resolve, reject) => {
    let sftp = this.sftp;

    try {
      if (!sftp) {
        reject(formatError('No SFTP connection available', 'sftp.chmod'));
      }
      sftp.chmod(remotePath, mode, err => {
        if (err) {
          reject(formatError(err, 'sftp.chmod'));
        }
        resolve('Successfully change file mode');
      });
    } catch (err) {
      reject(formatError(err, 'sftp.chmod'));
    }
  });
};

/**
 * @async
 *
 * Create a new SFTP connection to a remote SFTP server
 *
 * @param {Object} config - an SFTP configuration object
 * @param {string} connectMethod - ???
 *
 * @return {Promise} which will resolve to an sftp client object
 *
 */
SftpClient.prototype.connect = function(config) {
  let obj = this;
  var operation = retry.operation({
    retries: config.retries || 2,
    factor: config.retry_factor || 2,
    minTimeout: config.retry_minTimeout || 2000
  });

  function retryConnect(sftpObj, config, callback) {
    try {
      operation.attempt(function(attemptCount) {
        sftpObj.client
          .on('ready', () => {
            sftpObj.client.sftp((err, sftp) => {
              if (err) {
                removeListeners(sftpObj.client);
                if (operation.retry(err)) {
                  // failed to connect, but not yet reached max attempt count
                  // remove the listeners and try again
                  return;
                }
                // exhausted retries - do callback with error
                callback(formatError(err, 'sftp.connect', attemptCount), null);
              }
              sftpObj.sftp = sftp;
              // remove retry error listener and add generic error listener
              sftpObj.client.removeAllListeners('error');
              sftpObj.client.on('error', errorListener);
              sftpObj.client.on('finish', withError => {
                if (withError) {
                  console.error('Client ended due to errors');
                }
              });
              callback(null, sftp);
            });
          })
          .on('end', () => {
            sftpObj.sftp = null;
          })
          .on('error', err => {
            removeListeners(sftpObj.client);
            if (operation.retry(err)) {
              // failed to connect, but not yet reached max attempt count
              // remove the listeners and try again
              return;
            }
            // exhausted retries - do callback with error
            callback(formatError(err, 'sftp.connect', attemptCount), null);
          })
          .on('close', withError => {
            if (withError) {
              console.error('sftp client closed due to errors');
            }
          })
          .connect(config);
      });
    } catch (err) {
      removeListeners(sftpObj.client);
      callback(formatError(err, 'sftp.connect'), null);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      retryConnect(obj, config, (err, sftp) => {
        if (err) {
          reject(formatError(err, 'sftp.connect'));
        }
        resolve(sftp);
      });
    } catch (err) {
      reject(formatError(err, 'sftp.connect'));
    }
  });
};

// function debugListeners(emitter) {
//   let eventNames = emitter.eventNames();
//   if (eventNames.length) {
//     console.log('Listener Data');
//     eventNames.map(n => {
//       console.log(`${n}: ${emitter.listenerCount(n)}`);
//     });
//   }
// }

/**
 * @async
 *
 * Close the SFTP connection
 *
 */
SftpClient.prototype.end = function() {
  return new Promise((resolve, reject) => {
    try {
      // debugListeners(this.client);
      this.client.end();
      removeListeners(this.client);
      this.sftp = null;
      resolve(true);
    } catch (err) {
      reject(formatError(err, 'sftp.end'));
    }
  });
};

/**
 * Add a listner to the client object. This is rarely necessary and can be
 * the source of errors. It is the client's responsibility to remove the
 * listeners when no longer required. Failure to do so can result in memory
 * leaks.
 *
 * @param {string} eventType - one of the supported event types
 * @param {function} callback - function called when event triggers
 */
SftpClient.prototype.on = function(eventType, callback) {
  this.client.on(eventType, callback);
};

SftpClient.prototype.removeListener = function(eventType, listener) {
  this.client.removeListener(eventType, listener);
};

module.exports = SftpClient;
