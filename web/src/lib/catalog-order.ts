// 管理画面で並べ替えた順番を sort_order にする（10 刻み）。
// 画面を開いたあとに追加された行など、送られてこなかった行は今の順番のまま最後に回す
export function catalogSortOrders(rows: { id: string; sort_order: number }[], submitted: string[]) {
  const known = new Set(rows.map((r) => r.id));
  const seen = new Set<string>();
  const order = submitted.filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
  const rest = rows.filter((r) => !seen.has(r.id)).sort((a, b) => a.sort_order - b.sort_order);
  return new Map([...order, ...rest.map((r) => r.id)].map((id, i) => [id, (i + 1) * 10]));
}
