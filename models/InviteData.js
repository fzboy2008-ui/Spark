const mongoose = require('mongoose');

const InviteDataSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    regular: { type: Number, default: 0 },
    leaves: { type: Number, default: 0 },
    fake: { type: Number, default: 0 }
});

InviteDataSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('InviteData', InviteDataSchema);
