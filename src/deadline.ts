/** 回答締め切り（ISO 文字列）が現在時刻を過ぎているかを判定する純粋関数。 */
export const isDeadlinePassed = (deadline: string | null): boolean =>
  deadline != null && Date.parse(deadline) < Date.now();
