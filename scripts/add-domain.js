/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');

const WORKSPACE = '/Users/kelex/.hermes/kanban/workspaces/t_a50ebe3d';

// Read project config
const projectConfig = JSON.parse(fs.readFileSync(WORKSPACE + '/.vercel/project.json', 'utf8'));
const orgId = projectConfig.orgId;
const projectId = projectConfig.projectId;
const projectName = projectConfig.projectName;

console.log('Project:', projectName);
console.log('Project ID:', projectId);
console.log('Org ID:', orgId);

// Try to get the token by calling npx vercel info
console.log('\n--- Verifying CLI access ---');
try {
  const whoami = execSync('npx vercel whoami 2>&1', { encoding: 'utf8', timeout: 10000, cwd: WORKSPACE });
  console.log('whoami:', whoami.trim());
} catch(e) {
  console.error('whoami failed:', e.stderr || e.message);
}

// List existing domains
console.log('\n--- Listing domains ---');
try {
  const domains = execSync('npx vercel domains 2>&1', { encoding: 'utf8', timeout: 10000, cwd: WORKSPACE });
  console.log(domains.trim());
} catch(e) {
  console.error('domains list failed:', e.stderr || e.message);
}

// Check for adroit.io specifically
console.log('\n--- Checking adroit.io ---');
const exists = execSync('npx vercel domain ls 2>&1', { encoding: 'utf8', timeout: 10000, cwd: WORKSPACE });
console.log(exists);
