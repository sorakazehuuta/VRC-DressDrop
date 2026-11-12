// 管理画面の月ごとの集計で使う、日本時間の月（YYYY-MM）の範囲
export function monthRange(month: string) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const index = Number(m[2]) - 1;
  const at = (y: number, i: number) => {
    const d = new Date(Date.UTC(y, i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const next = at(year, index + 1);
  return {
    month,
    label: `${year}年${index + 1}月`,
    prev: at(year, index - 1),
    next,
    // 日本時間の月初〜翌月初
    start: `${month}-01T00:00:00+09:00`,
    end: `${next}-01T00:00:00+09:00`,
  };
}

// 今月（日本時間）から数えて何か月前か（今月は 0、未来はマイナス）
export function monthsAgo(month: string, now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const [y, m] = month.split("-").map(Number);
  return (jst.getUTCFullYear() - y) * 12 + (jst.getUTCMonth() + 1 - m);
}
