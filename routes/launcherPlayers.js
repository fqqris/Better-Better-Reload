const express = require("express");
const app = express.Router();

app.get("/launcher/players", (req, res) => {
    res.json({ online: global.Clients ? global.Clients.length : 0 });
});

module.exports = app;