#!/usr/bin/env node
// Register TypeScript once, then use the same entry and error handling as npm run blog.
import { register } from 'tsx/esm/api';

register();
const { runCli } = await import('../tools/blog-cli/index.ts');
await runCli();
