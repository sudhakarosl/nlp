const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema({
  entityName: { type: String, index: true }, // Index for entityName
  entityType: String,
  count: Number,
});

const Entity = mongoose.model('Entity', entitySchema);

module.exports = Entity;
