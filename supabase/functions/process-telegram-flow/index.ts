import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve(async (req) => {
  // 📌 CORS & SECURITY OPTIONS HANDLE ചെയ്യുന്നു
  // ഇത് വഴി സുപബേസിന്റെ 401 (Unauthorized) എറർ പൂർണ്ണമായി മാറും.
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const update = await req.json()
    
    let chatId: number | null = null
    let userId: number | null = null
    let userInput = ""

    if (update.message) {
      chatId = update.message.chat.id
      userId = update.message.from.id
      
      if (update.message.voice) {
        userInput = `[AUDIO_NOTE_ID]: ${update.message.voice.file_id}`
      } else {
        userInput = update.message.text || ""
      }
    } else if (update.callback_query) {
      chatId = update.callback_query.message.chat.id
      userId = update.callback_query.from.id
      userInput = update.callback_query.data || ""
    }

    if (!chatId || !userId) {
      return new Response("No Route", { status: 200 })
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY")
    const telegramToken = Deno.env.get("TELEGRAM_TOKEN")

    if (userInput.toUpperCase() === "CLEAR" || userInput === "/start") {
      await sendTelegramMenu(chatId, telegramToken!, "📌 **MAIN MENU**\n\nSelect an operations pipeline below:")
      return new Response("OK", { status: 200 })
    }

    const systemInstruction = `
      You are the absolute controller of an Enterprise Operations Bot for User ID: ${userId}.
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
      await sendTelegramButtons(chatId, telegramToken!, ui.text, ui.buttons)
    } else {
      await sendTelegramText(chatId, telegramToken!, ui.text)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 200
    })

  } catch (err) {
    console.error("🚨 Error:", err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
      reply_markup: { keyboard: keyboard, resize_keyboard: true, one_time_keyboard: false }
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
