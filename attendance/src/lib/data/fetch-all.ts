type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** 1000行ずつ全件を読み込む（API の1回あたりの上限を超える一覧のため） */
export async function fetchAll<T>(build: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
