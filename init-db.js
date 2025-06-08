// MongoDB initialization script for Docker
db = db.getSiblingDB('fee-collector-scanner');

// Create collections with proper indexes
db.createCollection('feeevents');
db.createCollection('scanprogresses');

// Create indexes for better query performance
db.feeevents.createIndex({ "integrator": 1, "blockNumber": -1 });
db.feeevents.createIndex({ "token": 1, "blockNumber": -1 });
db.feeevents.createIndex({ "blockNumber": -1 });
db.feeevents.createIndex({ "transactionHash": 1, "logIndex": 1 }, { "unique": true });
db.feeevents.createIndex({ "createdAt": -1 });

db.scanprogresses.createIndex({ "chain": 1 }, { "unique": true });

print('Database initialized successfully');