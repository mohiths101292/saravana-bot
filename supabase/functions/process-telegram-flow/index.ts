import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve(async (req: Request) => {
  // CORS ഹെഡേഴ്സ് സെറ്റ് ചെയ്യുന്നു
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  // 🔑 ടോക്കണുകൾ നേരിട്ട് സെറ്റ് ചെയ്യുന്നു
  const telegramToken = "8601740463:AAFZWZbWs4LGkyuKtv7svM_cJHCli7O9aTg"
  const geminiKey = "YOUR_ACTUAL_GEMINI_API_KEY_HERE" // നിങ്ങളുടെ ഒറിജിനൽ Gemini Key ഇവിടെ നൽകുക

  try {
    // 📥 ടെലിഗ്രാമിൽ നിന്നുള്ള റിക്വസ്റ്റ് ബോഡി കൃത്യമായി എടുക്കുന്നു
    const update = await req.json()
    console.log("📥 RECEIVED FROM TELEGRAM:", JSON.stringify(update))

    let chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id
    let userInput = ""

    if (update.message) {
      userInput = update.message.text || (update.message.voice ? "[AUDIO]" : "")
    } else if (update.callback_query) {
      userInput = update.callback_query.data || ""
    }

    if (!chatId) {
      return new Response("No Chat ID", { headers: corsHeaders, status: 200 })
    }

    // 🎯 CLEAR അല്ലെങ്കിൽ /start വന്നാൽ നേരിട്ട് മെയിൻ മെനു അയക്കുന്നു
    if (userInput.toUpperCase() === "CLEAR" || userInput === "/start") {
      await sendTelegramMenu(chatId, telegramToken, "📌 **MAIN MENU**\n\nSelect an operations pipeline below:")
      return new Response("OK", { headers: corsHeaders, status: 200 })
    }

    // 🤖 മറ്റെല്ലാ മെസ്സേജുകളും ജെമിനിക്ക് വിടുന്നു
    const systemInstruction = `
      You are an operations manager bot. 
      Parse the input and return ONLY a strict JSON format:
      {"status": "PENDING", "text": "Reply to user", "buttons": []}
    `

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: userInput }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    )

    const geminiData = await geminiRes.json()
    const aiRaw = geminiData.candidates[0].content.parts[0].text.trim()
    const ui = JSON.parse(aiRaw)

    if (ui.buttons && ui.buttons.length > 0) {
      await sendTelegramButtons(chatId, telegramToken, ui.text, ui.buttons)
    } else {
      await sendTelegramText(chatId, telegramToken, ui.text)
    }

    return new Response("OK", { headers: corsHeaders, status: 200 })

  } catch (err) {
    console.error("🚨 Error occurred:", err.message)
    return new Response("OK", { headers: corsHeaders, status: 200 })
  }
})

// ✉️ ടെലിഗ്രാം മെസ്സേജ് ഫങ്ക്ഷനുകൾ
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

async function sendTelegramButtons(chatId: number, token: string, text: string, buttons: any) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: { inline_keyboard: buttons }
    })
  })
}
