import { describe, expect, it } from "bun:test";
import { isDeadlinePassed } from "./deadline";

/**
 * isDeadlinePassed(deadline: string | null): boolean
 *
 * 回答締め切り機能のコアロジック。
 * - deadline が null の場合は締め切りなしとみなす
 * - deadline は ISO datetime 形式の文字列（例: "2024-06-10T18:00:00"）
 * - 現在時刻が deadline を過ぎていれば true を返す
 *
 * src/deadline.ts に定義予定。
 */

describe("isDeadlinePassed", () => {
  it("deadlineがnullのとき、falseを返す", () => {
    // Act
    const result = isDeadlinePassed(null);

    // Assert
    expect(result).toBe(false);
  });

  it("deadlineが未来のとき、falseを返す", () => {
    // Arrange
    const futureDeadline = new Date(Date.now() + 60_000).toISOString();

    // Act
    const result = isDeadlinePassed(futureDeadline);

    // Assert
    expect(result).toBe(false);
  });
});
