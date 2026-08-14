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

interface ClaudeResponse {
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
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Call Claude Vision API
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: `Extract from this receipt:
1. Store name (if visible, or use provided: "${store || "Unknown"}")
2. Date (YYYY-MM-DD format)
3. Every line item: name, quantity, unit, unit price, total price
4. Categorize each item: produce/dairy/meat/snacks/beverages/frozen/household/other

Format response as ONLY valid JSON (no markdown, no extra text):
{
  "store": "Store Name",
  "date": "YYYY-MM-DD",
  "items": [
    { "name": "Item Name", "quantity": 1, "unit": "each", "unitPrice": 3.99, "totalPrice": 3.99, "category": "category" }
  ]
}`,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      console.error("Claude API error:", err);
      return new Response(
        JSON.stringify({ error: "Claude Vision API failed" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const claudeData = await claudeResponse.json();
    const content = claudeData.content?.[0]?.text;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content from Claude" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Parse Claude's JSON response
    let extracted: ClaudeResponse;
    try {
      extracted = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse Claude response:", content);
      return new Response(
        JSON.stringify({ error: "Invalid response format from Claude" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Store in Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Insert receipt
    const { data: receipt, error: receiptError } = await supabase
      .from("grocery_receipts")
      .insert({
        family_id: familyId,
        scanned_by: scannedById,
        store: extracted.store,
        receipt_date: extracted.date,
        total: extracted.items.reduce((sum, item) => sum + item.totalPrice, 0),
        image_url: null, // Store image separately if needed
        ai_raw_json: claudeData,
      })
      .select("id")
      .single();

    if (receiptError) {
      console.error("Receipt insert error:", receiptError);
      return new Response(
        JSON.stringify({ error: "Failed to store receipt" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Insert receipt items
    const items = extracted.items.map((item) => ({
      receipt_id: receipt.id,
      family_id: familyId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      brand: null,
      added_to_list: false,
    }));

    const { error: itemsError } = await supabase
      .from("grocery_receipt_items")
      .insert(items);

    if (itemsError) {
      console.error("Items insert error:", itemsError);
      return new Response(
        JSON.stringify({ error: "Failed to store items" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Call grocery-ai-suggest to update staples
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/grocery-ai-suggest`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ familyId }),
      });
    } catch (e) {
      console.warn("Failed to call grocery-ai-suggest:", e);
      // Non-fatal; continue
    }

    return new Response(
      JSON.stringify({
        receiptId: receipt.id,
        itemCount: extracted.items.length,
        total: extracted.items.reduce((sum, item) => sum + item.totalPrice, 0),
        store: extracted.store,
        date: extracted.date,
        items: extracted.items,
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
