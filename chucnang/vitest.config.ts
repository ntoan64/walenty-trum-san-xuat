import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // test tổng hợp gọi MongoDB Atlas (database *_test) nên cần thời gian dài hơn, chạy tuần tự
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
