import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import pluginSecurity from "eslint-plugin-security";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/", "vite.config.js", "eslint.config.mjs", ".prettierrc.js"]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  pluginSecurity.configs.recommended,
  eslintConfigPrettier,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "no-console": 0,
      "no-debugger": "error",
      "no-else-return": "error",
      "prettier/prettier": "error",
      "react/prop-types": "off"
    }
  }
);
