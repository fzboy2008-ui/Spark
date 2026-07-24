const mongoose = require('mongoose');

const GuildStoreSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    serverName: { type: String, default: 'My Server' },
    adminRoleId: { type: String, default: '' },
    logsChannelId: { type: String, default: '' },
    consoleChannelId: { type: String, default: '' },
    
    // Panel Visual Layout
    panelTitle: { type: String, default: '🛒 Server Store' },
    panelDescription: { type: String, default: 'Select a category below to view items.' },
    panelBanner: { type: String, default: '' },
    
    // Inventory Arrays
    categories: [String], 
    items: [{
        category: String,
        name: String,
        price: Number,
        command: String
    }],

    // Button 4: DM Custom Texts
    dmApproved: { type: String, default: "📦 **Order Approved [{{server}}]!** Your item **{{item}}** has been processed! 🎉" },
    dmRejected: { type: String, default: "❌ **Order Rejected [{{server}}]!** Your request for **{{item}}** was declined." },
    dmPendingReminder: { type: String, default: "⏰ **Pending Order Reminder [{{server}}]!** Your order for **{{item}}** is under review." }
});

const OrderTicketSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    buyerId: { type: String, required: true },
    buyerIGN: { type: String, required: true },
    itemName: { type: String, required: true },
    itemPrice: { type: Number, required: true },
    itemCategory: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastReminderSent: { type: Date, default: Date.now }
});

module.exports = {
    GuildStore: mongoose.model('GuildStore', GuildStoreSchema),
    OrderTicket: mongoose.model('OrderTicket', OrderTicketSchema)
};
