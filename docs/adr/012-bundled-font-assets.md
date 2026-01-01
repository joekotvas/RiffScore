# 12. Bundled Font Assets

Date: 2026-01-01

## Status

Accepted

## Context

RiffScore relies on the Bravura SMuFL font for music notation rendering.
*   Previously, the font was not bundled, requiring consumers to manually host the font file and define a `@font-face` rule.
*   This violated the "plug-and-play" goal: a user could install the library but see broken glyphs (boxes or tofu) until they successfully configured the font.
*   Music notation software without a correct music font is functionally useless.

## Decision

We will **bundle the Bravura font asset** (WOFF2) directly with the library distribution.

### 1. Zero-Config Principle
The library must render authentic music notation "out of the box" with zero additional configuration from the consumer. Authentication of the visual output takes precedence over bundle size.

### 2. Asset Co-location
The font file (`Bravura.woff2`) will be copied to `dist/fonts/` during the build process.

### 3. Integrated CSS
The bundled CSS (`dist/index.css`) will include a `@font-face` declaration with a relative URL pointing to the co-located font file:

```css
@font-face {
  font-family: 'Bravura';
  src: url('./fonts/Bravura.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

### 4. Overridability
Advanced users who wish to serve the font from a CDN or use a different compatible font can still override the `@font-face` definition in their own CSS, relying on the CSS cascade (provided their CSS is loaded after the library's).

## Consequences

### Positive
*   **Developer Experience**: Consumers install the package, import the CSS, and it works immediately.
*   **Reliability**: The library is self-contained and does not depend on external CDNs or brittle relative path configurations by the user.
*   **Consistency**: All instances of RiffScore use the tested version of Bravura.

### Negative
*   **Package Size**: The package size increases by approximately ~240KB (size of `Bravura.woff2`). However, this is acceptable for a specialized visualization library where the font is a core dependency.

## Alternatives Considered

*   **CDN Reference**: Defaulting to a public CDN. Rejected due to privacy concerns, offline limitations, and potential "link rot."
*   **Inline Base64**: Inlining the font as a base64 string in CSS. Rejected because it bloats the CSS parse time and prevents the browser from caching the font file separately from the stylesheet.
