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

  try {
    if (!req.body) {
      return new Response("Empty body", { headers: corsHeaders, status: 200 })
    }

    const update = await req.json()
    console.log("📥 Received Update:", JSON.stringify(update))

    let chatId: number | null = null
    let userInput = ""

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

    if (!chatId) {
      return new Response("No Chat ID", { headers: corsHeaders, status: 200 })
    }

    // 🔑 FIXED TELEGRAM TOKEN
    const telegramToken = "8601740463:AAFZWZbWs4LGkyuKtv7svM_cJHCli7O9aTg"
    const geminiKey = Deno.env.get("GEMINI_API_KEY")

    if (userInput.toUpperCase() === "CLEAR" || userInput === "/start") {
      await sendTelegramMenu(chatId, telegramToken, "📌 **MAIN MENU**\n\nSelect an operations pipeline below:")
      return new Response("OK", { headers: corsHeaders, status: 200 })
    }

    // 🤖 GEMINI AI CALLING
    const systemInstruction = `
      You are the absolute controller of an Enterprise Operations Bot.
      Drive the conversation, parse English/Malayalam, and decide if PENDING or COMPLETED.
      
      MENUS:
      1. "➕ ADD NEW EMPLOYEE" -> Requires: Name, Role, Phone, Salary
      2. "📦 VENDOR EXPENSE ENTRY" -> Requires: Vendor Name, Item Name, Amount, Payment Status

      Return ONLY a strict JSON object:
      {
        "status": "PENDING" or "COMPLETED",
        "text": "Message for user",
        "buttons": [[{"text": "Label", "callback_data": "DATA"}]]
      }
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
    console.error("🚨 Core Error:", err)
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
