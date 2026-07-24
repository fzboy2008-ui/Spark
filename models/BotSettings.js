const mongoose = require('mongoose');

const BotSettingsSchema = new mongoose.Schema({
    settingKey: { type: String, required: true, unique: true, default: 'global' },
    coOwners: { type: [String], default: [] } // Array of additional co-owner Discord IDs
});

module.exports = mongoose.model('BotSettings', BotSettingsSchema);
