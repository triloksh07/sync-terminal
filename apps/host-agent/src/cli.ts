#!/usr/bin/env node
import { Command } from 'commander';
import { LocalBridge } from './local-bridge';

const program = new Command();

program
  .name('syncpty')
  .description('SyncPTY - realtime terminal sharing system')
  .version('0.1.0');

program
  .command('local-bridge')
  .description('Test local PTY bridge (Phase 1 demo)')
  .action(async () => {
    const bridge = new LocalBridge();
    try {
      await bridge.start();
    } catch (error) {
      console.error('Failed to start local bridge:', error);
      process.exit(1);
    }
  });

program.parse();
