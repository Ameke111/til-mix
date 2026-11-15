import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', '.til-data/**', 'node_modules/**'] },
  js.configs.recommended,
  { files: ['app.js', 'account.js'], languageOptions: { globals: globals.browser } },
  { files: ['server.js', '**/*.test.js'], languageOptions: { globals: globals.node } }
];
