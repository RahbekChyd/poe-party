
function getFunctionsBaseUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL')
  }

  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`
}

function getPublishableKey(): string {
  const functionsKey =
    import.meta.env.VITE_SUPABASE_FUNCTIONS_KEY as string | undefined
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const key = functionsKey ?? publishableKey

  if (!key) {
    throw new Error('Missing VITE_SUPABASE_FUNCTIONS_KEY or VITE_SUPABASE_ANON_KEY')
  }

  return key
}

export async function invokePublicFunction<TBody extends object>(
  name: string,
  body: TBody,
): Promise<unknown> {
  const res = await fetch(`${getFunctionsBaseUrl()}/${name}`, {
    method: 'POST',
    headers: {
      apikey: getPublishableKey(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let message = `Function ${name} failed`

    try {
      const data = await res.json() as { error?: string; message?: string }
      message = data.error ?? data.message ?? message
    } catch {
      // Ignore invalid JSON and fall back to the generic message.
    }

    throw new Error(message)
  }

  if (res.status === 204) {
    return null
  }

  return res.json()
}
