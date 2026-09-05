/** このファイルの役割と主要な処理フローを、実装の近くにコメントで説明しています。 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.url
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.key
  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookiesToSet) => { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } } },
  )
}

export async function requireUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('AUTH_REQUIRED')
  return { supabase, user: data.user }
}

// BEGIN DEMO ACCESS: 未ログインのデモ役割にサーバー処理を付与します。公開時に削除する場合はこのコメントからENDまで削除します。
// デモCookieは画面操作用の識別子としてのみ使い、DB操作はサーバー側のservice roleクライアントで行います。
export async function requireUserOrDemo() {
  try {
    return await requireUser()
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'AUTH_REQUIRED') throw error
    const cookieStore = await cookies()
    // BEGIN DEMO ACCESS: アップロード環境でCookieが分離される場合も、ピン投稿画面から渡されたデモ識別子を利用します。公開時はこのブロックを削除します。
    const demoRole = cookieStore.get('yorisoi_demo_role')?.value
    const requestHeaders = await import('next/headers').then(({ headers }) => headers())
    const hasDemoHeader = requestHeaders.get('x-demo-access') === 'true'
    const resolvedDemoRole = demoRole ?? (hasDemoHeader ? 'victim' : undefined)
    if (!resolvedDemoRole || !['victim', 'supporter', 'admin'].includes(resolvedDemoRole)) throw error
    // END DEMO ACCESS
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
    if (!url || !key) throw new Error('DEMO_SERVER_CONFIG_MISSING')
    const serviceClient = createServerClient(url, key, { cookies: { getAll: () => [], setAll: () => undefined } })
    // デモCookieは英語の識別子ですが、profiles.role_typeは日本語ラベルまたは英語値で保存される場合があります。
    // 両方を検索して、アップロード環境でも対応するデモプロフィールを確実に解決します。
    const roleAliases: Record<string, string[]> = {
      victim: ['victim', '被災者'],
      supporter: ['supporter', '支援者'],
      admin: ['admin', '管理者'],
    }
    let { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('id,role_type')
      .in('role_type', roleAliases[resolvedDemoRole])
      .limit(1)
      .maybeSingle()

    // BEGIN DEMO ACCESS: デモ用プロフィールが未作成のアップロード環境では、service roleで認証ユーザーとプロフィールを一度だけ作成します。
    // 公開時は、この自動作成ブロック（BEGIN DEMO ACCESSからEND DEMO ACCESSまで）を削除してください。
    if (!profile?.id && !profileError) {
      const email = `demo-${resolvedDemoRole}@yorisoi.invalid`
      const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        password: crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { role_type: resolvedDemoRole },
        app_metadata: { role: resolvedDemoRole },
      })
      if (createError && !createError.message.toLowerCase().includes('already')) throw new Error('DEMO_PROFILE_CREATE_FAILED')
      // 既存のデモ認証ユーザーがいる場合も、そのIDを取得してプロフィールを補完します。
      const existing = createError
        ? await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        : null
      const userId = created.user?.id ?? existing?.data.users.find((candidate) => candidate.email === email)?.id
      if (userId) {
        const { error: upsertError } = await serviceClient.from('profiles').upsert({ id: userId, role_type: resolvedDemoRole }, { onConflict: 'id' })
        if (upsertError) throw new Error('DEMO_PROFILE_CREATE_FAILED')
      }
      const resolved = await serviceClient.from('profiles').select('id,role_type').in('role_type', roleAliases[resolvedDemoRole]).limit(1).maybeSingle()
      profile = resolved.data
      profileError = resolved.error
    }
    // END DEMO ACCESS
    if (profileError || !profile?.id) throw new Error('DEMO_PROFILE_MISSING')
    return { supabase: serviceClient, user: { id: profile.id }, demo: true as const }
  }
}
// END DEMO ACCESS
