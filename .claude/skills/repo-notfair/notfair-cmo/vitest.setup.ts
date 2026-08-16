import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest 4 disabled globals by default; React Testing Library's auto-cleanup
// hook (which relies on globals like `afterEach`) no longer fires, so two
// tests in the same file end up sharing the same DOM. Run cleanup explicitly.
afterEach(() => {
  cleanup();
});
