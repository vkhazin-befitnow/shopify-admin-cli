#!/usr/bin/env node

import { Command } from 'commander';
import { helpCommand } from './commands/help';
import { authValidateCommand } from './commands/auth';

const program = new Command();

program
  .name('shopify-admin')
  .description('Comprehensive CLI for Shopify store asset management with GitHub integration')
  .version('1.0.0');

program
  .command('help')
  .description('Display help information')
  .action(() => {
    helpCommand();
  });

const authCommand = program
  .command('auth')
  .description('Authentication commands');

authCommand
  .command('validate')
  .description('Validate Shopify credentials and display store information with scopes')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await authValidateCommand(options);
  });

// Show help by default if no command provided
if (!process.argv.slice(2).length) {
  helpCommand();
} else {
  program.parse();
}
