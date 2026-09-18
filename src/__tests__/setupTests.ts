/**
 * Jest Setup File
 *
 * Global test configuration and imports.
 * This file runs before each test file.
 */

// Extend Jest matchers with DOM-specific assertions
import '@testing-library/jest-dom';

// jsdom does not implement the browser scrolling API used by the playback cursor.
Element.prototype.scrollTo = jest.fn();
