import axios from 'axios';
import { CONFIG } from '../config.js';
import { telegramService } from './telegram.js';
import { databaseService } from './database.js';

class PriceMonitor {
  constructor() {
    this.prices = new Map();
    this.lastHourlyAlerts = new Map();
    this.apiClient = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      headers: {
        'x-cg-demo-api-key': process.env.COINGECKO_API_KEY
      }
    });
  }

  async initialize() {
    for (const crypto of CONFIG.CRYPTOCURRENCIES) {
      await this.initializeCoin(crypto);
    }
  }

  async initializeCoin(crypto) {
    const price = await this.fetchPrice(crypto);
    if (price) {
      this.prices.set(crypto, price);
      console.log(`Initial ${crypto.toUpperCase()} price: ${this.formatPrice(price)}`);
      await databaseService.savePrice(crypto, price);
    }
  }

  formatPrice(price) {
    // Show up to 5 decimal places if they're not zero
    const decimalStr = price.toString().split('.')[1] || '';
    const significantDecimals = decimalStr.replace(/0+$/, '').length;
    return `$${price.toFixed(Math.min(Math.max(2, significantDecimals), 5))}`;
  }

  async fetchPrice(crypto) {
    try {
      const response = await this.apiClient.get(
        `/simple/price?ids=${crypto}&vs_currencies=usd`
      );
      return response.data[crypto].usd;
    } catch (error) {
      if (error.response?.status === 429) {
        console.error('Rate limit exceeded. Consider upgrading your CoinGecko plan.');
      } else {
        console.error(`Error fetching price for ${crypto}:`, error.message);
      }
      return null;
    }
  }

  calculatePriceChange(oldPrice, newPrice) {
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  async checkHourlyChanges(crypto, currentPrice) {
    const hourlyChange = await databaseService.getHourlyPriceChange(crypto);
    if (!hourlyChange) return;

    const now = Date.now();
    const lastAlert = this.lastHourlyAlerts.get(crypto) || 0;
    const hourInMs = 3600000;

    if (Math.abs(hourlyChange.percentageChange) >= CONFIG.ALERT_THRESHOLD && 
        (now - lastAlert) >= hourInMs) {
      const direction = hourlyChange.percentageChange > 0 ? 'increased' : 'decreased';
      const message = `🚨 <b>HOURLY ALERT</b> 🚨\n\n` +
                     `${crypto.toUpperCase()} has ${direction} by ` +
                     `${Math.abs(hourlyChange.percentageChange).toFixed(2)}% in the last hour\n\n` +
                     `Hour ago: ${this.formatPrice(hourlyChange.hourAgoPrice)}\n` +
                     `Current: ${this.formatPrice(currentPrice)}`;
      
      await telegramService.sendMessage(message);
      this.lastHourlyAlerts.set(crypto, now);
    }
  }

  async checkPrices() {
    console.log('\n=== Price Check ===');
    console.log(`Time: ${new Date().toLocaleString()}`);
    console.log('-------------------');

    const priceUpdates = {};

    for (const crypto of CONFIG.CRYPTOCURRENCIES) {
      const oldPrice = this.prices.get(crypto);
      const newPrice = await this.fetchPrice(crypto);

      if (oldPrice && newPrice) {
        const priceChange = this.calculatePriceChange(oldPrice, newPrice);
        console.log(`${crypto.toUpperCase()}: ${this.formatPrice(newPrice)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);

        // Save price to SQLite database
        await databaseService.savePrice(crypto, newPrice);

        // Check hourly changes
        await this.checkHourlyChanges(crypto, newPrice);

        priceUpdates[crypto] = {
          price: newPrice,
          priceChange: priceChange
        };

        if (Math.abs(priceChange) >= CONFIG.ALERT_THRESHOLD) {
          const message = `🚨 <b>PRICE ALERT</b> 🚨\n\n` +
                         `${crypto.toUpperCase()} has ${priceChange > 0 ? 'increased' : 'decreased'} by ` +
                         `${Math.abs(priceChange).toFixed(2)}%\n\n` +
                         `Old price: ${this.formatPrice(oldPrice)}\n` +
                         `New price: ${this.formatPrice(newPrice)}`;
          
          await telegramService.sendMessage(message);
        }

        this.prices.set(crypto, newPrice);
      }
    }

    // Send updates to Telegram
    if (Object.keys(priceUpdates).length > 0) {
      const telegramMessage = telegramService.formatPriceUpdate(priceUpdates);
      await telegramService.sendMessage(telegramMessage);
    }

    // Cleanup old data
    await databaseService.cleanup();

    console.log('-------------------\n');
  }

  start() {
    this.initialize().then(() => {
      setInterval(() => this.checkPrices(), CONFIG.PRICE_CHECK_INTERVAL);
    });
  }
}

export const priceMonitor = new PriceMonitor();