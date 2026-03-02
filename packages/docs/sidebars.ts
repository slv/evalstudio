import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: ["getting-started/installation", "getting-started/quick-start", "getting-started/deployment"],
    },
    {
      type: "category",
      label: "Guides",
      items: ["guides/langgraph-setup"],
    },
    {
      type: "html",
      value: "<hr />",
      defaultStyle: true,
    },
    {
      type: "category",
      label: "Core Library",
      items: [
        "core/status",
        "core/projects",
        "core/personas",
        "core/scenarios",
        "core/evals",
        "core/runs",
        "core/prompt",
        "core/llm-providers",
        "core/connectors",
      ],
    },
    {
      type: "category",
      label: "CLI Reference",
      items: [
        "cli/status",
        "cli/project",
        "cli/persona",
        "cli/scenario",
        "cli/eval",
        "cli/llm-provider",
        "cli/connector",
        "cli/serve",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      items: [
        "api/status",
        "api/projects",
        "api/personas",
        "api/scenarios",
        "api/evals",
        "api/runs",
        "api/llm-providers",
        "api/connectors",
      ],
    },
    {
      type: "category",
      label: "Web Dashboard",
      items: ["web/getting-started"],
    },
  ],
};

export default sidebars;
