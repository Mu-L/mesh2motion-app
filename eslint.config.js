import love from 'eslint-config-love'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'public/**']
  },
  {
    ...love,
    files: ['src/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: {
      ...love.languageOptions,
      globals: {
        ...globals.browser
      }
    },
    rules: {
      ...love.rules,

      /* Project naming style. Carried over from the old .eslintrc.json:
         local variables are snake_case here, unlike most TS codebases. */
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['snake_case']
        },
        {
          selector: 'class',
          format: ['PascalCase']
        },
        {
          selector: 'import',
          format: ['PascalCase', 'snake_case']
        },
        {
          selector: 'enumMember',
          format: ['PascalCase']
        }
      ],

      /* Formatting is not enforced here. The old config turned `indent` off and
         used @typescript-eslint/brace-style, which typescript-eslint v8 removed
         when formatting rules moved out to eslint-stylistic. */
      indent: 'off'
    }
  }
]
