import { spawn } from 'node:child_process';

const commands = [
  ['server', 'node', ['server/index.js']],
  ['client', 'vite', ['--host', '127.0.0.1']]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
});

function stopChildren() {
  children.forEach((child) => child.kill());
}

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);
