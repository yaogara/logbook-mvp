import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js"

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: { txn_id?: string; amount?: number | string }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const txnId = payload?.txn_id
  const amountValue = Number(payload?.amount)
  if (!txnId || !Number.isFinite(amountValue) || amountValue <= 0) {
    return new Response(JSON.stringify({ error: 'txn_id and positive amount are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Ensure txn exists and capture original amount + settled flag
  const { data: txn, error: txnErr } = await supabase
    .from("txns")
    .select("amount, settled")
    .eq("id", txnId)
    .single()

  if (txnErr || !txn) {
    return new Response(JSON.stringify({ error: txnErr?.message ?? "Txn not found" }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1. Insert settlement payment
  const { data: payment, error: pErr } = await supabase
    .from("settlement_payments")
    .insert({ txn_id: txnId, amount: amountValue })
    .select()
    .single()

  if (pErr || !payment) {
    return new Response(JSON.stringify({ error: pErr?.message ?? 'Failed to record settlement payment' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Sum all payments for txn
  const { data: totalRows, error: totalErr } = await supabase
    .from("settlement_payments")
    .select("amount")
    .eq("txn_id", txnId)

  if (totalErr) {
    return new Response(JSON.stringify({ error: totalErr.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const paidTotal = (totalRows ?? []).reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0,
  )

  const originalAmount = Number(txn.amount ?? 0)
  const fullySettled = paidTotal >= originalAmount && originalAmount > 0

  // 3. Update txn settled flag when thresholds met (or reset if reopened)
  const currentSettled = Boolean(txn.settled)
  if (fullySettled && !currentSettled) {
    await supabase
      .from("txns")
      .update({ settled: true })
      .eq("id", txnId)
  } else if (!fullySettled && currentSettled) {
    await supabase
      .from("txns")
      .update({ settled: false })
      .eq("id", txnId)
  }

  return new Response(
    JSON.stringify({
      payment,
      totals: {
        original: originalAmount,
        paid: paidTotal,
        remaining: Math.max(0, originalAmount - paidTotal),
      },
      settled: fullySettled,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
