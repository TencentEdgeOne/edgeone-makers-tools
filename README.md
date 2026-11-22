# EdgeOne Makers

EdgeOne Makers provides Claude with platform-specific guidance for building and deploying web applications, AI agents, and serverless services on Tencent EdgeOne Makers / EdgeOne Pages.

## What the plugin does

The plugin registers one skill, `edgeone-makers-tools`. Its entry point routes Claude to the relevant reference documents instead of loading every guide at once. It covers framework adapters, AI agent development and migration, Cloud Functions, Edge Functions, middleware, KV and Blob storage, project scaffolding, and deployment workflows.

This Claude-only distribution contains Markdown guidance, a plugin manifest, a PNG icon, and the license. It bundles no executable scripts, command hooks, package manifests, or dependency lockfiles. Following the guidance can still involve running external tools or changing cloud resources, so those actions require the user's authorization.

## Installation and use

Install the plugin through the Claude plugin directory when its listing is available. For local development, use a checkout of the `claude-marketplace` branch as the plugin directory:

```text
claude --plugin-dir /absolute/path/to/edgeone-makers-tools
```

Pass the repository root, not its `.claude-plugin` subdirectory. This branch is a standalone plugin and does not contain its own marketplace catalog.

After loading the plugin, ask Claude to help with a specific task, for example:

- Configure a Next.js application for EdgeOne Makers.
- Build a Cloud Function API or an AI agent.
- Store application data using KV or Blob storage.
- Deploy a project to EdgeOne Makers after confirming the target.

The guidance starts at [the skill entry point](skills/edgeone-makers-tools/SKILL.md).

## Setup and authorization

Reading the guides and writing code do not require a CLI installation or cloud authentication. Before running EdgeOne CLI commands, follow the installation instructions published by [EdgeOne Makers](https://pages.edgeone.ai/) and check the [CLI guide](skills/edgeone-makers-tools/references/makers-cli/SKILL.md). These guides require CLI version 1.7.0 or later and verification of the required command capabilities. Obtain consent before installing or upgrading external tools.

Authenticate through the supported tool flow only when the requested operation needs it. Do not read or copy private credential files or expose secrets. Confirm the account, workspace, project, and deployment intent before changing remote resources. MCP integrations are optional, not a prerequisite for using this plugin.

## License and source

This plugin is licensed under the [MIT License](LICENSE). The [main branch](https://github.com/TencentEdgeOne/edgeone-makers-tools/tree/main) contains the multi-platform source and maintenance tools; `claude-marketplace` contains the Claude-only publication files.
