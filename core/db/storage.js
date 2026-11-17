const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

class StorageEngine {
  constructor(options = {}) {
    this.memoryOnly = options.memoryOnly || false;
    this.dataDir = options.dataDir || config.dataPath;
    this.filePath = path.join(this.dataDir, 'marketplace-store.json');
    this.data = {
      users: [],
      shops: [],
      products: [],
      orders: [],
      sub_orders: [],
      settlement_statements: [],
      settlement_ledgers: []
    };
    this.init();
  }

  init() {
    if (this.memoryOnly) return;
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = { ...this.data, ...parsed };
      } else {
        this.persist();
      }
    } catch (err) {
      console.warn('StorageEngine init warning (fallback to memory):', err.message);
    }
  }

  persist() {
    if (this.memoryOnly) return;
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist store:', err.message);
    }
  }

  getCollection(name) {
    if (!this.data[name]) {
      this.data[name] = [];
    }
    return this.data[name];
  }

  insert(collectionName, item) {
    const coll = this.getCollection(collectionName);
    const now = new Date().toISOString();
    const doc = {
      id: item.id || crypto.randomUUID(),
      ...item,
      createdAt: item.createdAt || now,
      updatedAt: now
    };
    coll.push(doc);
    this.persist();
    return JSON.parse(JSON.stringify(doc));
  }

  find(collectionName, predicate = {}) {
    const coll = this.getCollection(collectionName);
    let results = coll;

    if (typeof predicate === 'function') {
      results = results.filter(predicate);
    } else if (typeof predicate === 'object' && Object.keys(predicate).length > 0) {
      results = results.filter(doc => {
        return Object.entries(predicate).every(([k, v]) => doc[k] === v);
      });
    }

    return JSON.parse(JSON.stringify(results));
  }

  findOne(collectionName, predicate) {
    const list = this.find(collectionName, predicate);
    return list.length > 0 ? list[0] : null;
  }

  findById(collectionName, id) {
    return this.findOne(collectionName, { id });
  }

  updateById(collectionName, id, updates) {
    const coll = this.getCollection(collectionName);
    const idx = coll.findIndex(item => item.id === id);
    if (idx === -1) return null;

    const existing = coll[idx];
    const updated = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
    coll[idx] = updated;
    this.persist();
    return JSON.parse(JSON.stringify(updated));
  }

  deleteById(collectionName, id) {
    const coll = this.getCollection(collectionName);
    const idx = coll.findIndex(item => item.id === id);
    if (idx === -1) return false;
    coll.splice(idx, 1);
    this.persist();
    return true;
  }

  count(collectionName, predicate = {}) {
    return this.find(collectionName, predicate).length;
  }

  clear(collectionName) {
    if (collectionName) {
      this.data[collectionName] = [];
    } else {
      Object.keys(this.data).forEach(k => {
        this.data[k] = [];
      });
    }
    this.persist();
  }
}

// 单例实例供全局使用
const defaultStore = new StorageEngine();

module.exports = {
  StorageEngine,
  db: defaultStore
};
