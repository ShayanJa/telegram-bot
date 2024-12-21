import TelegramBot from 'node-telegram-bot-api';
import { CONFIG } from '../config.js';
import { priceMonitor } from './priceMonitor.js';

class TelegramService {
  constructor() {
    this.bot = new TelegramBot(CONFIG.TELEGRAM.BOT_TOKEN, { polling: true });
    this.chatId = CONFIG.TELEGRAM.CHAT_ID;
    this.setupCommands();
  }

  setupCommands() {
    // List all tracked cryptocurrencies
    this.bot.onText(/\/list/, async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const coins = Array.from(CONFIG.CRYPTOCURRENCIES).join(', ');
      await this.sendMessage(`Currently tracking:\n${coins}`);
    });

    // Show top K cryptocurrencies
    this.bot.onText(/\/top(?:\s+(\d+))?/, async (msg, match) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const k = parseInt(match[1]) || 10; // Default to top 10 if no number specified
      
      try {
        const response = await priceMonitor.apiClient.get('/coins/markets', {
          params: {
            vs_currency: 'usd',
            order: 'market_cap_desc',
            per_page: 250,
            sparkline: false
          }
        });

        const topCoins = response.data
          .slice(0, k)
          .map((coin, index) => {
            const priceChange = coin.price_change_percentage_24h;
            const emoji = priceChange >= 0 ? '🟢' : '🔴';
            return `${index + 1}. ${emoji} <b>${coin.symbol.toUpperCase()}</b>\n` +
                   `💵 Price: ${priceMonitor.formatPrice(coin.current_price)}\n` +
                   `📊 24h: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%\n` +
                   `💰 Market Cap: $${(coin.market_cap / 1e9).toFixed(2)}B\n`;
          })
          .join('\n');

        const message = `<b>Top ${k} Cryptocurrencies</b>\n` +
                       `by Market Cap 📊\n\n${topCoins}`;
        
        await this.sendMessage(message);
      } catch (error) {
        await this.sendMessage(`❌ Error fetching top cryptocurrencies: ${error.message}`);
      }
    });

    // Add a new cryptocurrency
    this.bot.onText(/\/add (.+)/, async (msg, match) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const coin = match[1].toLowerCase().trim();
      
      try {
        // Try to fetch the price to validate the coin exists
        const price = await priceMonitor.fetchPrice(coin);
        
        if (price) {
          if (CONFIG.CRYPTOCURRENCIES.has(coin)) {
            await this.sendMessage(`${coin} is already being tracked!`);
          } else {
            CONFIG.CRYPTOCURRENCIES.add(coin);
            await priceMonitor.initializeCoin(coin);
            await this.sendMessage(`✅ Added ${coin} to tracking list!`);
          }
        } else {
          await this.sendMessage(`❌ Could not find cryptocurrency: ${coin}`);
        }
      } catch (error) {
        await this.sendMessage(`❌ Error adding ${coin}: ${error.message}`);
      }
    });

    // Remove a cryptocurrency
    this.bot.onText(/\/remove (.+)/, async (msg, match) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const coin = match[1].toLowerCase().trim();
      
      if (CONFIG.CRYPTOCURRENCIES.has(coin)) {
        CONFIG.CRYPTOCURRENCIES.delete(coin);
        await this.sendMessage(`✅ Removed ${coin} from tracking list!`);
      } else {
        await this.sendMessage(`❌ ${coin} is not in the tracking list!`);
      }
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const helpMessage = `
<b>Available Commands:</b>

/list - Show all tracked cryptocurrencies
/top [N] - Show top N cryptocurrencies by market cap (default: 10)
/add - Add a new cryptocurrency to track
/remove - Remove a cryptocurrency from tracking
/help - Show this help message

Examples:
• /add cardano
• /remove bitcoin
• /top 15`;
      await this.sendMessage(helpMessage);
    });
  }

  async sendMessage(message) {
    try {
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      console.log('Telegram message sent successfully');
    } catch (error) {
      console.error('Error sending Telegram message:', error.message);
    }
  }

  formatPriceUpdate(prices) {
    const timestamp = new Date().toLocaleString();
    let message = `<b>💰 Crypto Price Update</b>\n`;
    message += `🕒 ${timestamp}\n\n`;

    for (const [crypto, data] of Object.entries(prices)) {
      const priceChange = data.priceChange;
      const emoji = priceChange >= 0 ? '🟢' : '🔴';
      message += `${emoji} <b>${crypto.toUpperCase()}</b>\n`;
      message += `💵 Price: ${priceMonitor.formatPrice(data.price)}\n`;
      message += `📊 Change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%\n\n`;
    }

    return message;
  }
}

export const telegramService = new TelegramService();