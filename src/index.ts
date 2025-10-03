#!/usr/bin/env node

import { Command } from 'commander';
import { authValidateCommand } from './commands/auth';
import { themesPullCommand, themesPushCommand } from './commands/themes';
import { filesPullCommand, filesPushCommand } from './commands/files';
import { pagesPullCommand, pagesPushCommand } from './commands/pages';
import { CLI_VERSION } from './settings';
import { Logger } from './utils/logger';

const program = new Command();

program
  .name('shopify-admin')
  .description('Comprehensive CLI for Shopify store asset management with GitHub integration')
  .version(CLI_VERSION)
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
  .option('--published', 'Pull the published/main theme')
  .requiredOption('--output <path>', 'Output directory path')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete local files not present remotely (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    if (!options.name && !options.published) {
      Logger.error('Either --name or --published flag is required');
      process.exit(1);
    }
    if (options.name && options.published) {
      Logger.error('Cannot use both --name and --published flags together');
      process.exit(1);
    }
    await themesPullCommand({
      themeName: options.name || undefined,
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
  .option('--published', 'Push to the published/main theme')
  .requiredOption('--input <path>', 'Input directory path containing theme files')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete remote files not present locally (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    if (!options.name && !options.published) {
      Logger.error('Either --name or --published flag is required');
      process.exit(1);
    }
    if (options.name && options.published) {
      Logger.error('Cannot use both --name and --published flags together');
      process.exit(1);
    }
    await themesPushCommand({
      themeName: options.name || undefined,
      input: options.input,
      dryRun: options.dryRun || false,
      mirror: options.mirror || false,
      published: options.published || false,
      site: options.site,
      accessToken: options.accessToken
    });
  });

const filesCommand = program
  .command('files')
  .description('File management commands')
  .addHelpCommand(false);

filesCommand
  .command('pull')
  .description('Download files from Shopify store')
  .requiredOption('--output <path>', 'Output directory path')
  .option('--max-files <number>', 'Maximum number of files to download (for testing)', parseInt)
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete local files not present remotely (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await filesPullCommand(options);
  });

filesCommand
  .command('push')
  .description('Upload local files to Shopify store')
  .requiredOption('--input <path>', 'Input directory path containing files')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete remote files not present locally (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await filesPushCommand(options);
  });

const pagesCommand = program
  .command('pages')
  .description('Page management commands')
  .addHelpCommand(false);

pagesCommand
  .command('pull')
  .description('Download pages from Shopify store')
  .requiredOption('--output <path>', 'Output directory path')
  .option('--max-pages <number>', 'Maximum number of pages to download (for testing)', parseInt)
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete local files not present remotely (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await pagesPullCommand(options);
  });

pagesCommand
  .command('push')
  .description('Upload local pages to Shopify store')
  .requiredOption('--input <path>', 'Input directory path containing page files')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete remote pages not present locally (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    await pagesPushCommand(options);
  });

program
  .command('pull')
  .description('Pull all or specified components from Shopify store')
  .requiredOption('--output <path>', 'Output directory path')
  .option('--components <list>', 'Comma-separated list of components to pull (theme,files,pages)', 'theme,files,pages')
  .option('--theme-name <name>', 'Theme name to pull (if not specified, pulls published theme)')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete local files not present remotely (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    const components = options.components.split(',').map((c: string) => c.trim().toLowerCase());
    const validComponents = ['theme', 'files', 'pages'];
    const invalid = components.filter((c: string) => !validComponents.includes(c));

    if (invalid.length > 0) {
      Logger.error(`Invalid components: ${invalid.join(', ')}`);
      Logger.error(`Valid components are: ${validComponents.join(', ')}`);
      process.exit(1);
    }

    Logger.info(`Pulling components: ${components.join(', ')}`);

    for (const component of components) {
      Logger.info(`\n${'='.repeat(80)}`);
      Logger.info(`Pulling ${component}...`);
      Logger.info('='.repeat(80));

      try {
        if (component === 'theme') {
          await themesPullCommand({
            themeName: options.themeName || undefined,
            output: options.output,
            dryRun: options.dryRun || false,
            mirror: options.mirror || false,
            published: !options.themeName,
            site: options.site,
            accessToken: options.accessToken
          });
        } else if (component === 'files') {
          await filesPullCommand({
            output: options.output,
            dryRun: options.dryRun || false,
            mirror: options.mirror || false,
            site: options.site,
            accessToken: options.accessToken
          });
        } else if (component === 'pages') {
          await pagesPullCommand({
            output: options.output,
            dryRun: options.dryRun || false,
            mirror: options.mirror || false,
            site: options.site,
            accessToken: options.accessToken
          });
        }
        Logger.success(`${component} pull completed`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`${component} pull failed: ${message}`);
        process.exit(1);
      }
    }

    Logger.info(`\n${'='.repeat(80)}`);
    Logger.success('All components pulled successfully');
    Logger.info('='.repeat(80));
  });

program
  .command('push')
  .description('Push all or specified components to Shopify store')
  .requiredOption('--input <path>', 'Input directory path')
  .option('--components <list>', 'Comma-separated list of components to push (theme,files,pages)', 'theme,files,pages')
  .option('--theme-name <name>', 'Theme name to upload to (required if pushing theme)')
  .option('--dry-run', 'Show what would be changed without making actual changes')
  .option('--mirror', 'Mirror mode: delete remote files not present locally (destructive)')
  .option('--site <shop>', 'Shopify store domain (e.g., mystore.myshopify.com)')
  .option('--access-token <token>', 'Admin API access token (starts with shpat_)')
  .action(async (options) => {
    const components = options.components.split(',').map((c: string) => c.trim().toLowerCase());
    const validComponents = ['theme', 'files', 'pages'];
    const invalid = components.filter((c: string) => !validComponents.includes(c));

    if (invalid.length > 0) {
      Logger.error(`Invalid components: ${invalid.join(', ')}`);
      Logger.error(`Valid components are: ${validComponents.join(', ')}`);
      process.exit(1);
    }

    Logger.info(`Pushing components: ${components.join(', ')}`);

    for (const component of components) {
      Logger.info(`\n${'='.repeat(80)}`);
      Logger.info(`Pushing ${component}...`);
      Logger.info('='.repeat(80));

      try {
        if (component === 'theme') {
          if (!options.themeName) {
            Logger.error('--theme-name is required when pushing theme component');
            process.exit(1);
          }
          await themesPushCommand({
            themeName: options.themeName,
            input: options.input,
            dryRun: options.dryRun || false,
            mirror: options.mirror || false,
            site: options.site,
            accessToken: options.accessToken
          });
        } else if (component === 'files') {
          await filesPushCommand({
            input: options.input,
            dryRun: options.dryRun || false,
            mirror: options.mirror || false,
            site: options.site,
            accessToken: options.accessToken
          });
        } else if (component === 'pages') {
          await pagesPushCommand({
            input: options.input,
            dryRun: options.dryRun || false,
            mirror: options.mirror || false,
            site: options.site,
            accessToken: options.accessToken
          });
        }
        Logger.success(`${component} push completed`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`${component} push failed: ${message}`);
        process.exit(1);
      }
    }

    Logger.info(`\n${'='.repeat(80)}`);
    Logger.success('All components pushed successfully');
    Logger.info('='.repeat(80));
  });

// Show help by default if no command provided
if (!process.argv.slice(2).length) {
  program.help();
} else {
  program.parse();
}
