const mongoose = require('mongoose');

const headlineSchema = new mongoose.Schema({
  headlineId: { type: String, unique: true, index: true }, // Index for uniqueness
  originalText: String,
  entities: [
    // Define your entities subdocument schema here
  ],
  sentiment: { type: String, index: true }, // Index for sentiment queries
});

// Define your entities subdocument schema here if needed

const Headline = mongoose.model('Headline', headlineSchema);

module.exports = Headline;
