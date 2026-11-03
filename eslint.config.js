// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['www/', 'dist/', 'android/', 'ios/', 'scripts/', 'cordova-plugin-inappbrowser/', '**/*.d.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Custom globals for this project
        cordova: 'readonly',
        InAppBrowser: 'readonly',
        // Injected context globals
        window: 'readonly',
        document: 'readonly',
        history: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
      },
    },
    rules: {
      // Relax rules for this "hacky" wrapper project
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off', // TypeScript handles this usually
    },
  }
);
