// lets the node test runner load the halo's extensionless TypeScript imports: NODE_OPTIONS="--import file:///.../test/register.mjs" node --test test/*.test.ts
import { register } from 'node:module'
register('./hook.mjs', import.meta.url)
