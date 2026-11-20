import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', '.til-data/**', 'node_modules/**'] },
  js.configs.recommended,
  { files: ['app.js', 'account.js', 'studio-ui.js', 'admin-ui.js', 'activity-ui.js', 'companion-ui.js', 'listening-ui.js', 'speaking-ui.js', 'speaking-engine.js', 'assistant-ui.js'], languageOptions: { globals: globals.browser } },
  { files: ['server.js', 'assistant-model.js', 'ai-local.js', 'database.js', 'admin.js', 'build.js', 'demo.js', '**/*.test.js'], languageOptions: { globals: globals.node } }
];
