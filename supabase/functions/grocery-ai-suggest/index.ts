import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SuggestRequest {
  familyId: string;
}

interface ItemFrequency {
  name: string;
  category: string;
  count: number;
  daysRange: number[];
  avgDaysBetween: number;
  lastBought: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { familyId } = (await req.json()) as SuggestRequest;

    if (!familyId) {
      return new Response(
        JSON.stringify({ error: "familyId required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Get receipts from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateThreshold = ninetyDaysAgo.toISOString().split("T")[0];

    // Fetch receipt items grouped by name
    const { data: items, error: fetchError } = await supabase
      .from("grocery_receipt_items")
      .select(
        `
        name,
        category,
        grocery_receipts!inner(receipt_date)
      `
      )
      .eq("family_id", familyId)
      .gte("grocery_receipts.receipt_date", dateThreshold);

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch items" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ updated: 0, message: "No items to analyze" }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Group by item name and compute frequency
    const frequencies = new Map<
      string,
      { category: string; dates: string[]; count: number }
    >();

    for (const item of items) {
      const key = item.name.toLowerCase();
      const receiptData = item.grocery_receipts as { receipt_date: string };
      const receiptDate = receiptData.receipt_date;

      if (!frequencies.has(key)) {
        frequencies.set(key, {
          category: item.category || "other",
          dates: [],
          count: 0,
        });
      }

      const freq = frequencies.get(key)!;
      freq.dates.push(receiptDate);
      freq.count++;
    }

    // Calculate days between purchases and build staples list
    const staples: Array<{
      family_id: string;
      name: string;
      category: string;
      avg_days_between: number;
      last_bought_at: string;
      times_bought: number;
      auto_suggest: boolean;
      usual_store: string | null;
      usual_brand: string | null;
    }> = [];

    for (const [name, freq] of frequencies) {
      // Only suggest if purchased 3+ times
      if (freq.count >= 3) {
        const uniqueDates = [...new Set(freq.dates)].sort();
        const daysDeltas: number[] = [];

        for (let i = 1; i < uniqueDates.length; i++) {
          const prev = new Date(uniqueDates[i - 1]);
          const curr = new Date(uniqueDates[i]);
          const days = Math.floor(
            (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
          );
          daysDeltas.push(days);
        }

        const avgDaysBetween =
          daysDeltas.length > 0
            ? Math.round(daysDeltas.reduce((a, b) => a + b, 0) / daysDeltas.length)
            : Math.round(90 / freq.count); // Rough estimate if only 1 purchase

        const lastBought = uniqueDates[uniqueDates.length - 1];

        staples.push({
          family_id: familyId,
          name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize first letter
          category: freq.category,
          avg_days_between: avgDaysBetween,
          last_bought_at: `${lastBought}T00:00:00Z`,
          times_bought: freq.count,
          auto_suggest: avgDaysBetween <= 14, // Suggest if bought every 2 weeks or more
          usual_store: null,
          usual_brand: null,
        });
      }
    }

    if (staples.length === 0) {
      return new Response(
        JSON.stringify({ updated: 0, message: "No items met frequency threshold" }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Upsert staples (UNIQUE constraint on family_id + name)
    const { data: upserted, error: upsertError } = await supabase
      .from("grocery_staples")
      .upsert(staples, { onConflict: "family_id,name" })
      .select("id");

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to upsert staples" }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        updated: upserted?.length || 0,
        staples: staples.map((s) => ({ name: s.name, avgDaysBetween: s.avg_days_between })),
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
