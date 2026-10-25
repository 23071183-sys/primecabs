import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest doesn't use globals here, so Testing Library can't clean up between tests by itself.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
