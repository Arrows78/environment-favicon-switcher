/* global globalThis */
globalThis.DEFAULT_SETTINGS = {
  enabled: true,
  titlePrefixEnabled: false,
  reapplyOnChanges: true,
  debug: false,
  rules: [
    {
      id: "skello-local",
      enabled: true,
      name: "Skello Local",
      label: "LOCAL",
      color: "#0ea5e9",
      matchType: "contains",
      patterns: ["localhost", "127.0.0.1"],
      favicon: "icons/favicon-local.ico",
      keepOriginalFavicon: false
    },
    {
      id: "skello-review",
      enabled: true,
      name: "Skello Review App",
      label: "REVIEW",
      color: "#8b5cf6",
      matchType: "contains",
      patterns: ["reviewapps.skello.io"],
      favicon: "icons/favicon-review.ico",
      keepOriginalFavicon: false
    },
    {
      id: "skello-sandbox",
      enabled: true,
      name: "Skello Sandbox",
      label: "SANDBOX",
      color: "#f97316",
      matchType: "contains",
      patterns: ["sandbox.skello.io"],
      favicon: "icons/favicon-sandbox.ico",
      keepOriginalFavicon: false
    },
    {
      id: "skello-staging",
      enabled: true,
      name: "Skello Staging",
      label: "STAGING",
      color: "#22c55e",
      matchType: "contains",
      patterns: ["staging.skello.io"],
      favicon: "icons/favicon-staging.ico",
      keepOriginalFavicon: false
    },
    {
      id: "skello-production",
      enabled: true,
      name: "Skello Production",
      label: "PROD",
      color: "#111827",
      matchType: "contains",
      patterns: ["app.skello.io", "www.skello.io"],
      favicon: "",
      keepOriginalFavicon: true
    },
    {
      id: "raul-scratch-lightning",
      enabled: true,
      name: "Raul Scratch Lightning",
      label: "SCRATCH",
      color: "#06b6d4",
      matchType: "contains",
      patterns: ["scratch.lightning.force.com"],
      favicon: "icons/raul-sandbox.ico",
      keepOriginalFavicon: false
    },
    {
      id: "raul-uat",
      enabled: true,
      name: "Raul UAT",
      label: "UAT",
      color: "#a855f7",
      matchType: "contains",
      patterns: ["uat.sandbox.lightning.force.com", "uat.sandbox.my.salesforce.com"],
      favicon: "icons/raul-uat.ico",
      keepOriginalFavicon: false
    },
    {
      id: "raul-sandbox",
      enabled: true,
      name: "Raul Sandbox",
      label: "SANDBOX",
      color: "#f59e0b",
      matchType: "contains",
      patterns: ["sandbox.lightning.force.com", "sandbox.my.salesforce.com"],
      favicon: "icons/raul-sandbox.ico",
      keepOriginalFavicon: false
    },
    {
      id: "raul-production",
      enabled: true,
      name: "Raul Production",
      label: "PROD",
      color: "#111827",
      matchType: "contains",
      patterns: ["raul.lightning.force.com", "raul.my.salesforce.com"],
      favicon: "icons/raul.ico",
      keepOriginalFavicon: false
    }
  ]
};
