import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  // Pin the project root so Next doesn't pick up a lockfile from a parent folder.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};
