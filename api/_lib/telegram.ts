// Minimal Telegram Bot API client. The token only exists in the server environment.
export interface InlineButton {
  text: string;
  callback_data: string;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN manquant');
  return token;
}

export async function telegram<T = any>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method} : ${data.description || res.status}`);
  return data.result as T;
}

export function sendMessage(chatId: string | number, text: string, buttons?: InlineButton[][]) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

// Asks the technician for a free-text answer (RDV date, litige detail…).
export function askForReply(chatId: string | number, text: string) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { force_reply: true },
  });
}

export function editButtons(chatId: string | number, messageId: number, buttons: InlineButton[][]) {
  return telegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: buttons },
  });
}

export function answerCallback(callbackQueryId: string, text?: string) {
  return telegram('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}
