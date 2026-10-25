const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');

// Secret bytes travel over stdin, never in command arguments or diagnostics.
function protectWithWindows(value, purpose, decrypt = false) {
  if (process.platform !== 'win32') throw new Error('Remembering API keys requires Windows credential protection.');
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$bytes = [Convert]::FromBase64String($request.data)
$entropy = [Text.Encoding]::UTF8.GetBytes($request.purpose)
if ($request.decrypt) {
  $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
} else {
  $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
}
[Console]::Out.Write([Convert]::ToBase64String($result))`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows secret protection timed out.')); }, 15000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('Windows secret protection could not start.')); });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !output.trim()) return reject(new Error('Windows could not unlock or protect this secret for the current user.'));
      resolve(output.trim());
    });
    child.stdin.end(JSON.stringify({ data: value, purpose, decrypt }));
  });
}

async function encryptLocalSecret(value, purpose = 'localSecret') {
  if (!String(value || '')) throw new Error('No secret value supplied');
  return { v: 2, alg: 'windows-dpapi', purpose, data: await protectWithWindows(Buffer.from(String(value), 'utf8').toString('base64'), purpose), createdAt: new Date().toISOString() };
}

async function decryptLocalSecret(blob, purpose = 'localSecret') {
  if (!blob || blob.purpose !== purpose) throw new Error('Local secret purpose mismatch');
  if (blob.v === 2 && blob.alg === 'windows-dpapi') {
    return Buffer.from(await protectWithWindows(blob.data, purpose, true), 'base64').toString('utf8');
  }
  // Read the old format only to migrate it immediately to DPAPI.
  if (blob.v !== 1 || blob.alg !== 'aes-256-gcm') throw new Error('Unsupported local secret format');
  const material = ['KinForge local API secret v1', os.hostname(), os.userInfo().username, process.env.USERPROFILE || process.env.HOME || ''].join('|');
  const key = crypto.createHash('sha256').update(material).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encryptLocalSecret, decryptLocalSecret };
