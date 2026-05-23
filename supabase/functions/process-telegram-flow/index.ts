import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve(async (req: Request) => {
  // 1. സുപബേസ് സെക്യൂരിറ്റി ഗേറ്റ്‌വേ കടത്തിവിടാൻ എല്ലാ റിക്വസ്റ്റുകൾക്കും ഈ ഹെഡേഴ്സ് നൽകാം
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }

  // OPTIONS റിക്വസ്റ്റുകൾ വന്നാൽ ഉടൻ 200 കൊടുക്കുക
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    // റിക്വസ്റ്റ് ബോഡി ഉണ്ടെന്ന് ഉറപ്പുവരുത്തുക
    if (!req.body) {
      return new Response("Empty body", { headers: corsHeaders, status: 200 })
    }

    const update = await req.json()
    console.log("📥 Received Update:", JSON.stringify(update))

    let chatId: number | null = null
    let userInput = ""

    if (update.message) {
      chatId = update.message.chat.id
      userInput = update.message.text || ""
    } else if (update.callback_query) {
      chatId = update.callback_query.message.chat.id
      userInput = update.callback_query.data || ""
    }

    // ചാറ്റ് ഐഡി ഇല്ലെങ്കിൽ ടെലിഗ്രാമിന് 200 ഒകെ കൊടുത്ത് അവസാനിപ്പിക്കുക (ലൂപ്പ് ഒഴിവാക്കാൻ)
    if (!chatId) {
      return new Response("No Chat ID", { headers: corsHeaders, status: 200 })
    }

    const telegramToken = "8601740463:AAFZWZbWs4LGkyuKtv7svM_cJHCli7O9aTg"

    // CLEAR അല്ലെങ്കിൽ /start വന്നാൽ നേരിട്ട് മെനു അയക്കുക (ജെമിനിയെ വിളിച്ച് സമയം കളയേണ്ട)
    if (userInput.toUpperCase() === "CLEAR" || userInput === "/start") {
      await sendTelegramMenu(chatId, telegramToken!, "📌 **MAIN MENU**\n\nSelect an operations pipeline below:")
      return new Response("OK", { headers: corsHeaders, status: 200 })
    }

    // മറ്റെല്ലാ മെസ്സേജുകളും തൽക്കാലം എക്കോ ചെയ്യുക അല്ലെങ്കിൽ ജെമിനിക്ക് വിടുക
    await sendTelegramText(chatId, telegramToken!, `You said: ${userInput}`)
    return new Response("OK", { headers: corsHeaders, status: 200 })

  } catch (err) {
    console.error("🚨 Core Error:", err)
    // സുപബേസ് EarlyDrop ചെയ്യാതിരിക്കാൻ എറർ വന്നാലും 200 തന്നെ റിട്ടേൺ ചെയ്യണം
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }
})

async function sendTelegramText(chatId: number, token: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
  })
}

async function sendTelegramMenu(chatId: number, token: string, text: string) {
  const keyboard = [
    [{ text: "➕ Add New Employee" }],
    [{ text: "📦 Vendor Expense Entry" }]
  ]
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: { keyboard: keyboard, resize_keyboard: true }
    })
  })
}
