// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // ignoreRestSiblings allows the `const { passwordHash, ...safe } = user`
      // omit pattern, which is how sensitive fields are stripped before a
      // response. Without it the rule fights a security practice.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
);
