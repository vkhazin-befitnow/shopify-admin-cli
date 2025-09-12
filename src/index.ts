#!/usr/bin/env node

import { Command } from 'commander';
import { helpCommand } from './commands/help';
import { authLoginCommand } from './commands/auth';

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
  .command('login')
  .description('Authenticate with Shopify using OAuth 2.0')
  .action(() => {
    authLoginCommand();
  });

// Show help by default if no command provided
if (!process.argv.slice(2).length) {
  helpCommand();
} else {
  program.parse();
}
