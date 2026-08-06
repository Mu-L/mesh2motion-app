import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'public/**']
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  /* Browser source. PROCESS_ENV is injected at build time by the `define`
     block in vite.config.js, so it exists at runtime but not in any lib. */
  {
    files: ['src/**/*.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        PROCESS_ENV: 'readonly'
      }
    }
  },

  /* Cloudflare Worker — runs in the workerd runtime, not the browser */
  {
    files: ['src/survey-worker.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.worker }
    }
  },

  /* Build and test config files run in Node */
  {
    files: ['*.config.js', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.node }
    }
  }
]
