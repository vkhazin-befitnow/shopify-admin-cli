#!/usr/bin/env node

import { Command } from 'commander';
import { authValidateCommand } from './commands/auth';
import { themesListCommand, themesPullCommand } from './commands/themes';

const program = new Command();

program
  .name('shopify-admin')
  .description('Comprehensive CLI for Shopify store asset management with GitHub integration')
  .version('1.0.0')
  .addHelpCommand(false);

const authCommand = program
  .command('auth')
  .description('Authentication commands')
  .addHelpCommand(false);

authCommand
  .command('validate')
  .description('Validate Shopify credentials and display store information with scopes')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await authValidateCommand(options.site, options.accessToken);
  });

const themesCommand = program
  .command('themes')
  .description('Theme management commands')
  .addHelpCommand(false);

themesCommand
  .command('list')
  .description('List all themes in the store')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await themesListCommand(options);
  });

themesCommand
  .command('pull')
  .description('Download a theme to local directory')
  .requiredOption('--theme-name <name>', 'Theme name to download (e.g., "Dawn", "Horizon")')
  .requiredOption('--output <path>', 'Output directory path')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await themesPullCommand({
      themeName: options.themeName,
      output: options.output,
      site: options.site,
      accessToken: options.accessToken
    });
  });

// Show help by default if no command provided
if (!process.argv.slice(2).length) {
  program.help();
} else {
  program.parse();
}
