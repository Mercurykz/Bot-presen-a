
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const QRCode = require("qrcode");
const fetch = require("node-fetch");

const client = new Client({ intents:[GatewayIntentBits.Guilds] });

client.on("ready", ()=> console.log("Bot online"));

client.on("interactionCreate", async (i)=>{
 if(!i.isChatInputCommand()) return;

 if(i.commandName==="chamada"){
   const res = await fetch("http://localhost:3000/api/chamada",{method:"POST"});
   const data = await res.json();

   const file = `qr.png`;
   await QRCode.toFile(file, data.link);

   await i.reply({content:"QR Code:", files:[file]});
 }
});

client.login(process.env.BOT_TOKEN);
