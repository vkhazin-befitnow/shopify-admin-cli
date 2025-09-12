#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('shopify-admin')
  .description('Comprehensive CLI for Shopify store asset management with GitHub integration')
  .version('1.0.0');

program
  .command('auth')
  .description('Authenticate with Shopify using OAuth 2.0')
  .action(() => {
    console.log('🔐 Authentication command - Coming soon');
    console.log('This will open browser for Shopify OAuth login');
  });

program
  .command('stores')
  .description('List all accessible Shopify stores')
  .action(() => {
    console.log('🏪 Stores command - Coming soon');
    console.log('This will list all stores you have access to');
  });

program
  .command('pull')
  .description('Pull assets from Shopify store')
  .option('--store <store-id>', 'Store ID to pull from')
  .option('--output-dir <path>', 'Output directory for assets', './shopify-assets')
  .option('--exclude <types>', 'Asset types to exclude (comma-separated)')
  .action((options) => {
    console.log('⬇️  Pull command - Coming soon');
    console.log('Options:', options);
    console.log('This will download store assets with selective filtering');
  });

program
  .command('push')
  .description('Push assets to Shopify store')
  .option('--store <store-id>', 'Store ID to push to')
  .option('--source-dir <path>', 'Source directory for assets', './shopify-assets')
  .option('--assets <types>', 'Asset types to push (comma-separated)')
  .action((options) => {
    console.log('⬆️  Push command - Coming soon');
    console.log('Options:', options);
    console.log('This will upload assets to target store');
  });

program
  .command('help [command]')
  .description('Display help information')
  .action((command) => {
    if (command) {
      program.commands.find(cmd => cmd.name() === command)?.help();
    } else {
      program.help();
    }
  });

// Show help by default if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse();
