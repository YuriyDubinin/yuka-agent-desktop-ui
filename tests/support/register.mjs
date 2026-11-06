// Lets `node --test` run the TypeScript sources directly: Node strips the types itself, and
// this hook resolves extensionless relative imports ("./schema") to their .ts files.
import { register } from 'node:module';

register('./resolve-ts.mjs', import.meta.url);
