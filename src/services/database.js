import sqlite3 from 'sqlite3';
import { promisify } from 'util';

class DatabaseService {
  constructor() {
    this.db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to in-memory SQLite database');
        this.initialize();
      }
    });

    // Promisify database methods
    this.run = promisify(this.db.run.bind(this.db));
    this.get = promisify(this.db.get.bind(this.db));
    this.all = promisify(this.db.all.bind(this.db));
  }

  async initialize() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cryptocurrency TEXT NOT NULL,
        price REAL NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `;

    try {
      await this.run(createTableSQL);
      console.log('Price history table created successfully');
    } catch (error) {
      console.error('Error creating table:', error);
    }
  }

  async savePrice(cryptocurrency, price) {
    const sql = `
      INSERT INTO price_history (cryptocurrency, price, timestamp)
      VALUES (?, ?, ?)
    `;
    
    try {
      await this.run(sql, [cryptocurrency, price, Date.now()]);
    } catch (error) {
      console.error('Error saving price:', error);
    }
  }

  async getHourlyPriceChange(cryptocurrency) {
    const hourAgo = Date.now() - 3600000; // 1 hour in milliseconds
    
    const sql = `
      SELECT price, timestamp FROM price_history
      WHERE cryptocurrency = ? AND timestamp <= ?
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    try {
      const currentPrice = await this.get(
        'SELECT price FROM price_history WHERE cryptocurrency = ? ORDER BY timestamp DESC LIMIT 1',
        [cryptocurrency]
      );

      const hourAgoPrice = await this.get(sql, [cryptocurrency, hourAgo]);

      if (!currentPrice || !hourAgoPrice) return null;

      const priceChange = ((currentPrice.price - hourAgoPrice.price) / hourAgoPrice.price) * 100;
      
      return {
        currentPrice: currentPrice.price,
        hourAgoPrice: hourAgoPrice.price,
        percentageChange: priceChange
      };
    } catch (error) {
      console.error('Error getting hourly price change:', error);
      return null;
    }
  }

  async cleanup() {
    const dayAgo = Date.now() - 86400000; // 24 hours in milliseconds
    
    const sql = 'DELETE FROM price_history WHERE timestamp < ?';
    
    try {
      await this.run(sql, [dayAgo]);
    } catch (error) {
      console.error('Error cleaning up old data:', error);
    }
  }

  async getPriceHistory(cryptocurrency, hours = 24) {
    const timeAgo = Date.now() - (hours * 3600000);
    
    const sql = `
      SELECT price, timestamp 
      FROM price_history 
      WHERE cryptocurrency = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `;

    try {
      return await this.all(sql, [cryptocurrency, timeAgo]);
    } catch (error) {
      console.error('Error getting price history:', error);
      return [];
    }
  }
}

export const databaseService = new DatabaseService();