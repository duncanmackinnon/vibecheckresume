import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
export default [
  ...nextVitals,...nextTypescript,
  {ignores:['.next/**','out/**','coverage/**','node_modules/**','next-env.d.ts','src/app/.well-known/workflow/**']},
  {files:['**/*.cjs','src/test/setupTests.ts'], rules:{'@typescript-eslint/no-require-imports':'off'}},
  {rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrors:'none'}], 'react-hooks/set-state-in-effect':'off','react-hooks/purity':'off','react-hooks/refs':'off','react-hooks/immutability':'off','react-hooks/preserve-manual-memoization':'off'}},
];
