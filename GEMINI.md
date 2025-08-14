# Gemini Retrospective: KuttyAI v0.2.0

This document outlines the core concepts and architecture of the KuttyAI project based on the available documentation. It includes a brief analysis from the perspective of an AI agent.

## Project Overview

KuttyAI is a command-line interface (CLI) tool built with Node.js and Electron. Its primary purpose is to provide a suite of "agents" for safe and moderated interaction with web content. The project's flagship feature is a secure image gallery that enforces strict content policies before displaying results. The architecture is designed around a security-first model, isolating content rendering from the main orchestration logic.

## Core Architecture

The system is composed of three main parts:

1.  **CLI Orchestrator:** The main entry point for the user. It parses commands and flags, invokes the appropriate agent, and manages the lifecycle of the Electron viewer.
2.  **Agents/Tools:** A collection of specialized modules for handling different tasks:
    *   **Guardian:** Appears to be the core policy engine, checking inputs against a set of rules. It has an extensive set of configuration flags for controlling output.
    *   **Gallery:** A child-safe image search tool that can render results in a secure viewer.
    *   **Policy:** A simple tool for checking text against a list of banned terms.
    *   **PerplexSearch:** A general-purpose search tool.
    *   **Comments Moderator:** A tool for analyzing text content.
    *   **Curator:** Mentioned in the agent list but its function is not detailed in the `README.md`.
3.  **Electron Viewer:** A sandboxed Electron application responsible for rendering content. It operates as a subordinate process and receives its security policy (allowed domains, banned terms) from the CLI orchestrator via IPC. This design is crucial, as it prevents the renderer from making unauthorized network requests or displaying unapproved content.

## Security Model

Security is a central theme. The project implements this through several key mechanisms:

*   **Security Profiles:**
    *   `hardened` (default): A fail-closed profile that enforces maximum security. It uses `dataURI` for images to achieve network isolation, blocks navigation, and disables developer tools.
    *   `dev`: A more permissive profile for local debugging, allowing images to be loaded from remote URLs.
*   **Policy Enforcement:** Content policies are defined in external JSON files (`--domains`, `--banned`) and passed to the relevant tools. The Electron viewer receives and enforces these policies at the main-process level, providing a strong safeguard against renderer-level exploits.
*   **Image Isolation:** The default `dataURI` mode for the gallery is a strong security feature, ensuring that the viewer process never makes direct contact with external image servers.

## Retrospective Analysis & Observations

*   **Strengths:** The architectural separation of the orchestrator and the viewer is a robust design pattern for security. It effectively creates a "choke point" where policies can be enforced before any potentially harmful content reaches the renderer. The use of explicit, file-based policies (`.json` files) makes the ruleset transparent and easy to audit.
*   **Areas for Clarification:**
    *   The role of the `Curator` agent is undefined in the documentation.
    *   The implementation details of the moderation agents (Guardian, Comments Moderator) are not specified. It is unclear whether they use local models, third-party APIs, or simple rule-based systems.
    *   The `Guardian` tool has an exceptionally large number of `--no-*` flags. This suggests a highly detailed but potentially unwieldy configuration system, which might be a candidate for simplification or grouping.
*   **Potential Future Steps:**
    *   Extend the security model to other media types (e.g., video, audio).
    *   Develop a more dynamic or centralized system for managing policies, rather than relying solely on local files.
    *   Provide more detailed documentation on the inner workings of the moderation and analysis agents.
