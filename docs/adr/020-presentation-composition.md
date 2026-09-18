# ADR 020: Presentation composition through public contracts

Status: accepted for the alpha.19 candidate.

The editor must support separately packaged presentations without exposing layout engines or duplicating musical state. The user authorized this architecture as part of extension development.

Use ordinary React composition. A pure viewport callback reads detached, frozen scroll geometry after engraving and returns bounds and/or scale. It cannot change engraving inputs in the same pass. Explicit host bounds win. Page layout remains authoritative in page view. Existing pointer mapping uses the resulting scale and origin.

Provide an instance-local imperative API ref and reactive control snapshots from the existing editor transport. Hiding the notation surface does not dispose the score owner. Overlays reuse public glyph components and anchored coordinates. A small headless contract/version assertion supplies diagnostics at package integration boundaries.

There is no global extension registry, second score engine, duplicate audio scheduler, or extension lifecycle manager. React owns mounting and cleanup; each extension owns its observers and subscriptions. The core publishes neutral primitives without depending on downstream packages. Compatibility currently pins prerelease package versions; capabilities are not a substitute for testing packed consumers.

Consequences: callers must keep render policies pure, reserve space for custom ink, and test their own composition. Ordinary score state and history survive host resizing. Public contract changes require a core release; alpha.18 remains unchanged.
