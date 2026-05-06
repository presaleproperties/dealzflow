import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Phase 4 — funnel all email/SMS composer & thread imports through
      // the unified barrel. Legacy paths still work via the re-exports in
      // `@/components/crm/unified` (LegacyComposeEmailDialog, etc.).
      "no-restricted-imports": ["warn", {
        paths: [
          { name: "@/components/crm/leads/ComposeEmailDialog",          message: "Import from '@/components/crm/unified' instead (LegacyComposeEmailDialog or UnifiedComposerDialog)." },
          { name: "@/components/crm/leads/SendProjectDialog",           message: "Import LegacySendProjectDialog from '@/components/crm/unified'." },
          { name: "@/components/crm/leads/SendTextDialog",              message: "Import LegacySendTextDialog from '@/components/crm/unified'." },
          { name: "@/components/crm/leads/BulkSendTextDialog",          message: "Import LegacyBulkSendTextDialog from '@/components/crm/unified'." },
          { name: "@/components/crm/leads/LeadEmailThreadDialog",       message: "Import LegacyLeadEmailThreadDialog or UnifiedEmailThreadDialog from '@/components/crm/unified'." },
          { name: "@/components/crm/marketing/PresaleQuickSendDialog",  message: "Import LegacyPresaleQuickSendDialog from '@/components/crm/unified'." },
        ],
      }],
    },
  },
  // The unified barrel itself is allowed to import the legacy paths so it
  // can re-export them.
  {
    files: ["src/components/crm/unified/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
);
