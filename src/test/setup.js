import { copyFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
const setupTestEnv = async (tempDir = null) => {
  if (tempDir === null){
    tempDir = tmpdir();
  }

  const sourceDir = join(__dirname, '__mocks__');

  // Copy files in mock folder to temporary directory
  // loop through files in mock folder
  const files = readdirSync(sourceDir);

  for (const file of files) {
    const source = join(sourceDir, file);
    const dest = join(tempDir, file);
    copyFileSync(source, dest);
  }
};

beforeAll(async () => {

  console.log('beforeAll');
  await setupTestEnv();
});
