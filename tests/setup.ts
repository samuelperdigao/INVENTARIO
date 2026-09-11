import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

import { db } from "@/lib/db";

afterEach(async () => {
  cleanup();
  await db.delete();
  await db.open();
});

