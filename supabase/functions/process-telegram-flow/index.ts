import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve(async (req) => {
  try {
    // 1. ടെലിഗ്രാമിൽ നിന്നുള്ള റിക്വസ്റ്റ് സ്വീകരിക്കുന്നു
    const update = await req.json()
    
    let chatId: number | null = null
    let userId: number | null = null
    let userInput = ""

    if (update.message) {
      chatId = update.message.chat.id
      userId = update.message.from.id
      
      // വോയിസ് നോട്ട് ഉണ്ടെങ്കിൽ (ഇവിടെ നിങ്ങളുടെ പഴയ വോയിസ് ഫങ്ക്ഷൻ ലിങ്ക് ചെയ്യാം)
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

    // 2. എൻവിറോൺമെന്റ് വേരിയബിളുകൾ എടുക്കുന്നു (Supabase Settings-ൽ നൽകുന്നത്)
    const geminiKey = Deno.env.get("GEMINI_API_KEY")
    const telegramToken = Deno.env.get("TELEGRAM_TOKEN")

    // 📌 CLEAR / START റൂട്ട്
    if (userInput.toUpperCase() === "CLEAR" || userInput === "/start") {
      await sendTelegramMenu(chatId, telegramToken!, "📌 **MAIN MENU**\n\nSelect an operations pipeline below:")
      return new Response("OK", { status: 200 })
    }

    // 3. ജെമിനി പ്രോംപ്റ്റ് സെറ്റ് ചെയ്യുന്നു
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

    // 4. ജെമിനി 1.5 പ്രോ മോഡലിലേക്ക് ഹിറ്റ് അയക്കുന്നു
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

    // 5. ടെലിഗ്രാമിലേക്ക് മറുപടി തിരികെ അയക്കുന്നു
    if (ui.buttons && ui.buttons.length > 0) {
      await sendTelegramButtons(chatId, telegramToken!, ui.text, ui.buttons)
    } else {
      await sendTelegramText(chatId, telegramToken!, ui.text)
    }

    // ടെലിഗ്രാമിന് ഉടൻ തന്നെ വിജയകരമായ മറുപടി നൽകി ലൂപ്പ് തടയുന്നു
    return new Response("OK", { status: 200 })

  } catch (err) {
    console.error("🚨 Error:", err)
    return new Response("OK", { status: 200 })
  }
})

// ========================================================
// ടെലിഗ്രാമിലേക്ക് മെസ്സേജുകൾ അയക്കാനുള്ള ഹെൽപ്പർ ഫങ്ക്ഷനുകൾ
// ========================================================

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
