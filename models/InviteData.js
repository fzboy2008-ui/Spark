const mongoose = require('mongoose');

const InviteDataSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    
    // Falcon Stats Tracking Fields
    joins: { type: Number, default: 0 },
    regular: { type: Number, default: 0 },
    leaves: { type: Number, default: 0 },
    fake: { type: Number, default: 0 },
    rejoins: { type: Number, default: 0 },
    
    // Event / Short-Term Stats
    eventRegular: { type: Number, default: 0 },
    eventLeaves: { type: Number, default: 0 },
    eventFake: { type: Number, default: 0 },
    
    // Event Active State Tracker
    isEventActive: { type: Boolean, default: false }
});

InviteDataSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('InviteData', InviteDataSchema);
