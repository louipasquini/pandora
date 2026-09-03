// @ts-check
import { join } from 'node:path';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';

const here = import.meta.dirname;

/**
 * Bounded contexts de domínio (Princípio VI da constituição). Um contexto NÃO pode
 * importar de outro contexto — só de `core`. `api` e `admin` são módulos de borda
 * que compõem os demais, então ficam fora da restrição.
 */
const DOMAIN_CONTEXTS = [
  'ingestao',
  'financeiro',
  'catalogo',
  'contratos',
  'clientes',
  'crm',
  'marketing',
  'central',
];

/** Zonas de import proibido: para cada contexto, barra os outros contextos. */
const noCrossContextZones = DOMAIN_CONTEXTS.map((target) => ({
  target: join(here, 'src', target),
  from: DOMAIN_CONTEXTS.filter((c) => c !== target).map((c) => join(here, 'src', c)),
  message:
    'Contexto não pode importar de outro contexto (Princípio VI). Use `core`, um contrato explícito, ou eventos.',
}));

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts'],
    plugins: { import: importPlugin },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: here,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { project: join(here, 'tsconfig.json') },
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'import/no-restricted-paths': ['error', { zones: noCrossContextZones }],
    },
  },
  {
    // Fronteira de configuração (Padrão Transversal "config/segredos", spec 002).
    // `process.env` só é lido pelo contrato tipado do `core` e pelo bootstrap.
    files: ['src/**/*.ts'],
    ignores: ['src/config/**', 'src/core/**', 'src/main.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Leia config pelo contrato tipado do `core` (AppConfig / ConfigService), não `process.env`.',
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
