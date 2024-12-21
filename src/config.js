export const CONFIG = {
  PRICE_CHECK_INTERVAL: 300000, // 5 minutes
  ALERT_THRESHOLD: 5, // 5% price change
  CRYPTOCURRENCIES: new Set(['bitcoin', 'ethereum', 'dogecoin']),
  TELEGRAM: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    CHAT_ID: process.env.TELEGRAM_CHAT_ID
  }
};