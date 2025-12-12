[← Back to README](../README.md)

# Contributing to RiffScore

Thank you for your interest in contributing to RiffScore!

## Getting Started

1.  **Fork and Clone**: Fork the repo and clone it locally.
2.  **Install Dependencies**:
    ```bash
    npm install
    cd demo && npm install
    ```
3.  **Run Development Environment**:
    ```bash
    npm run demo:dev
    ```
    This starts the Next.js demo app which consumes the library code.

## Documentation

-   [**Configuration Guide**](./CONFIGURATION.md): Complete API reference for config options.
-   [**Architecture Guide**](./ARCHITECTURE.md): Technical reference for developers.
-   [**Interaction Design**](./INTERACTION.md): Guide to the intuitive editing behavior.

## Development Workflow

-   **Library Code**: Located in `src/`. This is the core component library.
-   **Demo App**: Located in `demo/`. Used for testing and verifying changes.

## Branching

-   `main`: Stable releases.
-   `develop`: Integration branch (if applicable).
-   `feature/*`: New features.
-   `fix/*`: Bug fixes.

## Release Process

We follow [Semantic Versioning](https://semver.org/).
-   **Alpha**: `1.0.0-alpha.x`
-   **Release**: `1.0.0`
