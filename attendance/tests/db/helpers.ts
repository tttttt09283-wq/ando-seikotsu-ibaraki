import pg from "pg";
import { inject } from "vitest";

export type Role = "super_admin" | "hq_admin" | "clinic_manager" | "staff";

/**
 * 1テスト = 1トランザクション（最後に必ずロールバック）。
 * - `sql` はテーブル所有者（postgres）として実行。フィクスチャ作成用で RLS は効かない。
 * - `as(userId).sql` は Supabase の authenticated ロール＋JWT(sub) として実行し、RLS が効く。
 * どちらも失敗してもトランザクション全体が壊れないよう、SAVEPOINT で囲む。
 */
export class TestTx {
  constructor(private readonly client: pg.PoolClient) {}

  async sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
    await this.client.query("savepoint as_owner");
    try {
      const result = await this.client.query<T>(text, params);
      await this.client.query("release savepoint as_owner");
      return result.rows;
    } catch (error) {
      await this.client.query("rollback to savepoint as_owner");
      throw error;
    }
  }

  as(userId: string | null) {
    return {
      sql: async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) => {
        await this.client.query("savepoint as_user");
        try {
          await this.client.query(userId ? "set local role authenticated" : "set local role anon");
          await this.client.query("select set_config('request.jwt.claims', $1, true)", [
            userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : "",
          ]);
          const result = await this.client.query<T>(text, params);
          await this.client.query("release savepoint as_user");
          return result.rows;
        } catch (error) {
          await this.client.query("rollback to savepoint as_user");
          throw error;
        } finally {
          await this.client.query("reset role");
          await this.client.query("select set_config('request.jwt.claims', '', true)");
        }
      },
    };
  }

  async clinicId(code: string) {
    const rows = await this.sql<{ clinic_id: string }>("select clinic_id from public.clinics where clinic_code = $1", [
      code,
    ]);
    if (!rows[0]) throw new Error(`clinic ${code} not found`);
    return rows[0].clinic_id;
  }

  /** 管理画面ユーザー（auth.users + app_accounts + user_roles）を作る */
  async createUser(
    email: string,
    roles: { role: Role; clinicId?: string; validFrom?: string; validTo?: string }[] = [],
    options: { disabled?: boolean } = {},
  ) {
    const [user] = await this.sql<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
    await this.sql("insert into public.app_accounts (user_id, email, display_name, disabled) values ($1, $2, $2, $3)", [
      user.id,
      email,
      options.disabled ?? false,
    ]);
    for (const r of roles) {
      await this.sql(
        `insert into public.user_roles (user_id, role, clinic_id, valid_from, valid_to)
         values ($1, $2, $3, coalesce($4::date, app.today_jst()), $5::date)`,
        [user.id, r.role, r.clinicId ?? null, r.validFrom ?? null, r.validTo ?? null],
      );
    }
    return user.id;
  }

  /** スタッフ（基本情報・個人情報・主所属）を作る */
  async createStaff(
    code: string,
    primaryClinicId: string,
    options: { authUserId?: string; hireDate?: string; phone?: string } = {},
  ) {
    const [staff] = await this.sql<{ staff_id: string }>(
      `insert into public.staff_profiles (staff_code, family_name, given_name, hire_date, auth_user_id)
       values ($1, '安藤', $1, $2::date, $3) returning staff_id`,
      [code, options.hireDate ?? "2024-04-01", options.authUserId ?? null],
    );
    await this.sql("insert into public.staff_private_details (staff_id, phone, address) values ($1, $2, '大阪府')", [
      staff.staff_id,
      options.phone ?? "090-0000-0000",
    ]);
    await this.sql(
      `insert into public.staff_clinic_assignments (staff_id, clinic_id, assignment_type, valid_from)
       values ($1, $2, 'primary', $3::date)`,
      [staff.staff_id, primaryClinicId, options.hireDate ?? "2024-04-01"],
    );
    return staff.staff_id;
  }

  async addSupport(staffId: string, clinicId: string, validFrom = "2024-04-01", validTo: string | null = null) {
    await this.sql(
      `insert into public.staff_clinic_assignments (staff_id, clinic_id, assignment_type, valid_from, valid_to)
       values ($1, $2, 'support', $3::date, $4::date)`,
      [staffId, clinicId, validFrom, validTo],
    );
  }
}

let pool: pg.Pool | undefined;

function getPool() {
  pool ??= new pg.Pool({ connectionString: inject("dbUrl"), max: 2 });
  return pool;
}

export async function withTx(fn: (tx: TestTx) => Promise<void>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await fn(new TestTx(client));
  } finally {
    await client.query("rollback");
    client.release();
  }
}

export async function closePool() {
  await pool?.end();
  pool = undefined;
}
