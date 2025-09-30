#!/usr/bin/env node

import { Command } from 'commander';
import { authValidateCommand } from './commands/auth';
import { themesPullCommand, themesPushCommand } from './commands/themes';
import { pagesPullCommand, pagesPushCommand } from './commands/pages';

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
  .command('pull')
  .description('Download a theme to local directory')
  .option('--name <name>', 'Theme name to download (e.g., "Dawn", "Horizon")')
  .option('--published', 'Pull the published (main) theme instead of specifying by name')
  .requiredOption('--output <path>', 'Output directory path')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete local files not present remotely (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    if (!options.published && !options.name) {
      console.error('Error: Either --name or --published flag must be provided');
      process.exit(1);
    }
    await themesPullCommand({
      themeName: options.name,
      output: options.output,
      dryRun: options.dryRun || false,
      mirror: options.mirror || false,
      published: options.published || false,
      site: options.site,
      accessToken: options.accessToken
    });
  });

themesCommand
  .command('push')
  .description('Upload local theme files to store')
  .option('--name <name>', 'Theme name to upload to (e.g., "Dawn", "Horizon")')
  .option('--published', 'Push to the published (main) theme instead of specifying by name')
  .requiredOption('--input <path>', 'Input directory path containing theme files')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete remote files not present locally (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    if (!options.published && !options.name) {
      console.error('Error: Either --name or --published flag must be provided');
      process.exit(1);
    }
    await themesPushCommand({
      themeName: options.name,
      input: options.input,
      dryRun: options.dryRun || false,
      mirror: options.mirror || false,
      published: options.published || false,
      site: options.site,
      accessToken: options.accessToken
    });
  });

const pagesCommand = program
  .command('pages')
  .description('Page management commands')
  .addHelpCommand(false);

pagesCommand
  .command('pull')
  .description('Download pages to local directory')
  .requiredOption('--output <path>', 'Output directory path')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete local files not present remotely (destructive)')
  .option('--max-pages <number>', 'Maximum number of pages to pull (for testing)', (value) => parseInt(value, 10))
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await pagesPullCommand({
      output: options.output,
      dryRun: options.dryRun || false,
      mirror: options.mirror || false,
      maxPages: options.maxPages,
      site: options.site,
      accessToken: options.accessToken
    });
  });

pagesCommand
  .command('push')
  .description('Upload local page files to store')
  .requiredOption('--input <path>', 'Input directory path containing page files')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete remote pages not present locally (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await pagesPushCommand({
      input: options.input,
      dryRun: options.dryRun || false,
      mirror: options.mirror || false,
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
