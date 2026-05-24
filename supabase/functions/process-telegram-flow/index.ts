import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  // 🔑 TOKENS
  const telegramToken = "8601740463:AAFZWZbWs4LGkyuKtv7svM_cJHCli7O9aTg"
  const geminiKey = "AIzaSyYourActualGeminiKeyGoesHere" // നിങ്ങളുടെ ശരിക്കുമുള്ള Gemini API Key ഇവിടെ നൽകുക

  try {
    const rawBody = await req.text()
    console.log("📥 Raw Payload Received:", rawBody)

    if (!rawBody || rawBody.trim() === "") {
      return new Response("Empty Body", { headers: corsHeaders, status: 200 })
    }

    let update: any = {}
    let chatId: number | null = null
    let userInput = ""

    // ടെക്സ്റ്റ് മെസ്സേജാണോ JSON ആണോ എന്ന് പരിശോധിക്കുന്നു
    if (rawBody.trim().startsWith("CLEAR") || rawBody.trim().startsWith("/start") || rawBody.trim().toUpperCase() === "CLEAR") {
      userInput = rawBody.trim()
      // വെബ്ഹൂക്ക് വഴിയുള്ള ചാറ്റ് ഐഡി മിസ്സിംഗ് ഒഴിവാക്കാൻ നിങ്ങളുടെ ടെലിഗ്രാം ചാറ്റ് ഐഡി ഇവിടെ ഡിഫോൾട്ടായി നൽകുന്നു
      chatId = 2084172371 
    } else {
      try {
        update = JSON.parse(rawBody)
        if (update.message) {
          chatId = update.message.chat.id
          if (update.message.voice) {
            userInput = `[AUDIO_NOTE_ID]: ${update.message.voice.file_id}`
          } else {
            userInput = update.message.text || ""
          }
        } else if (update.callback_query) {
          chatId = update.callback_query.message.chat.id
          userInput = update.callback_query.data || ""
        }
      } catch (pErr) {
        // പ്ലെയിൻ ടെക്സ്റ്റ് മെസ്സേജുകൾ നേരിട്ട് എടുക്കുന്നു
        userInput = rawBody
        chatId = 2084172371
      }
    }

    if (!chatId) {
      console.log("⚠️ No valid Chat ID found in payload")
      return new Response("No Chat ID", { headers: corsHeaders, status: 200 })
    }

    // 🎯 CLEAR / START കമാൻഡുകൾ നേരിട്ട് ഹാൻഡിൽ ചെയ്യുന്നു
    if (userInput.toUpperCase() === "CLEAR" || userInput === "/start") {
      console.log("🎯 Triggering Main Menu for Chat:", chatId)
      await sendTelegramMenu(chatId, telegramToken, "📌 **MAIN MENU**\n\nSelect an operations pipeline below:")
      return new Response("OK", { headers: corsHeaders, status: 200 })
    }

    // 🤖 GEMINI AI CALLS
    const systemInstruction = `
      You are the absolute controller of an Enterprise Operations Bot.
      Drive the conversation, parse English/Malayalam, and decide if PENDING or COMPLETED.
      MENUS:
      1. "➕ ADD NEW EMPLOYEE" -> Requires: Name, Role, Phone, Salary
      2. "📦 VENDOR EXPENSE ENTRY" -> Requires: Vendor Name, Item Name, Amount, Payment Status
      Return ONLY strict JSON: {"status": "PENDING", "text": "msg", "buttons": []}
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
    console.error("🚨 Core Flow Error:", err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
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
