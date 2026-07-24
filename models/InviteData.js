const mongoose = require('mongoose');

const InviteDataSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    
    // Permanent / Lifetime Stats
    permRegular: { type: Number, default: 0 },
    permLeaves: { type: Number, default: 0 },
    permFake: { type: Number, default: 0 },
    
    // Event / Short-Term Stats
    eventRegular: { type: Number, default: 0 },
    eventLeaves: { type: Number, default: 0 },
    eventFake: { type: Number, default: 0 },
    
    // Event Active State Tracker
    isEventActive: { type: Boolean, default: false }
});

InviteDataSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('InviteData', InviteDataSchema);
