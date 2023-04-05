import net from 'node:net';

import { spawn } from 'child_process';

export const get = (value, path, defaultValue) =>
  String(path).split('.').reduce((acc, v) => {
    try {
      acc = acc[v] ? acc[v] : defaultValue;
    } catch (e) {
      return defaultValue;
    }

    return acc;
  }, value);

export const isPortReachable = (port) => new Promise(resolve => {
  const checker = net.createServer()
    .once('error', () => {
      resolve(false);
    })
    .once('listening', () => checker.once('close', () => resolve(true)).close())
    .listen(port);
});

export const killProcessUsingPort = (port) => new Promise((resolve, reject) => {
  // find the PID of the process using the port
  const findProcess = spawn('netstat', ['-ano', '-p', 'TCP']);

  findProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    const match = lines.find((line) => {
      const cols = line.trim().split(/\s+/);

      return cols[0] === 'TCP' && cols[1].endsWith(`:${port}`);
    });

    if (match) {
      const pid = match.trim().split(/\s+/)[4];
      if (pid) {
        // kill the process with the PID
        const killProcess = spawn('taskkill', ['/pid', pid, '/f', '/t']);
        killProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Failed to kill process with PID ${pid}.`));
          }
        });
      }
    }
  });

  findProcess.on('error', (err) => {
    reject(err);
  });
});
