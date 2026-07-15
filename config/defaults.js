/* global globalThis */
globalThis.DEFAULT_SETTINGS = {
  schemaVersion: 2,
  enabled: true,
  titlePrefixEnabled: false,
  reapplyOnChanges: true,
  debug: false,
  groups: [
    { id: "default", name: "Default", color: "#64748B" }
  ],
  rules: [
    {
      groupId: "default",
      id: "local",
      priority: 100,
      enabled: true,
      name: "Local",
      label: "LOC",
      color: "#FFD600",
      matchType: "contains",
      patterns: ["localhost", "127.0.0.1"],
      excludePatterns: [],
      favicon: "icons/favicon-local.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "review",
      priority: 80,
      enabled: true,
      name: "Review App",
      label: "REV",
      color: "#00C853",
      matchType: "contains",
      patterns: ["review.", "reviewapp"],
      excludePatterns: [],
      favicon: "icons/favicon-review.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "sandbox",
      priority: 60,
      enabled: true,
      name: "Sandbox",
      label: "SBX",
      color: "#7B00FF",
      matchType: "contains",
      patterns: ["sandbox.", "integration."],
      excludePatterns: [],
      favicon: "icons/favicon-sandbox.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "staging",
      priority: 50,
      enabled: true,
      name: "Staging",
      label: "STG",
      color: "#FF1744",
      matchType: "contains",
      patterns: ["staging.", "uat."],
      excludePatterns: [],
      favicon: "icons/favicon-staging.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "production",
      priority: 10,
      enabled: true,
      name: "Production",
      label: "PROD",
      color: "#2979FF",
      matchType: "hostname",
      patterns: ["myapp.com"],
      excludePatterns: [],
      favicon: "",
      keepOriginalFavicon: true
    }
  ]
};
