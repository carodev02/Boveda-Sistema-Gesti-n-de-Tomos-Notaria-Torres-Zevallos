import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['**/node_modules/**','**/dist/**','.tsbuild/**','src-tauri/target/**','src-tauri/gen/**','src-tauri/vision/runtime/**','src-tauri/vision/.venv/**','backend/storage/**','backend/logs/**','backend/import-reports/**','ENTREGA-OTRA-PC/**','tmp/**','outputs/**']},{extends:[js.configs.recommended,...tseslint.configs.recommended],files:['**/*.{ts,tsx}'],languageOptions:{ecmaVersion:2020,globals:globals.browser},plugins:{'react-hooks':reactHooks,'react-refresh':reactRefresh},rules:{...reactHooks.configs.recommended.rules,'no-irregular-whitespace':'off','react-refresh/only-export-components':['warn',{allowConstantExport:true}]}});
