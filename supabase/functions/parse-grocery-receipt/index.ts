import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParseRequest {
  familyId: string;
  scannedById: string;
  imageBase64: string;
  store?: string;
}

interface ExtractedItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
}

interface ParsedReceipt {
  store: string;
  date: string;
  items: ExtractedItem[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { familyId, scannedById, imageBase64, store } = (await req.json()) as ParseRequest;

    if (!familyId || !scannedById || !imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: familyId, scannedById, imageBase64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Gemini Vision API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: imageBase64,
                  },
                },
                {
                  text: `You are a grocery receipt parser. First check what this image is.

STEP 1 — Is this a receipt at all?
If the image is NOT a receipt (selfie, landscape, document, ID, etc.), return ONLY:
{"notAReceipt": true, "reason": "one sentence explaining what it actually is"}

STEP 2 — Is this a GROCERY or RETAIL SHOPPING receipt?
Allowed: grocery stores, supermarkets, wholesale clubs (Costco/Sam's), Indian/ethnic grocery stores, department stores, pharmacies with groceries, convenience stores, farmers markets.
NOT allowed: restaurants, fast food, gas stations, utility bills, hotel bills, airline tickets, medical bills, car services.
If it is a receipt but NOT grocery/retail shopping, return ONLY:
{"notGrocery": true, "reason": "one sentence e.g. This is a restaurant receipt from Chipotle"}

STEP 3 — Extract items. Return ONLY valid JSON (no markdown, no code fences, no explanation):
{
  "store": "${store ? store : "store name from receipt or Unknown"}",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "name": "item name",
      "quantity": 1,
      "unit": "each",
      "unitPrice": 0.00,
      "totalPrice": 0.00,
      "category": "produce|dairy|meat|seafood|bakery|frozen|snacks|beverages|grains|cleaning|personal_care|other"
    }
  ]
}

Rules for extraction:
- Skip tax lines, subtotals, discounts, payment method lines — only real products
- If quantity is unclear use 1; if price is unclear use 0
- category must be exactly one of the listed values
- Output raw JSON only — no \`\`\` fences, no markdown`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", errText);
      return new Response(
        JSON.stringify({ error: `Gemini API failed: ${geminiRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Strip all markdown code fences (gemini-2.5-flash sometimes wraps mid-string)
    const cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    let extracted: ParsedReceipt & { notAReceipt?: boolean; notGrocery?: boolean; reason?: string };
    try {
      extracted = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse Gemini response:", rawText);
      return new Response(
        JSON.stringify({ error: "Could not parse AI response as JSON", raw: rawText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: not a receipt at all
    if (extracted.notAReceipt) {
      return new Response(
        JSON.stringify({ error: "not_a_receipt", message: extracted.reason ?? "This image doesn't appear to be a receipt." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: receipt but not grocery/shopping
    if (extracted.notGrocery) {
      return new Response(
        JSON.stringify({ error: "not_grocery", message: extracted.reason ?? "This looks like a non-grocery receipt (restaurant, gas, etc). Only grocery and retail shopping receipts are supported." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!extracted.items || !Array.isArray(extracted.items)) {
      return new Response(
        JSON.stringify({ error: "No items found in receipt" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalise items
    const items: ExtractedItem[] = extracted.items.map((item) => ({
      name: String(item.name ?? "Unknown item"),
      quantity: Number(item.quantity) || 1,
      unit: String(item.unit ?? "each"),
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      category: String(item.category ?? "other"),
    }));

    const receiptTotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
    const receiptStore = extracted.store || store || "Unknown Store";
    const receiptDate = extracted.date || new Date().toISOString().split("T")[0];

    // Persist to Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: receipt, error: receiptError } = await supabase
      .from("grocery_receipts")
      .insert({
        family_id: familyId,
        scanned_by: scannedById,
        store: receiptStore,
        receipt_date: receiptDate,
        total: receiptTotal,
        ai_raw_json: geminiData,
      })
      .select("id")
      .single();

    if (receiptError) {
      console.error("Receipt insert error:", receiptError);
      // Still return extracted items even if DB write fails
      return new Response(
        JSON.stringify({ receiptId: null, itemCount: items.length, total: receiptTotal, store: receiptStore, date: receiptDate, items }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert line items
    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from("grocery_receipt_items")
        .insert(
          items.map((item) => ({
            receipt_id: receipt.id,
            family_id: familyId,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            added_to_list: false,
          }))
        );
      if (itemsError) {
        console.error("Items insert error:", itemsError);
      }
    }

    // Async: update staples (fire-and-forget)
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/grocery-ai-suggest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ familyId }),
    }).catch((e) => console.warn("grocery-ai-suggest fire-and-forget failed:", e));

    return new Response(
      JSON.stringify({
        receiptId: receipt.id,
        itemCount: items.length,
        total: receiptTotal,
        store: receiptStore,
        date: receiptDate,
        items,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
