'use strict';

const chai = require('chai');
const expect = chai.expect;
const chaiSubset = require('chai-subset');
const chaiAsPromised = require('chai-as-promised');
const {join} = require('path');
const gHooks = require('./hooks/global-hooks');
const lHooks = require('./hooks/list-hooks');

chai.use(chaiSubset);
chai.use(chaiAsPromised);

let hookSftp, sftp, sftpUrl, localUrl;

before('Global setup', async function() {
  try {
    let testEnv = await gHooks.setup();
    hookSftp = testEnv.hookSftp;
    sftp = testEnv.sftp;
    sftpUrl = testEnv.sftpUrl;
    localUrl = testEnv.localUrl;
    return true;
  } catch (err) {
    console.error(`list global setup: ${err.message}`);
    return false;
  }
});

after('Global shutdown', async function() {
  try {
    await gHooks.closeDown();
    return true;
  } catch (err) {
    console.error(`list global close down: ${err.message}`);
    return false;
  }
});

describe('list method tests', function() {
  before('List test setup hook', async function() {
    try {
      await lHooks.listSetup(hookSftp, sftpUrl, localUrl);
      return true;
    } catch (err) {
      console.error(`list setup: ${err.message}`);
      return false;
    }
  });

  after('List test cleanup hook', async function() {
    try {
      await lHooks.listCleanup(hookSftp, sftpUrl);
      return true;
    } catch (err) {
      console.error(`list clenup: ${err.message}`);
      return false;
    }
  });

  it('list return should be a promise', function() {
    return expect(sftp.list(join(sftpUrl, 'mocha-list'))).to.be.a('promise');
  });

  it('list return on empty directory should be empty', function() {
    return expect(sftp.list(join(sftpUrl, 'mocha-list/empty'))).to.become([]);
  });

  it('list non-existent directory rejected', function() {
    return expect(
      sftp.list(join(sftpUrl, 'mocha-list/not-exist'))
    ).to.be.rejectedWith('No such file');
  });

  it('list existing dir returns details of each entry', async function() {
    let list = await sftp.list(join(sftpUrl, 'mocha-list'));

    return expect(list).to.containSubset([
      {type: 'd', name: 'dir1'},
      {type: 'd', name: 'dir2'},
      {type: 'd', name: 'empty'},
      {type: '-', name: 'file1.html', size: 11},
      {type: '-', name: 'file2.md', size: 11},
      {type: '-', name: 'test-file1.txt', size: 6973257},
      {type: '-', name: 'test-file2.txt.gz', size: 570314}
    ]);
  });

  it('list with /.*/ regexp', async function() {
    let list = await sftp.list(join(sftpUrl, 'mocha-list'), /.*/);

    return expect(list).to.containSubset([
      {type: 'd', name: 'dir1'},
      {type: 'd', name: 'dir2'},
      {type: 'd', name: 'empty'},
      {type: '-', name: 'file1.html', size: 11},
      {type: '-', name: 'file2.md', size: 11},
      {type: '-', name: 'test-file1.txt', size: 6973257},
      {type: '-', name: 'test-file2.txt.gz', size: 570314}
    ]);
  });

  it('list with /dir.*/ regexp', async function() {
    let list = await sftp.list(join(sftpUrl, 'mocha-list'), /dir.*/);

    return expect(list).to.containSubset([
      {type: 'd', name: 'dir1'},
      {type: 'd', name: 'dir2'}
    ]);
  });

  it('list with leading /.*txt/ regexp', async function() {
    let list = await sftp.list(join(sftpUrl, 'mocha-list'), /.*txt/);

    return expect(list).to.containSubset([
      {type: '-', name: 'test-file1.txt', size: 6973257},
      {type: '-', name: 'test-file2.txt.gz', size: 570314}
    ]);
  });

  it('list with * pattern', async function() {
    let list = await sftp.list(join(sftpUrl, 'mocha-list'), '*');

    return expect(list).to.containSubset([
      {type: 'd', name: 'dir1'},
      {type: 'd', name: 'dir2'},
      {type: 'd', name: 'empty'},
      {type: '-', name: 'file1.html', size: 11},
      {type: '-', name: 'file2.md', size: 11},
      {type: '-', name: 'test-file1.txt', size: 6973257},
      {type: '-', name: 'test-file2.txt.gz', size: 570314}
    ]);
  });

  it('list with dir* pattern', async function() {
    let list = await sftp.list(join(sftpUrl, 'mocha-list'), 'dir*');

    return expect(list).to.containSubset([
      {type: 'd', name: 'dir1'},
      {type: 'd', name: 'dir2'}
    ]);
  });

  it('list with leading *txt pattern', async function() {
    let list = await sftp.list(join(sftpUrl, 'mocha-list'), '*txt');

    return expect(list).to.containSubset([
      {type: '-', name: 'test-file1.txt', size: 6973257},
      {type: '-', name: 'test-file2.txt.gz', size: 570314}
    ]);
  });
});

describe('auxList testing', function() {
  before('List test setup hook', async function() {
    try {
      await lHooks.listSetup(hookSftp, sftpUrl, localUrl);
      return true;
    } catch (err) {
      console.error(`auxList cleanup: ${err.message}`);
      return false;
    }
  });

  after('List test cleanup hook', async function() {
    try {
      await lHooks.listCleanup(hookSftp, sftpUrl);
      return true;
    } catch (err) {
      console.log(`auxList cleanup: ${err.message}`);
      return false;
    }
  });

  it('auxList with * pattern', async function() {
    let list = await sftp.auxList(join(sftpUrl, 'mocha-list'), '*');

    return expect(list).to.containSubset([
      {type: 'd', name: 'dir1'},
      {type: 'd', name: 'dir2'},
      {type: 'd', name: 'empty'},
      {type: '-', name: 'file1.html', size: 11},
      {type: '-', name: 'file2.md', size: 11},
      {type: '-', name: 'test-file1.txt', size: 6973257},
      {type: '-', name: 'test-file2.txt.gz', size: 570314}
    ]);
  });

  it('auxList with dir* pattern', async function() {
    let list = await sftp.auxList(join(sftpUrl, 'mocha-list'), 'dir*');

    return expect(list).to.containSubset([
      {type: 'd', name: 'dir1'},
      {type: 'd', name: 'dir2'}
    ]);
  });

  it('auxList with leading *txt pattern', async function() {
    let list = await sftp.auxList(join(sftpUrl, 'mocha-list'), '*txt');

    return expect(list).to.containSubset([
      {type: '-', name: 'test-file1.txt', size: 6973257},
      {type: '-', name: 'test-file2.txt.gz', size: 570314}
    ]);
  });
});
