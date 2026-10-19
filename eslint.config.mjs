import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      ".plasmo/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "src/routeTree.gen.ts"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error"
    }
  },
  {
    files: [
      ".agents/skills/web-compose-capabilities/templates/compositions/purchase-checkout/source-reference/*.js"
    ],
    languageOptions: {
      sourceType: "script",
      globals: {
        document: "readonly",
        window: "readonly",
        location: "readonly",
        setTimeout: "readonly",
        icon: "readonly",
        button: "readonly",
        announce: "readonly",
        badge: "readonly",
        facts: "readonly",
        notice: "readonly",
        product: "readonly",
        quoteAmount: "readonly",
        walletProblem: "readonly",
        validQuote: "readonly",
        canCreate: "readonly",
        pageHeading: "readonly",
        controls: "readonly",
        categories: "readonly",
        catalogProducts: "readonly",
        walletSelection: "readonly",
        catalogPage: "readonly",
        ordersSurface: "readonly",
        checkoutSummary: "readonly",
        purchaseSelection: "readonly",
        checkoutPage: "readonly",
        task: "readonly",
        setProduct: "readonly",
        switchOrg: "readonly",
        newOrder: "readonly",
        confirmPaid: "readonly",
        createOrder: "readonly",
        goto: "readonly",
        variant: "readonly",
        dict: "readonly",
        s: "readonly",
        products: "readonly",
        orgs: "readonly",
        records: "readonly",
        $: "readonly",
        t: "readonly",
        esc: "readonly",
        name: "readonly",
        money: "readonly",
        sleep: "readonly",
        db: "readonly",
        orderDialogContent: "readonly",
        renderDialog: "readonly",
        render: "readonly",
        dialogKind: "writable",
        returnFocus: "writable",
        returnAction: "writable",
        returnId: "writable",
        openDialog: "readonly",
        closeDialog: "readonly",
        filterForm: "readonly",
        pagination: "readonly",
        ordersPage: "readonly",
        walletPage: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "error",
      "no-redeclare": ["error", { builtinGlobals: false }]
    }
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-console": "error"
    }
  },
  {
    files: ["src/observability/logger.ts", "src/observability/AppErrorBoundary.test.tsx"],
    rules: {
      "no-console": "off"
    }
  }
)
