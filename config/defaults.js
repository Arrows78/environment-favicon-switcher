/* global globalThis */
globalThis.DEFAULT_SETTINGS = {
  enabled: true,
  titlePrefixEnabled: false,
  reapplyOnChanges: true,
  debug: false,
  groups: [
    { id: "default", name: "Default", color: "#64748B" },
  ],
  rules: [
    {
      groupId: "default",
      id: "local",
      enabled: true,
      name: "Local",
      label: "LOC",
      color: "#FFD600",
      matchType: "contains",
      patterns: ["localhost", "127.0.0.1"],
      favicon: "icons/favicon-local.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "review",
      enabled: true,
      name: "Review App",
      label: "REV",
      color: "#00C853",
      matchType: "contains",
      patterns: ["review.", "reviewapp"],
      favicon: "icons/favicon-review.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "sandbox",
      enabled: true,
      name: "Sandbox",
      label: "SBX",
      color: "#7B00FF",
      matchType: "contains",
      patterns: ["sandbox.", "integration."],
      favicon: "icons/favicon-sandbox.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "staging",
      enabled: true,
      name: "Staging",
      label: "STG",
      color: "#FF1744",
      matchType: "contains",
      patterns: ["staging.", "uat."],
      favicon: "icons/favicon-staging.png",
      keepOriginalFavicon: false
    },
    {
      groupId: "default",
      id: "production",
      enabled: true,
      name: "Production",
      label: "PROD",
      color: "#2979FF",
      matchType: "hostname",
      patterns: ["myapp.com"],
      favicon: "",
      keepOriginalFavicon: true
    }
  ]
};
